namespace Arcana.Shared.Contracts;

public record CreateRoomRequest(string HostName);

public record JoinRoomRequest(string Code, string PlayerName);

public record RoomMemberDto(string Id, string Name, bool IsHost, bool IsReady, DateTime JoinedAt);

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

public record ErrorResponse(string Code, string Message);
