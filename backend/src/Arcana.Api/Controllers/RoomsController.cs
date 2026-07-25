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
            .Select(m => new RoomMemberDto(m.Id, m.Name, m.IsHost, m.IsReady, m.JoinedAt))
            .ToList());
}
