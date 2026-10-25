using Arcana.Domain.Entities;
using Arcana.Infrastructure.Repositories;

namespace Arcana.UnitTests.Infrastructure;

/// <summary>
/// Unit tests for <see cref="RoomSnapshot"/> — the deep-clone helpers that
/// keep the cached room store isolated from callers that keep mutating the
/// objects they got back.
///
/// A shallow clone here would leak state between the cache and the live game
/// state, which is exactly the class of bug these tests guard against.
/// </summary>
public class RoomSnapshotTests
{
    private static Room BuildRoom()
    {
        var room = new Room
        {
            Id = "room-1",
            Code = "ABC234",
            HostId = "m1",
            HostName = "Alice",
            Status = Domain.Enums.RoomStatus.Playing,
            MaxPlayers = 7,
            CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            GameState = new GameState
            {
                Deck = { "attack", "skip" },
                DiscardPile = { "bomb" },
                CurrentTurnMemberId = "m1",
                AttackCounter = 2,
                StartedAt = new DateTime(2026, 1, 1, 0, 1, 0, DateTimeKind.Utc),
                Hands = { ["m1"] = new List<string> { "attack", "ninja" } },
                Alive = { ["m1"] = true, ["m2"] = false },
                TurnOrder = { "m1", "m2" },
                CardsPlayed = { ["m1"] = 3 },
                TurnsTaken = { ["m1"] = 2 },
                DrawOnlyBotIds = { "m3" },
                AfkMemberIds = { "m4" },
            },
        };

        room.Members.Add(new RoomMember
        {
            Id = "m1",
            Name = "Alice",
            IsHost = true,
            IsReady = true,
            IsOnline = true,
            IsBot = false,
        });
        room.Members.Add(new RoomMember { Id = "m2", Name = "Bob" });

        return room;
    }

    // ─────────────────────────────────────────────────────────────────────
    // CloneRoom
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public void CloneRoom_CopiesAllScalarProperties()
    {
        var source = BuildRoom();

        var clone = RoomSnapshot.CloneRoom(source);

        Assert.Equal(source.Id, clone.Id);
        Assert.Equal(source.Code, clone.Code);
        Assert.Equal(source.HostId, clone.HostId);
        Assert.Equal(source.HostName, clone.HostName);
        Assert.Equal(source.Status, clone.Status);
        Assert.Equal(source.MaxPlayers, clone.MaxPlayers);
        Assert.Equal(source.CreatedAt, clone.CreatedAt);
    }

    [Fact]
    public void CloneRoom_CopiesMembersIntoNewInstances()
    {
        var source = BuildRoom();

        var clone = RoomSnapshot.CloneRoom(source);

        Assert.Equal(source.Members.Count, clone.Members.Count);
        Assert.NotSame(source.Members[0], clone.Members[0]);
        Assert.Equal(source.Members[0].Id, clone.Members[0].Id);
        Assert.Equal(source.Members[0].Name, clone.Members[0].Name);
        Assert.Equal(source.Members[0].IsHost, clone.Members[0].IsHost);
        Assert.Equal(source.Members[0].IsReady, clone.Members[0].IsReady);
        Assert.Equal(source.Members[0].IsBot, clone.Members[0].IsBot);
    }

    [Fact]
    public void CloneRoom_MutatingTheCloneDoesNotAffectTheSource()
    {
        var source = BuildRoom();

        var clone = RoomSnapshot.CloneRoom(source);
        clone.Members[0].Name = "Changed";
        clone.Members.Clear();

        Assert.Equal("Alice", source.Members[0].Name);
        Assert.Equal(2, source.Members.Count);
    }

    [Fact]
    public void CloneRoom_MutatingTheClonedGameStateDoesNotAffectTheSource()
    {
        var source = BuildRoom();

        var clone = RoomSnapshot.CloneRoom(source);
        clone.GameState!.Deck.Add("favor");
        clone.GameState.Hands["m1"].Add("bomb");
        clone.GameState.Alive["m1"] = false;

        Assert.DoesNotContain("favor", source.GameState!.Deck);
        Assert.DoesNotContain("bomb", source.GameState.Hands["m1"]);
        Assert.True(source.GameState.Alive["m1"]);
    }

