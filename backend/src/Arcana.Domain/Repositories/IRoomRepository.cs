using Arcana.Domain.Entities;

namespace Arcana.Domain.Repositories;

public interface IRoomRepository
{
    Task<Room?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<Room?> GetByCodeAsync(string code, CancellationToken ct = default);

    /// <summary>
    /// Reserve a unique invitation code. Returns true if reservation succeeded,
    /// false if the code was already taken. Persistence is atomic at the Firestore level.
    /// </summary>
    Task<bool> TryReserveCodeAsync(string code, string roomId, CancellationToken ct = default);

    Task CreateAsync(Room room, CancellationToken ct = default);

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

    /// <summary>
    /// Update a single member's fields (e.g. IsReady). Returns the updated member
    /// or null if the room/member does not exist. The host must never be marked
    /// not-ready — that's enforced at the service layer.
    /// </summary>
    Task<RoomMember?> UpdateMemberFieldAsync(string roomId, string memberId, bool? isReady, DateTime? lastSeenAt, CancellationToken ct = default);

    /// <summary>
    /// Sweep stale members across every active room in a single Firestore
    /// pass. Used by OfflineMemberSweeperService on a long interval so we
    /// don't drain the read quota from per-snapshot polling. Returns the
    /// number of members marked offline.
    /// </summary>
    Task<int> SweepStaleMembersAsync(TimeSpan offlineAfter, int maxRooms = 50, CancellationToken ct = default);

    /// <summary>
    /// Replace the room's <c>gameState</c> field (and optionally <c>status</c>)
    /// in Firestore. WRITE-ONLY — does NOT re-read the room. Callers should
    /// keep using their in-memory snapshot (which is authoritative for the
    /// mutation that just ran) and broadcast it through the realtime channel.
    /// Skipping the post-write read avoids two extra Firestore reads
    /// (room doc + members subcollection) per gameplay mutation.
    /// </summary>
    Task UpdateGameStateAsync(string roomId, Domain.Entities.GameState? gameState, Domain.Enums.RoomStatus? status, CancellationToken ct = default);

    /// <summary>
    /// Snapshot every room whose status is <c>Playing</c>. Used by background
    /// sweepers (e.g. <c>FuturePeekSweeperService</c>) that need to walk all
    /// in-flight games without going through the lobby / snapshot path.
    /// </summary>
    Task<IReadOnlyList<Room>> GetAllPlayingAsync(CancellationToken ct = default);
}
