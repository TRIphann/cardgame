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
    public async Task<ActionResult<CreateRoomResponse>> Create([FromBody] CreateRoomRequest request, CancellationToken ct)
    {
        var room = await _roomService.CreateRoomAsync(request.HostName, ct);
        return CreatedAtAction(nameof(GetById), new { id = room.Id }, new CreateRoomResponse(MapToDto(room, null)));
    }

    [HttpPost("join")]
    public async Task<ActionResult<JoinRoomResponse>> Join([FromBody] JoinRoomRequest request, CancellationToken ct)
    {
        var room = await _roomService.JoinRoomAsync(request.Code, request.PlayerName, ct);
        // On join we don't know which member is the new one — return no hand.
        var newMember = room.Members.FirstOrDefault(m => m.Name == request.PlayerName.Trim());
        return Ok(new JoinRoomResponse(MapToDto(room, newMember?.Id)));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<RoomDto>> GetById(
        [FromRoute] string id,
        [FromQuery(Name = "memberId")] string? memberId,
        CancellationToken ct)
    {
        var room = await _roomService.GetRoomAsync(id, ct);
        if (room is null) return NotFound(new ErrorResponse("room_not_found", "Phòng không tồn tại."));
        return Ok(MapToDto(room, memberId));
    }

    [HttpPost("{id}/kick")]
    public async Task<ActionResult<KickMemberResponse>> Kick(
        [FromRoute] string id,
        [FromBody] KickMemberRequest request,
        CancellationToken ct)
    {
        var room = await _roomService.KickMemberAsync(id, request.HostId, request.TargetMemberId, ct);
        return Ok(new KickMemberResponse(MapToDto(room!, request.HostId)));
    }

    [HttpPost("{id}/ready")]
    public async Task<ActionResult<SetReadyResponse>> SetReady(
        [FromRoute] string id,
        [FromBody] SetReadyRequest request,
        CancellationToken ct)
    {
        var member = await _roomService.SetReadyAsync(id, request.MemberId, request.IsReady, ct);
        if (member is null) return NotFound(new ErrorResponse("member_not_found", "Thành viên không còn trong phòng."));
        return Ok(new SetReadyResponse(MapMemberDto(member)));
    }

    [HttpPost("{id}/heartbeat")]
    public async Task<ActionResult<HeartbeatResponse>> Heartbeat(
        [FromRoute] string id,
        [FromBody] HeartbeatRequest request,
        CancellationToken ct)
    {
        var member = await _roomService.HeartbeatAsync(id, request.MemberId, ct);
        if (member is null) return NotFound(new ErrorResponse("member_not_found", "Thành viên không còn trong phòng."));
        return Ok(new HeartbeatResponse(member.Id, member.IsOnline));
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
            false, false, false,
            false, null,
            null, null,
            null));
    }

    [HttpPost("{id}/start")]
    public async Task<ActionResult<StartGameResponse>> Start(
        [FromRoute] string id,
        [FromBody] StartGameRequest request,
        CancellationToken ct)
    {
        var room = await _gameService.StartGameAsync(id, request.HostId, ct);
        return Ok(new StartGameResponse(MapToDto(room, request.HostId)));
    }

    [HttpPost("{id}/rotate")]
    public async Task<ActionResult<RotateRoomResponse>> Rotate(
        [FromRoute] string id,
        [FromBody] RotateRoomRequest request,
        CancellationToken ct)
    {
        var room = await _gameService.RotateRoomAsync(id, request.HostId, ct);
        return Ok(new RotateRoomResponse(MapToDto(room, request.HostId)));
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
            result.RequiresFavorPick, result.FavorCandidates,
            result.FuturePeek, result.PlayedCardKey,
            result.ComboKind?.ToString()));
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
            result.RequiresFavorPick, result.FavorCandidates,
            result.FuturePeek, result.PlayedCardKey,
            result.ComboKind?.ToString()));
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
            false, null,
            result.FuturePeek, result.PlayedCardKey,
            result.ComboKind?.ToString()));
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
            false, false, false,
            false, null,
            null, result.PlayedCardKey,
            result.ComboKind?.ToString()));
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
        room.GameState is null ? null : MapGameState(room.GameState),
        // Expose the local hand only to its owner. Other players' hands are
        // hidden server-side too, but we double-check here for defense-in-depth.
        viewerMemberId is null || room.GameState is null || !room.GameState.Hands.TryGetValue(viewerMemberId, out var hand)
            ? null
            : hand);

    private static GameStateDto MapGameState(GameState gs)
    {
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
                gs.PendingAction.TargetMemberId,
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
            gs.TurnOrder?.ToList() ?? new List<string>(),
            gs.FuturePeek?.ToList() ?? new List<string>());
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
