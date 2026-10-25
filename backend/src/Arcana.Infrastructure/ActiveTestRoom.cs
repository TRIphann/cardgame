using Arcana.Application.Abstractions;
using Arcana.Domain.Entities;
using Arcana.Domain.Repositories;
using Microsoft.Extensions.Logging;

namespace Arcana.Infrastructure;

/// <summary>
/// Singleton that tracks a single active test room.
/// When a new test room is created, any existing test room is automatically stopped.
/// This ensures only one test room exists at a time, simplifying quota management.
/// </summary>
public sealed class ActiveTestRoom : IActiveTestRoom, IDisposable
{
    private readonly ILogger<ActiveTestRoom> _logger;
    private readonly IRoomCache _roomCache;
    private readonly object _lock = new();
    private string? _activeRoomId;
    private bool _disposed;

    public ActiveTestRoom(ILogger<ActiveTestRoom> logger, IRoomCache roomCache)
    {
        _logger = logger;
        _roomCache = roomCache;
    }

    /// <summary>
    /// Gets the currently active test room ID, if any.
    /// </summary>
    public string? CurrentRoomId
    {
        get
        {
            lock (_lock)
            {
                // Verify the room still exists in cache
                if (_activeRoomId != null && _roomCache.Get(_activeRoomId) == null)
                {
                    _activeRoomId = null;
                }
                return _activeRoomId;
            }
        }
    }

    /// <summary>
    /// Registers a room as the active test room.
    /// If another room is already active, it will be stopped first.
    /// </summary>
    /// <param name="roomId">The room ID to register.</param>
    /// <param name="room">The room entity to cache.</param>
    /// <returns>True if this room is now the active room; false if it was superseded.</returns>
    public bool Register(string roomId, Room room)
    {
        lock (_lock)
        {
            if (_activeRoomId == roomId)
            {
                // Same room, just update
                _roomCache.Set(roomId, room);
                return true;
            }

            // Stop previous room if exists
            if (_activeRoomId != null)
            {
                var previousRoom = _roomCache.Get(_activeRoomId);
                if (previousRoom != null)
                {
                    _logger.LogInformation(
                        "Stopping previous test room {PreviousRoomId} ({PreviousCode}) because new test room {NewRoomId} was created",
                        _activeRoomId,
                        previousRoom.Code,
                        roomId);
                }
                StopRoom(_activeRoomId);
            }

            _activeRoomId = roomId;
            _roomCache.Set(roomId, room);
            _logger.LogInformation("Registered new test room {RoomId} ({Code})", roomId, room.Code);
            return true;
        }
    }

    /// <summary>
    /// Updates the cached room data for the active test room.
    /// </summary>
    public void Update(Room room)
    {
        lock (_lock)
        {
            if (_activeRoomId == room.Id)
            {
                _roomCache.Set(room.Id, room);
            }
        }
    }

    /// <summary>
    /// Returns true if the given room ID is the active test room.
    /// </summary>
    public bool IsTestRoom(string? roomId) =>
        !string.IsNullOrEmpty(roomId) && roomId == _activeRoomId;

    /// <summary>
    /// Clears the active test room without fully removing it from the cache.
    /// Used when a test game ends but the room still exists in memory.
    /// </summary>
    public void Clear()
    {
        lock (_lock)
        {
            _logger.LogInformation("Cleared active test room {RoomId}", _activeRoomId ?? "(none)");
            _activeRoomId = null;
        }
    }

    /// <summary>
    /// Fully stops and removes the active test room from cache.
    /// </summary>
    public void StopAndClear()
    {
        lock (_lock)
        {
            if (_activeRoomId != null)
            {
                StopRoom(_activeRoomId);
                _activeRoomId = null;
            }
        }
    }

    private void StopRoom(string roomId)
    {
        _roomCache.Remove(roomId);
        _logger.LogInformation("Stopped and removed test room {RoomId}", roomId);
    }

    public void Dispose()
    {
        lock (_lock)
        {
            _disposed = true;
            if (_activeRoomId != null)
            {
                StopRoom(_activeRoomId);
                _activeRoomId = null;
            }
        }
    }
}
