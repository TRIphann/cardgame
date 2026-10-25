using Arcana.Application.Abstractions;
using Arcana.Application.Game;
using Arcana.Application.Services;
using Arcana.Domain.Common;
using Arcana.Domain.Entities;
using Arcana.Domain.Enums;
using Arcana.Infrastructure;
using Arcana.Infrastructure.Repositories;

namespace Arcana.UnitTests.Services;

/// <summary>
/// Unit tests for <see cref="GameService"/> — the orchestrator that owns the
/// card rules, the turn rotation and the win condition.
///
/// The service is exercised through its public API against the REAL
/// <see cref="InMemoryRoomRepository"/> (which deep-clones on read/write,
/// giving us the same isolation the production cache provides) and no-op
/// fakes for the three registries plus the broadcaster. That keeps the tests
/// fast and deterministic while still covering the real code paths.
/// </summary>
public class GameServiceTests
{
    private readonly InMemoryRoomRepository _repo = new();
    private readonly FakeBroadcaster _broadcaster = new();
    private readonly InMemoryTurnClockRegistry _turnClock = new();
    private readonly InMemoryNopeWindowRegistry _nopeWindow = new();
    private readonly FuturePeekRegistry _futurePeek = new();

    private GameService CreateService() =>
        new(_repo, _repo, _broadcaster, _turnClock, _nopeWindow, _futurePeek);

    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────

    private async Task<Room> SeedRoomAsync(
        int playerCount = 3,
        string status = "waiting",
        int maxPlayers = 7)
    {
        var room = new Room
        {
            Id = "room-1",
            Code = "ABC234",
            HostId = "m1",
            HostName = "Alice",
            Status = status == "waiting" ? RoomStatus.Waiting : RoomStatus.Playing,
            MaxPlayers = maxPlayers,
        };

        for (var i = 1; i <= playerCount; i++)
        {
            room.Members.Add(new RoomMember
            {
                Id = $"m{i}",
                Name = $"Player{i}",
                IsHost = i == 1,
                IsReady = i == 1,
                IsBot = false,
            });
        }

        await _repo.CreateAsync(room);
        return room;
    }

    // ─────────────────────────────────────────────────────────────────────
    // StartGameAsync — validation
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task StartGameAsync_Throws_WhenRoomDoesNotExist()
    {
        var service = CreateService();

        var ex = await Assert.ThrowsAsync<DomainException>(
            () => service.StartGameAsync("missing", "m1"));

        Assert.Equal("room_not_found", ex.Code);
    }

    [Fact]
    public async Task StartGameAsync_Throws_WhenCallerIsNotTheHost()
    {
        await SeedRoomAsync();
        var service = CreateService();

        var ex = await Assert.ThrowsAsync<DomainException>(
            () => service.StartGameAsync("room-1", "m2"));

        Assert.Equal("not_host", ex.Code);
    }

    [Fact]
    public async Task StartGameAsync_Throws_WhenTheGameAlreadyStarted()
    {
        await SeedRoomAsync(status: "playing");
        var service = CreateService();

        var ex = await Assert.ThrowsAsync<DomainException>(
            () => service.StartGameAsync("room-1", "m1"));

        Assert.Equal("game_already_started", ex.Code);
    }

    [Fact]
    public async Task StartGameAsync_Throws_WhenThereAreFewerThanThreePlayers()
    {
        await SeedRoomAsync(playerCount: 2);
        var service = CreateService();

        var ex = await Assert.ThrowsAsync<DomainException>(
            () => service.StartGameAsync("room-1", "m1"));

        Assert.Equal("cannot_start", ex.Code);
    }

    // ─────────────────────────────────────────────────────────────────────
    // StartGameAsync — dealing protocol
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task StartGameAsync_DealsOneDefuseAndFourCardsToEachPlayer()
    {
        await SeedRoomAsync(playerCount: 4);
        var service = CreateService();

        var room = await service.StartGameAsync("room-1", "m1", disableBotService: true);

        var gs = room.GameState!;
        Assert.Equal(4, gs.Hands.Count);
        foreach (var hand in gs.Hands.Values)
        {
            Assert.Equal(5, hand.Count);
            Assert.Equal(1, hand.Count(c => c == CardCatalog.Defuse));
            // No bomb is ever dealt into a hand.
            Assert.DoesNotContain(CardCatalog.Bomb, hand);
        }
    }

