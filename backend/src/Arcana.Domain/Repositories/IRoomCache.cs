using Arcana.Domain.Entities;

namespace Arcana.Domain.Repositories;

/// <summary>
/// In-memory cache for active game rooms. SignalR keeps clients connected,
/// so the server naturally holds all in-flight rooms in RAM. This cache
/// eliminates redundant Firestore reads during gameplay — Firebase becomes
/// a persistence layer only (read on cold start, write on mutation).
///
/// <para>
/// All methods are thread-safe. Reads check the cache first; on a miss,
/// the caller must load from Firestore and populate the cache via <see
/// cref="Set"/> before any subsequent reads hit the cache.
/// </para>
/// </summary>
public interface IRoomCache
{
    /// <summary>Gets a room from cache, or null if not present.</summary>
    Room? Get(string roomId);

    /// <summary>
    /// Stores a room in the cache. Overwrites any existing entry.
    /// Call this after every successful write (Create, Join, mutation).
    /// </summary>
    void Set(string roomId, Room room);

    /// <summary>
    /// Removes a room from the cache. Call this when a room is cleaned up
    /// or the game ends and is no longer needed.
    /// </summary>
    void Remove(string roomId);

    /// <summary>Returns all room IDs currently held in the cache.</summary>
    IReadOnlyCollection<string> Keys();

    /// <summary>Returns the number of rooms currently cached.</summary>
    int Count { get; }
}
