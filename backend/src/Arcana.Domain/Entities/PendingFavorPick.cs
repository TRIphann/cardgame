namespace Arcana.Domain.Entities;

// State captured while a Favor card is waiting for the actor to pick which
// card to take from the target's hand. Lives on GameState (not PendingAction)
// because the Nope window can be closed by the time this is set — we keep it
// across the player pick phase so a reconnecting client can re-open the modal.
public class PendingFavorPick
{
    public string TargetMemberId { get; set; } = string.Empty;
    // Server-side shuffled list of the target's hand at the moment Favor
    // was played. The actor picks from this list.
    public List<string> ShuffledCandidates { get; set; } = new();
}