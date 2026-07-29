namespace Arcana.Application.Abstractions;

/// <summary>
/// Handles a Nope window that expired without any player chaining a Nope
/// (or with an even-length chain, where the original action still goes
/// through). Used by the background <c>NopeTimeoutService</c>.
/// </summary>
public interface INopeTimeoutHandler
{
    Task HandleAsync(string roomId, CancellationToken ct = default);
}

/// <summary>
/// Handles the case where a player lets their turn timer expire. The default
/// implementation is provided by the API layer; tests can swap in a stub that
/// records the call without hitting the repository.
/// </summary>
public interface ITurnTimeoutHandler
{
    /// <summary>
    /// Force a draw for the given room's current player. This is the same
    /// path as a manual draw — defuse resolution, turn advance, persistence,
    /// broadcast — so the rest of the engine doesn't need to know it was
    /// triggered by the clock.
    /// </summary>
    Task HandleAsync(string roomId, CancellationToken ct = default);
}

/// <summary>
/// In-memory registry of currently-active game rooms and the moment their
/// current player's turn started. Lets the <c>TurnClockService</c> background
/// worker auto-draw for players who let their 60s turn timer expire.
///
/// GameService is the single writer: it calls <see cref="Register"/> when
/// a turn starts (game start, AdvanceTurn after draw/nope chain) and
/// <see cref="Unregister"/> when the game ends or the room is torn down.
/// Reads are cheap and happen from a single background loop.
/// </summary>
public interface ITurnClockRegistry
{
    /// <summary>
    /// Mark that <paramref name="roomId"/> has an active turn that started
    /// at <paramref name="startedAtUtc"/>. If the room was already tracked,
    /// the start time is overwritten with the new value.
    /// </summary>
    void Register(string roomId, DateTime startedAtUtc);

    /// <summary>Drop the room from the registry (game ended, room removed).</summary>
    void Unregister(string roomId);

    /// <summary>
    /// Snapshot of all currently-tracked rooms. Each entry includes the
    /// current turn start time so the background service can decide which
    /// rooms have exceeded their window.
    /// </summary>
    IReadOnlyList<TurnClockEntry> Snapshot();
}

public readonly record struct TurnClockEntry(string RoomId, DateTime StartedAtUtc);

/// <summary>
/// Registry of rooms whose Nope window is currently open. Lets the
/// <c>NopeTimeoutService</c> background loop auto-resolve a stale window
/// (commit the action, advance the turn) so a slow or disconnected player
/// doesn't hang the game forever.
/// </summary>
public interface INopeWindowRegistry
{
    void Register(string roomId, DateTime createdAtUtc);
    void Unregister(string roomId);
    IReadOnlyList<NopeWindowEntry> Snapshot();
}

public readonly record struct NopeWindowEntry(string RoomId, DateTime CreatedAtUtc);
