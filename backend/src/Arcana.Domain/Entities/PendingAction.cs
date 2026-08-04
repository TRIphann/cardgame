namespace Arcana.Domain.Entities;

public class PendingAction
{
    public string InitiatorId { get; set; } = string.Empty;
    public string CardKey { get; set; } = string.Empty;
    public string? DiscardPickKey { get; set; }
    // The set of memberIds who have noped so far. Even count = cancelled, odd = proceeds.
    public List<string> NopeChain { get; set; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
