using Arcana.Domain.Common;

namespace Arcana.Application.Game;

// Card catalogue + deck composition for the Exploding Kittens variant.
//
// Two card groups:
//   - Action cards: shuffled into the draw pile and dealt to players.
//   - Defuse variants (the 5 "combo" defuses): dealt directly to each player
//     at start (one per player, random type). They are NEVER in the deck.
//     Players can stack 2/3/5 of any combination to trigger the combo rule.
//
// Combo rules (Exploding Kittens standard):
//   - 2 same defuse-variant: steal 1 random card from a target.
//     Target's hand is shown to the actor face-down; actor picks 1;
//     remaining cards go back to the target unchanged.
//   - 3 same defuse-variant: name a specific card; if target has it they
//     must give it; otherwise nothing happens.
//   - 5 of any defuse variants (any mix): pick 1 card from the discard pile.
//     Empty discard pile = no-op.
public static class CardCatalog
{
    public const string Bomb = "bomb";
    public const string Defuse = "defuse";
    public const string Attack = "attack";
    public const string Skip = "skip";
    public const string Favor = "favor";
    public const string Future = "future";
    public const string Shuffle = "shuffle";
    public const string Nope = "nope";

    public static readonly IReadOnlyList<string> ComboDefuses = new[]
    {
        "ninja", "superman", "zombie", "robot", "hải-tặc"
    };

    public static readonly IReadOnlyDictionary<string, string> Names = new Dictionary<string, string>
    {
        [Bomb] = "Bom",
        [Defuse] = "Cứu",
        [Attack] = "Tấn công",
        [Skip] = "Bỏ lượt",
        [Favor] = "Xin",
        [Future] = "Xem trước",
        [Shuffle] = "Xáo bài",
        [Nope] = "Cản",
        ["ninja"] = "Ninja",
        ["superman"] = "Siêu nhân",
        ["zombie"] = "Xác sống",
        ["robot"] = "Robot",
        ["hải-tặc"] = "Hải tặc",
    };

    public static bool IsComboDefuse(string key) => ComboDefuses.Contains(key);

    /// <summary>
    /// Cards exposed to the player for "name any card" combos (3-same).
    /// Excludes bomb + back (back is not a real card; bomb is hidden from
    /// the public catalogue since nobody "wants" it).
    /// </summary>
    public static readonly IReadOnlyList<string> PublicCardKeys = new[]
    {
        Attack, Skip, Favor, Future, Shuffle, Nope,
        "ninja", "superman", "zombie", "robot", "hải-tặc",
        Defuse,
    };

    /// <summary>
    /// Build the deck (Fisher-Yates shuffled) for the given player count.
    ///
    /// Card counts per player count (Exploding Kittens variant):
    ///   4 players: 3 bombs (winner is the 1 player who avoids all 3)
    ///   5 players: 4 bombs (winner is the 1 player who avoids all 4)
    ///   N players: N-1 bombs (guarantees at least 1 survivor)
    ///
    /// For N players the composition is:
    ///   Bombs        = N - 1
    ///   Attack      = N
    ///   Future      = N
    ///   Defuse      = N + 1  (1 per player at start + 1 leftover in deck)
    ///   Shuffle     = N - 1
    ///   Skip        = N - 1
    ///   Favor       = N
    ///   Nope        = N - 1
    ///   Combo defuse variants: each = N - 1 (split evenly across 5 types if needed)
    /// </summary>
    public static List<string> BuildDeck(int playerCount)
    {
        if (playerCount < 2) playerCount = 2;
        if (playerCount > 8) playerCount = 8;

        var rng = Random.Shared;
        var deck = new List<string>();

        // Bombs: N - 1 so the last player CAN win if they dodge all.
        var bombCount = playerCount - 1;
        for (var i = 0; i < bombCount; i++) deck.Add(Bomb);

        // Core action cards: exactly N copies each.
        AddCopies(deck, Attack, playerCount);
        AddCopies(deck, Favor, playerCount);
        AddCopies(deck, Future, playerCount);

        // Defuse: N + 1 (1 per player for starting hands + 1 extra in deck).
        AddCopies(deck, Defuse, playerCount + 1);

        // Cards that appear N - 1 times.
        AddCopies(deck, Shuffle, playerCount - 1);
        AddCopies(deck, Skip, playerCount - 1);
        AddCopies(deck, Nope, playerCount - 1);

        // Combo defuse variants (5 types): N - 1 total copies distributed evenly.
        // These are the cards players USE in combos (2/3/5 same).
        var comboCopies = playerCount - 1;
        var comboPerType = comboCopies / ComboDefuses.Count;
        var comboRemainder = comboCopies % ComboDefuses.Count;
        for (var i = 0; i < ComboDefuses.Count; i++)
        {
            var count = comboPerType + (i < comboRemainder ? 1 : 0);
            AddCopies(deck, ComboDefuses[i], count);
        }

        // Fisher-Yates shuffle.
        for (var i = deck.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1);
            (deck[i], deck[j]) = (deck[j], deck[i]);
        }
        return deck;
    }

    private static void AddCopies(List<string> deck, string key, int count)
    {
        for (var i = 0; i < count; i++) deck.Add(key);
    }

    /// <summary>
    /// Roll a random defuse-variant for a player's starting hand.
    /// </summary>
    public static string RollDefuseVariant()
    {
        var i = Random.Shared.Next(ComboDefuses.Count);
        return ComboDefuses[i];
    }

    /// <summary>
    /// Detect the highest combo the actor can play from their hand.
    /// Returns null if no combo is possible.
    /// Combo precedence: 5-of-any > 3-same > 2-same.
    /// </summary>
    public static ComboKind? DetectCombo(IReadOnlyList<string> hand)
    {
        var comboCount = hand.Count(IsComboDefuse);
        if (comboCount >= 5) return ComboKind.FiveAny;
        // Check for 3 same
        foreach (var v in ComboDefuses)
        {
            if (hand.Count(c => c == v) >= 3) return ComboKind.ThreeSame;
        }
        // Check for 2 same
        foreach (var v in ComboDefuses)
        {
            if (hand.Count(c => c == v) >= 2) return ComboKind.TwoSame;
        }
        return null;
    }

    public static void ValidateHandCard(IReadOnlyList<string> hand, string cardKey)
    {
        if (!hand.Contains(cardKey))
            throw new DomainException("card_not_in_hand", "Bạn không có lá bài này trên tay.");
    }
}

public enum ComboKind { TwoSame, ThreeSame, FiveAny }
