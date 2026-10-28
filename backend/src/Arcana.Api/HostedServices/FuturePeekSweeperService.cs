using Arcana.Application.Abstractions;
using Arcana.Application.Services;
using Arcana.Domain.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Arcana.Api.HostedServices;

/// <summary>
/// Background loop that auto-clears stale <c>FuturePeek</c> entries once the
/// peek lifetime expires. Without this the modal would re-open on every
/// SignalR snapshot poll until the player takes their next action.
///
/// <para>
/// <b>Quota-safe design:</b> This service uses an in-memory
/// <see cref="IFuturePeekRegistry"/> instead of scanning Firestore. When a
/// Future card is played, <c>GameService</c> registers the room ID with an
/// expiry timestamp. When the turn advances (or the peek is noped), the
/// registry is cleared. This sweeper only reads Firestore for rooms that are
/// <i>known</i> to have an active peek — never a full-collection scan.
/// </para>
///
/// <para>
/// The lifetime is <c>PeekLifetime</c> (13s): 5s nope window + 8s view time.
/// The poll interval is <c>PollIntervalMs</c> (10s), giving a ≤10s grace
/// window for a 13s peek. Rooms with an active peek are swept as soon as
/// they appear in the registry — the 10s tick is the max delay, not a
/// guaranteed delay.
/// </para>
/// </summary>
public sealed class FuturePeekSweeperService(
    IServiceScopeFactory scopeFactory,
    IFuturePeekRegistry registry,
    ILogger<FuturePeekSweeperService> logger) : BackgroundService
{
    /// <summary>How often this loop scans the registry for expired entries.</summary>
    private const int PollIntervalMs = 10_000;

    /// <summary>When a Firestore quota error fires, back off this many ms.</summary>
    private const int QuotaBackoffMs = 300_000;

    /// <summary>
    /// Total lifetime of a Future peek before the sweeper wipes it.
    /// Unified 10s rule: the Future modal runs on the same 10s budget as
    /// every other picker (Nope window, Favor target/card, Combo, Bomb
    /// placement). Mirrors GameService.FuturePeekSeconds.
    /// </summary>
    public static readonly TimeSpan PeekLifetime = TimeSpan.FromSeconds(GameService.FuturePeekSeconds);

    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly IFuturePeekRegistry _registry = registry;
    private readonly ILogger<FuturePeekSweeperService> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "FuturePeekSweeperService started (poll={PollMs}ms, lifetime={Life}s)",
            PollIntervalMs, (int)PeekLifetime.TotalSeconds);

        var nextDelayMs = PollIntervalMs;

        while (!stoppingToken.IsCancellationRequested)
        {
            var quotaExceeded = false;

            try
            {
                await TickAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Grpc.Core.RpcException rex) when (
                rex.StatusCode == Grpc.Core.StatusCode.ResourceExhausted)
            {
                quotaExceeded = true;
                nextDelayMs = QuotaBackoffMs;
                _logger.LogWarning(
                    "FuturePeekSweeperService: Firestore quota exceeded, backing off {Sec}s",
                    nextDelayMs / 1000);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "FuturePeekSweeperService tick failed");
            }

            try
            {
                await Task.Delay(nextDelayMs, stoppingToken);
            }
            catch (OperationCanceledException) { break; }

            if (!quotaExceeded) nextDelayMs = PollIntervalMs;
        }

        _logger.LogInformation("FuturePeekSweeperService stopped");
    }

    private async Task TickAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;

        // Read the registry snapshot — zero Firestore reads here.
        // Only rooms with a known-active peek are included.
        var entries = _registry.Snapshot();
        if (entries.Count == 0) return;

        using var scope = _scopeFactory.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<IRoomRepository>();
        // Test rooms (created through /api/test/room) live in the in-memory
        // test repository, NOT in Firestore. The test repo is optional so
        // production deployments without it keep working unchanged.
        var testRepo = scope.ServiceProvider.GetService<ITestRoomRepository>();

        foreach (var entry in entries)
        {
            if (now < entry.ExpiresAtUtc) continue;

            try
            {
                // Resolve the WRITE target the same way GameService does:
                // prefer the test repo when the room actually lives there.
                // Without this the sweeper wrote test rooms to Firestore and
                // every tick failed with "No document to update" (NotFound),
                // spamming the log and leaving the peek stuck forever.
                var writeRepo = await ResolveWriteRepositoryAsync(entry.RoomId, testRepo, repo, ct);

                // Fetch the room so we can clear only FuturePeek fields without
                // wiping the rest of the game state (deck, hands, etc.).
                var room = await writeRepo.GetByIdAsync(entry.RoomId, ct);
                if (room?.GameState is null) { _registry.Unregister(entry.RoomId); continue; }

                var gs = room.GameState;
                gs.FuturePeek = null;
                gs.FuturePeekAt = null;

                // UpdateGameStateAsync: 1 read (GetByIdAsync inside) + 1 write.
                await writeRepo.UpdateGameStateAsync(entry.RoomId, gs, null, ct);
                _registry.Unregister(entry.RoomId);
                _logger.LogDebug(
                    "Cleared stale FuturePeek for room {RoomId}", entry.RoomId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to clear FuturePeek for room {RoomId}; will retry next tick",
                    entry.RoomId);
            }
        }
    }

    /// <summary>
    /// Picks the repository that OWNS the room: the in-memory test repo when
    /// the room lives there, otherwise the production Firestore-backed repo.
    /// Mirrors <c>GameService.ResolveWriteRepositoryAsync</c> so the sweeper
    /// and the game engine always agree on where a room's state lives.
    /// </summary>
    private static async Task<IRoomRepository> ResolveWriteRepositoryAsync(
        string roomId,
        ITestRoomRepository? testRepo,
        IRoomRepository productionRepo,
        CancellationToken ct)
    {
        if (testRepo is not null)
        {
            var testRoom = await testRepo.GetByIdAsync(roomId, ct);
            if (testRoom is not null) return testRepo;
        }
        return productionRepo;
    }
}
