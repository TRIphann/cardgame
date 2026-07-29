namespace Arcana.Domain.Entities;

public class GameState
{
    public List<string> Deck { get; set; } = new();
    public List<string> DiscardPile { get; set; } = new();
    // Per-member hand (the local viewer sees only their own hand; others are hidden).
    public Dictionary<string, List<string>> Hands { get; set; } = new();
    // Whose turn it is right now.
    public string CurrentTurnMemberId { get; set; } = string.Empty;
    // Attack: counter that says "the current player has to take N more turns"
    public int AttackCounter { get; set; } = 0;
    // Player stats for the summary screen.
    public Dictionary<string, int> TurnsTaken { get; set; } = new();
    public Dictionary<string, int> CardsPlayed { get; set; } = new();
    // Alive flags — dead members' hands get folded into the discard pile.
    public Dictionary<string, bool> Alive { get; set; } = new();
    // When did each player die (UTC). Null = still alive.
    public Dictionary<string, DateTime?> DiedAt { get; set; } = new();
    public DateTime? StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public string? WinnerId { get; set; }
    // While this is set, the active action is "pending nope" and other players
    // have a 3s window to chain nopes.
    public PendingAction? PendingAction { get; set; }

    // ── Turn timer ────────────────────────────────────────────
    // When the current player's turn started (UTC). Reset on every turn
    // advance. If null, the game hasn't started or the game has ended.
    // Players get TurnTimeLimitSec to act; if they don't, the server
    // background service auto-draws on their behalf (treated as a normal
    // draw that advances the turn).
    public DateTime? TurnStartedAt { get; set; }

    // ── Cinematic broadcast fields ─────────────────────────────────
    // Set by DrawCardAsync so every viewer can show the bomb-reveal
    // animation in sync. Cleared a few seconds later by the broadcaster
    // (or by the next state mutation).
    public string? LastDrawnBy { get; set; }
    public string? LastDrawnCardKey { get; set; }
    public DateTime? LastDrawnAt { get; set; }
    // True while the bomb-reveal overlay is showing (drawn bomb, not yet
    // exploded or defused). Drives a 3s cinematic for everyone in the room.
    public bool BombRevealActive { get; set; } = false;

    // ── Action-card cinematic fields ────────────────────────
    // Most recent action / nope card that should appear centre-screen for
    // everyone. Reset each time someone chains a Nope. Cleared when the
    // action resolves (window expires or chain even).
    public string? LastPlayedCardKey { get; set; }
    public string? LastPlayedBy { get; set; }
    public DateTime? LastPlayedAt { get; set; }
    public string? LastPlayedByNope { get; set; } // memberId who most recently played Nope (if last entry is Nope)
}
