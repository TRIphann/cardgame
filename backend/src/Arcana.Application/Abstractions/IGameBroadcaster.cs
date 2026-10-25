namespace Arcana.Application.Abstractions;

/// <summary>
/// Abstraction over the realtime push channel used by GameService after
/// every state mutation. The default implementation pushes via SignalR
/// (see SignalRGameBroadcaster); tests can swap in a no-op stub.
/// </summary>
public interface IGameBroadcaster
{
    /// <summary>
    /// Broadcast that the room state has changed. Receivers subscribed to
    /// the room's SignalR group receive a "room-updated" event with the
    /// serialized payload.
    /// </summary>
    Task BroadcastRoomUpdatedAsync(string roomId, object payload, CancellationToken ct = default);

    /// <summary>
    /// Broadcast the full room snapshot to all clients in the room group.
    /// </summary>
    Task BroadcastRoomSnapshotAsync(string roomId, object roomSnapshot, CancellationToken ct = default);

    /// <summary>
    /// Broadcast a toast (transient notification) to every client in the
    /// room group. The server passes through any memberIds the caller wants
    /// to exclude (e.g. the AFK player themselves — they get an in-app modal
    /// instead of a toast). Each client filters the exclude list locally;
    /// the server does not perform per-recipient routing.
    /// </summary>
    /// <param name="roomId">Room whose group should receive the toast.</param>
    /// <param name="toastText">Localized toast text to display.</param>
    /// <param name="excludeMemberIds">Members who should NOT see this toast.</param>
    /// <param name="ct">Cancellation token.</param>
    Task BroadcastRoomToastAsync(
        string roomId,
        string toastText,
        IEnumerable<string>? excludeMemberIds,
        CancellationToken ct = default);
}
