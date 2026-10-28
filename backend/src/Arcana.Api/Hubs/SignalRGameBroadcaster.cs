using Arcana.Application.Abstractions;
using Microsoft.AspNetCore.SignalR;

namespace Arcana.Api.Hubs;

/// <summary>
/// Default IGameBroadcaster backed by SignalR. Pushes a "room-updated"
/// event to the matching hub group. Callers pass already-serialized payload
/// so we don't double-JSON-encode (SignalR handles the wire format itself).
/// </summary>
public class SignalRGameBroadcaster(IHubContext<GameHub> hub) : IGameBroadcaster
{
    private readonly IHubContext<GameHub> _hub = hub;

    public Task BroadcastRoomUpdatedAsync(string roomId, object payload, CancellationToken ct = default)
    {
        var group = $"room-{roomId}";
        return _hub.Clients.Group(group).SendAsync("room-updated", payload, ct);
    }

    public Task BroadcastRoomSnapshotAsync(string roomId, object roomSnapshot, CancellationToken ct = default)
    {
        var group = $"room-{roomId}";
        return _hub.Clients.Group(group).SendAsync("room-snapshot", roomSnapshot, ct);
    }

    public Task BroadcastRoomToastAsync(
        string roomId,
        string toastText,
        IEnumerable<string>? excludeMemberIds,
        CancellationToken ct = default)
    {
        var group = $"room-{roomId}";
        var payload = new
        {
            text = toastText,
            excludeMemberIds = excludeMemberIds?.ToArray() ?? [],
        };
        return _hub.Clients.Group(group).SendAsync("room-toast", payload, ct);
    }
}
