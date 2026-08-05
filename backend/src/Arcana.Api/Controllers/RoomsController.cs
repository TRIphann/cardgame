using Arcana.Application.Abstractions;
using Arcana.Application.Game;
using Arcana.Application.Services;
using Arcana.Domain.Common;
using Arcana.Domain.Entities;
using Arcana.Shared.Contracts;
using Microsoft.AspNetCore.Mvc;

namespace Arcana.Api.Controllers;

[ApiController]
[Route("api/rooms")]
public class RoomsController : ControllerBase
{
    private readonly IRoomService _roomService;
    private readonly GameService _gameService;

    public RoomsController(IRoomService roomService, GameService gameService)
    {
        _roomService = roomService;
        _gameService = gameService;
    }

    [HttpPost]
    public async Task<ActionResult<RoomDto>> Create([FromBody] CreateRoomRequest request, CancellationToken ct)
    {
        var room = await _roomService.CreateRoomAsync(request.HostName, ct);
        return Ok(MapToDto(room, null));
    }

    [HttpPost("join")]
    public async Task<ActionResult<RoomDto>> Join([FromBody] JoinRoomRequest request, CancellationToken ct)
    {
        var room = await _roomService.JoinRoomAsync(request.Code, request.PlayerName, ct);
        // On join we don't know which member is the new one — return no hand.
        var newMember = room.Members.FirstOrDefault(m => m.Name == request.PlayerName.Trim());
        return Ok(MapToDto(room, newMember?.Id));
    }

    [HttpPost("{id}/kick")]
    public async Task<ActionResult<RoomDto>> Kick(
        [FromRoute] string id,
        [FromBody] KickMemberRequest request,
        CancellationToken ct)
    {
        var room = await _roomService.KickMemberAsync(id, request.HostId, request.TargetMemberId, ct);
        return Ok(MapToDto(room!, request.HostId));
    }

    [HttpPost("{id}/ready")]
    public async Task<ActionResult<RoomMemberDto>> SetReady(
        [FromRoute] string id,
        [FromBody] SetReadyRequest request,
        CancellationToken ct)
    {
        var member = await _roomService.SetReadyAsync(id, request.MemberId, request.IsReady, ct);
        if (member is null) return NotFound(new ErrorResponse("member_not_found", "Thành viên không còn trong phòng."));
        return Ok(MapMemberDto(member));
    }

    [HttpPost("{id}/heartbeat")]
    public async Task<IActionResult> Heartbeat(
        [FromRoute] string id,
        [FromBody] HeartbeatRequest request,
        CancellationToken ct)
    {
        var member = await _roomService.HeartbeatAsync(id, request.MemberId, ct);
        if (member is null) return NotFound(new ErrorResponse("member_not_found", "Thành viên không còn trong phòng."));
        return NoContent();
    }

    [HttpGet("{id}/snapshot")]
    public async Task<ActionResult<RoomDto>> Snapshot(
        [FromRoute] string id,
        [FromQuery(Name = "memberId")] string? memberId,
        CancellationToken ct)
    {
        var room = await _roomService.GetRoomWithPruneAsync(id, ct);
        if (room is null) return NotFound(new ErrorResponse("room_not_found", "Phòng không tồn tại."));
        return Ok(MapToDto(room, memberId));
    }

    [HttpPost("{id}/members/{memberId}/leave")]
    public async Task<IActionResult> Leave(
        [FromRoute] string id,
        [FromRoute] string memberId,
        CancellationToken ct)
    {
        var room = await _roomService.GetRoomAsync(id, ct);
        if (room is null) return NoContent();
        if (string.Equals(room.HostId, memberId, StringComparison.Ordinal)) return NoContent();
        var member = room.Members.FirstOrDefault(m => m.Id == memberId);
        if (member is null) return NoContent();
        try
        {
            await _roomService.KickMemberAsync(id, room.HostId, memberId, ct);
        }
        catch (DomainException)
        {
            // Race: another request already removed them. That's fine.
        }
        return NoContent();
    }

    // ── Game endpoints ────────────────────────────────────────────────

    [HttpPost("{id}/game/concede")]
    public async Task<ActionResult<GameActionResponse>> Concede(
        [FromRoute] string id,
        [FromBody] NopeRequest request,
        CancellationToken ct)
    {
        var result = await _gameService.ConcedeAsync(id, request.MemberId, ct);
        return Ok(new GameActionResponse(
            MapToDto(result.Room, request.MemberId),
            result.Toast, null,
            false, false, false, false, null, null, null));
    }

