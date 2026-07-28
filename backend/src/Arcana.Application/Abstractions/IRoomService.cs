using Arcana.Domain.Entities;

namespace Arcana.Application.Abstractions;

public interface IRoomService
{
    Task<Room> CreateRoomAsync(string hostName, CancellationToken ct = default);
    Task<Room> JoinRoomAsync(string code, string playerName, CancellationToken ct = default);
    Task<Room?> GetRoomAsync(string id, CancellationToken ct = default);
    Task<Room?> GetRoomWithPruneAsync(string id, CancellationToken ct = default);

    /// <summary>
    /// Host removes another member from the room. Returns the updated room,
    /// or throws a DomainException if the room is missing, the caller is not the host,
    /// or the target is the host themselves.
    /// </summary>
    Task<Room?> KickMemberAsync(string roomId, string hostId, string targetMemberId, CancellationToken ct = default);

    /// <summary>
    /// Toggle a non-host member's IsReady flag. Hosts cannot be marked not-ready.
    /// </summary>
    Task<RoomMember?> SetReadyAsync(string roomId, string memberId, bool isReady, CancellationToken ct = default);

    /// <summary>
    /// Refresh LastSeenAt / IsOnline for a member. Called by the heartbeat
    /// endpoint roughly every 8s from each tab.
    /// </summary>
    Task<RoomMember?> HeartbeatAsync(string roomId, string memberId, CancellationToken ct = default);

    /// <summary>
    /// Mark members who haven't sent a heartbeat inside the offline window
    /// as IsOnline=false. Returns the number of members touched.
    /// </summary>
    Task<int> PruneStaleMembersAsync(string roomId, CancellationToken ct = default);
}
