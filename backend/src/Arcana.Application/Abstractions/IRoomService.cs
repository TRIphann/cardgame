using Arcana.Domain.Entities;

namespace Arcana.Application.Abstractions;

public interface IRoomService
{
    Task<Room> CreateRoomAsync(string hostName, CancellationToken ct = default);
    Task<Room> JoinRoomAsync(string code, string playerName, CancellationToken ct = default);
    Task<Room?> GetRoomAsync(string id, CancellationToken ct = default);
}
