using Arcana.Application.Abstractions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Arcana.Api.HostedServices;

/// <summary>
/// Background loop that resolves Nope windows that expired with no chain
/// (or an even-length chain). It commits the original action and advances
/// the turn so the game never gets stuck because a player walked away.
///
/// Runs in parallel with <see cref="TurnClockService"/>. They share the
/// <see cref="IServiceScopeFactory"/> pattern — each room gets a fresh scope
/// so the scoped GameService / repository are the same ones the HTTP path
/// uses.
/// </summary>
public sealed class NopeTimeoutService : BackgroundService
{
    /// <summary>How often this loop scans for stale Nope windows.</summary>
    private const int PollIntervalMs = 500;

    /// <summary>Total window length — must mirror GameService's NopeWindowSeconds.</summary>
    public const int NopeWindowSeconds = 3;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly INopeWindowRegistry _registry;
    private readonly ILogger<NopeTimeoutService> _logger;

    public NopeTimeoutService(
        IServiceScopeFactory scopeFactory,
        INopeWindowRegistry registry,
        ILogger<NopeTimeoutService> logger)
    {
        _scopeFactory = scopeFactory;
        _registry = registry;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "NopeTimeoutService started (poll={PollMs}ms, window={Window}s)",
            PollIntervalMs, NopeWindowSeconds);

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
                _logger.LogError(ex, "NopeTimeoutService tick failed");
            }

            try
            {
                await Task.Delay(PollIntervalMs, stoppingToken);
            }
            catch (OperationCanceledException) { break; }
        }

        _logger.LogInformation("NopeTimeoutService stopped");
    }

    private async Task TickAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var snapshot = _registry.Snapshot();
        if (snapshot.Count == 0) return;

        var threshold = TimeSpan.FromSeconds(NopeWindowSeconds);
        foreach (var entry in snapshot)
        {
            if (now - entry.CreatedAtUtc < threshold) continue;

            using var scope = _scopeFactory.CreateScope();
            var handler = scope.ServiceProvider.GetRequiredService<INopeTimeoutHandler>();
            try
            {
                await handler.HandleAsync(entry.RoomId, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Nope-window auto-resolve failed for room {RoomId}; will retry next tick",
                    entry.RoomId);
            }
        }
    }
}