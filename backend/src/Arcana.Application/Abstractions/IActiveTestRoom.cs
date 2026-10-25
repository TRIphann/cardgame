using Arcana.Domain.Entities;

namespace Arcana.Application.Abstractions;

/// <summary>
/// Singleton that tracks the active test room.
/// When a new test room is created, any existing test room is automatically stopped.
/// </summary>
public interface IActiveTestRoom
{
    /// <summary>
    /// Gets the currently active test room ID, if any.
    /// </summary>
    string? CurrentRoomId { get; }

    /// <summary>
    /// Registers a room as the active test room.
    /// If another room is already active, it will be stopped first.
    /// </summary>
    bool Register(string roomId, Room room);

    /// <summary>
    /// Updates the cached room data for the active test room.
    /// </summary>
    void Update(Room room);

    /// <summary>
    /// Clears the active test room reference.
    /// </summary>
    void Clear();

    /// <summary>
    /// Fully stops and removes the active test room from cache.
    /// </summary>
    void StopAndClear();
}
