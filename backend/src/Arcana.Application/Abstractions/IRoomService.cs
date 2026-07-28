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

    /// <summary>
    /// Mark members who haven't sent a heartbeat inside the offline window
    /// as IsOnline=false. Returns the number of members touched.
    /// </summary>
    Task<int> PruneStaleMembersAsync(string roomId, CancellationToken ct = default);

    // ── Game lifecycle ────────────────────────────────────────────────
    Task<Room> StartGameAsync(string roomId, string hostId, CancellationToken ct = default);
    Task<Room> RotateRoomAsync(string roomId, string hostId, CancellationToken ct = default);

    // ── Game actions (player-driven) ─────────────────────────────────
    Task<GameActionResult> PlayCardAsync(string roomId, string memberId, string cardKey, string? targetMemberId, ComboKind? comboKind, string? discardPickKey, CancellationToken ct = default);
    Task<GameActionResult> DrawCardAsync(string roomId, string memberId, CancellationToken ct = default);
    Task<GameActionResult> UseDefuseAsync(string roomId, string memberId, int slotIndex, CancellationToken ct = default);
    Task<GameActionResult> ChainNopeAsync(string roomId, string memberId, CancellationToken ct = default);
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
    // Set when the player needs to pick a target (2-same combo or Favor).
    public bool RequiresTargetPick { get; set; }
    // Set when future card peeked top-3 deck cards (3 cards max).
    public List<string>? FuturePeek { get; set; }
    // Card played this turn (for active-card display).
    public string? PlayedCardKey { get; set; }
    // Combo variant used this turn (if any).
    public ComboKind? ComboKind { get; set; }
}
