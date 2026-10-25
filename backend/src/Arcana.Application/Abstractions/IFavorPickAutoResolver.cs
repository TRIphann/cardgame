using Arcana.Domain.Entities;

namespace Arcana.Application.Abstractions;

/// <summary>
/// Background sweeper that auto-picks a random card from the favor target's
/// hand if the target hasn't chosen within <c>PickTimeoutSeconds</c> after the
/// Favor card resolved. Keeps the game from stalling when a target walks away
/// from the tab, hides the picker, or just doesn't engage.
///
/// The resolve is delegated to <c>GameService.CompleteFavorPickAsync</c> with
/// <c>autoPicked: true</c>, which throws graceful errors (target hand gone,
/// only bomb left) instead of failing the poll loop.
/// </summary>
public interface IFavorPickAutoResolver
{
    TimeSpan PickTimeoutSeconds { get; }

    /// <summary>
    /// Returns the rooms that have a pending Favor pick older than
    /// <see cref="PickTimeoutSeconds"/>. Called by the background sweeper.
    /// </summary>
    IReadOnlyList<string> FindExpiredFavorPicks();

    /// <summary>
    /// Resolves an expired Favor pick: auto-picks a random non-bomb card from
    /// the target's hand and awards it to the actor. Returns the updated room
    /// (for the broadcaster) or null if the pick was already cleared.
    /// </summary>
    Task<Room?> ResolveAsync(string roomId, CancellationToken ct = default);
}
