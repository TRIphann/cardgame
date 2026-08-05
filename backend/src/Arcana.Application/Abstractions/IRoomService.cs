using Arcana.Application.Abstractions;
using Arcana.Application.Game;
using Arcana.Domain.Entities;

namespace Arcana.Application.Abstractions;

public interface IRoomService
{
    Task<Room> CreateRoomAsync(string hostName, CancellationToken ct = default);
    Task<Room> JoinRoomAsync(string code, string playerName, CancellationToken ct = default);
    Task<Room?> GetRoomAsync(string id, CancellationToken ct = default);
    Task<Room?> GetRoomWithPruneAsync(string id, CancellationToken ct = default);

    /// <summary>
    /// Host removes another member from the room. Returns the updated room,
    /// or throws a DomainException if the room is missing, the caller is not the host,
    /// or the target is the host themselves.
    /// </summary>
    Task<Room?> KickMemberAsync(string roomId, string hostId, string targetMemberId, CancellationToken ct = default);

    /// <summary>
    /// Toggle a non-host member's IsReady flag. Hosts cannot be marked not-ready.
    /// </summary>
    Task<RoomMember?> SetReadyAsync(string roomId, string memberId, bool isReady, CancellationToken ct = default);

    /// <summary>
    /// Refresh LastSeenAt / IsOnline for a member. Called by the heartbeat
    /// endpoint roughly every 8s from each tab.
    /// </summary>
    Task<RoomMember?> HeartbeatAsync(string roomId, string memberId, CancellationToken ct = default);
}

/// <summary>
/// Per-action return value: room state snapshot + a short-lived hint that
/// the frontend can use to play a transient animation (e.g. drew a bomb,
/// peeked top-3 cards, action was noped).
/// </summary>
public class GameActionResult
{
    public Room Room { get; set; } = null!;
    public string? Toast { get; set; }
    // Last drawn card (only set on DrawCard) so client can animate it.
    public string? DrawnCardKey { get; set; }
    // Set when the player must defuse (bomb drawn and they have one).
    public bool RequiresDefuse { get; set; }
    // Set when the player needs to pick a discard card (5-any combo).
    public bool RequiresDiscardPick { get; set; }
    // Set when the player needs to pick a target (2-same combo or Favor phase 1).
    public bool RequiresTargetPick { get; set; }
    // Set when the ACTOR needs to pick a card from the Favor target's hand.
    // (retained for combo-2 backward-compat — Favor now uses RequiresFavorTargetPick)
    public bool RequiresFavorPick { get; set; }
    // NEW: set when the Favor TARGET needs to pick which of their cards to give.
    // Read by the controller to surface "FavorTargetId" + "RequiresFavorTargetPick"
    // to the right client (only the target sees the picker).
    public bool RequiresFavorTargetPick { get; set; }
    public string? FavorTargetId { get; set; }
    // Cards the player can pick from (server-side shuffled target hand,
    // or target's hand when they're the picker for a Favor).
    public List<string>? FavorCandidates { get; set; }
    // Set when future card peeked top-3 deck cards (3 cards max).
    public List<string>? FuturePeek { get; set; }
    // Set when the player must draw more cards (Attack chain). The client
    // should auto-prompt for another draw rather than waiting for the
    // 60s turn timer.
    public bool RequiresMoreDraws { get; set; }
    // How many more draws are required when RequiresMoreDraws is true.
    public int RemainingDraws { get; set; }
}
