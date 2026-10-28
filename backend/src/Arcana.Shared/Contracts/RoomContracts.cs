namespace Arcana.Shared.Contracts;

public record CreateRoomRequest(string HostName);

public record JoinRoomRequest(string Code, string PlayerName);

public record KickMemberRequest(string HostId, string TargetMemberId);

public record SetReadyRequest(string MemberId, bool IsReady);

public record HeartbeatRequest(string MemberId);

public record StartGameRequest(string HostId);

public record RotateRoomRequest(string HostId);

public record PlayCardRequest(string MemberId, string CardKey, string? TargetMemberId, string? ComboKind, string? DiscardPickKey);

public record DrawCardRequest(string MemberId);

public record DefuseRequest(string MemberId, int SlotIndex);

public record NopeRequest(string MemberId);

public record CancelPendingRequest(string MemberId, string CardKey, string ComboKind);

public record RoomMemberDto(string Id, string Name, bool IsHost, bool IsReady, bool IsOnline, DateTime JoinedAt, DateTime LastSeenAt);

// NOTE: DeckCount intentionally excluded from the public DTO — no player should
// know how many cards remain. Clients derive nothing from deck size.
public record GameStateDto(
    int DiscardCount,
    Dictionary<string, int> HandCounts,
    Dictionary<string, int> TurnsTaken,
    Dictionary<string, int> CardsPlayed,
    Dictionary<string, bool> Alive,
    Dictionary<string, string?> DiedAt,
    string CurrentTurnMemberId,
    int AttackCounter,
    string? WinnerId,
    string? StartedAt,
    string? EndedAt,
    PendingActionDto? PendingAction,
    // Cinematic broadcast fields — see GameState. Null when not relevant.
    string? LastDrawnBy = null,
    string? LastDrawnCardKey = null,
    string? LastDrawnAt = null,
    bool BombRevealActive = false,
    // Action-card / nope cinematic fields
    string? LastPlayedCardKey = null,
    string? LastPlayedBy = null,
    string? LastPlayedAt = null,
    string? LastPlayedByNope = null,
    // Turn timer — when the current player's turn started (UTC ISO-8601)
    // and how many seconds they have until the server auto-draws.
    // Window is unified at 10s for every lobby (mirrors
    // GameService.TurnTimeLimitSeconds). Reset back to 10 on every
    // committed action.
    string? TurnStartedAt = null,
    int TurnTimeLimitSec = 60,
    // F-1 fix: remaining seconds on the current turn clock. Used by the
    // FuturePeekModal to decide whether to show a confirm dialog when
    // the player closes the peek early (confirm required if > 20s remain).
    int TurnRemainingSec = 60,
    // Frozen turn order for the current game. Index 0 = first player.
    IReadOnlyList<string>? TurnOrder = null,
    // Persisted FuturePeek — survives SignalR snapshot re-fetch so the modal
    // can re-render correctly when players reconnect.
    IReadOnlyList<string>? FuturePeek = null,
    // Favor-pick pending state — surfaces which player must pick the card
    // they want to give, and the shuffled candidate list.
    PendingFavorPickDto? PendingFavorPick = null,
    // Target-pick pending state (Favor phase 1 — "choose who to ask").
    // Exposed so the client can render the player picker and so the
    // 10s auto-cancel timeout is observable from the outside.
    PendingTargetPickDto? PendingTargetPick = null,
    // AFK auto-play: list of memberIds the server has marked as AFK (their
    // first 10s turn timed out). Exposed so the client can render the
    // "Bạn có đang chơi không?" modal and surface a "X đã quay lại" toast
    // when the player explicitly returns. Without this the modal never
    // knows who to show it to.
    IReadOnlyList<string>? AfkMemberIds = null,
    // Client-ready gate: true once at least one human has called /ready
    // for this room. The turn clock only ticks when this is true — that
    // way the player has a full 60s window the moment the game UI renders,
    // instead of opening the tab to find they're already AFK.
    bool ClientReady = false,
    // Bot turn override: seconds a bot takes to act. 0 = instant action on
    // the bot's turn (default). Capped at GameService.TurnTimeLimitSeconds
    // (10s) so a slow bot can never outlive the player it shares a room with.
    int BotTurnSeconds = 0,
// Local hand: exposed only to the viewing member via GameState so the
// client always has a top-level `room.myHand` regardless of which DTO
// layer carries it. Eliminates stale-hand-closure bugs in card validation.
    IReadOnlyList<string>? MyHand = null);

public record PendingFavorPickDto(
    string TargetMemberId,
    string InitiatorId,
    IReadOnlyList<string> ShuffledCandidates);

public record PendingTargetPickDto(
    string Kind,
    string CardKey,
    string InitiatorId,
    IReadOnlyList<string> CandidateMemberIds,
    string CreatedAt);

public record PendingActionDto(string InitiatorId, string CardKey, IReadOnlyList<string> NopeChain, string CreatedAt);

public record RoomDto(
    string Id,
    string Code,
    string HostId,
    string HostName,
    string Status,
    int MaxPlayers,
    int CurrentPlayers,
    DateTime CreatedAt,
    IReadOnlyList<RoomMemberDto> Members,
    GameStateDto? GameState,
    // Localized: only the requesting member's hand is exposed.
    IReadOnlyList<string>? MyHand);

public record GameActionResponse(
    RoomDto Room,
    string? Toast,
    string? DrawnCardKey,
    bool RequiresDefuse,
    bool RequiresDiscardPick,
    bool RequiresTargetPick,
    /// <summary>
    /// True after the actor played Favor and chose a target; the target now
    /// needs to pick which of their cards to give (per the user-confirmed
    /// spec: the target picks, not the actor).
    /// </summary>
    bool RequiresFavorTargetPick,
    /// <summary>
    /// The target player who must pick which card to give. Null when no
    /// target-pick is pending.
    /// </summary>
    string? FavorTargetId,
    IReadOnlyList<string>? FavorCandidates,
    IReadOnlyList<string>? FuturePeek,
    bool RequiresMoreDraws = false,
    int RemainingDraws = 0,
    /// <summary>
    /// True when the ACTOR must pick a card from the target's shuffled hand
    /// (Combo 2-same). The front-end reads this to open the card picker.
    /// Without it the Combo 2 flow can never complete — the server returned
    /// the candidate list but the client had no way of knowing it had to
    /// show a picker.
    /// </summary>
    bool RequiresFavorPick = false);

public record ErrorResponse(string Code, string Message);
