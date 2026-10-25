using System.Collections.Concurrent;
using Arcana.Application.Abstractions;
using Arcana.Domain.Entities;
using Arcana.Domain.Enums;
using Arcana.Domain.Repositories;

namespace Arcana.Infrastructure.Repositories;

/// <summary>
/// In-memory implementation of <see cref="ITestRoomRepository"/> for local testing.
/// All data is stored in a thread-safe <see cref="ConcurrentDictionary"/> and
/// is lost on server restart.
///
/// <para>
/// This repository bypasses Firestore entirely, eliminating quota concerns for
/// local development and automated testing scenarios.
/// </para>
/// </summary>
public sealed class InMemoryRoomRepository : ITestRoomRepository
{
    private readonly ConcurrentDictionary<string, Room> _rooms = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _codeToRoomId = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _codeLock = new();
    private readonly IRoomCache? _roomCache;

    public InMemoryRoomRepository() : this(null) { }

    public InMemoryRoomRepository(IRoomCache? roomCache)
    {
        _roomCache = roomCache;
    }

    public Task<Room?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        // Defensive clone so callers can mutate the returned GameState without
        // silently corrupting the cached copy in _rooms. Without this, a
        // mutation like DrawCardAsync's `hand.Add(drawn)` would leak into the
        // next read, producing the "hands vanish" symptom when a concurrent
        // tick observes a partially-mutated state.
        _rooms.TryGetValue(id, out var room);
        return Task.FromResult(room is null ? null : CloneRoom(room));
    }

    public Task<Room?> GetByCodeAsync(string code, CancellationToken ct = default)
    {
        if (_codeToRoomId.TryGetValue(code, out var roomId) && _rooms.TryGetValue(roomId, out var room))
        {
            return Task.FromResult<Room?>(room);
        }
        return Task.FromResult<Room?>(null);
    }

    public Task<bool> TryReserveCodeAsync(string code, string roomId, CancellationToken ct = default)
    {
        lock (_codeLock)
        {
            if (_codeToRoomId.ContainsKey(code))
                return Task.FromResult(false);

            _codeToRoomId[code] = roomId;
            return Task.FromResult(true);
        }
    }

    public Task CreateAsync(Room room, CancellationToken ct = default)
    {
        _rooms[room.Id] = CloneRoom(room);
        return Task.CompletedTask;
    }

    public Task<Room?> TryJoinRoomAsync(string roomId, RoomMember member, CancellationToken ct = default)
    {
        if (!_rooms.TryGetValue(roomId, out var room))
            return Task.FromResult<Room?>(null);

        if (room.Status != RoomStatus.Waiting)
            return Task.FromResult<Room?>(null);

        if (room.Members.Count >= room.MaxPlayers)
            return Task.FromResult<Room?>(null);

        if (room.Members.Any(m => m.Id == member.Id))
            return Task.FromResult<Room?>(null);

        var newMember = new RoomMember
        {
            Id = member.Id,
            Name = member.Name,
            IsHost = member.IsHost,
            IsReady = member.IsReady,
            JoinedAt = member.JoinedAt,
            LastSeenAt = member.LastSeenAt,
            IsOnline = member.IsOnline,
            IsBot = member.IsBot,
        };
        room.Members.Add(newMember);
        _rooms[roomId] = room;

        // Return a clone so the caller can't mutate the cached room.
        return Task.FromResult<Room?>(CloneRoom(room));
    }

    public Task<Room?> RemoveMemberAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        if (!_rooms.TryGetValue(roomId, out var room))
            return Task.FromResult<Room?>(null);

        var member = room.Members.FirstOrDefault(m => m.Id == memberId);
        if (member == null)
            return Task.FromResult<Room?>(null);

        room.Members.Remove(member);
        _rooms[roomId] = room;

        return Task.FromResult<Room?>(room);
    }

    public Task<RoomMember?> UpdateMemberFieldAsync(
        string roomId,
        string memberId,
        bool? isReady,
        DateTime? lastSeenAt,
        CancellationToken ct = default)
    {
        if (!_rooms.TryGetValue(roomId, out var room))
            return Task.FromResult<RoomMember?>(null);

        var member = room.Members.FirstOrDefault(m => m.Id == memberId);
        if (member == null)
            return Task.FromResult<RoomMember?>(null);

        if (isReady.HasValue)
            member.IsReady = isReady.Value;
        if (lastSeenAt.HasValue)
            member.LastSeenAt = lastSeenAt.Value;

        _rooms[roomId] = room;
        return Task.FromResult<RoomMember?>(member);
    }

    public Task<int> MarkStaleMembersOfflineAsync(string roomId, TimeSpan offlineAfter, CancellationToken ct = default)
    {
        if (!_rooms.TryGetValue(roomId, out var room))
            return Task.FromResult(0);

        var cutoff = DateTime.UtcNow - offlineAfter;
        int marked = 0;

        foreach (var member in room.Members)
        {
            if (!member.IsOnline)
                continue;

            if (member.LastSeenAt < cutoff)
            {
                member.IsOnline = false;
                marked++;
            }
        }

        if (marked > 0)
            _rooms[roomId] = room;

        return Task.FromResult(marked);
    }

    public Task<bool> UpdateRoomCodeAsync(string roomId, string code, CancellationToken ct = default)
    {
        if (!_rooms.TryGetValue(roomId, out var room))
            return Task.FromResult(false);

        lock (_codeLock)
        {
            // Remove old code mapping if exists
            if (!string.IsNullOrEmpty(room.Code) && _codeToRoomId.TryGetValue(room.Code, out var oldMapping) && oldMapping == roomId)
            {
                _codeToRoomId.TryRemove(room.Code, out _);
            }

            // Add new code mapping
            if (_codeToRoomId.ContainsKey(code))
                return Task.FromResult(false);

            room.Code = code;
            _codeToRoomId[code] = roomId;
        }

        _rooms[roomId] = room;
        return Task.FromResult(true);
    }

    public Task<Room?> UpdateGameStateAsync(
        string roomId,
        Domain.Entities.GameState? gameState,
        RoomStatus? status,
        CancellationToken ct = default)
    {
        if (!_rooms.TryGetValue(roomId, out var room))
            return Task.FromResult<Room?>(null);

        // Defensive clone: callers (e.g. GameService.PersistAsync) keep mutating
        // the original `gameState` for several lines after this call (turn-clock
        // arming, broadcast prep, etc.). Without cloning here, those mutations
        // would silently leak into the cached GameState and confuse subsequent
        // reads — including BotService's clone-on-read, which would observe a
        // half-mutated state and drop/clear hands for other players.
        if (gameState != null)
            room.GameState = CloneGameState(gameState);
        if (status.HasValue)
            room.Status = status.Value;

        _rooms[roomId] = room;

        // CRITICAL: Sync to IRoomCache so BotService (which reads from cache) sees the updated game state.
        // Without this, BotService's TickAsync() sees stale data and skips this room.
        if (_roomCache != null)
        {
            _roomCache.Set(roomId, room);
        }

        return Task.FromResult<Room?>(room);
    }

    public Task<IReadOnlyList<Room>> GetAllPlayingAsync(CancellationToken ct = default)
    {
        var playing = _rooms.Values
            .Where(r => r.Status == RoomStatus.Playing && r.GameState != null)
            .Select(CloneRoom)
            .ToList();

        return Task.FromResult<IReadOnlyList<Room>>(playing);
    }

    /// <summary>
    /// Clears all rooms from the repository. Used when stopping a test room.
    /// </summary>
    public void ClearAll()
    {
        _rooms.Clear();
        _codeToRoomId.Clear();
    }

    /// <summary>
    /// Deletes a specific room by ID.
    /// </summary>
    public Task DeleteAsync(string id, CancellationToken ct = default)
    {
        _rooms.TryRemove(id, out var room);
        if (room != null)
        {
            _codeToRoomId.TryRemove(room.Code, out _);
        }
        return Task.CompletedTask;
    }

    private static Room CloneRoom(Room source)
    {
        var clone = new Room
        {
            Id = source.Id,
            Code = source.Code,
            HostId = source.HostId,
            HostName = source.HostName,
            Status = source.Status,
            MaxPlayers = source.MaxPlayers,
            CreatedAt = source.CreatedAt,
            GameState = CloneGameState(source.GameState),
        };

        foreach (var member in source.Members)
        {
            clone.Members.Add(new RoomMember
            {
                Id = member.Id,
                Name = member.Name,
                IsHost = member.IsHost,
                IsReady = member.IsReady,
                JoinedAt = member.JoinedAt,
                LastSeenAt = member.LastSeenAt,
                IsOnline = member.IsOnline,
                IsBot = member.IsBot,
            });
        }

        return clone;
    }

    private static GameState? CloneGameState(GameState? source)
    {
        if (source is null) return null;

        return new GameState
        {
            Deck = source.Deck.ToList(),
            DiscardPile = source.DiscardPile.ToList(),
            PreShuffleDeck = source.PreShuffleDeck?.ToList(),
            PreAttackCounter = source.PreAttackCounter,
            CurrentTurnMemberId = source.CurrentTurnMemberId,
            AttackCounter = source.AttackCounter,
            TurnStartedAt = source.TurnStartedAt,
            TurnOrder = source.TurnOrder.ToList(),
            WinnerId = source.WinnerId,
            StartedAt = source.StartedAt,
            EndedAt = source.EndedAt,
            ClientReady = source.ClientReady,
            FuturePeek = source.FuturePeek?.ToList(),
            FuturePeekAt = source.FuturePeekAt,
            PendingAction = ClonePendingAction(source.PendingAction),
            Hands = source.Hands.ToDictionary(k => k.Key, k => k.Value.ToList()),
            Alive = source.Alive.ToDictionary(k => k.Key, k => k.Value),
            DiedAt = source.DiedAt.ToDictionary(k => k.Key, k => k.Value),
            TurnsTaken = source.TurnsTaken.ToDictionary(k => k.Key, k => k.Value),
            CardsPlayed = source.CardsPlayed.ToDictionary(k => k.Key, k => k.Value),
            LastDrawnBy = source.LastDrawnBy,
            LastDrawnCardKey = source.LastDrawnCardKey,
            LastDrawnAt = source.LastDrawnAt,
            BombRevealActive = source.BombRevealActive,
            LastPlayedCardKey = source.LastPlayedCardKey,
            LastPlayedBy = source.LastPlayedBy,
            LastPlayedAt = source.LastPlayedAt,
            LastPlayedByNope = source.LastPlayedByNope,
            PendingFavorPick = source.PendingFavorPick,
            // FIX: OneCardBotCardMap was missing from the clone, so the
            // "play one specific card" bot mode silently degraded to
            // draw-only every time the room was read back from the
            // repository. The BotService reads the map from the cached
            // state — without it, `isOneCardBot` was always false and the
            // designated card was never played.
            OneCardBotCardMap = source.OneCardBotCardMap != null
                ? new Dictionary<string, string>(source.OneCardBotCardMap)
                : new Dictionary<string, string>(),
            // Null-safe clone of bot configuration. The defensive `?? new
            // HashSet<string>()` avoids passing `null` into the HashSet
            // constructor (which would NRE); without it the build warns
            // CS8604 and a transient source-side null would crash here.
            DisableBotService = source.DisableBotService,
            DrawOnlyBotIds = source.DrawOnlyBotIds != null
                ? new HashSet<string>(source.DrawOnlyBotIds)
                : new HashSet<string>(),
            PlayCardsBotIds = source.PlayCardsBotIds != null
                ? new HashSet<string>(source.PlayCardsBotIds)
                : new HashSet<string>(),
            AfkMemberIds = source.AfkMemberIds != null
                ? new HashSet<string>(source.AfkMemberIds)
                : new HashSet<string>(),
            // FIX: BotTurnSeconds was missing from the clone, which silently
            // reset the bot turn window to 0 (= use the 10s default) on
            // every UpdateGameStateAsync. With BotTurnSeconds=1 (test mode)
            // the bots would wait 10s before acting instead of 1s, making
            // them feel frozen during QA.
            // the test lobby feel "frozen" for almost the whole turn timer.
            BotTurnSeconds = source.BotTurnSeconds,
        };
    }

    private static PendingAction? ClonePendingAction(PendingAction? source)
    {
        if (source is null) return null;
        return new PendingAction
        {
            InitiatorId = source.InitiatorId,
            CardKey = source.CardKey,
            DiscardPickKey = source.DiscardPickKey,
            CreatedAt = source.CreatedAt,
            NopeChain = source.NopeChain.ToList(),
            // FIX: SkipTurnAdvance was missing from the clone, which caused
            // the in-memory repo to silently reset Future's `SkipTurnAdvance`
            // back to false on every UpdateGameStateAsync. After the 5s Nope
            // window expired, ResolveExpiredNopeAsync saw SkipTurnAdvance=false
            // and called AdvanceTurn, so the Future player's turn ended
            // automatically — which contradicts the rule "Future does NOT
            // advance the turn".
            SkipTurnAdvance = source.SkipTurnAdvance,
        };
    }
}
