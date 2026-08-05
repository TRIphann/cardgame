using Arcana.Application.Abstractions;
using Arcana.Application.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Arcana.Infrastructure;

/// <summary>
/// Glue between <see cref="NopeTimeoutService"/> and
/// <see cref="GameService.ResolveExpiredNopeAsync"/>. Each tick resolves a
/// fresh scope so we get the same scoped GameService the HTTP path uses.
///
/// Quota note: pre-resolve read goes through <see cref="IRoomService"/> so
/// the 2-second snapshot cache (auto-invalidated on every write) absorbs
/// back-to-back ticks. The post-resolve read also goes through the cache so
/// even on a cache miss the cache fills and the next tick hits.
/// </summary>
public sealed class NopeTimeoutHandler : INopeTimeoutHandler
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly INopeWindowRegistry _registry;
    private readonly ILogger<NopeTimeoutHandler> _logger;

    public NopeTimeoutHandler(
        IServiceScopeFactory scopeFactory,
        INopeWindowRegistry registry,
        ILogger<NopeTimeoutHandler> logger)
    {
        _scopeFactory = scopeFactory;
        _registry = registry;
        _logger = logger;
    }

    public async Task HandleAsync(string roomId, CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var roomService = sp.GetRequiredService<IRoomService>();
        var gameService = sp.GetRequiredService<GameService>();

        var room = await roomService.GetRoomAsync(roomId, ct);
        if (room is null)
        {
            _registry.Unregister(roomId);
            return;
        }
        var gs = room.GameState;
        if (gs is null || gs.EndedAt is not null || gs.PendingAction is null)
        {
            _registry.Unregister(roomId);
            return;
        }

        await gameService.ResolveExpiredNopeAsync(roomId, ct);
        // ResolveExpiredNopeAsync clears PendingAction. Re-fetch (through cache)
        // to make sure the next turn clock is registered for the right player.
        var refreshed = await roomService.GetRoomAsync(roomId, ct);
        if (refreshed?.GameState is { EndedAt: null, PendingAction: null, TurnStartedAt: not null })
        {
            // Hand off to TurnClockRegistry — they live in the same DI
            // container so we just resolve the same registry here.
            var turnClock = sp.GetRequiredService<ITurnClockRegistry>();
            turnClock.Register(roomId, refreshed.GameState.TurnStartedAt!.Value);
        }
        _registry.Unregister(roomId);
        // Use Debug — auto-resolves fire every 5s on stale Nope windows;
        // logging at Info would create one noisy line per stale window.
        _logger.LogDebug(
            "Auto-resolved expired Nope window for room {RoomId}", roomId);
    }
}