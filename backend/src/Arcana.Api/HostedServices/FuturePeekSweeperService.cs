using Arcana.Domain.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Arcana.Api.HostedServices;

/// <summary>
/// Background loop that auto-clears stale <c>GameState.FuturePeek</c> entries
/// once the peek lifetime expires. Without this the modal would re-open on
/// every SignalR snapshot poll until the player takes their next action
/// (which clears it via <c>AdvanceTurn</c>).
///
/// The lifetime is intentionally short: <c>NopeWindowSeconds</c> (5s) for
/// the nope chain plus another 8s grace for the actor to view the cards.
/// Combined: 13s. By the time we sweep, the actor has either committed the
/// peek mentally or moved on. We also broadcast so subscribers see the
/// cleared state in real-time.
/// </summary>
public sealed class FuturePeekSweeperService : BackgroundService
{
    /// <summary>How often this loop scans for stale FuturePeek entries.</summary>
    private const int PollIntervalMs = 2_000;

    /// <summary>
    /// Total lifetime of a Future peek before the sweeper wipes it. Tuned to
    /// "nope window (5s) + generous view time (8s)" = 13s. Anything longer
    /// risks the modal lingering past the actor's actual viewing time.
    /// </summary>
    public static readonly TimeSpan PeekLifetime = TimeSpan.FromSeconds(13);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<FuturePeekSweeperService> _logger;

    public FuturePeekSweeperService(
        IServiceScopeFactory scopeFactory,
        ILogger<FuturePeekSweeperService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "FuturePeekSweeperService started (poll={PollMs}ms, lifetime={Life}s)",
            PollIntervalMs, (int)PeekLifetime.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "FuturePeekSweeperService tick failed");
            }

            try
            {
                await Task.Delay(PollIntervalMs, stoppingToken);
            }
            catch (OperationCanceledException) { break; }
        }

        _logger.LogInformation("FuturePeekSweeperService stopped");
    }

    private async Task TickAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        using var scope = _scopeFactory.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<IRoomRepository>();

        // Scan every active room. The number of rooms in flight is small
        // (single-digit for a casual party game) so an O(rooms) scan is fine.
        var rooms = await repo.GetAllPlayingAsync(ct);
        if (rooms.Count == 0) return;

        foreach (var room in rooms)
        {
            var gs = room.GameState;
            if (gs?.FuturePeek is null || gs.FuturePeekAt is null) continue;
            if (now - gs.FuturePeekAt.Value < PeekLifetime) continue;

            // Expired — wipe and persist so the modal stops re-opening.
            gs.FuturePeek = null;
            gs.FuturePeekAt = null;
            await repo.UpdateGameStateAsync(room.Id, gs, null, ct);
            _logger.LogInformation(
                "Cleared stale FuturePeek for room {RoomId}", room.Id);
        }
    }
}