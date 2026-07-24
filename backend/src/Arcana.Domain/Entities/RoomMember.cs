namespace Arcana.Domain.Entities;

public class RoomMember
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsHost { get; set; }
    public bool IsReady { get; set; }
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
