using Arcana.Domain.Entities;

namespace Arcana.Domain.Repositories;

public interface IRoomRepository
{
    Task<Room?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<Room?> GetByCodeAsync(string code, CancellationToken ct = default);
    Task<bool> CodeExistsAsync(string code, CancellationToken ct = default);
    Task CreateAsync(Room room, CancellationToken ct = default);
    Task AddMemberAsync(string roomId, RoomMember member, CancellationToken ct = default);
    Task UpdateMemberAsync(string roomId, RoomMember member, CancellationToken ct = default);
}
