using Arcana.Domain.Entities;

namespace Arcana.Application.Abstractions;

/// <summary>
/// Thread-safe in-memory registry of rooms that currently have a FuturePeek active.
/// The sweeper registers a room when a FuturePeek is created and unregisters it
/// when the peek is cleared (by the sweeper itself, by a game action, or by the
/// peek naturally expiring). This means the sweeper only reads documents it
/// *knows* need sweeping, rather than scanning the entire collection every tick.
///
/// Usage:
///   IFuturePeekRegistry.Register(roomId, expiresAt)  — called when a peek is set
///   IFuturePeekRegistry.Unregister(roomId)             — called when peek is cleared
///   IFuturePeekRegistry.Snapshot()                    — called by sweeper each tick
/// </summary>
public interface IFuturePeekRegistry
{
    void Register(string roomId, DateTime expiresAt);
    void Unregister(string roomId);
    IReadOnlyList<FuturePeekEntry> Snapshot();
    void Clear();
}

public record FuturePeekEntry(string RoomId, DateTime ExpiresAtUtc);

public sealed class FuturePeekRegistry : IFuturePeekRegistry
{
    // Multiple reads, infrequent writes — use a simple lock over a dictionary.
    private readonly object _gate = new();
    private readonly Dictionary<string, FuturePeekEntry> _entries = new(StringComparer.OrdinalIgnoreCase);

    public void Register(string roomId, DateTime expiresAt)
    {
        ArgumentNullException.ThrowIfNull(roomId);
        lock (_gate)
        {
            _entries[roomId] = new FuturePeekEntry(roomId, expiresAt.ToUniversalTime());
        }
    }

    public void Unregister(string roomId)
    {
        ArgumentNullException.ThrowIfNull(roomId);
        lock (_gate)
        {
            _entries.Remove(roomId);
        }
    }

    public IReadOnlyList<FuturePeekEntry> Snapshot()
    {
        lock (_gate)
        {
            // Return a snapshot so callers can iterate without holding the lock.
            return [.. _entries.Values];
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            _entries.Clear();
        }
    }
}
