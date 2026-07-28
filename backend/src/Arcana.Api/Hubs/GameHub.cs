using Microsoft.AspNetCore.SignalR;

namespace Arcana.Api.Hubs;

/// <summary>
/// SignalR hub that lets each browser tab join a "roomId" group. The server
/// pushes "room-updated" events to the group whenever the game state
/// changes (see SignalRGameBroadcaster).
///
/// Clients call `JoinRoom(roomId, memberId)` on connect; the server tracks
/// the connection's memberId in a connection-scope map for cleanup and for
/// future per-player targeting.
/// </summary>
public class GameHub : Hub
{
    public async Task JoinRoom(string roomId, string memberId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(roomId));
        // Tag the connection with the memberId for future server-side targeting
        // (e.g. private chat). HubContext.Items is per-connection so this is safe.
        Context.Items["memberId"] = memberId;
        Context.Items["roomId"] = roomId;
        await Clients.Caller.SendAsync("joined", roomId);
    }

    public async Task LeaveRoom(string roomId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(roomId));
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        // Hub automatically removes the connection from all groups on disconnect.
        return base.OnDisconnectedAsync(exception);
    }

    private static string GroupName(string roomId) => $"room-{roomId}";
}
