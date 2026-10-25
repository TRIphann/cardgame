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
    private readonly ConcurrentDictionary<string, Entry> _entries = new();

    private readonly record struct Entry(DateTime StartedAtUtc, int TimeoutSeconds);

    public void Register(string roomId, DateTime startedAtUtc, int timeoutSeconds = 60)
    {
        _entries[roomId] = new Entry(startedAtUtc, timeoutSeconds);
    }

    public void Unregister(string roomId) => _entries.TryRemove(roomId, out _);

    public IReadOnlyList<TurnClockEntry> Snapshot()
    {
        var list = new List<TurnClockEntry>(_entries.Count);
        foreach (var kv in _entries)
            list.Add(new TurnClockEntry(kv.Key, kv.Value.StartedAtUtc, kv.Value.TimeoutSeconds));
        return list;
    }
}
