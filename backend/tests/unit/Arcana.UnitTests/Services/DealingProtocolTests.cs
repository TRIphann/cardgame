using Arcana.Application.Abstractions;
using Arcana.Application.Game;
using Arcana.Application.Services;
using Arcana.Domain.Entities;
using Arcana.Domain.Enums;
using Arcana.Infrastructure;
using Arcana.Infrastructure.Repositories;

namespace Arcana.UnitTests.Services;

/// <summary>
/// Regression tests for the "no bomb is ever dealt into a player's hand"
/// invariant of the dealing protocol.
///
/// The documented contract (see the comment block in
/// <c>GameService.StartGameAsync</c>) is:
///
///   "Result (normal): every player starts with exactly one defuse, NO bombs
///    dealt, exactly 1 player can dodge every bomb and win."
///
/// A bomb sitting in a hand is a dead card the player can never use, and it
/// silently removes a bomb from the deck — which breaks the "exactly one
/// player can dodge every bomb" guarantee the whole design rests on.
/// </summary>
public class DealingProtocolTests
{
    private readonly InMemoryRoomRepository _repo = new();
    private readonly FakeBroadcaster _broadcaster = new();
    private readonly InMemoryTurnClockRegistry _turnClock = new();
    private readonly InMemoryNopeWindowRegistry _nopeWindow = new();
    private readonly FuturePeekRegistry _futurePeek = new();

    private GameService CreateService() =>
        new(_repo, _repo, _broadcaster, _turnClock, _nopeWindow, _futurePeek);

    private async Task SeedRoomAsync(int playerCount)
    {
        var room = new Room
        {
            Id = "room-1",
            Code = "ABC234",
            HostId = "m1",
            HostName = "Alice",
            Status = RoomStatus.Waiting,
            MaxPlayers = 7,
        };

        for (var i = 1; i <= playerCount; i++)
        {
            room.Members.Add(new RoomMember
            {
                Id = $"m{i}",
                Name = $"Player{i}",
                IsHost = i == 1,
                IsReady = i == 1,
            });
        }

        await _repo.CreateAsync(room);
    }

    [Theory]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    [InlineData(7)]
    public async Task StartGame_NeverDealsABombIntoAPlayersHand(int playerCount)
    {
        await SeedRoomAsync(playerCount);
        var service = CreateService();

        // Run several times: the dealing order is shuffled, so a single run
        // could get lucky and leave every bomb in the deck.
        for (var attempt = 0; attempt < 12; attempt++)
        {
            await SeedRoomAsync(playerCount);
            var room = await service.StartGameAsync("room-1", "m1", disableBotService: true);

            foreach (var hand in room.GameState!.Hands.Values)
            {
                Assert.DoesNotContain(CardCatalog.Bomb, hand);
            }
        }
    }

    [Fact]
    public async Task StartGame_KeepsEveryBombInTheDeck()
    {
        await SeedRoomAsync(5);
        var service = CreateService();

        var room = await service.StartGameAsync("room-1", "m1", disableBotService: true);

        var gs = room.GameState!;
        var bombsInHands = gs.Hands.Values.Sum(h => h.Count(c => c == CardCatalog.Bomb));
        var bombsInDeck = gs.Deck.Count(c => c == CardCatalog.Bomb);

        // 5 players -> N - 1 = 4 bombs, all of which must still be in the deck.
        Assert.Equal(0, bombsInHands);
        Assert.Equal(4, bombsInDeck);
    }

    [Fact]
    public async Task StartGame_GivesEveryPlayerExactlyOneDefuseAndFourOtherCards()
    {
        await SeedRoomAsync(4);
        var service = CreateService();

        var room = await service.StartGameAsync("room-1", "m1", disableBotService: true);

        var gs = room.GameState!;
        Assert.Equal(4, gs.Hands.Count);
        foreach (var hand in gs.Hands.Values)
        {
            Assert.Equal(5, hand.Count);
            Assert.Equal(1, hand.Count(c => c == CardCatalog.Defuse));
        }
    }

    [Fact]
    public async Task StartGame_ConservesTheTotalCardCount()
    {
        await SeedRoomAsync(5);
        var service = CreateService();

        var room = await service.StartGameAsync("room-1", "m1", disableBotService: true);

        var gs = room.GameState!;
        var inHands = gs.Hands.Values.Sum(h => h.Count);
        var total = inHands + gs.Deck.Count;

        // 5 players -> 40 cards total. Each player holds 1 defuse + 4 action
        // cards = 5 cards, so 25 are in hands and 15 stay in the deck.
        Assert.Equal(40, total);
        Assert.Equal(25, inHands);
        Assert.Equal(15, gs.Deck.Count);
    }

    [Fact]
    public async Task StartGame_WithACustomDeck_AndDealCards_KeepsTheBombsInTheDeck()
    {
        await SeedRoomAsync(3);
        var service = CreateService();

        var customDeck = new List<string>
        {
            CardCatalog.Bomb, "attack", CardCatalog.Bomb,
            "skip", "favor", "future", "nope",
        };

        var room = await service.StartGameAsync(
            "room-1", "m1",
            customDeck: customDeck,
            dealCards: true,
            disableBotService: true);

        var gs = room.GameState!;
        var bombsInHands = gs.Hands.Values.Sum(h => h.Count(c => c == CardCatalog.Bomb));
        var bombsInDeck = gs.Deck.Count(c => c == CardCatalog.Bomb);

        // The 2 custom bombs must not be dealt into any hand.
        Assert.Equal(0, bombsInHands);
        Assert.True(bombsInDeck >= 2, $"expected the custom bombs to survive, found {bombsInDeck} in the deck");
    }

    [Fact]
    public async Task StartGame_WithACustomDeck_AndNoDealing_PinsTheExactDeckOrder()
    {
        await SeedRoomAsync(3);
        var service = CreateService();

        var customDeck = new List<string> { "attack", CardCatalog.Bomb, "skip" };

        var room = await service.StartGameAsync(
            "room-1", "m1",
            customDeck: customDeck,
            dealCards: false,
            disableBotService: true);

        var gs = room.GameState!;
        // Slot 1 of the deck builder maps to the END of the stored list,
        // because DrawCardAsync draws from gs.Deck[^1].
        Assert.Equal(new[] { "skip", CardCatalog.Bomb, "attack" }, gs.Deck);
    }
}
