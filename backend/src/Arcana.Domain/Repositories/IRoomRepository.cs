using Arcana.Domain.Entities;

namespace Arcana.Domain.Repositories;

public interface IRoomRepository
{
    Task<Room?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<Room?> GetByCodeAsync(string code, CancellationToken ct = default);
    Task<bool> CodeExistsAsync(string code, CancellationToken ct = default);

    /// <summary>
    /// Reserve a unique invitation code. Returns true if reservation succeeded,
    /// false if the code was already taken. Persistence is atomic at the Firestore level.
    /// </summary>
    Task<bool> TryReserveCodeAsync(string code, string roomId, CancellationToken ct = default);

    Task CreateAsync(Room room, CancellationToken ct = default);
    Task AddMemberAsync(string roomId, RoomMember member, CancellationToken ct = default);
    Task UpdateMemberAsync(string roomId, RoomMember member, CancellationToken ct = default);

    /// <summary>
    /// Atomically add a member only if the room still has capacity.
    /// Returns the resulting room on success, or null if rejected (full / closed / not found).
    /// The caller should treat null as "already full" and surface a room_full error.
    /// </summary>
    Task<Room?> TryJoinRoomAsync(string roomId, RoomMember member, CancellationToken ct = default);

    /// <summary>
    /// Atomically remove a member. Returns the updated room, or null if the room
    /// or member no longer exists.
    /// </summary>
    Task<Room?> RemoveMemberAsync(string roomId, string memberId, CancellationToken ct = default);
}
