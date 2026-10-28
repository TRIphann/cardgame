using Arcana.Application.Abstractions;
using Arcana.Application.Services;
using Arcana.Domain.Common;
using Arcana.Domain.Entities;
using Arcana.Domain.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Arcana.Infrastructure;

// FavorPickAutoResolver — scans the cache every 2s for any room whose
// PendingFavorPick has been open longer than PickTimeoutSeconds (10s by
// default), and auto-picks a random non-bomb card from the target's hand
// on the target's behalf.
//
// Why a separate component rather than wiring it into GameService? Favor
// auto-pick is a cross-cutting concern (it runs continuously across all
// rooms without a player request) and Poll-and-resolve is its natural
// shape. The background sweeper just calls ResolveAsync for each hit.
public sealed class FavorPickAutoResolver(
    IRoomCache roomCache,
    IServiceScopeFactory scopeFactory,
    ILogger<FavorPickAutoResolver> logger) : IFavorPickAutoResolver
{
    private readonly IRoomCache _roomCache = roomCache;
    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<FavorPickAutoResolver> _logger = logger;

    // Unified 10-second picker rule: matches GameService.PickerTimeoutSeconds.
    // The Favor target/card picker, Combo 2/3 picker and Bomb placement
    // picker all run on this same 10s budget. If no pick lands inside the
    // window the system auto-picks a random valid card / slot on the
    // player's behalf so the game never stalls.
    public TimeSpan PickTimeoutSeconds => TimeSpan.FromSeconds(GameService.PickerTimeoutSeconds);

    public IReadOnlyList<string> FindExpiredFavorPicks()
    {
        var cutoff = DateTime.UtcNow - PickTimeoutSeconds;
        var result = new List<string>();
        foreach (var roomId in _roomCache.Keys())
        {
            var room = _roomCache.Get(roomId);
            if (room?.GameState is null) continue;
            var pending = room.GameState.PendingFavorPick;
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

        // Load playing room state directly so we can hand CompleteFavorPickAsync
        // the same Room + GameState pair (and clone in one place).
        var room = await gameService.LoadPlayingRoomAsync(roomId, ct);
        if (room is null) return null;
        var gs = room.GameState!;
        var pending = gs.PendingFavorPick;
        if (pending is null) return null;

        try
        {
            var result = await gameService.CompleteFavorPickAsync(
                room, gs, pending.TargetMemberId,
                discardPickKey: "", autoPicked: true, ct);

            _logger.LogInformation(
                "Auto-picked favor card for target {Target} in room {RoomId}",
                pending.TargetMemberId, roomId);
            return result.Room;
        }
        catch (DomainException ex)
        {
            // Race: pick was cleared between FindExpiredFavorPicks and now
            // (player picked, or game ended). Log and move on — this isn't
            // an error worth bubbling up to the user.
            _logger.LogDebug(ex,
                "Skipped favor auto-resolve in room {RoomId}: {Reason}",
                roomId, ex.Code);
            return null;
        }
    }
}
