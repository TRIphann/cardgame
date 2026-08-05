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
    IReadOnlyList<string>? FuturePeek = null);

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
    bool RequiresFavorPick,
    IReadOnlyList<string>? FavorCandidates,
    IReadOnlyList<string>? FuturePeek,
    bool RequiresMoreDraws = false,
    int RemainingDraws = 0);

public record ErrorResponse(string Code, string Message);
