using Arcana.Application.Abstractions;
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

    public RoomsController(IRoomService roomService)
    {
        _roomService = roomService;
    }

    [HttpPost]
    public async Task<ActionResult<CreateRoomResponse>> Create([FromBody] CreateRoomRequest request, CancellationToken ct)
    {
        var room = await _roomService.CreateRoomAsync(request.HostName, ct);
        return CreatedAtAction(nameof(GetById), new { id = room.Id }, new CreateRoomResponse(MapToDto(room)));
    }

    [HttpPost("join")]
    public async Task<ActionResult<JoinRoomResponse>> Join([FromBody] JoinRoomRequest request, CancellationToken ct)
    {
        var room = await _roomService.JoinRoomAsync(request.Code, request.PlayerName, ct);
        return Ok(new JoinRoomResponse(MapToDto(room)));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<RoomDto>> GetById([FromRoute] string id, CancellationToken ct)
    {
        var room = await _roomService.GetRoomAsync(id, ct);
        if (room is null) return NotFound(new ErrorResponse("room_not_found", "Phòng không tồn tại."));
        return Ok(MapToDto(room));
    }

    [HttpPost("{id}/kick")]
    public async Task<ActionResult<KickMemberResponse>> Kick(
        [FromRoute] string id,
        [FromBody] KickMemberRequest request,
        CancellationToken ct)
    {
        var room = await _roomService.KickMemberAsync(id, request.HostId, request.TargetMemberId, ct);
        return Ok(new KickMemberResponse(MapToDto(room!)));
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
        CancellationToken ct)
    {
        var room = await _roomService.GetRoomWithPruneAsync(id, ct);
        if (room is null) return NotFound(new ErrorResponse("room_not_found", "Phòng không tồn tại."));
        return Ok(MapToDto(room));
    }

    [HttpPost("{id}/members/{memberId}/leave")]
    public async Task<IActionResult> Leave(
        [FromRoute] string id,
        [FromRoute] string memberId,
        CancellationToken ct)
    {
        // Best-effort: a tab that closed must not block waiting for the host.
        // We try to remove the member; ignore "not found" / "is host" because
        // the host leaving should destroy the room, not throw.
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

    private static RoomDto MapToDto(Room room) => new(
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
            .ToList());

    private static RoomMemberDto MapMemberDto(RoomMember m) => new(
        m.Id,
        m.Name,
        m.IsHost,
        m.IsReady,
        m.IsOnline,
        m.JoinedAt,
        m.LastSeenAt);
}
