using Arcana.Application.Abstractions;
using Arcana.Application.Services;
using Arcana.Domain.Common;
using Arcana.Domain.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Arcana.Infrastructure;

/// <summary>
/// Glue between the <see cref="TurnClockService"/> background loop and
/// <see cref="GameService.DrawCardAsync"/>. Resolves the scoped GameService
/// (which has the actual game logic) and asks it to draw on behalf of the
/// player whose turn has timed out.
///
/// Important: DrawCardAsync only validates "is it your turn?" by memberId.
/// We grab the current turn member at the moment of the timeout and pass
/// that to DrawCardAsync so we never draw for the wrong person — race-free
/// because the read happens inside the same scope that performs the write.
/// </summary>
public sealed class TurnTimeoutHandler : ITurnTimeoutHandler
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ITurnClockRegistry _registry;
    private readonly ILogger<TurnTimeoutHandler> _logger;

    public TurnTimeoutHandler(
        IServiceScopeFactory scopeFactory,
        ITurnClockRegistry registry,
        ILogger<TurnTimeoutHandler> logger)
    {
        _scopeFactory = scopeFactory;
        _registry = registry;
        _logger = logger;
    }

    public async Task HandleAsync(string roomId, CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var roomRepo = sp.GetRequiredService<IRoomRepository>();
        var gameService = sp.GetRequiredService<GameService>();

        // Read fresh state — the turn may have changed since the registry
        // snapshot was taken. If the game ended, unregister and bail out.
        var room = await roomRepo.GetByIdAsync(roomId, ct);
        if (room is null)
        {
            _registry.Unregister(roomId);
            return;
        }
        var gs = room.GameState;
        if (gs is null || gs.EndedAt is not null || gs.PendingAction is not null
            || string.IsNullOrEmpty(gs.CurrentTurnMemberId))
        {
            // Either the game ended, a nope window is pending (don't auto-draw
            // while another player could chain Nope), or the room hasn't
            // started yet. Drop the registry entry; the next StartGameAsync
            // (if any) will re-register.
            _registry.Unregister(roomId);
            return;
        }

        // Stale-start guard: another tick may have already triggered the
        // auto-draw for the previous turn. If TurnStartedAt is fresher than
        // the entry we were watching, this turn is already in good hands.
        var snap = _registry.Snapshot();
        var tracked = snap.FirstOrDefault(e => e.RoomId == roomId);
        if (tracked.RoomId is not null && tracked.StartedAtUtc != gs.TurnStartedAt)
        {
            // The registry entry is stale. Refresh it and let the next tick
            // decide whether THIS turn has expired.
            if (gs.TurnStartedAt is not null)
                _registry.Register(roomId, gs.TurnStartedAt.Value);
            return;
        }

        var memberId = gs.CurrentTurnMemberId;
        try
        {
            await gameService.DrawCardAsync(roomId, memberId, ct);
            // DrawCardAsync advances the turn and resets TurnStartedAt, but
            // GameService doesn't know about the registry. We re-register
            // here using the fresh state so the next player is on the clock.
            var refreshed = await roomRepo.GetByIdAsync(roomId, ct);
            if (refreshed?.GameState is { EndedAt: null, TurnStartedAt: not null })
            {
                _registry.Register(roomId, refreshed.GameState.TurnStartedAt!.Value);
            }
            else
            {
                _registry.Unregister(roomId);
            }
            _logger.LogInformation(
                "Auto-drew for player {MemberId} in room {RoomId} (turn timer expired)",
                memberId, roomId);
        }
        catch (DomainException ex) when (ex.Code == "no_defuse_required")
        {
            // Defuse modal just popped for the timed-out player — let them
            // still react. Their turn hasn't advanced; refresh the registry
            // so we don't immediately fire again.
            if (gs.TurnStartedAt is not null)
                _registry.Register(roomId, gs.TurnStartedAt.Value);
        }
        catch (DomainException ex) when (ex.Code is "deck_empty" or "action_pending" or "not_your_turn")
        {
            // Race: another player already moved, the deck ran dry, or a
            // nope window opened in between. Drop the room — next mutation
            // will re-register if needed.
            _logger.LogDebug(
                "Auto-draw skipped for room {RoomId}: {Reason}",
                roomId, ex.Code);
            _registry.Unregister(roomId);
        }
    }
}
