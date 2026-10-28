using Arcana.Application.Game;
using Arcana.Domain.Common;

namespace Arcana.UnitTests.Game;

/// <summary>
/// Unit tests for <see cref="CardCatalog"/> — the single source of truth for
/// deck composition and combo rules.
///
/// CardCatalog is fully static, so none of these tests need mocks, a database
/// or a running API. They cover the two rule areas that are easiest to break
/// with a refactor: deck composition per player count, and combo detection
/// precedence (5-any > 3-same > 2-same) including the mixed-type relaxation
/// that applies when fewer than 5 players are alive.
/// </summary>
public class CardCatalogTests
{
    // ─────────────────────────────────────────────────────────────────────
    // IsComboDefuse / IsActionCard
    // ─────────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("ninja")]
    [InlineData("superman")]
    [InlineData("zombie")]
    [InlineData("robot")]
    [InlineData("hải-tặc")]
    public void IsComboDefuse_ReturnsTrue_ForEveryComboVariant(string key)
    {
        Assert.True(CardCatalog.IsComboDefuse(key));
    }

    [Theory]
    [InlineData("bomb")]
    [InlineData("defuse")]
    [InlineData("attack")]
    [InlineData("skip")]
    [InlineData("favor")]
    [InlineData("future")]
    [InlineData("shuffle")]
    [InlineData("nope")]
    public void IsComboDefuse_ReturnsFalse_ForNonComboCards(string key)
    {
        Assert.False(CardCatalog.IsComboDefuse(key));
    }

    [Theory]
    [InlineData("bomb", false)]
    [InlineData("defuse", false)]
    [InlineData("attack", true)]
    [InlineData("skip", true)]
    [InlineData("favor", true)]
    [InlineData("future", true)]
    [InlineData("shuffle", true)]
    [InlineData("nope", true)]
    [InlineData("ninja", true)]
    public void IsActionCard_ExcludesBombAndDefuse_Only(string key, bool expected)
    {
        Assert.Equal(expected, CardCatalog.IsActionCard(key));
    }

    // ─────────────────────────────────────────────────────────────────────
    // GetActionCards / GetComboDefuseCards
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public void GetActionCards_FiltersOutBombAndDefuse_Only()
    {
        // "Action card" means "not bomb and not defuse" — the combo defuse
        // variants ARE included, because the bot uses this list to pick any
        // card it is allowed to play (a combo card is playable as a combo).
        var hand = new[] { "attack", "bomb", "ninja", "skip", "defuse", "nope" };

        var actions = CardCatalog.GetActionCards(hand).ToList();

        Assert.Equal(expectedActionCardSet, actions);
    }

    private static readonly string[] expectedActionCardSet = ["attack", "ninja", "skip", "nope"];

    private static readonly string[] expectedActionCards = ["ninja", "robot"];

    [Fact]
    public void GetComboDefuseCards_KeepsOnlyComboVariants()
    {
        var hand = new[] { "attack", "bomb", "ninja", "skip", "robot", "defuse" };

        var combos = CardCatalog.GetComboDefuseCards(hand).ToList();

        Assert.Equal(expectedActionCards, combos);
    }

    // ─────────────────────────────────────────────────────────────────────
    // BuildDeck — composition per player count
    // ─────────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(0, 2)]   // clamped up to the minimum
    [InlineData(1, 2)]
    [InlineData(2, 2)]
    [InlineData(9, 8)]   // clamped down to the maximum
    [InlineData(100, 8)]
    public void BuildDeck_ClampsPlayerCountIntoSupportedRange(int requested, int effective)
    {
        var deck = CardCatalog.BuildDeck(requested);

        Assert.Equal(CardCatalog.BuildDeck(effective).Count, deck.Count);
    }

    [Theory]
    [InlineData(2, 13)]
    [InlineData(3, 22)]
    [InlineData(4, 31)]
    [InlineData(5, 40)]
    [InlineData(6, 49)]
    [InlineData(7, 58)]
    [InlineData(8, 67)]
    public void BuildDeck_ProducesExpectedTotalCardCount(int playerCount, int expectedTotal)
    {
        var deck = CardCatalog.BuildDeck(playerCount);

        Assert.Equal(expectedTotal, deck.Count);
    }

