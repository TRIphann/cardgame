using System.Collections.Concurrent;
using Arcana.Domain.Entities;
using Arcana.Domain.Repositories;

namespace Arcana.Infrastructure.Repositories;

/// <summary>
/// Thread-safe in-memory room cache backed by a <see cref="ConcurrentDictionary"/>.
/// Designed as a singleton — one instance per server process holds all active
/// rooms. Since SignalR keeps clients connected and alive rooms are mutated
/// frequently, the cache naturally stays warm without any TTL logic.
///
/// <para>
/// Memory budget: ~1-5 KB per active room. Even with 100 simultaneous games
/// on the free-tier 512 MB Render instance, the cache consumes under 1 MB —
/// negligible compared to the .NET runtime baseline (~150 MB).
/// </para>
/// </summary>
public sealed class InMemoryRoomCache : IRoomCache
{
    private readonly ConcurrentDictionary<string, Room> _rooms = new(StringComparer.OrdinalIgnoreCase);

    public Room? Get(string roomId) =>
        _rooms.TryGetValue(roomId, out var room) ? room : null;

    public void Set(string roomId, Room room)
    {
        // Defensive deep clone — callers must not be able to mutate the
        // cached entry by holding on to the original reference.
        _rooms[roomId] = RoomSnapshot.CloneRoom(room);
    }

    public void Remove(string roomId)
    {
        _rooms.TryRemove(roomId, out _);
    }

    public IReadOnlyCollection<string> Keys() => _rooms.Keys.ToList();

    public int Count => _rooms.Count;
}