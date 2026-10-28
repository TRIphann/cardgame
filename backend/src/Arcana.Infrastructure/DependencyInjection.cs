using Arcana.Application.Abstractions;
using Arcana.Application.Services;
using Arcana.Application.Services.TestRoom;
using Arcana.Domain.Repositories;
using Arcana.Domain.Services;
using Arcana.Infrastructure.Firebase;
using Arcana.Infrastructure.Redis;
using Arcana.Infrastructure.Repositories;
using Google.Apis.Auth.OAuth2;
using Google.Cloud.Firestore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;
namespace Arcana.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddArcanaInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<FirebaseOptions>(configuration.GetSection(FirebaseOptions.Section));

        // ── Ephemeral / CI mode ─────────────────────────────────────────
        // When Firestore:UseInMemoryRepository=true the whole room store is
        // swapped for the in-memory implementation. This is what the CI
        // integration workflow sets so the test run NEVER touches the shared
        // Firestore quota (and never needs the service-account JSON).
        //
        // Before this flag existed the workflow exported the setting but the
        // code ignored it, so the CI backend still booted the Firestore
        // repository — every request either 500'd (no credentials in the
        // runner) or wrote into the production database.
        var useInMemoryRepository = configuration.GetValue<bool?>("Firestore:UseInMemoryRepository") ?? false;

        // Redis connection for code reservation and session storage.
        // Redis is OPTIONAL in production — if it isn't reachable (cold start,
        // free-tier sleep, missing connection string) we fall back to the
        // in-memory reservation service so the API still boots and /health
        // stays green. Single-instance Render deploys keep correct behavior;
        // multi-instance deploys only lose cross-instance code uniqueness.
        services.AddSingleton(typeof(IConnectionMultiplexer), sp =>
        {
            var logger = sp.GetRequiredService<ILogger<IConnectionMultiplexer>>();
            var redisConnectionString = configuration.GetSection("Redis:ConnectionString").Value;

            if (string.IsNullOrWhiteSpace(redisConnectionString))
            {
                logger.LogWarning(
                    "Redis:ConnectionString is not configured — using in-memory code reservation. " +
                    "Set Redis:ConnectionString (Render Key Value) for multi-instance safety.");
                return null;
            }

            try
            {
                var options = ConfigurationOptions.Parse(redisConnectionString);
                options.AbortOnConnectFail = false;
                options.ConnectTimeout = 5000;
                options.SyncTimeout = 5000;
                options.ConnectRetry = 5;
                var mux = ConnectionMultiplexer.Connect(options);
                if (!mux.IsConnected)
                {
                    logger.LogWarning(
                        "Redis at '{Host}' accepted TCP but isn't reporting IsConnected — " +
                        "falling back to in-memory code reservation.",
                        redisConnectionString);
                    try { mux.Dispose(); } catch { /* best effort */ }
                    return null;
                }
                return mux;
            }
            catch (Exception ex) when (ex is RedisConnectionException || ex is InvalidOperationException)
            {
                logger.LogWarning(ex,
                    "Cannot connect to Redis — falling back to in-memory code reservation. " +
                    "Start Redis (Docker: `docker run -p 6379:6379 redis:7-alpine`) " +
                    "or fix the connection string for multi-instance safety.");
                return null;
            }
        });
        services.AddSingleton<ICodeReservationService>(sp =>
        {
            // Redis when available, in-memory fallback otherwise.
            var redis = sp.GetService<IConnectionMultiplexer>();
            if (redis is not null)
            {
                return (ICodeReservationService)ActivatorUtilities.CreateInstance<RedisCodeReservationService>(sp, redis);
            }
            return new InMemoryCodeReservationService();
        });

        services.AddSingleton<FirestoreDb>(sp =>
        {
            var options = configuration.GetSection(FirebaseOptions.Section).Get<FirebaseOptions>()
                ?? throw new InvalidOperationException("Missing Firebase configuration section.");

            GoogleCredential credential;

            if (!string.IsNullOrWhiteSpace(options.CredentialsBase64))
            {
                var jsonBytes = Convert.FromBase64String(options.CredentialsBase64);
                using var stream = new MemoryStream(jsonBytes);
                credential = GoogleCredential.FromStream(stream);
            }
            else if (!string.IsNullOrWhiteSpace(options.CredentialsFilePath))
            {
                var credentialsPath = Path.IsPathRooted(options.CredentialsFilePath)
                    ? options.CredentialsFilePath
                    : Path.Combine(Directory.GetCurrentDirectory(), options.CredentialsFilePath);

                if (!File.Exists(credentialsPath))
                    throw new FileNotFoundException($"Firebase service account file not found at: {credentialsPath}");

                credential = GoogleCredential.FromFile(credentialsPath);
            }
            else
            {
                throw new InvalidOperationException(
                    "Firebase credentials not configured. Set either Firebase:CredentialsBase64 or Firebase:CredentialsFilePath.");
            }

            var builder = new FirestoreDbBuilder
            {
                ProjectId = options.ProjectId,
                Credential = credential,
            };
            return builder.Build();
        });

        services.AddSingleton<IInvitationCodeGenerator, InvitationCodeGenerator>();
        services.AddSingleton<ITurnClockRegistry, InMemoryTurnClockRegistry>();
        services.AddSingleton<INopeWindowRegistry, InMemoryNopeWindowRegistry>();
        services.AddSingleton<IFuturePeekRegistry, FuturePeekRegistry>();
        services.AddScoped<IFavorPickAutoResolver, FavorPickAutoResolver>();
        // Phase-1 sibling of the Favor resolver: auto-cancels a pending
        // "choose who to ask" picker (Favor phase 1) after the 10s budget.
        services.AddScoped<ITargetPickAutoResolver, TargetPickAutoResolver>();
        // In-memory room cache: singleton so all requests share the same warm cache.
        // Server restart clears it (cold start), but gameplay reads are near-zero Firestore.
        services.AddSingleton<IRoomCache, InMemoryRoomCache>();
        // Singleton room repository for test mode - zero Firestore reads/writes.
        //
        // IMPORTANT: the concrete type and the ITestRoomRepository interface
        // must resolve to the SAME instance. Registering them as two
        // independent factories created two separate stores, so a room
        // created through /api/test/room was invisible to the code path
        // that writes through IRoomRepository (and vice versa) — gameplay
        // writes landed in an empty store and the room state never changed.
        services.AddSingleton<InMemoryRoomRepository>(sp =>
        {
            var cache = sp.GetRequiredService<IRoomCache>();
            return new InMemoryRoomRepository(cache);
        });
        services.AddSingleton<ITestRoomRepository>(sp => sp.GetRequiredService<InMemoryRoomRepository>());
        // Singleton to track the single active test room.
        services.AddSingleton<IActiveTestRoom, ActiveTestRoom>();
        services.AddSingleton<ActiveTestRoom>(); // Keep concrete type for direct access if needed
        // FirestoreRoomRepository is still scoped because it holds a FirestoreDb
        // reference (which is safe to reuse but benefits from per-request lifetime).
        services.AddScoped<FirestoreRoomRepository>();
        // CachedRoomRepository decorates FirestoreRoomRepository with the IRoomCache.
        //
        // EXCEPTION — ephemeral/CI mode (Firestore:UseInMemoryRepository=true):
        // the production repository is swapped for the in-memory one so the CI
        // run never touches the shared Firestore quota and never needs the
        // service-account JSON (which doesn't exist on a GitHub runner).
        // Without this the CI backend booted Firestore-backed repos and every
        // request 500'd on missing credentials.
        if (useInMemoryRepository)
        {
            services.AddScoped<IRoomRepository>(sp => sp.GetRequiredService<InMemoryRoomRepository>());
        }
        else
        {
            services.AddScoped<IRoomRepository, CachedRoomRepository>();
        }
        services.AddScoped<ITurnTimeoutHandler, TurnTimeoutHandler>();
        services.AddScoped<INopeTimeoutHandler, NopeTimeoutHandler>();
        services.AddScoped<IRoomService, RoomService>();
        // TestRoomService: same IRoomService surface but reads/writes only the
        // in-memory test repo. Registered as a sub-interface so it doesn't
        // shadow the production RoomService above; consumers that need the
        // test-aware path inject ITestRoomService.
        services.AddScoped<ITestRoomService, TestRoomService>(sp =>
        {
            var testRepository = sp.GetRequiredService<ITestRoomRepository>();
            var codeGenerator = sp.GetRequiredService<IInvitationCodeGenerator>();
            return new TestRoomService(testRepository, codeGenerator);
        });
        // GameService gets both IRoomRepository (Firestore) and ITestRoomRepository (in-memory).
        // The GameService will use the test repository when available, falling back to Firestore.
        services.AddScoped<GameService>(sp =>
        {
            var repository = sp.GetRequiredService<IRoomRepository>();
            var testRepository = sp.GetService<ITestRoomRepository>();
            var broadcaster = sp.GetRequiredService<IGameBroadcaster>();
            var turnClock = sp.GetRequiredService<ITurnClockRegistry>();
            var nopeWindow = sp.GetRequiredService<INopeWindowRegistry>();
            var futurePeek = sp.GetRequiredService<IFuturePeekRegistry>();
            return new GameService(repository, testRepository, broadcaster, turnClock, nopeWindow, futurePeek);
        });
        // Bot auto-draw service
        services.AddHostedService<BotService>();

        return services;
    }
}
