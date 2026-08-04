using Arcana.Application.Abstractions;
using Arcana.Application.Services;
using Arcana.Domain.Repositories;
using Arcana.Infrastructure.Firebase;
using Arcana.Infrastructure.Repositories;
using Google.Apis.Auth.OAuth2;
using Google.Cloud.Firestore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
namespace Arcana.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddArcanaInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<FirebaseOptions>(configuration.GetSection(FirebaseOptions.Section));

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
        services.AddScoped<ITurnTimeoutHandler, TurnTimeoutHandler>();
        services.AddScoped<INopeTimeoutHandler, NopeTimeoutHandler>();
        services.AddScoped<IRoomRepository, FirestoreRoomRepository>();
        services.AddScoped<IRoomService, RoomService>();
        services.AddScoped<GameService>();

        return services;
    }
}
