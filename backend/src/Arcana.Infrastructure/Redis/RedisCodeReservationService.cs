using Arcana.Domain.Services;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace Arcana.Infrastructure.Redis;

public class RedisCodeReservationService : ICodeReservationService
{
    private readonly IDatabase _db;
    private readonly ILogger<RedisCodeReservationService> _logger;
    
    private const string KeyPrefix = "room:code:";
    private static readonly TimeSpan DefaultExpiry = TimeSpan.FromHours(24);

    public RedisCodeReservationService(
        IConnectionMultiplexer redis,
        ILogger<RedisCodeReservationService> logger)
    {
        _db = redis.GetDatabase();
        _logger = logger;
    }

    public async Task<bool> TryReserveCodeAsync(string code, string roomId, CancellationToken ct = default)
    {
        var key = GetKey(code);
        
        // SETNX with expiry - atomic reservation
        // If key exists, returns false (already taken)
        var result = await _db.StringSetAsync(key, roomId, DefaultExpiry, When.NotExists);
        
        if (result)
        {
            _logger.LogDebug("Reserved code {Code} for room {RoomId}", code, roomId);
        }
        else
        {
            _logger.LogDebug("Code {Code} already reserved", code);
        }
        
        return result;
    }

    public async Task<string?> ResolveCodeAsync(string code, CancellationToken ct = default)
    {
        var key = GetKey(code);
        var roomId = await _db.StringGetAsync(key);
        
        if (roomId.IsNullOrEmpty)
        {
            _logger.LogDebug("Code {Code} not found or expired", code);
            return null;
        }
        
        _logger.LogDebug("Resolved code {Code} to room {RoomId}", code, roomId.ToString());
        return roomId.ToString();
    }

    public async Task ReleaseCodeAsync(string code, CancellationToken ct = default)
    {
        var key = GetKey(code);
        await _db.KeyDeleteAsync(key);
        _logger.LogDebug("Released code {Code}", code);
    }

    private static string GetKey(string code) => $"{KeyPrefix}{code.ToUpperInvariant()}";
}
