namespace Arcana.Domain.Services;

public interface ICodeReservationService
{
    /// <summary>
    /// Atomically reserve a unique invitation code.
    /// Returns true if reservation succeeded (code was free), false if already taken.
    /// Uses Redis SETNX for atomicity with automatic expiration.
    /// </summary>
    Task<bool> TryReserveCodeAsync(string code, string roomId, CancellationToken ct = default);

    /// <summary>
    /// Resolve a code to its roomId. Returns null if the code doesn't exist or expired.
    /// </summary>
    Task<string?> ResolveCodeAsync(string code, CancellationToken ct = default);

    /// <summary>
    /// Release a reserved code (used when room creation fails or room is deleted).
    /// </summary>
    Task ReleaseCodeAsync(string code, CancellationToken ct = default);
}
