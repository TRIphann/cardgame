using Arcana.Application.Abstractions;
using Microsoft.AspNetCore.SignalR;

namespace Arcana.Api.Hubs;

/// <summary>
/// Default IGameBroadcaster backed by SignalR. Pushes a "room-updated"
/// event to the matching hub group. Callers pass already-serialized payload
/// so we don't double-JSON-encode (SignalR handles the wire format itself).
///
/// The payload is the FULL RoomDto already scoped to the right viewer (each
/// caller passes a pre-built DTO). Subscribers receive the exact state they
/// would have gotten from a /snapshot call, so they no longer need to re-fetch
/// after every broadcast. This eliminates the per-action Firestore read that
/// the client was doing as a reaction to the broadcast — the single biggest
/// quota saver in the realtime pipeline.
/// </summary>
public class SignalRGameBroadcaster : IGameBroadcaster
{
    private readonly IHubContext<GameHub> _hub;

    public SignalRGameBroadcaster(IHubContext<GameHub> hub)
    {
        _hub = hub;
    }

    public Task BroadcastRoomUpdatedAsync(string roomId, object payload, CancellationToken ct = default)
    {
        var group = $"room-{roomId}";
        return _hub.Clients.Group(group).SendAsync("room-updated", payload, ct);
    }
}
