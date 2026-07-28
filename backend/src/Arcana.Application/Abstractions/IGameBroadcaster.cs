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
}
