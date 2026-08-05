namespace Arcana.Domain.Entities;

// State captured while a Favor card is between phase 1 (target chosen) and
// phase 2 (target picks which card to give). Lives on GameState (not on
// PendingAction) because the Nope window can have already closed by the time
// this is set — we keep it across the player pick phase so a reconnecting
// client can re-open the modal.
//
// Per the user-confirmed spec: the FAVOR TARGET (not the actor) selects
// which of their own cards to give to the actor. Candidates is the target's
// own hand at the moment the Favor resolved, server-shuffled so the actor
// (and everyone watching the live modal in the target's seat) can't predict
// what card will be chosen.
public class PendingFavorPick
{
    public string TargetMemberId { get; set; } = string.Empty;
    // Server-side shuffled list of the target's hand at the moment Favor
    // resolved. The TARGET picks one card to hand over to the actor.
    public List<string> ShuffledCandidates { get; set; } = new();
    // Whose Favor card is in flight. Used by the controller to scope the
    // picker modal response to the right viewer.
    public string InitiatorId { get; set; } = string.Empty;
}