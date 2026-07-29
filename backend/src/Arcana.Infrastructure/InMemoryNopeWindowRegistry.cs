using System.Collections.Concurrent;
using Arcana.Application.Abstractions;

namespace Arcana.Infrastructure;

/// <summary>
/// Thread-safe in-memory registry of rooms whose Nope window is currently
/// open. The background <c>NopeTimeoutService</c> watches this list and
/// auto-resolves stale windows (commits the action + advances the turn) so
/// a slow or disconnected opponent can never hang the game indefinitely.
/// </summary>
public sealed class InMemoryNopeWindowRegistry : INopeWindowRegistry
{
    private readonly ConcurrentDictionary<string, DateTime> _entries = new();

    public void Register(string roomId, DateTime createdAtUtc)
        => _entries[roomId] = createdAtUtc;

    public void Unregister(string roomId) => _entries.TryRemove(roomId, out _);

    public IReadOnlyList<NopeWindowEntry> Snapshot()
    {
        var list = new List<NopeWindowEntry>(_entries.Count);
        foreach (var kv in _entries)
            list.Add(new NopeWindowEntry(kv.Key, kv.Value));
        return list;
    }
}