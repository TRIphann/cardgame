using Arcana.Domain.Repositories;
using Microsoft.Extensions.DependencyInjection;

namespace Arcana.Api.Controllers;

/// <summary>
/// Centralized "mark stale members offline" trigger that fires the
/// underlying Firestore write at most once per room per
/// <see cref="PruneDebounceMs"/>. Without this gate the snapshot endpoint
/// would pay one Firestore read+write per request — and the polling loop
/// in <c>useRoomPolling.js</c> hits snapshot every 2-5s, so during a lobby
/// wait you'd burn 10+ writes/min just to maintain member-online flags.
/// </summary>
public sealed class StaleMemberPruner
{
    private const long PruneDebounceMs = 8000;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeSpan _offlineAfter;
    private readonly Dictionary<string, long> _lastPruneTicks = new(StringComparer.Ordinal);
    private readonly object _lock = new();

    public StaleMemberPruner(
        IServiceScopeFactory scopeFactory,
        TimeSpan? offlineAfter = null)
    {
        _scopeFactory = scopeFactory;
        _offlineAfter = offlineAfter ?? TimeSpan.FromSeconds(35);
    }

    /// <summary>
    /// Run a prune for <paramref name="roomId"/> unless one already ran
    /// recently. Fire-and-forget by design — the caller is on the snapshot
    /// hot path and the worst-case outcome of a missed prune is a single
    /// ghost member showing offline one cycle later, which is acceptable.
    /// </summary>
    public void PruneAsync(string roomId, CancellationToken ct)
    {
        var nowTicks = DateTime.UtcNow.Ticks;
        lock (_lock)
        {
            if (_lastPruneTicks.TryGetValue(roomId, out var last)
                && new TimeSpan(nowTicks - last).TotalMilliseconds < PruneDebounceMs)
            {
                return;
            }
            _lastPruneTicks[roomId] = nowTicks;
        }
        _ = Task.Run(async () =>
        {
            try
            {
                // Resolve the (scoped) IRoomRepository on a fresh background
                // scope — the caller's HTTP scope is gone by the time we run.
                using var scope = _scopeFactory.CreateScope();
                var repo = scope.ServiceProvider.GetRequiredService<IRoomRepository>();
                await repo.MarkStaleMembersOfflineAsync(roomId, _offlineAfter, CancellationToken.None);
            }
            catch
            {
                // Pruning is best-effort; never propagate failures (the snapshot
                // request itself already returned the room state).
            }
        }, ct);
    }

    /// <summary>
    /// Force the next prune attempt to actually hit the repository (used by
    /// tests to bypass the debounce). Production code should just call
    /// <see cref="PruneAsync"/>.
    /// </summary>
    public void Forget(string roomId)
    {
        lock (_lock) _lastPruneTicks.Remove(roomId);
    }
}
