using Arcana.Domain.Enums;

namespace Arcana.Domain.Entities;

public class Room
{
    public string Id { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string HostId { get; set; } = string.Empty;
    public string HostName { get; set; } = string.Empty;
    public RoomStatus Status { get; set; } = RoomStatus.Waiting;
    public int MaxPlayers { get; set; } = 8;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<RoomMember> Members { get; set; } = new();
}