    [HttpPost("{id}/start")]
    public async Task<ActionResult<RoomDto>> Start(
        [FromRoute] string id,
        [FromBody] StartGameRequest request,
        CancellationToken ct)
    {
        var room = await _gameService.StartGameAsync(id, request.HostId, ct);
        return Ok(MapToDto(room, request.HostId));
    }

    [HttpPost("{id}/rotate")]
    public async Task<ActionResult<RoomDto>> Rotate(
        [FromRoute] string id,
        [FromBody] RotateRoomRequest request,
        CancellationToken ct)
    {
        var room = await _gameService.RotateRoomAsync(id, request.HostId, ct);
        return Ok(MapToDto(room, request.HostId));
    }

    [HttpPost("{id}/game/play-card")]
    public async Task<ActionResult<GameActionResponse>> PlayCard(
        [FromRoute] string id,
        [FromBody] PlayCardRequest request,
        CancellationToken ct)
    {
        ComboKind? combo = null;
        if (!string.IsNullOrEmpty(request.ComboKind) &&
            Enum.TryParse<ComboKind>(request.ComboKind, true, out var ck))
        {
            combo = ck;
        }
        var result = await _gameService.PlayCardAsync(
            id, request.MemberId, request.CardKey,
            request.TargetMemberId, combo, request.DiscardPickKey, ct);
        return Ok(new GameActionResponse(
            MapToDto(result.Room, request.MemberId),
            result.Toast, result.DrawnCardKey,
            result.RequiresDefuse, result.RequiresDiscardPick, result.RequiresTargetPick,
            result.RequiresFavorTargetPick, result.FavorTargetId, result.FavorCandidates,
            result.FuturePeek,
            result.RequiresMoreDraws, result.RemainingDraws));
    }

    [HttpPost("{id}/game/draw-card")]
    public async Task<ActionResult<GameActionResponse>> DrawCard(
        [FromRoute] string id,
        [FromBody] DrawCardRequest request,
        CancellationToken ct)
    {
        var result = await _gameService.DrawCardAsync(id, request.MemberId, ct);
        return Ok(new GameActionResponse(
            MapToDto(result.Room, request.MemberId),
            result.Toast, result.DrawnCardKey,
            result.RequiresDefuse, result.RequiresDiscardPick, result.RequiresTargetPick,
            result.RequiresFavorTargetPick, result.FavorTargetId, result.FavorCandidates,
            result.FuturePeek,
            result.RequiresMoreDraws, result.RemainingDraws));
    }

    [HttpPost("{id}/game/cancel-pending")]
    public async Task<ActionResult<GameActionResponse>> CancelPending(
        [FromRoute] string id,
        [FromBody] CancelPendingRequest request,
        CancellationToken ct)
    {
        if (!Enum.TryParse<ComboKind>(request.ComboKind, true, out var ck))
            throw new ArgumentException("combo_kind_invalid", nameof(request.ComboKind));
        var result = await _gameService.CancelPendingActionAsync(
            id, request.MemberId, request.CardKey, ck, ct);
        return Ok(new GameActionResponse(
            MapToDto(result.Room, request.MemberId),
            result.Toast, result.DrawnCardKey,
            result.RequiresDefuse, result.RequiresDiscardPick, result.RequiresTargetPick,
            result.RequiresFavorTargetPick, result.FavorTargetId, result.FavorCandidates,
            result.FuturePeek,
            result.RequiresMoreDraws, result.RemainingDraws));
    }

    [HttpPost("{id}/game/defuse")]
    public async Task<ActionResult<GameActionResponse>> Defuse(
        [FromRoute] string id,
        [FromBody] DefuseRequest request,
        CancellationToken ct)
    {
        var result = await _gameService.UseDefuseAsync(id, request.MemberId, request.SlotIndex, ct);
        return Ok(new GameActionResponse(
            MapToDto(result.Room, request.MemberId),
            result.Toast, result.DrawnCardKey,
            result.RequiresDefuse, result.RequiresDiscardPick, result.RequiresTargetPick,
            false, null, null,
            result.FuturePeek));
    }

