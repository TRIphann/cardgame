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
    /// Build the full set of cards BEFORE dealing and BEFORE inserting bombs.
    /// Card counts for N players (per the user-confirmed spec):
    ///   Bombs       = N - 1   (the last survivor dodges all)
    ///   Future      = N       ("Xem 1 tí")
    ///   Defuse      = N + 1   (one deal for each player on deal start, plus
    ///                          1 leftover that can be dealt to anyone in the
    ///                          random 4-card deals — gives the deck a defuse
    ///                          in circulation so a player who used their cứu
    ///                          can pick up a new one)
    ///   Combo total = N - 1   (split evenly across the 5 types — any combo
    ///                          card can substitute for any other when N < 5)
    ///   Attack      = N - 1
    ///   Favor       = N - 1
    ///   Skip        = N - 1
    ///   Shuffle     = N - 1
    ///   Nope        = N
    /// </summary>
    public static List<string> BuildDeck(int playerCount)
    {
        if (playerCount < 2) playerCount = 2;
        if (playerCount > 8) playerCount = 8;

        var deck = new List<string>();

        // Bombs separated out — they're inserted AFTER the rest is shuffled
        // and dealt. BuildDeck returns the deck without bombs; StartGame
        // takes bombs from here and stashes them aside.
        var bombCount = playerCount - 1;
        for (var i = 0; i < bombCount; i++) deck.Add(Bomb);

        // N copies each for these "common" action cards.
        AddCopies(deck, Future, playerCount);
        AddCopies(deck, Nope, playerCount);

        // N + 1 defuse-class cards (N dealt to players first, 1 leftover lands
        // inside the 4-card deals).
        AddCopies(deck, Defuse, playerCount + 1);

        // N - 1 copies each for the "consumable" action cards.
        AddCopies(deck, Attack, playerCount - 1);
        AddCopies(deck, Favor, playerCount - 1);
        AddCopies(deck, Shuffle, playerCount - 1);
        AddCopies(deck, Skip, playerCount - 1);

        // Combo defuse variants: N - 1 total distributed across the 5 types.
        // For small N (e.g. N=3 → 2 cards total), each combo variant gets
        // ⌊(N-1)/5⌋ copies with the remainder distributed to the first
        // types in the array. Players with < 5 types in the deck can still
        // build combos by stacking DIFFERENT combo variants (rule is "any
        // N combo cards" until a single type has enough to make a same-type
        // combo in larger games).
        var comboCopies = playerCount - 1;
        var comboPerType = comboCopies / ComboDefuses.Count;
        var comboRemainder = comboCopies % ComboDefuses.Count;
        for (var i = 0; i < ComboDefuses.Count; i++)
        {
            var count = comboPerType + (i < comboRemainder ? 1 : 0);
            AddCopies(deck, ComboDefuses[i], count);
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
    /// Combo precedence: 5-of-any > 3-of-any-mix > 2-of-any-mix.
    ///
    /// Per the user-confirmed spec: when playerCount is < 5 the player base
    /// may not have 5 distinct combo types in circulation, so 2-same and
    /// 3-same combos accept MIXED combo types (any 2 / any 3 combo cards
    /// from the 5-variant pool, no requirement that they be identical).
    /// This keeps combos playable in 3-4 player games where the deck only
    /// contains ⌊(N-1)/5⌋ copies of any single variant.
    /// </summary>
    public static ComboKind? DetectCombo(IReadOnlyList<string> hand, int playerCount = 5)
    {
        var comboCount = hand.Count(IsComboDefuse);
        // 5-any is always "any 5 combo cards" regardless of player count.
        if (comboCount >= 5) return ComboKind.FiveAny;
        // 3-same: if N >= 5, require same-type; if N < 5, allow mixed types.
        if (comboCount >= 3 && playerCount < 5) return ComboKind.ThreeSame;
        foreach (var v in ComboDefuses)
        {
            if (hand.Count(c => c == v) >= 3) return ComboKind.ThreeSame;
        }
        // 2-same: same rule as above.
        if (comboCount >= 2 && playerCount < 5) return ComboKind.TwoSame;
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
