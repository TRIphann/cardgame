using Arcana.Application.Abstractions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Arcana.Api.HostedServices;

// FavorPickAutoResolverService — background sweeper that resolves stale
// pending Favor picks. Scans every 2s for rooms where PendingFavorPick has
// been open longer than IFavorPickAutoResolver.PickTimeoutSeconds (10s by
// default), and calls ResolveAsync to auto-pick a random non-bomb card from
// the target's hand. Keeps the game from stalling when the target walks
// away or hides the picker.
//
// 2s tick is intentional: we want a 10s timeout to feel snappy, not "wait
// 10s + a polling interval".
public sealed class FavorPickAutoResolverService(
    IServiceScopeFactory scopeFactory,
    ILogger<FavorPickAutoResolverService> logger) : BackgroundService
{
    private const int PollIntervalMs = 2_000;

    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<FavorPickAutoResolverService> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "FavorPickAutoResolverService started (poll={PollMs}ms)", PollIntervalMs);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var resolver = scope.ServiceProvider.GetRequiredService<IFavorPickAutoResolver>();

                var expired = resolver.FindExpiredFavorPicks();
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
                            "Failed to resolve favor pick for room {RoomId}", roomId);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "FavorPickAutoResolverService tick failed");
            }

            try { await Task.Delay(PollIntervalMs, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }

        _logger.LogInformation("FavorPickAutoResolverService stopped");
    }
}
