using Arcana.Domain.Entities;

namespace Arcana.Application.Abstractions;

/// <summary>
/// In-memory room repository for testing scenarios.
/// This interface extends <see cref="IRoomRepository"/> with additional methods
/// specific to test mode operations.
/// </summary>
public interface ITestRoomRepository : Domain.Repositories.IRoomRepository
{
    /// <summary>
    /// Clears all rooms from the repository.
    /// </summary>
    void ClearAll();

    /// <summary>
    /// Deletes a specific room by ID.
    /// </summary>
    Task DeleteAsync(string id, CancellationToken ct = default);
}