    [Theory]
    [InlineData(2, 1)]   // bomb = N - 1
    [InlineData(3, 2)]
    [InlineData(5, 4)]
    [InlineData(8, 7)]
    public void BuildDeck_ContainsPlayerCountMinusOneBombs(int playerCount, int expectedBombs)
    {
        var deck = CardCatalog.BuildDeck(playerCount);

        Assert.Equal(expectedBombs, deck.Count(c => c == CardCatalog.Bomb));
    }

    [Theory]
    [InlineData(2, 2)]   // future = N
    [InlineData(3, 3)]
    [InlineData(5, 5)]
    [InlineData(8, 8)]
    public void BuildDeck_ContainsPlayerCountFutures(int playerCount, int expected)
    {
        var deck = CardCatalog.BuildDeck(playerCount);

        Assert.Equal(expected, deck.Count(c => c == CardCatalog.Future));
    }

    [Theory]
    [InlineData(2, 2)]   // nope = N
    [InlineData(3, 3)]
    [InlineData(5, 5)]
    [InlineData(8, 8)]
    public void BuildDeck_ContainsPlayerCountNopes(int playerCount, int expected)
    {
        var deck = CardCatalog.BuildDeck(playerCount);

        Assert.Equal(expected, deck.Count(c => c == CardCatalog.Nope));
    }

    [Theory]
    [InlineData(2, 3)]   // defuse = N + 1
    [InlineData(3, 4)]
    [InlineData(5, 6)]
    [InlineData(8, 9)]
    public void BuildDeck_ContainsPlayerCountPlusOneDefuses(int playerCount, int expected)
    {
        var deck = CardCatalog.BuildDeck(playerCount);

        Assert.Equal(expected, deck.Count(c => c == CardCatalog.Defuse));
    }

    [Theory]
    [InlineData(2, 1)]   // attack = N - 1
    [InlineData(5, 4)]
    [InlineData(8, 7)]
    public void BuildDeck_ContainsPlayerCountMinusOneAttacks(int playerCount, int expected)
    {
        var deck = CardCatalog.BuildDeck(playerCount);

        Assert.Equal(expected, deck.Count(c => c == CardCatalog.Attack));
    }

    [Theory]
    [InlineData(2, 1)]   // favor = N - 1
    [InlineData(5, 4)]
    [InlineData(8, 7)]
    public void BuildDeck_ContainsPlayerCountMinusOneFavors(int playerCount, int expected)
    {
        var deck = CardCatalog.BuildDeck(playerCount);

        Assert.Equal(expected, deck.Count(c => c == CardCatalog.Favor));
    }

    [Theory]
    [InlineData(2, 1)]   // skip = N - 1
    [InlineData(5, 4)]
    [InlineData(8, 7)]
    public void BuildDeck_ContainsPlayerCountMinusOneSkips(int playerCount, int expected)
    {
        var deck = CardCatalog.BuildDeck(playerCount);

        Assert.Equal(expected, deck.Count(c => c == CardCatalog.Skip));
    }

    [Theory]
    [InlineData(2, 1)]   // shuffle = N - 1
    [InlineData(5, 4)]
    [InlineData(8, 7)]
    public void BuildDeck_ContainsPlayerCountMinusOneShuffles(int playerCount, int expected)
    {
        var deck = CardCatalog.BuildDeck(playerCount);

        Assert.Equal(expected, deck.Count(c => c == CardCatalog.Shuffle));
    }

    [Theory]
    [InlineData(2, 1)]   // combo total = N - 1
    [InlineData(3, 2)]
    [InlineData(5, 4)]
    [InlineData(6, 5)]
    [InlineData(8, 7)]
    public void BuildDeck_ContainsPlayerCountMinusOneComboDefusesInTotal(int playerCount, int expected)
    {
        var deck = CardCatalog.BuildDeck(playerCount);

        var comboCount = deck.Count(CardCatalog.IsComboDefuse);
        Assert.Equal(expected, comboCount);
    }

