using Arcana.Application.Abstractions;
using Arcana.Application.Services;
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
/// the granularity at which an "expired" turn is detected. The 10s window
/// itself lives in <see cref="GameService.TurnTimeLimitSeconds"/>.
///
/// <para>
/// Quota guard: with the AFK auto-play mode (<see cref="TurnClockEntry.TimeoutSeconds"/> = 0)
/// a single AFK player can trigger a write per tick (every 2s). If multiple
/// players in the same room go AFK simultaneously this can hammer Firestore.
/// We mirror <c>BotService</c>'s cooldown strategy: the first time we see a
/// quota error we suppress ticking for <see cref="QuotaCooldown"/> seconds
/// so the project isn't drained.
/// </para>
/// </summary>
public sealed class TurnClockService(
    IServiceScopeFactory scopeFactory,
    ITurnClockRegistry registry,
    ILogger<TurnClockService> logger) : BackgroundService
{
    /// <summary>How often the background loop scans the registry.</summary>
    private const int PollIntervalMs = 2_000;

    /// <summary>Backoff delay once we've seen Firestore quota errors.</summary>
    private const int QuotaBackoffMs = 30_000;

    /// <summary>How long to suppress polling after a quota error.</summary>
    private static readonly TimeSpan QuotaCooldown = TimeSpan.FromSeconds(60);

    /// <summary>
    /// How long a single turn lasts before auto-draw kicks in.
    /// Forwarded from <see cref="GameService.TurnTimeLimitSeconds"/> so the
    /// background loop, the gameplay code and the picker timers all share
    /// the same 10-second budget.
    /// </summary>
    public const int TurnTimeLimitSeconds = GameService.TurnTimeLimitSeconds;

    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ITurnClockRegistry _registry = registry;
    private readonly ILogger<TurnClockService> _logger = logger;
    private long _quotaCooldownUntilTicks;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "TurnClockService started (poll={PollMs}ms, limit={Limit}s)",
            PollIntervalMs, TurnTimeLimitSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            // Suppress ticking when we're in a Firestore-quota cooldown window.
            // Without this, AFK auto-play chains (every 2s auto-draw per player)
            // could exhaust quota within seconds and starve user-facing requests.
            var nowTicks = DateTime.UtcNow.Ticks;
            if (nowTicks < Interlocked.Read(ref _quotaCooldownUntilTicks))
            {
                await SafeDelay(PollIntervalMs, stoppingToken);
                continue;
            }

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
                if (IsQuotaError(ex))
                {
                    var until = DateTime.UtcNow + QuotaCooldown;
                    Interlocked.Exchange(ref _quotaCooldownUntilTicks, until.Ticks);
                    _logger.LogWarning(
                        "TurnClockService hit Firestore quota; backing off until {Until:o}",
                        until);
                    await SafeDelay(QuotaBackoffMs, stoppingToken);
                    continue;
                }
                // A single bad room must not crash the loop. Log and keep going.
                _logger.LogError(ex, "TurnClockService tick failed");
            }

            await SafeDelay(PollIntervalMs, stoppingToken);
        }

        _logger.LogInformation("TurnClockService stopped");
    }

    private static async Task SafeDelay(int ms, CancellationToken stoppingToken)
    {
        try { await Task.Delay(ms, stoppingToken); }
        catch (OperationCanceledException) { }
    }

    private static bool IsQuotaError(Exception ex)
    {
        for (var e = ex; e != null; e = e.InnerException)
        {
            var msg = e.Message;
            if (msg != null && msg.Contains("Quota exceeded", StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    private async Task TickAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var snapshot = _registry.Snapshot();
        if (snapshot.Count == 0) return;

        foreach (var entry in snapshot)
        {
            // Per-entry timeout: AFK players get timeout=0 so the very next
            // tick fires immediately after the previous auto-draw completes.
            var threshold = TimeSpan.FromSeconds(entry.TimeoutSeconds);
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
                if (IsQuotaError(ex))
                {
                    // Re-throw so the outer loop's quota backoff catches it
                    // and suppresses all rooms (not just this one) for the
                    // cooldown duration.
                    throw;
                }
                _logger.LogWarning(ex,
                    "Auto-draw failed for room {RoomId}; will retry next tick",
                    entry.RoomId);
            }
        }
    }
}
