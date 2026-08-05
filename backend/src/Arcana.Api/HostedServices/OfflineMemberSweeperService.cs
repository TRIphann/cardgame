using Arcana.Domain.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Arcana.Api.HostedServices;

/// <summary>
/// Background loop that marks <c>isOnline=false</c> on members whose
/// <c>lastSeenAt</c> is older than the offline window. Replaces the
/// per-snapshot prune which was hammering Firestore (every poll
/// triggered a subcollection scan).
///
/// We use a single collection-group sweep with a server-side timestamp
/// inequality so the query touches only the few stale rows instead of
/// every member of every active room.
/// </summary>
public sealed class OfflineMemberSweeperService : BackgroundService
{
    /// <summary>How often this loop scans for stale members.</summary>
    private const int PollIntervalMs = 60_000;

    /// <summary>
    /// When Firestore returns a quota error, back off hard so we don't
    /// burn the remaining daily budget in a tight retry loop.
    /// </summary>
    private const int QuotaBackoffMs = 600_000;

    /// <summary>Stale after 35s — matches the previous Online cutoff.</summary>
    private static readonly TimeSpan OfflineAfter = TimeSpan.FromSeconds(35);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OfflineMemberSweeperService> _logger;

    public OfflineMemberSweeperService(
        IServiceScopeFactory scopeFactory,
        ILogger<OfflineMemberSweeperService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "OfflineMemberSweeperService started (poll={PollMs}ms, offlineAfter={Sec}s)",
            PollIntervalMs, (int)OfflineAfter.TotalSeconds);

        var nextDelayMs = PollIntervalMs;

        while (!stoppingToken.IsCancellationRequested)
        {
            var quotaExceeded = false;
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var repo = scope.ServiceProvider.GetRequiredService<IRoomRepository>();
                var touched = await repo.SweepStaleMembersAsync(OfflineAfter, maxRooms: 50, ct: stoppingToken);
                if (touched > 0)
                {
                    _logger.LogInformation(
                        "OfflineMemberSweeperService marked {Count} members offline", touched);
                }
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
                    "OfflineMemberSweeperService: Firestore quota exceeded, backing off {Sec}s",
                    nextDelayMs / 1000);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "OfflineMemberSweeperService tick failed");
            }

            try
            {
                await Task.Delay(nextDelayMs, stoppingToken);
            }
            catch (OperationCanceledException) { break; }

            if (!quotaExceeded) nextDelayMs = PollIntervalMs;
        }

        _logger.LogInformation("OfflineMemberSweeperService stopped");
    }
}