using Arcana.Application.Abstractions;
using Arcana.Application.Game;
using Arcana.Application.Services;
using Arcana.Application.Services.TestRoom;
using Arcana.Domain.Common;
using Arcana.Domain.Entities;
using Arcana.Domain.Repositories;
using Arcana.Shared.Contracts;
using Microsoft.AspNetCore.Mvc;

namespace Arcana.Api.Controllers;

[ApiController]
[Route("api/rooms")]
public class RoomsController(
    IRoomService roomService,
    ITestRoomService testRoomService,
    ITestRoomRepository testRoomRepository,
    GameService gameService,
    StaleMemberPruner stalePruner) : ControllerBase
{
    private readonly IRoomService _roomService = roomService;
    private readonly ITestRoomService _testRoomService = testRoomService;
    private readonly ITestRoomRepository _testRoomRepository = testRoomRepository;
    private readonly GameService _gameService = gameService;
    private readonly StaleMemberPruner _stalePruner = stalePruner;

    /// <summary>
    /// Pick the room service for a given room id. Test rooms (rooms previously
    /// created via <c>/api/test/room</c>) live in <see cref="ITestRoomRepository"/>;
    /// everything else falls through to the production Firestore-backed service.
    ///
    /// The probe is a single <c>ConcurrentDictionary.TryGet</c> — cheap, no IO,
    /// and bounded by server lifetime. Lobby/phòng thường never hit the test repo
    /// because their ids are random GUIDs that TestController never registers.
    /// </summary>
    private async Task<IRoomService> ResolveRoomServiceAsync(string roomId, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(roomId) && await _testRoomRepository.GetByIdAsync(roomId, ct) is not null)
            return _testRoomService;
        return _roomService;
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
        var room = await (await ResolveRoomServiceAsync(id, ct)).KickMemberAsync(id, request.HostId, request.TargetMemberId, ct);
        return Ok(MapToDto(room!, request.HostId));
    }

    [HttpPost("{id}/ready")]
    public async Task<ActionResult<RoomMemberDto>> SetReady(
        [FromRoute] string id,
        [FromBody] SetReadyRequest request,
        CancellationToken ct)
    {
        var member = await (await ResolveRoomServiceAsync(id, ct)).SetReadyAsync(id, request.MemberId, request.IsReady, ct);
        if (member is null) return NotFound(new ErrorResponse("member_not_found", "Thành viên không còn trong phòng."));
        return Ok(MapMemberDto(member));
    }

    [HttpPost("{id}/heartbeat")]
    public async Task<IActionResult> Heartbeat(
        [FromRoute] string id,
        [FromBody] HeartbeatRequest request,
        CancellationToken ct)
    {
        var member = await (await ResolveRoomServiceAsync(id, ct)).HeartbeatAsync(id, request.MemberId, ct);
        if (member is null) return NotFound(new ErrorResponse("member_not_found", "Thành viên không còn trong phòng."));
        return NoContent();
    }

    [HttpPost("{id}/members/{memberId}/resume")]
    public async Task<ActionResult<RoomDto>> ResumeFromAfk(
        [FromRoute] string id,
        [FromRoute] string memberId,
        CancellationToken ct)
    {
        var room = await _gameService.ResumeFromAfkAsync(id, memberId, ct);
        return Ok(MapToDto(room, memberId));
    }

    /// <summary>
    /// Fired by the game page once its UI has finished its initial render.
    /// This tells the server to ARM the turn clock — previously the clock was
    /// armed by <c>StartGameAsync</c> directly, which meant it would tick
    /// down during the few seconds the player needs to navigate from the
    /// lobby to the game tab, and they would be greeted with an AFK modal.
    /// </summary>
    [HttpPost("{id}/members/{memberId}/ready")]
    public async Task<ActionResult<RoomDto>> ClientReady(
        [FromRoute] string id,
        [FromRoute] string memberId,
        CancellationToken ct)
    {
        // Test rooms and prod rooms share the same GameService — the
        // underlying repository doesn't matter for the ready gate.
        var room = await _gameService.MarkClientReadyAsync(id, memberId, ct);
        return Ok(MapToDto(room, memberId));
    }

    [HttpGet("{id}/snapshot")]
    public async Task<ActionResult<RoomDto>> Snapshot(
        [FromRoute] string id,
        [FromQuery(Name = "memberId")] string? memberId,
        CancellationToken ct)
    {
        // Snapshot hot path: serve from cache immediately (no Firestore
        // round-trip for the room doc), then kick off the "mark stale
        // members offline" sweep in the background. Before this the
        // snapshot endpoint issued one Firestore read+write per request;
        // with the polling hook hitting this every 2-5s during lobby wait
        // the resulting traffic was the bulk of our quota consumption.
        var room = await (await ResolveRoomServiceAsync(id, ct)).GetRoomAsync(id, ct);
        if (room is null) return NotFound(new ErrorResponse("room_not_found", "Phòng không tồn tại."));
        // Debounced background prune — never block the response on it.
        _stalePruner.PruneAsync(id, ct);
        return Ok(MapToDto(room, memberId));
    }

    [HttpPost("{id}/members/{memberId}/leave")]
    public async Task<IActionResult> Leave(
        [FromRoute] string id,
        [FromRoute] string memberId,
        CancellationToken ct)
    {
        var svc = await ResolveRoomServiceAsync(id, ct);
        var room = await svc.GetRoomAsync(id, ct);
        if (room is null) return NoContent();
        if (string.Equals(room.HostId, memberId, StringComparison.Ordinal)) return NoContent();
        var member = room.Members.FirstOrDefault(m => m.Id == memberId);
        if (member is null) return NoContent();
        try
        {
            await svc.KickMemberAsync(id, room.HostId, memberId, ct);
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
        var room = await _gameService.StartGameAsync(id, request.HostId, customHands: null, ct: ct);
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
            result.RequiresMoreDraws, result.RemainingDraws,
            result.RequiresFavorPick));
    }

    [HttpPost("{id}/game/draw-card")]
    public async Task<ActionResult<GameActionResponse>> DrawCard(
        [FromRoute] string id,
        [FromBody] DrawCardRequest request,
        CancellationToken ct)
    {
        var result = await _gameService.DrawCardAsync(id, request.MemberId, ct: ct);
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
            throw new ArgumentException("combo_kind_invalid", nameof(request));
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
            GameService.TurnTimeLimitSeconds,
            gs.TurnStartedAt.HasValue
                ? Math.Max(0, (int)(GameService.TurnTimeLimitSeconds - (DateTime.UtcNow - gs.TurnStartedAt.Value).TotalSeconds))
                : GameService.TurnTimeLimitSeconds,
            gs.TurnOrder?.ToList() ?? [],
            futurePeek?.ToList() ?? [],
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
                        : []),
            // Target-pick pending DTO (Favor phase 1 — "choose who to ask").
            // The INITIATOR is the only player who needs the candidate list;
            // everyone else sees the state but not the targets, so they
            // can't pick on someone else's behalf.
            gs.PendingTargetPick is null
                ? null
                : new PendingTargetPickDto(
                    gs.PendingTargetPick.Kind.ToString(),
                    gs.PendingTargetPick.CardKey,
                    gs.PendingTargetPick.InitiatorId,
                    string.Equals(gs.PendingTargetPick.InitiatorId, viewerMemberId, StringComparison.Ordinal)
                        ? gs.PendingTargetPick.CandidateMemberIds
                        : [],
                    gs.PendingTargetPick.CreatedAt.ToString("O")),
            // AFK auto-play list — every viewer can see who is currently AFK
            // (the modal decides whether to show for the local player).
            gs.AfkMemberIds?.ToList() ?? [],
            // Client-ready gate (see GameService.MarkClientReadyAsync and
            // GameState.ClientReady). Front-end uses this for info only;
            // the server is the source of truth for whether the clock is
            // ticking.
            gs.ClientReady,
            // Bot turn override: seconds a bot takes to act. 0 = instant
            // (uses the unified 10s turn budget for the AFK auto-draw chain).
            gs.BotTurnSeconds,
            // MyHand: mirror RoomDto.MyHand at the GameStateDto level so the
            // front-end always has a top-level `room.myHand` to read from
            // regardless of which REST endpoint returned the snapshot.
            viewerMemberId is not null && gs.Hands.TryGetValue(viewerMemberId, out var gsMyHand)
                ? gsMyHand
                : null);
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
