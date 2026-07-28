namespace Arcana.Domain.Entities;

public class RoomMember
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsHost { get; set; }
    public bool IsReady { get; set; }
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    // Updated by the heartbeat endpoint. Used to detect members that closed
    // their tab / went offline. Members whose LastSeenAt is older than the
    // heartbeat window are pruned by the polling endpoint on the server.
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
    public bool IsOnline { get; set; } = true;
}