    [Fact]
    public void CloneRoom_HandlesNullGameState()
    {
        var room = new Room { Id = "r" };

        var clone = RoomSnapshot.CloneRoom(room);

        Assert.Null(clone.GameState);
    }

    // ─────────────────────────────────────────────────────────────────────
    // CloneGameState
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public void CloneGameState_ReturnsNull_ForNullInput()
    {
        Assert.Null(RoomSnapshot.CloneGameState(null));
    }

    [Fact]
    public void CloneGameState_CopiesScalarProperties()
    {
        var source = BuildRoom().GameState!;

        var clone = RoomSnapshot.CloneGameState(source)!;

        Assert.Equal(source.CurrentTurnMemberId, clone.CurrentTurnMemberId);
        Assert.Equal(source.AttackCounter, clone.AttackCounter);
        Assert.Equal(source.StartedAt, clone.StartedAt);
        Assert.Equal(source.EndedAt, clone.EndedAt);
        Assert.Equal(source.WinnerId, clone.WinnerId);
        Assert.Equal(source.ClientReady, clone.ClientReady);
        Assert.Equal(source.DisableBotService, clone.DisableBotService);
        Assert.Equal(source.BotTurnSeconds, clone.BotTurnSeconds);
        Assert.Equal(source.BombRevealActive, clone.BombRevealActive);
        Assert.Equal(source.LastDrawnBy, clone.LastDrawnBy);
        Assert.Equal(source.LastDrawnCardKey, clone.LastDrawnCardKey);
        Assert.Equal(source.LastPlayedBy, clone.LastPlayedBy);
        Assert.Equal(source.LastPlayedCardKey, clone.LastPlayedCardKey);
        Assert.Equal(source.LastPlayedByNope, clone.LastPlayedByNope);
        Assert.Equal(source.PreAttackCounter, clone.PreAttackCounter);
    }

    [Fact]
    public void CloneGameState_DoesNotShareListReferences()
    {
        var source = BuildRoom().GameState!;

        var clone = RoomSnapshot.CloneGameState(source)!;
        clone.Deck.Add("favor");
        clone.DiscardPile.Add("nope");
        clone.TurnOrder.Add("m3");
        clone.DrawOnlyBotIds.Add("m9");
        clone.AfkMemberIds.Add("m8");

        Assert.Equal(2, source.Deck.Count);
        Assert.Single(source.DiscardPile);
        Assert.Equal(2, source.TurnOrder.Count);
        Assert.Single(source.DrawOnlyBotIds);
        Assert.Single(source.AfkMemberIds);
    }

    [Fact]
    public void CloneGameState_DoesNotShareDictionaryReferences()
    {
        var source = BuildRoom().GameState!;

        var clone = RoomSnapshot.CloneGameState(source)!;
        clone.Hands["m1"].Add("bomb");
        clone.Alive["m1"] = false;
        clone.CardsPlayed["m1"] = 99;
        clone.TurnsTaken["m1"] = 99;
        clone.Hands["m9"] = new List<string>();

        Assert.Equal(2, source.Hands["m1"].Count);
        Assert.True(source.Alive["m1"]);
        Assert.Equal(3, source.CardsPlayed["m1"]);
        Assert.Equal(2, source.TurnsTaken["m1"]);
        Assert.False(source.Hands.ContainsKey("m9"));
    }

    [Fact]
    public void CloneGameState_ClonesPendingAction()
    {
        var source = BuildRoom().GameState!;
        source.PendingAction = new PendingAction
        {
            InitiatorId = "m1",
            CardKey = "attack",
            SkipTurnAdvance = true,
            NopeChain = { "m2" },
        };

        var clone = RoomSnapshot.CloneGameState(source)!;

        Assert.NotNull(clone.PendingAction);
        Assert.NotSame(source.PendingAction, clone.PendingAction);
        Assert.Equal("m1", clone.PendingAction!.InitiatorId);
        Assert.Equal("attack", clone.PendingAction.CardKey);
        // Regression guard: SkipTurnAdvance was previously dropped by the clone.
        Assert.True(clone.PendingAction.SkipTurnAdvance);
        Assert.Equal(new[] { "m2" }, clone.PendingAction.NopeChain);
    }

