using Arcana.Domain.Entities;

namespace Arcana.Infrastructure.Repositories;

/// <summary>
/// Shared deep-clone helpers for <see cref="Room"/> and <see cref="GameState"/>.
/// Both <see cref="CachedRoomRepository"/> and <see cref="InMemoryRoomCache"/>
/// need to snapshot these objects to avoid reference leaks when callers keep
/// mutating the originals after a cache write.
/// </summary>
public static class RoomSnapshot
{
    /// <summary>
    /// Clones a <see cref="Room"/> with all mutable collections duplicated.
    /// The returned instance is fully isolated from the source — mutations
    /// to either side never leak across.
    /// </summary>
    public static Room CloneRoom(Room source)
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

    /// <summary>
    /// Clones a <see cref="GameState"/>. Every collection on the entity is
    /// duplicated (lists via <c>ToList</c>, dictionaries via
    /// <c>ToDictionary</c>, hash sets via <c>ToHashSet</c>) so the snapshot
    /// has no shared references with the source.
    /// </summary>
    public static GameState? CloneGameState(GameState? source)
    {
        if (source is null) return null;

        return new GameState
        {
            Deck = [.. source.Deck],
            DiscardPile = [.. source.DiscardPile],
            PreShuffleDeck = source.PreShuffleDeck?.ToList(),
            PreAttackCounter = source.PreAttackCounter,
            CurrentTurnMemberId = source.CurrentTurnMemberId,
            AttackCounter = source.AttackCounter,
            TurnStartedAt = source.TurnStartedAt,
            TurnOrder = [.. source.TurnOrder],
            WinnerId = source.WinnerId,
            StartedAt = source.StartedAt,
            EndedAt = source.EndedAt,
            ClientReady = source.ClientReady,
            DrawOnlyBotIds = [.. source.DrawOnlyBotIds],
            PlayCardsBotIds = [.. source.PlayCardsBotIds],
            DisableBotService = source.DisableBotService,
            AfkMemberIds = [.. source.AfkMemberIds],
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
            // FIX: PendingTargetPick (Favor phase-1 / combo target picker)
            // was missing from the clone, so the 10s picker-timeout state
            // was dropped every time a room was read back from the cache.
            // The sweeper then never saw a pending picker and the room
            // stalled forever waiting for a target the server had forgotten.
            PendingTargetPick = ClonePendingTargetPick(source.PendingTargetPick),
            // FIX: OneCardBotCardMap was missing from the clone, so the
            // "play one specific card" bot mode silently degraded to
            // draw-only every time a room was read back from the cache.
            // The BotService reads the map from the cached state — without
            // it, `isOneCardBot` was always false and the designated card
            // was never played.
            OneCardBotCardMap = source.OneCardBotCardMap != null
                ? new Dictionary<string, string>(source.OneCardBotCardMap)
                : [],
            // FIX: BotTurnSeconds was missing, causing bots to never act when
            // read from cache (BotService and TurnClockService both read from cache).
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
            NopeChain = [.. source.NopeChain],
            // FIX: SkipTurnAdvance was missing from the clone.
            SkipTurnAdvance = source.SkipTurnAdvance,
        };
    }

    private static PendingTargetPick? ClonePendingTargetPick(PendingTargetPick? source)
    {
        if (source is null) return null;
        return new PendingTargetPick
        {
            Kind = source.Kind,
            CardKey = source.CardKey,
            InitiatorId = source.InitiatorId,
            CandidateMemberIds = [.. source.CandidateMemberIds],
            CreatedAt = source.CreatedAt,
        };
    }
}