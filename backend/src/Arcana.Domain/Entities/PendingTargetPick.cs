namespace Arcana.Domain.Entities;

// Which phase of a multi-step card action is currently waiting on the
// player. Used by the PendingTargetPick state so the server knows what to
// do when the 10s picker timeout fires.
public enum TargetPickKind
{
    None = 0,
    // Favor phase 1 — the actor must choose WHO to ask for a card.
    FavorTarget = 1,
    // Combo 2-same — the actor must choose whose card to take.
    ComboTarget = 2,
}

// State captured while a card action is waiting for the actor to choose a
// target player. Lives on GameState (not on PendingAction) because this
// phase has NOT yet opened a Nope window — the action isn't committed
// until the target is chosen.
//
// The server arms a 10s timeout on this state (the same unified picker
// budget as every other picker in the game) so a player who walks away
// from the tab can't stall the whole room. On expiry the server
// auto-cancels the action: the card is spent, the turn advances, and
// nobody is asked to hand over a card.
public class PendingTargetPick
{
    // Which kind of picker this is — decides what the timeout does.
    public TargetPickKind Kind { get; set; } = TargetPickKind.None;

    // The card key that was played to open this picker ("favor", "ninja",
    // "superman", ...). Used to spend the right card on auto-cancel.
    public string CardKey { get; set; } = string.Empty;

    // The member who played the card and is waiting to pick a target.
    public string InitiatorId { get; set; } = string.Empty;

    // The eligible targets (member ids) at the moment the picker opened.
    // Used to auto-pick a random target on expiry and to validate the
    // client's choice.
    public List<string> CandidateMemberIds { get; set; } = new();

    // Timestamp when this picker became pending. The background sweeper
    // checks this and auto-cancels the action after the picker timeout.
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
