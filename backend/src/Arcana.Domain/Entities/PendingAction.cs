namespace Arcana.Domain.Entities;

public class PendingAction
{
    public string InitiatorId { get; set; } = string.Empty;
    public string CardKey { get; set; } = string.Empty;
    public string? DiscardPickKey { get; set; }
    // The set of memberIds who have noped so far. Even count = cancelled, odd = proceeds.
    public List<string> NopeChain { get; set; } = [];
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    // BUG-NEW fix: when true, committing/cancelling this action does NOT
    // advance the turn. Used for action cards whose effect doesn't end the
    // current player's turn (e.g. Future / "Xem trước" — peek only, the
    // player still has to draw or play another action card to end their
    // turn). Defaults to false (legacy Attack / Skip / Shuffle / Favor).
    public bool SkipTurnAdvance { get; set; } = false;
}
