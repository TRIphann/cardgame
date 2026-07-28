using Arcana.Application.Abstractions;
using Microsoft.AspNetCore.SignalR;

namespace Arcana.Api.Hubs;

/// <summary>
/// Default IGameBroadcaster backed by SignalR. Pushes a "room-updated"
/// event to the matching hub group. Callers pass already-serialized payload
/// so we don't double-JSON-encode (SignalR handles the wire format itself).
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
