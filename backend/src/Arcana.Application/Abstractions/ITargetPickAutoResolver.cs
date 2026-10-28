using Arcana.Domain.Entities;

namespace Arcana.Application.Abstractions;

/// <summary>
/// Background sweeper that auto-cancels a pending TARGET picker (Favor
/// phase 1 — "choose who to ask") when the actor hasn't picked a target
/// within the unified 10s picker budget.
///
/// Why this exists separately from <see cref="IFavorPickAutoResolver"/>:
/// that resolver handles Favor PHASE 2 (the target picks WHICH card to
/// hand over). This one handles PHASE 1 (the actor picks WHO to ask).
/// Without it, an actor who walks away after playing a Favor stalls the
/// whole room — the turn never advances and nobody is ever asked for a card.
///
/// The resolve is delegated to
/// <c>GameService.AutoCancelPendingTargetPickAsync</c>, which spends the
/// Favor card, advances the turn and clears the pending state.
/// </summary>
public interface ITargetPickAutoResolver
{
    TimeSpan PickTimeoutSeconds { get; }

    /// <summary>
    /// Returns the rooms that have a pending target picker older than
    /// <see cref="PickTimeoutSeconds"/>. Called by the background sweeper.
    /// </summary>
    IReadOnlyList<string> FindExpiredTargetPicks();

    /// <summary>
    /// Auto-cancels an expired target picker. Returns the updated room (for
    /// the broadcaster) or null if the picker was already cleared.
    /// </summary>
    Task<Room?> ResolveAsync(string roomId, CancellationToken ct = default);
}
