using System.Collections.Concurrent;
using Arcana.Domain.Services;

namespace Arcana.Infrastructure.Repositories;

/// <summary>
/// In-memory fallback for <see cref="ICodeReservationService"/>.
/// Used when Redis isn't reachable so the API still boots in dev/local
/// environments. Concurrent dictionary + lock gives the same SETNX-like
/// atomicity for a single-process deployment.
/// </summary>
public class InMemoryCodeReservationService : ICodeReservationService
{
    private readonly ConcurrentDictionary<string, string> _codes = new();
    private readonly ConcurrentDictionary<string, DateTime> _expiries = new();
    private readonly TimeSpan _expiry = TimeSpan.FromHours(24);

    public Task<bool> TryReserveCodeAsync(string code, string roomId, CancellationToken ct = default)
    {
        SweepExpired();
        var key = Normalize(code);
        if (_codes.TryAdd(key, roomId))
        {
            _expiries[key] = DateTime.UtcNow.Add(_expiry);
            return Task.FromResult(true);
        }
        return Task.FromResult(false);
    }

    public Task<string?> ResolveCodeAsync(string code, CancellationToken ct = default)
    {
        SweepExpired();
        var key = Normalize(code);
        return Task.FromResult(_codes.TryGetValue(key, out var roomId) ? roomId : null);
    }

    public Task ReleaseCodeAsync(string code, CancellationToken ct = default)
    {
        var key = Normalize(code);
        _codes.TryRemove(key, out _);
        _expiries.TryRemove(key, out _);
        return Task.CompletedTask;
    }

    private void SweepExpired()
    {
        var now = DateTime.UtcNow;
        foreach (var kv in _expiries)
        {
            if (kv.Value < now)
            {
                _codes.TryRemove(kv.Key, out _);
                _expiries.TryRemove(kv.Key, out _);
            }
        }
    }

    private static string Normalize(string code) => code.Trim().ToUpperInvariant();
}