    [Fact]
    public void CloneGameState_PendingActionNopeChainIsNotShared()
    {
        var source = BuildRoom().GameState!;
        source.PendingAction = new PendingAction { InitiatorId = "m1", CardKey = "attack" };
        source.PendingAction.NopeChain.Add("m2");

        var clone = RoomSnapshot.CloneGameState(source)!;
        clone.PendingAction!.NopeChain.Add("m3");

        Assert.Single(source.PendingAction.NopeChain);
        Assert.Equal(2, clone.PendingAction.NopeChain.Count);
    }

    [Fact]
    public void CloneGameState_ClonesNullableListProperties()
    {
        var source = BuildRoom().GameState!;
        source.PreShuffleDeck = new List<string> { "attack", "skip" };
        source.FuturePeek = new List<string> { "bomb" };

        var clone = RoomSnapshot.CloneGameState(source)!;
        clone.PreShuffleDeck!.Add("nope");
        clone.FuturePeek!.Add("nope");

        Assert.Equal(2, source.PreShuffleDeck!.Count);
        Assert.Single(source.FuturePeek!);
    }

    [Fact]
    public void CloneGameState_CopiesBotTurnSeconds()
    {
        // Regression guard: BotTurnSeconds used to be dropped by the clone,
        // which stopped bots from ever acting when the room came from cache.
        var source = BuildRoom().GameState!;
        source.BotTurnSeconds = 7;

        var clone = RoomSnapshot.CloneGameState(source)!;

        Assert.Equal(7, clone.BotTurnSeconds);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Regression: OneCardBotCardMap (one-card bot mode)
    //
    // The "play one specific card" bot mode stores its configuration in
    // GameState.OneCardBotCardMap. Every clone helper (RoomSnapshot,
    // InMemoryRoomRepository, GameService.CloneGameStateForMutation) used
    // to DROP this map, so the designated card was silently lost the moment
    // the state was cloned — the bot degraded to draw-only and the turn
    // never advanced. These tests pin the behaviour so the map can't be
    // dropped again.
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public void CloneGameState_CopiesOneCardBotCardMap()
    {
        var source = BuildRoom().GameState!;
        source.OneCardBotCardMap = new Dictionary<string, string> { ["m3"] = "attack" };

        var clone = RoomSnapshot.CloneGameState(source)!;

        Assert.NotNull(clone.OneCardBotCardMap);
        Assert.Equal("attack", clone.OneCardBotCardMap["m3"]);
    }

    [Fact]
    public void CloneGameState_OneCardBotCardMapIsNotShared()
    {
        var source = BuildRoom().GameState!;
        source.OneCardBotCardMap = new Dictionary<string, string> { ["m3"] = "attack" };

        var clone = RoomSnapshot.CloneGameState(source)!;
        clone.OneCardBotCardMap!["m3"] = "skip";
        clone.OneCardBotCardMap["m4"] = "bomb";

        Assert.Equal("attack", source.OneCardBotCardMap["m3"]);
        Assert.False(source.OneCardBotCardMap.ContainsKey("m4"));
    }

    [Fact]
    public void CloneGameState_OneCardBotCardMapHandlesNullSource()
    {
        var source = BuildRoom().GameState!;
        source.OneCardBotCardMap = null!;

        var clone = RoomSnapshot.CloneGameState(source)!;

        Assert.NotNull(clone.OneCardBotCardMap);
        Assert.Empty(clone.OneCardBotCardMap);
    }

    [Fact]
    public void CloneGameState_HandlesEmptyCollections()
    {
        var source = new GameState();

        var clone = RoomSnapshot.CloneGameState(source)!;

        Assert.NotNull(clone.Deck);
        Assert.NotNull(clone.Hands);
        Assert.NotNull(clone.Alive);
        Assert.NotNull(clone.DiscardPile);
    }
}