    [Fact]
    public void BuildDeck_SplitsComboDefusesAcrossTheFiveVariants()
    {
        // 7 players -> 6 combo cards -> 1 extra beyond one per variant.
        var deck = CardCatalog.BuildDeck(7);

        var counts = CardCatalog.ComboDefuses.ToDictionary(
            v => v,
            v => deck.Count(c => c == v));

        // Every variant must appear at least once and the totals must add up.
        Assert.All(counts.Values, c => Assert.True(c >= 1, "each combo variant should appear at least once"));
        Assert.Equal(6, counts.Values.Sum());

        // The remainder goes to the FIRST variants in array order.
        Assert.Equal(2, counts["ninja"]);
        Assert.Equal(1, counts["superman"]);
    }

    [Fact]
    public void BuildDeck_ContainsOnlyKnownCardKeys()
    {
        var known = new HashSet<string>(CardCatalog.Names.Keys);

        var deck = CardCatalog.BuildDeck(8);

        Assert.All(deck, card => Assert.True(known.Contains(card), $"unexpected card key '{card}'"));
    }

    [Fact]
    public void BuildDeck_IsDeterministicInComposition_ButNotInOrder()
    {
        // Two calls must have identical multisets. Order is randomised later by
        // the game service, so we only assert on the sorted content.
        var a = CardCatalog.BuildDeck(5).OrderBy(c => c).ToList();
        var b = CardCatalog.BuildDeck(5).OrderBy(c => c).ToList();

        Assert.Equal(a, b);
    }

    // ─────────────────────────────────────────────────────────────────────
    // DetectCombo — precedence and the mixed-type relaxation
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public void DetectCombo_ReturnsNull_WhenHandHasNoComboCards()
    {
        var hand = new[] { "attack", "skip", "favor", "defuse", "bomb" };

        Assert.Null(CardCatalog.DetectCombo(hand));
    }

    [Fact]
    public void DetectCombo_ReturnsNull_ForEmptyHand()
    {
        Assert.Null(CardCatalog.DetectCombo([]));
    }

    [Fact]
    public void DetectCombo_ReturnsFiveAny_WhenFiveComboCardsArePresent()
    {
        var hand = new[] { "ninja", "superman", "zombie", "robot", "hải-tặc" };

        Assert.Equal(ComboKind.FiveAny, CardCatalog.DetectCombo(hand));
    }

    [Fact]
    public void DetectCombo_ReturnsFiveAny_ForFiveIdenticalComboCards()
    {
        var hand = new[] { "ninja", "ninja", "ninja", "ninja", "ninja" };

        Assert.Equal(ComboKind.FiveAny, CardCatalog.DetectCombo(hand));
    }

    [Fact]
    public void DetectCombo_FiveAnyTakesPrecedence_OverThreeSame()
    {
        // 3 ninja + 2 other combos -> 5 cards total -> 5-any wins.
        var hand = new[] { "ninja", "ninja", "ninja", "robot", "zombie" };

        Assert.Equal(ComboKind.FiveAny, CardCatalog.DetectCombo(hand, playerCount: 5));
    }

    [Fact]
    public void DetectCombo_ReturnsThreeSame_ForThreeIdenticalComboCards()
    {
        var hand = new[] { "ninja", "ninja", "ninja" };

        Assert.Equal(ComboKind.ThreeSame, CardCatalog.DetectCombo(hand, playerCount: 5));
    }

    [Fact]
    public void DetectCombo_ReturnsTwoSame_ForTwoIdenticalComboCards()
    {
        var hand = new[] { "ninja", "ninja" };

        Assert.Equal(ComboKind.TwoSame, CardCatalog.DetectCombo(hand, playerCount: 5));
    }

    [Fact]
    public void DetectCombo_AllowsMixedTypes_WhenFewerThanFivePlayers()
    {
        // With < 5 players the deck holds too few copies of any single variant,
        // so 2 MIXED combo cards are enough for a 2-same combo.
        var hand = new[] { "ninja", "robot" };

        Assert.Equal(ComboKind.TwoSame, CardCatalog.DetectCombo(hand, playerCount: 3));
    }

