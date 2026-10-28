using Arcana.Application.Abstractions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Arcana.Api.HostedServices;

// TargetPickAutoResolverService — background sweeper that resolves stale
// pending TARGET pickers (Favor phase 1 — "choose who to ask").
//
// Scans every 2s for rooms where PendingTargetPick has been open longer than
// ITargetPickAutoResolver.PickTimeoutSeconds (10s by default) and calls
// ResolveAsync to auto-cancel the action: the Favor card is spent, the turn
// advances, and nobody is asked to hand over a card.
//
// The 2s tick is intentional — a 10s timeout should feel snappy, not
// "wait 10s + a polling interval".
public sealed class TargetPickAutoResolverService(
    IServiceScopeFactory scopeFactory,
    ILogger<TargetPickAutoResolverService> logger) : BackgroundService
{
    private const int PollIntervalMs = 2_000;

    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<TargetPickAutoResolverService> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "TargetPickAutoResolverService started (poll={PollMs}ms)", PollIntervalMs);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var resolver = scope.ServiceProvider.GetRequiredService<ITargetPickAutoResolver>();

                var expired = resolver.FindExpiredTargetPicks();
                foreach (var roomId in expired)
                {
                    try
                    {
                        await resolver.ResolveAsync(roomId, stoppingToken);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        // One bad room shouldn't poison the whole sweep.
                        _logger.LogWarning(ex,
                            "Failed to auto-cancel target pick for room {RoomId}", roomId);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "TargetPickAutoResolverService tick failed");
            }

            try { await Task.Delay(PollIntervalMs, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }

        _logger.LogInformation("TargetPickAutoResolverService stopped");
    }
}
