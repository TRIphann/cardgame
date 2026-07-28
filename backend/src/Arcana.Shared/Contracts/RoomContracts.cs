namespace Arcana.Shared.Contracts;

public record CreateRoomRequest(string HostName);

public record JoinRoomRequest(string Code, string PlayerName);

public record KickMemberRequest(string HostId, string TargetMemberId);

public record SetReadyRequest(string MemberId, bool IsReady);

public record HeartbeatRequest(string MemberId);

public record RoomMemberDto(string Id, string Name, bool IsHost, bool IsReady, bool IsOnline, DateTime JoinedAt, DateTime LastSeenAt);

public record RoomDto(
    string Id,
    string Code,
    string HostId,
    string HostName,
    string Status,
    int MaxPlayers,
    int CurrentPlayers,
    DateTime CreatedAt,
    IReadOnlyList<RoomMemberDto> Members);

public record CreateRoomResponse(RoomDto Room);

public record JoinRoomResponse(RoomDto Room);

public record KickMemberResponse(RoomDto Room);

public record SetReadyResponse(RoomMemberDto Member);

public record HeartbeatResponse(string MemberId, bool IsOnline);

public record ErrorResponse(string Code, string Message);
