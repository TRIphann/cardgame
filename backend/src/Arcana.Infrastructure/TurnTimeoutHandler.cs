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
public sealed class TurnTimeoutHandler(
    IServiceScopeFactory scopeFactory,
    ITurnClockRegistry registry,
    ILogger<TurnTimeoutHandler> logger) : ITurnTimeoutHandler
{
    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ITurnClockRegistry _registry = registry;
    private readonly ILogger<TurnTimeoutHandler> _logger = logger;

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
            // isAutoDraw=true tells GameService to mark the player AFK on
            // their first timeout. After PersistAsync runs, the turn clock
            // for the NEXT player is re-registered below from the result
            // payload — no extra Firestore read needed.
            //
            // Pass `room` we just read so DrawCardAsync doesn't issue its
            // own GetByIdAsync (saves 1 read per auto-draw — important for
            // AFK auto-play chains that fire every 2s).
            var drawResult = await gameService.DrawCardAsync(
                roomId, memberId, room, isAutoDraw: true, ct: ct);

            // The fresh room snapshot is already on drawResult.Room from
            // DrawCardAsync's final read — use it directly to re-register
            // the next player's clock. If they're AFK too the timeout goes
            // to 0 so the auto-draw chain keeps firing.
            var refreshedGs = drawResult.Room?.GameState;
            if (refreshedGs is { EndedAt: null, TurnStartedAt: not null })
            {
                // Unified 10s rule: every action resets the timer back to 10.
                // AFK players still get timeout=0 so the auto-draw chain keeps
                // firing without burning the 10s budget they aren't watching.
                var timeoutSeconds = refreshedGs.AfkMemberIds.Contains(refreshedGs.CurrentTurnMemberId)
                    ? 0
                    : GameService.TurnTimeLimitSeconds;
                _registry.Register(
                    roomId,
                    refreshedGs.TurnStartedAt!.Value,
                    timeoutSeconds);
            }
            else
            {
                _registry.Unregister(roomId);
            }
            _logger.LogInformation(
                "Auto-drew for player {MemberId} in room {RoomId} (turn timer expired)",
                memberId, roomId);
        }
        catch (DomainException ex) when (ex.Code is "deck_empty" or "action_pending" or "not_your_turn")
        {
            // Race: another player already moved, the deck ran dry, or a
            // nope window opened in between. Drop the room — next mutation
            // will re-register if needed. (The previous code had two extra
            // catch arms below for `deck_empty_during_attack` and a duplicate
            // `deck_empty`, but both are dead: `GameService` only throws
            // `deck_empty` (not `deck_empty_during_attack`) and the OR-list
            // above already swallows it.)
            _logger.LogDebug(
                "Auto-draw skipped for room {RoomId}: {Reason}",
                roomId, ex.Code);
            _registry.Unregister(roomId);
        }
        catch (DomainException ex) when (ex.Code == "already_dead")
        {
            // The timed-out player died (e.g. via a bomb) between the
            // registry snapshot and this call. AdvanceTurn should already
            // have moved the turn forward; just refresh the registry to the
            // current player so the next tick fires for the right person.
            var refreshed = await roomRepo.GetByIdAsync(roomId, ct);
            if (refreshed?.GameState is { EndedAt: null, TurnStartedAt: not null })
            {
                _registry.Register(roomId, refreshed.GameState.TurnStartedAt!.Value);
            }
            else
            {
                _registry.Unregister(roomId);
            }
        }
    }
}
