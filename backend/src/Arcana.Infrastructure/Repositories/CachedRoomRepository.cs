using Arcana.Domain.Entities;
using Arcana.Domain.Repositories;
using Arcana.Domain.Enums;
using Microsoft.Extensions.Logging;

namespace Arcana.Infrastructure.Repositories;

/// <summary>
/// Decorator that wraps <see cref="FirestoreRoomRepository"/> with an
/// in-memory <see cref="IRoomCache"/>. All reads go to cache first; on a
/// miss, the underlying Firestore repo is called and the result cached.
/// Writes always go to Firestore first, then update the cache.
///
/// <para>
/// This makes Firestore a pure persistence layer during active gameplay.
/// The only remaining Firestore reads are:
///   - Cold-start: when the first request for a room comes in and it's
///     not yet in the cache (server restart / room just created by another
///     server in a future scaled-out deployment).
///   - Invariant checks that require a DB snapshot (TryJoinRoomAsync,
///     RemoveMemberAsync, UpdateMemberFieldAsync — these need transaction
///     isolation so they bypass the cache).
/// </para>
/// </summary>
public sealed class CachedRoomRepository : IRoomRepository
{
    private readonly FirestoreRoomRepository _inner;
    private readonly IRoomCache _cache;
    private readonly ILogger<CachedRoomRepository> _logger;

    public CachedRoomRepository(
        FirestoreRoomRepository inner,
        IRoomCache cache,
        ILogger<CachedRoomRepository> logger)
    {
        _inner = inner;
        _cache = cache;
        _logger = logger;
    }

    // ── Reads: cache-first ────────────────────────────────────────

    public async Task<Room?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        // Hot path: cache hit means zero Firestore reads.
        if (_cache.Get(id) is { } cached)
        {
            _logger.LogDebug("CachedRoomRepository: cache HIT for room {RoomId}", id);
            return cached;
        }

        _logger.LogDebug("CachedRoomRepository: cache MISS for room {RoomId}, reading Firestore", id);
        var room = await _inner.GetByIdAsync(id, ct);
        if (room is not null)
        {
            _cache.Set(id, room);
        }
        return room;
    }

    public async Task<Room?> GetByCodeAsync(string code, CancellationToken ct = default)
    {
        // GetByCodeAsync first resolves the code → roomId via Firestore,
        // then delegates to GetByIdAsync which respects the cache.
        var room = await _inner.GetByCodeAsync(code, ct);
        if (room is not null)
        {
            _cache.Set(room.Id, room);
        }
        return room;
    }

    public async Task<IReadOnlyList<Room>> GetAllPlayingAsync(CancellationToken ct = default)
    {
        // Background sweeper use-case: scan all playing rooms.
        // Each room that lands in cache will benefit subsequent reads.
        // This is a cold-scan and intentionally bypasses the cache for accuracy.
        var rooms = await _inner.GetAllPlayingAsync(ct);
        foreach (var room in rooms)
        {
            _cache.Set(room.Id, room);
        }
        return rooms;
    }

    // ── Writes: Firestore-first, then cache ──────────────────────

    public async Task<bool> TryReserveCodeAsync(string code, string roomId, CancellationToken ct = default)
    {
        return await _inner.TryReserveCodeAsync(code, roomId, ct);
    }

    public async Task CreateAsync(Room room, CancellationToken ct = default)
    {
        await _inner.CreateAsync(room, ct);
        _cache.Set(room.Id, room);
        _logger.LogDebug("CachedRoomRepository: cached new room {RoomId}", room.Id);
    }

    public async Task<Room?> TryJoinRoomAsync(string roomId, RoomMember member, CancellationToken ct = default)
    {
        // Transactional read-modify-write — must hit Firestore for isolation.
        // The Firestore repo now patches the returned Room object to include
        // the new member (the transaction can't re-read after writing), so
        // caching it is safe. Stale cache entries are still evicted just in
        // case the next read hits before the cache is warmed.
        var result = await _inner.TryJoinRoomAsync(roomId, member, ct);
        if (result is not null)
        {
            _cache.Set(result.Id, result);
        }
        else
        {
            // Failed join: evict any stale entry so the caller can re-check
            // the latest room state from Firestore.
            _cache.Remove(roomId);
        }
        return result;
    }

    public async Task<Room?> RemoveMemberAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        // Same race as TryJoinRoomAsync: the Firestore repo patches the
        // returned Room object (drops the removed member) so the cached copy
        // stays consistent with the post-delete state. Stale entries are
        // evicted defensively for callers that re-read before the cache is
        // warmed.
        var result = await _inner.RemoveMemberAsync(roomId, memberId, ct);
        if (result is not null)
        {
            _cache.Set(result.Id, result);
        }
        else
        {
            _cache.Remove(roomId);
        }
        return result;
    }

    public async Task<RoomMember?> UpdateMemberFieldAsync(
        string roomId,
        string memberId,
        bool? isReady,
        DateTime? lastSeenAt,
        CancellationToken ct = default)
    {
        // Transactional — must go to Firestore.
        // After update, evict the room from cache so the next GetByIdAsync
        // call picks up the fresh member state from Firestore.
        var result = await _inner.UpdateMemberFieldAsync(roomId, memberId, isReady, lastSeenAt, ct);
        if (result is not null)
        {
            // Evict rather than re-fetch: updating a single member's field
            // doesn't change the game state, so skipping one re-fetch is fine.
            _cache.Remove(roomId);
        }
        return result;
    }

    public async Task<int> MarkStaleMembersOfflineAsync(string roomId, TimeSpan offlineAfter, CancellationToken ct = default)
    {
        var result = await _inner.MarkStaleMembersOfflineAsync(roomId, offlineAfter, ct);
        // Invalidate cache so next read picks up offline flags.
        if (result > 0) _cache.Remove(roomId);
        return result;
    }

    public async Task<bool> UpdateRoomCodeAsync(string roomId, string code, CancellationToken ct = default)
    {
        var result = await _inner.UpdateRoomCodeAsync(roomId, code, ct);
        if (result)
        {
            _cache.Remove(roomId);
        }
        return result;
    }

    public async Task<Room?> UpdateGameStateAsync(
        string roomId,
        Domain.Entities.GameState? gameState,
        RoomStatus? status,
        CancellationToken ct = default)
    {
        // Write to Firestore first (authoritative).
        await _inner.UpdateGameStateAsync(roomId, gameState, status, ct);

        // Build the post-write Room WITHOUT a Firestore round-trip:
        //   - If cache is warm, take the cached Room and swap GameState + Status.
        //     This is what 99% of writes look like during active gameplay.
        //   - If cache is cold (process restart), do one authoritative read.
        // The previous implementation always re-read; with AFK auto-play
        // chains that fires every 2s, that doubled read traffic for no gain.
        if (_cache.Get(roomId) is { } cached && gameState is not null)
        {
            // Deep-clone the GameState before stashing it: callers (e.g.
            // GameService.PersistAsync) keep mutating the original gs for
            // several lines after this write (turn-clock arming, broadcast
            // prep, etc.). Without the clone, those mutations would silently
            // leak into the cache and confuse subsequent reads.
            cached.GameState = RoomSnapshot.CloneGameState(gameState);
            if (status is not null) cached.Status = status.Value;
            _cache.Set(roomId, cached);
            return cached;
        }

        var room = await _inner.GetByIdAsync(roomId, ct);
        if (room is not null)
        {
            _cache.Set(roomId, room);
            _logger.LogDebug("CachedRoomRepository: cached updated room {RoomId}", roomId);
        }
        return room;
    }
}
