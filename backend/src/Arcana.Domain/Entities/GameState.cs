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
}
