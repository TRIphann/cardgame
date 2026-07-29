using System.Collections.Concurrent;
using Arcana.Application.Abstractions;

namespace Arcana.Infrastructure;

/// <summary>
/// Thread-safe in-memory registry of active game turns. Used by the
/// background <c>TurnClockService</c> to detect players who have run out of
/// their turn window. GameService is the only writer; readers iterate a
/// snapshot under the underlying lock.
/// </summary>
public sealed class InMemoryTurnClockRegistry : ITurnClockRegistry
{
    private readonly ConcurrentDictionary<string, DateTime> _entries = new();

    public void Register(string roomId, DateTime startedAtUtc)
    {
        // StartedAtUtc is always DateTime.UtcNow from callers; we store the
        // value verbatim and let the reader compare against its own clock.
        _entries[roomId] = startedAtUtc;
    }

    public void Unregister(string roomId) => _entries.TryRemove(roomId, out _);

    public IReadOnlyList<TurnClockEntry> Snapshot()
    {
        var now = DateTime.UtcNow;
        var list = new List<TurnClockEntry>(_entries.Count);
        foreach (var kv in _entries)
            list.Add(new TurnClockEntry(kv.Key, kv.Value));
        return list;
    }
}
