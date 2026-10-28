using Arcana.Application.Abstractions;
using Arcana.Application.Services;
using Arcana.Domain.Common;
using Arcana.Domain.Entities;
using Arcana.Domain.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Arcana.Infrastructure;

// TargetPickAutoResolver — scans the room cache every 2s for any room whose
// PendingTargetPick has been open longer than the unified 10s picker budget,
// and auto-cancels the action.
//
// This is the PHASE-1 sibling of FavorPickAutoResolver:
//   - FavorPickAutoResolver  → phase 2: the TARGET picks which card to give.
//   - TargetPickAutoResolver → phase 1: the ACTOR picks WHO to ask.
//
// Without the phase-1 sweeper an actor who plays a Favor and then walks
// away stalls the room forever: the turn never advances, no Nope window is
// open, and the target is never asked for a card.
public sealed class TargetPickAutoResolver(
    IRoomCache roomCache,
    IServiceScopeFactory scopeFactory,
    ILogger<TargetPickAutoResolver> logger) : ITargetPickAutoResolver
{
    private readonly IRoomCache _roomCache = roomCache;
    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<TargetPickAutoResolver> _logger = logger;

    // Unified 10-second picker rule — same budget as the Favor card picker,
    // the Combo pickers and the Bomb placement picker.
    public TimeSpan PickTimeoutSeconds => TimeSpan.FromSeconds(GameService.PickerTimeoutSeconds);

    public IReadOnlyList<string> FindExpiredTargetPicks()
    {
        var cutoff = DateTime.UtcNow - PickTimeoutSeconds;
        var result = new List<string>();
        foreach (var roomId in _roomCache.Keys())
        {
            var room = _roomCache.Get(roomId);
            if (room?.GameState is null) continue;
            var pending = room.GameState.PendingTargetPick;
            if (pending is null) continue;
            if (pending.CreatedAt > cutoff) continue;
            result.Add(roomId);
        }
        return result;
    }

    public async Task<Room?> ResolveAsync(string roomId, CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var gameService = scope.ServiceProvider.GetRequiredService<GameService>();

        try
        {
            var result = await gameService.AutoCancelPendingTargetPickAsync(roomId, ct);
            if (result is null) return null;

            _logger.LogInformation(
                "Auto-cancelled expired target picker in room {RoomId}", roomId);
            return result.Room;
        }
        catch (DomainException ex)
        {
            // Race: the picker was cleared between FindExpiredTargetPicks and
            // now (the player picked in time, or the game ended). Not an
            // error worth bubbling up — the next tick just moves on.
            _logger.LogDebug(ex,
                "Skipped target auto-cancel in room {RoomId}: {Reason}",
                roomId, ex.Code);
            return null;
        }
    }
}