    [Fact]
    public async Task StartGameAsync_LeavesHandsEmpty_WhenDealCardsIsFalse()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();

        var room = await service.StartGameAsync("room-1", "m1", dealCards: false, disableBotService: true);

        Assert.All(room.GameState!.Hands.Values, h => Assert.Empty(h));
    }

    [Fact]
    public async Task StartGameAsync_KeepsBombsInTheDeck_WhenDealCardsIsFalse()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();

        // Test-lobby "custom deck" mode: the tester placed the bombs on purpose.
        var customDeck = new List<string> { "attack", CardCatalog.Bomb, "skip", CardCatalog.Bomb, "favor" };
        var room = await service.StartGameAsync(
            "room-1", "m1",
            customDeck: customDeck,
            dealCards: false,
            disableBotService: true);

        var gs = room.GameState!;
        Assert.Equal(2, gs.Deck.Count(c => c == CardCatalog.Bomb));
        Assert.All(gs.Hands.Values, h => Assert.Empty(h));
    }

    [Fact]
    public async Task StartGameAsync_ResetsLeftoverStateFromAPreviousRound()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();

        var room = await service.StartGameAsync("room-1", "m1", disableBotService: true);

        var gs = room.GameState!;
        Assert.Empty(gs.AfkMemberIds);
        Assert.False(gs.BombRevealActive);
        Assert.False(gs.ClientReady);
        Assert.Null(gs.PendingAction);
        Assert.Null(gs.PendingFavorPick);
        Assert.Null(gs.FuturePeek);
        Assert.Null(gs.LastDrawnBy);
        Assert.Null(gs.LastPlayedCardKey);
    }

    [Fact]
    public async Task StartGameAsync_SetsTheRoomStatusToPlaying()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();

        var room = await service.StartGameAsync("room-1", "m1", disableBotService: true);

        Assert.Equal(RoomStatus.Playing, room.Status);
    }

    [Fact]
    public async Task StartGameAsync_AssignsAFirstPlayer()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();

        var room = await service.StartGameAsync("room-1", "m1", disableBotService: true);

        Assert.False(string.IsNullOrEmpty(room.GameState!.CurrentTurnMemberId));
        Assert.Contains(room.GameState.CurrentTurnMemberId, room.GameState.Hands.Keys);
    }

    [Fact]
    public async Task StartGameAsync_HonoursTheRequestedFirstPlayer()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();

        var room = await service.StartGameAsync(
            "room-1", "m1", firstPlayerId: "m2", disableBotService: true);

        Assert.Equal("m2", room.GameState!.CurrentTurnMemberId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // PlayCardAsync — validation
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task PlayCardAsync_Throws_WhenTheCardIsNotInHand()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync("room-1", "m1", dealCards: false, disableBotService: true);

        // Play on the player's own turn so the turn check passes and the
        // hand check is the one that trips.
        var playerId = room.GameState!.CurrentTurnMemberId;
        var gs = room.GameState;
        gs.Hands[playerId] = new List<string>();
        await _repo.UpdateGameStateAsync("room-1", gs, null);

        var ex = await Assert.ThrowsAsync<DomainException>(
            () => service.PlayCardAsync("room-1", playerId, "attack", null, null, null));

        Assert.Equal("card_not_in_hand", ex.Code);
    }

    [Fact]
    public async Task PlayCardAsync_Throws_WhenItIsNotThePlayersTurn()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync(
            "room-1", "m1", firstPlayerId: "m1", disableBotService: true);

        var other = room.GameState!.Hands.Keys.First(k => k != "m1");
        var gs = room.GameState;
        gs.Hands[other] = new List<string> { "attack" };
        await _repo.UpdateGameStateAsync("room-1", gs, null);

        var ex = await Assert.ThrowsAsync<DomainException>(
            () => service.PlayCardAsync("room-1", other, "attack", null, null, null));

        Assert.Equal("not_your_turn", ex.Code);
    }

    // ─────────────────────────────────────────────────────────────────────
    // DrawCardAsync
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task DrawCardAsync_AddsTheDrawnCardToTheHand()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync(
            "room-1", "m1", dealCards: false, disableBotService: true);

        var playerId = room.GameState!.CurrentTurnMemberId;

        // Give the current player a known deck and an empty hand.
        var gs = (await _repo.GetByIdAsync("room-1"))!.GameState!;
        gs.Deck = new List<string> { "attack", "skip", "favor" };
        gs.Hands[playerId] = new List<string>();
        await _repo.UpdateGameStateAsync("room-1", gs, null);

        var result = await service.DrawCardAsync("room-1", playerId);

        Assert.False(result.RequiresDefuse);
        Assert.NotNull(result.DrawnCardKey);
        // The top of the deck is the LAST element (DrawCardAsync takes Deck[^1]).
        Assert.Equal("favor", result.DrawnCardKey);
        // Assert against the returned room — the service mutates its own clone.
        Assert.Contains("favor", result.Room.GameState!.Hands[playerId]);
    }

    [Fact]
    public async Task DrawCardAsync_RequiresADefuse_WhenTheDrawnCardIsABomb()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync(
            "room-1", "m1", dealCards: false, disableBotService: true);

        var playerId = room.GameState!.CurrentTurnMemberId;
        var gs = (await _repo.GetByIdAsync("room-1"))!.GameState!;
        gs.Deck = new List<string> { CardCatalog.Bomb };
        // The player holds a defuse, so the bomb must be defused rather than fatal.
        gs.Hands[playerId] = new List<string> { CardCatalog.Defuse };
        await _repo.UpdateGameStateAsync("room-1", gs, null);

        var result = await service.DrawCardAsync("room-1", playerId);

        Assert.True(result.RequiresDefuse);
        Assert.Equal(CardCatalog.Bomb, result.DrawnCardKey);
    }

    [Fact]
    public async Task DrawCardAsync_KillsThePlayer_WhenTheDrawnCardIsABombAndTheyHaveNoDefuse()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync(
            "room-1", "m1", dealCards: false, disableBotService: true);

        var playerId = room.GameState!.CurrentTurnMemberId;
        var gs = (await _repo.GetByIdAsync("room-1"))!.GameState!;
        gs.Deck = new List<string> { CardCatalog.Bomb };
        gs.Hands[playerId] = new List<string>();
        await _repo.UpdateGameStateAsync("room-1", gs, null);

        var result = await service.DrawCardAsync("room-1", playerId);

        Assert.False(result.RequiresDefuse);
        Assert.False(result.Room.GameState!.Alive[playerId]);
        Assert.Contains(playerId, result.Room.GameState.DiedAt.Keys);
    }

    [Fact]
    public async Task DrawCardAsync_Throws_WhenTheDeckIsEmpty()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync(
            "room-1", "m1", dealCards: false, disableBotService: true);

        var playerId = room.GameState!.CurrentTurnMemberId;
        var gs = (await _repo.GetByIdAsync("room-1"))!.GameState!;
        gs.Deck = new List<string>();
        gs.Hands[playerId] = new List<string>();
        await _repo.UpdateGameStateAsync("room-1", gs, null);

        var ex = await Assert.ThrowsAsync<DomainException>(
            () => service.DrawCardAsync("room-1", playerId));

        Assert.Equal("deck_empty", ex.Code);
    }

    // ─────────────────────────────────────────────────────────────────────
    // ConcedeAsync — win condition
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task ConcedeAsync_MarksThePlayerAsDead()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync(
            "room-1", "m1", dealCards: false, disableBotService: true);

        var gs = room.GameState!;
        var playerId = gs.CurrentTurnMemberId;
        gs.Hands[playerId] = new List<string>();
        gs.Alive[playerId] = true;
        await _repo.UpdateGameStateAsync("room-1", gs, null);

        await service.ConcedeAsync("room-1", playerId);

        var after = (await _repo.GetByIdAsync("room-1"))!.GameState!;
        Assert.False(after.Alive[playerId]);
        Assert.True(after.DiedAt.ContainsKey(playerId));
    }

    [Fact]
    public async Task ConcedeAsync_CrownsTheLastSurvivorAsWinner()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync(
            "room-1", "m1", dealCards: false, disableBotService: true);

        var gs = room.GameState!;
        gs.Alive = new Dictionary<string, bool> { ["m1"] = true, ["m2"] = true, ["m3"] = true };
        await _repo.UpdateGameStateAsync("room-1", gs, null);

        // m2 and m3 concede, leaving m1 alone.
        await service.ConcedeAsync("room-1", "m2");
        await service.ConcedeAsync("room-1", "m3");

        var after = (await _repo.GetByIdAsync("room-1"))!.GameState!;
        Assert.Equal("m1", after.WinnerId);
        Assert.NotNull(after.EndedAt);
    }

    [Fact]
    public async Task ConcedeAsync_HasNoWinner_WhenTheLastSurvivorConcedes()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync(
            "room-1", "m1", dealCards: false, disableBotService: true);

        // Set up the state directly: only m1 is left standing. The win
        // condition has not run yet, so the game is still "Playing" and the
        // last survivor can still concede. That is exactly the scenario the
        // "everyone is dead -> no winner" branch in CheckWinCondition covers:
        // the player would otherwise be crowned as the winner even though they
        // gave up.
        var gs = room.GameState!;
        gs.Alive = new Dictionary<string, bool> { ["m1"] = true, ["m2"] = false, ["m3"] = false };
        await _repo.UpdateGameStateAsync("room-1", gs, null);

        await service.ConcedeAsync("room-1", "m1");

        var after = (await _repo.GetByIdAsync("room-1"))!.GameState!;
        Assert.Null(after.WinnerId);
        Assert.NotNull(after.EndedAt);
        Assert.False(after.Alive["m1"]);
    }

    [Fact]
    public async Task ConcedeAsync_Throws_WhenThePlayerIsAlreadyDead()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync(
            "room-1", "m1", dealCards: false, disableBotService: true);

        var gs = room.GameState!;
        gs.Alive["m2"] = false;
        await _repo.UpdateGameStateAsync("room-1", gs, null);

        var ex = await Assert.ThrowsAsync<DomainException>(
            () => service.ConcedeAsync("room-1", "m2"));

        Assert.Equal("already_dead", ex.Code);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Nope window
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task PlayCardAsync_OpensTheNopeWindow_ForAnActionCard()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync(
            "room-1", "m1", dealCards: false, disableBotService: true);

        var gs = room.GameState!;
        var playerId = gs.CurrentTurnMemberId;
        gs.Hands[playerId] = new List<string> { "skip" };
        await _repo.UpdateGameStateAsync("room-1", gs, null);

        await service.PlayCardAsync("room-1", playerId, "skip", null, null, null);

        var after = (await _repo.GetByIdAsync("room-1"))!.GameState!;
        Assert.NotNull(after.PendingAction);
        Assert.Equal("skip", after.PendingAction!.CardKey);
        Assert.Equal(playerId, after.PendingAction.InitiatorId);
    }

    [Fact]
    public async Task PlayCardAsync_RejectsADirectNopePlay()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync(
            "room-1", "m1", dealCards: false, disableBotService: true);

        var gs = room.GameState!;
        var playerId = gs.CurrentTurnMemberId;
        gs.Hands[playerId] = new List<string> { "nope" };
        await _repo.UpdateGameStateAsync("room-1", gs, null);

        var ex = await Assert.ThrowsAsync<DomainException>(
            () => service.PlayCardAsync("room-1", playerId, "nope", null, null, null));

        Assert.Equal("nope_direct_use", ex.Code);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Turn clock registry integration
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task StartGameAsync_DoesNotArmTheTurnClock_BeforeTheClientIsReady()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();

        await service.StartGameAsync("room-1", "m1", disableBotService: true);

        // The clock is only armed once the UI reports it is ready, otherwise
        // the 10s window would burn down during the lobby -> game navigation.
        Assert.Empty(_turnClock.Snapshot());
    }

    [Fact]
    public async Task MarkClientReadyAsync_ArmsTheTurnClock()
    {
        await SeedRoomAsync(playerCount: 3);
        var service = CreateService();
        var room = await service.StartGameAsync("room-1", "m1", disableBotService: true);

        await service.MarkClientReadyAsync("room-1", room.GameState!.CurrentTurnMemberId);

        Assert.Single(_turnClock.Snapshot());
    }
}

/// <summary>
/// No-op <see cref="IGameBroadcaster"/> — the unit tests never assert on
/// broadcast payloads, they only need the calls to succeed.
/// </summary>
internal sealed class FakeBroadcaster : IGameBroadcaster
{
    public Task BroadcastRoomUpdatedAsync(string roomId, object payload, CancellationToken ct = default)
        => Task.CompletedTask;

    public Task BroadcastRoomSnapshotAsync(string roomId, object roomSnapshot, CancellationToken ct = default)
        => Task.CompletedTask;

    public Task BroadcastRoomToastAsync(
        string roomId, string text, IEnumerable<string>? excludeMemberIds = null, CancellationToken ct = default)
        => Task.CompletedTask;
}