    [HttpPost("{id}/game/nope")]
    public async Task<ActionResult<GameActionResponse>> Nope(
        [FromRoute] string id,
        [FromBody] NopeRequest request,
        CancellationToken ct)
    {
        var result = await _gameService.ChainNopeAsync(id, request.MemberId, ct);
        return Ok(new GameActionResponse(
            MapToDto(result.Room, request.MemberId),
            result.Toast, result.DrawnCardKey,
            false, false, false, false, null, null, null));
    }

    // ── Mappers ───────────────────────────────────────────────────────

    private static RoomDto MapToDto(Room room, string? viewerMemberId) => new(
        room.Id,
        room.Code,
        room.HostId,
        room.HostName,
        room.Status.ToString().ToLowerInvariant(),
        room.MaxPlayers,
        room.Members.Count,
        room.CreatedAt,
        room.Members
            .OrderBy(m => m.JoinedAt)
            .Select(m => MapMemberDto(m))
            .ToList(),
        room.GameState is null ? null : MapGameState(room.GameState, viewerMemberId),
        // Expose the local hand only to its owner. Other players' hands are
        // hidden server-side too, but we double-check here for defense-in-depth.
        viewerMemberId is null || room.GameState is null || !room.GameState.Hands.TryGetValue(viewerMemberId, out var hand)
            ? null
            : hand);

    private static GameStateDto MapGameState(GameState gs, string? viewerMemberId)
    {
        // Per the game rules: the Future peek is private to the player who
        // played the card. Everyone else sees the cinematic overlay but
        // NOT the card contents. We nil out the FuturePeek for non-owners.
        var futurePeek = gs.FuturePeek;
        var pendingInitiator = gs.PendingAction?.InitiatorId;
        var isOwner = !string.IsNullOrEmpty(viewerMemberId)
            && !string.IsNullOrEmpty(pendingInitiator)
            && string.Equals(pendingInitiator, viewerMemberId, StringComparison.Ordinal);
        if (futurePeek is not null && !isOwner)
        {
            futurePeek = null;
        }

        return new GameStateDto(
            // NOTE: DeckCount intentionally omitted — nobody should see deck size.
            gs.DiscardPile.Count,
            gs.Hands.ToDictionary(kv => kv.Key, kv => kv.Value.Count),
            new Dictionary<string, int>(gs.TurnsTaken),
            new Dictionary<string, int>(gs.CardsPlayed),
            new Dictionary<string, bool>(gs.Alive),
            gs.DiedAt.ToDictionary(
                kv => kv.Key,
                kv => kv.Value.HasValue ? kv.Value.Value.ToString("O") : null),
            gs.CurrentTurnMemberId,
            gs.AttackCounter,
            gs.WinnerId,
            gs.StartedAt?.ToString("O"),
            gs.EndedAt?.ToString("O"),
            gs.PendingAction is null ? null : new PendingActionDto(
                gs.PendingAction.InitiatorId,
                gs.PendingAction.CardKey,
                gs.PendingAction.NopeChain,
                gs.PendingAction.CreatedAt.ToString("O")),
            gs.LastDrawnBy,
            gs.LastDrawnCardKey,
            gs.LastDrawnAt?.ToString("O"),
            gs.BombRevealActive,
            gs.LastPlayedCardKey,
            gs.LastPlayedBy,
            gs.LastPlayedAt?.ToString("O"),
            gs.LastPlayedByNope,
            gs.TurnStartedAt?.ToString("O"),
            60,
            gs.TurnStartedAt.HasValue
                ? Math.Max(0, (int)(60 - (DateTime.UtcNow - gs.TurnStartedAt.Value).TotalSeconds))
                : 60,
            gs.TurnOrder?.ToList() ?? new List<string>(),
            futurePeek?.ToList() ?? new List<string>(),
            // Favor-pick pending DTO. The TARGET is the only player who
            // needs the candidate list — everyone else (including the
            // initiator) sees null so they don't accidentally pick for
            // someone else.
            gs.PendingFavorPick is null
                ? null
                : new PendingFavorPickDto(
                    gs.PendingFavorPick.TargetMemberId,
                    gs.PendingFavorPick.InitiatorId,
                    string.Equals(gs.PendingFavorPick.TargetMemberId, viewerMemberId, StringComparison.Ordinal)
                        ? gs.PendingFavorPick.ShuffledCandidates
                        : new List<string>()));
    }

    private static RoomMemberDto MapMemberDto(RoomMember m) => new(
        m.Id,
        m.Name,
        m.IsHost,
        m.IsReady,
        m.IsOnline,
        m.JoinedAt,
        m.LastSeenAt);
}
