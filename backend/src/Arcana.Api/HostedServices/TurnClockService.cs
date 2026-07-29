using Arcana.Application.Abstractions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Arcana.Api.HostedServices;

/// <summary>
/// Background loop that watches the <see cref="ITurnClockRegistry"/> and
/// auto-draws for any player who has exceeded their turn window. Each room
/// gets its own scope so the scoped GameService + repository can be reused
/// exactly the same way as a manual HTTP request.
///
/// The check runs every <see cref="PollIntervalMs"/> milliseconds — that's
/// the granularity at which an "expired" turn is detected. The 60s window
/// itself lives in <see cref="TurnTimeLimitSeconds"/>.
/// </summary>
public sealed class TurnClockService : BackgroundService
{
    /// <summary>How often the background loop scans the registry.</summary>
    private const int PollIntervalMs = 2_000;

    /// <summary>How long a single turn lasts before auto-draw kicks in.</summary>
    public const int TurnTimeLimitSeconds = 60;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ITurnClockRegistry _registry;
    private readonly ILogger<TurnClockService> _logger;

    public TurnClockService(
        IServiceScopeFactory scopeFactory,
        ITurnClockRegistry registry,
        ILogger<TurnClockService> logger)
    {
        _scopeFactory = scopeFactory;
        _registry = registry;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "TurnClockService started (poll={PollMs}ms, limit={Limit}s)",
            PollIntervalMs, TurnTimeLimitSeconds);

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
                // A single bad room must not crash the loop. Log and keep going.
                _logger.LogError(ex, "TurnClockService tick failed");
            }

            try
            {
                await Task.Delay(PollIntervalMs, stoppingToken);
            }
            catch (OperationCanceledException) { break; }
        }

        _logger.LogInformation("TurnClockService stopped");
    }

    private async Task TickAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var snapshot = _registry.Snapshot();
        if (snapshot.Count == 0) return;

        var threshold = TimeSpan.FromSeconds(TurnTimeLimitSeconds);
        foreach (var entry in snapshot)
        {
            if (now - entry.StartedAtUtc < threshold) continue;

            // Resolve a fresh handler per-room. The handler is responsible
            // for re-registering the room if the game is still ongoing, or
            // unregistering it if the game ended.
            using var scope = _scopeFactory.CreateScope();
            var handler = scope.ServiceProvider.GetRequiredService<ITurnTimeoutHandler>();
            try
            {
                await handler.HandleAsync(entry.RoomId, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Auto-draw failed for room {RoomId}; will retry next tick",
                    entry.RoomId);
            }
        }
    }
}