    [Fact]
    public void DetectCombo_AllowsMixedTypes_ForThreeSame_WhenFewerThanFivePlayers()
    {
        var hand = new[] { "ninja", "robot", "zombie" };

        Assert.Equal(ComboKind.ThreeSame, CardCatalog.DetectCombo(hand, playerCount: 4));
    }

    [Fact]
    public void DetectCombo_RequiresSameType_WhenFiveOrMorePlayers()
    {
        var hand = new[] { "ninja", "robot" };

        Assert.Null(CardCatalog.DetectCombo(hand, playerCount: 5));
    }

    [Fact]
    public void DetectCombo_RequiresSameType_ForThreeSame_WhenFiveOrMorePlayers()
    {
        var hand = new[] { "ninja", "robot", "zombie" };

        Assert.Null(CardCatalog.DetectCombo(hand, playerCount: 5));
    }

    [Fact]
    public void DetectCombo_IgnoresNonComboCards_WhenCounting()
    {
        // Only the 2 ninja count towards the combo — the action cards are noise.
        var hand = new[] { "ninja", "ninja", "attack", "skip", "favor", "defuse" };

        Assert.Equal(ComboKind.TwoSame, CardCatalog.DetectCombo(hand, playerCount: 5));
    }

    // ─────────────────────────────────────────────────────────────────────
    // ValidateHandCard
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public void ValidateHandCard_DoesNotThrow_WhenCardIsInHand()
    {
        var hand = new[] { "attack", "ninja" };

        var exception = Record.Exception(() => CardCatalog.ValidateHandCard(hand, "ninja"));

        Assert.Null(exception);
    }

    [Fact]
    public void ValidateHandCard_ThrowsDomainException_WhenCardIsNotInHand()
    {
        var hand = new[] { "attack" };

        var exception = Assert.Throws<DomainException>(
            () => CardCatalog.ValidateHandCard(hand, "bomb"));

        Assert.Equal("card_not_in_hand", exception.Code);
    }

    [Fact]
    public void ValidateHandCard_IsCaseSensitive()
    {
        var hand = new[] { "attack" };

        Assert.Throws<DomainException>(() => CardCatalog.ValidateHandCard(hand, "Attack"));
    }

    // ─────────────────────────────────────────────────────────────────────
    // RollDefuseVariant
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public void RollDefuseVariant_AlwaysReturnsAKnownComboVariant()
    {
        for (var i = 0; i < 200; i++)
        {
            var variant = CardCatalog.RollDefuseVariant();

            Assert.Contains(variant, CardCatalog.ComboDefuses);
        }
    }

    [Fact]
    public void RollDefuseVariant_CanProduceEveryComboVariant()
    {
        // 200 rolls across 5 variants — statistically certain to hit all of them.
        var seen = new HashSet<string>();
        for (var i = 0; i < 200; i++) seen.Add(CardCatalog.RollDefuseVariant());

        Assert.Equal(CardCatalog.ComboDefuses.Count, seen.Count);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Catalogue integrity
    // ─────────────────────────────────────────────────────────────────────

    [Fact]
    public void PublicCardKeys_ExcludesBombButIncludesDefuse()
    {
        Assert.DoesNotContain(CardCatalog.Bomb, CardCatalog.PublicCardKeys);
        Assert.Contains(CardCatalog.Defuse, CardCatalog.PublicCardKeys);
    }

    [Fact]
    public void PublicCardKeys_ContainsEveryComboVariant()
    {
        Assert.All(CardCatalog.ComboDefuses, v => Assert.Contains(v, CardCatalog.PublicCardKeys));
    }

    [Fact]
    public void Names_CoversEveryComboVariant()
    {
        Assert.All(CardCatalog.ComboDefuses, v => Assert.True(CardCatalog.Names.ContainsKey(v)));
    }

    [Fact]
    public void Names_HasADisplayNameForEveryPublicCardKey()
    {
        Assert.All(CardCatalog.PublicCardKeys, k => Assert.True(CardCatalog.Names.ContainsKey(k)));
    }

    [Fact]
    public void ComboDefuses_ContainsExactlyFiveVariants()
    {
        Assert.Equal(5, CardCatalog.ComboDefuses.Count);
    }
}
