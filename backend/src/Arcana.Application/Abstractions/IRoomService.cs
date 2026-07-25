using Arcana.Domain.Entities;

namespace Arcana.Application.Abstractions;

public interface IRoomService
{
    Task<Room> CreateRoomAsync(string hostName, CancellationToken ct = default);
    Task<Room> JoinRoomAsync(string code, string playerName, CancellationToken ct = default);
    Task<Room?> GetRoomAsync(string id, CancellationToken ct = default);

    /// <summary>
    /// Host removes another member from the room. Returns the updated room,
    /// or throws a DomainException if the room is missing, the caller is not the host,
    /// or the target is the host themselves.
    /// </summary>
    Task<Room?> KickMemberAsync(string roomId, string hostId, string targetMemberId, CancellationToken ct = default);
}
