using Arcana.Application.Abstractions;
using Arcana.Application.Game;
using Arcana.Domain.Common;
using Arcana.Domain.Entities;
using Arcana.Domain.Enums;
using Arcana.Domain.Repositories;

namespace Arcana.Application.Services;

public class RoomService : Abstractions.IRoomService
{
    private const int MaxPlayers = 7;
    private const int MaxCodeAttempts = 16;
    private static readonly TimeSpan OfflineAfter = TimeSpan.FromSeconds(35);

    private readonly IRoomRepository _repository;
    private readonly Abstractions.IInvitationCodeGenerator _codeGenerator;
    private readonly GameService _gameService;

    public RoomService(
        IRoomRepository repository,
        Abstractions.IInvitationCodeGenerator codeGenerator,
        GameService gameService)
    {
        _repository = repository;
        _codeGenerator = codeGenerator;
        _gameService = gameService;
    }

    public async Task<Room> CreateRoomAsync(string hostName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(hostName))
            throw new DomainException("invalid_name", "Tên người chơi không được để trống.");

        var hostId = Guid.NewGuid().ToString("N");
        var roomId = Guid.NewGuid().ToString("N");

        var code = await ClaimUniqueCodeAsync(roomId, ct);

        var room = new Room
        {
            Id = roomId,
            Code = code,
            HostId = hostId,
            HostName = hostName.Trim(),
            Status = RoomStatus.Waiting,
            MaxPlayers = MaxPlayers,
            CreatedAt = DateTime.UtcNow,
        };

        room.Members.Add(new RoomMember
        {
            Id = hostId,
            Name = hostName.Trim(),
            IsHost = true,
            IsReady = false,
            JoinedAt = DateTime.UtcNow,
        });

        await _repository.CreateAsync(room, ct);
        return room;
    }

    public async Task<Room> JoinRoomAsync(string code, string playerName, CancellationToken ct = default)
    {
        if (!_codeGenerator.IsValid(code))
            throw new Abstractions.InvalidInvitationCodeException();

        if (string.IsNullOrWhiteSpace(playerName))
            throw new DomainException("invalid_name", "Tên người chơi không được để trống.");

        var room = await _repository.GetByCodeAsync(code.ToUpperInvariant(), ct)
            ?? throw new DomainException("invalid_code", "Mã phòng không tồn tại. Vui lòng kiểm tra lại mã.");

        var member = new RoomMember
        {
            Id = Guid.NewGuid().ToString("N"),
            Name = playerName.Trim(),
            IsHost = false,
            IsReady = false,
            JoinedAt = DateTime.UtcNow,
        };

        var updated = await _repository.TryJoinRoomAsync(room.Id, member, ct);
        if (updated is null)
            throw new DomainException("room_full", "Phòng đã đủ người chơi hoặc đã bắt đầu.");

        if (!updated.Members.Any(m => m.Id == member.Id))
            updated.Members.Add(member);
        return updated;
    }

    public async Task<Room?> GetRoomAsync(string id, CancellationToken ct = default)
    {
        return await _repository.GetByIdAsync(id, ct);
    }

    public async Task<Room?> KickMemberAsync(string roomId, string hostId, string targetMemberId, CancellationToken ct = default)
    {
        var room = await _repository.GetByIdAsync(roomId, ct)
            ?? throw new DomainException("room_not_found", "Phòng không tồn tại.");

        if (!string.Equals(room.HostId, hostId, StringComparison.Ordinal))
            throw new DomainException("not_host", "Chỉ chủ phòng mới có quyền đá thành viên.");

        if (string.Equals(room.HostId, targetMemberId, StringComparison.Ordinal))
            throw new DomainException("cannot_kick_host", "Không thể đá chủ phòng.");

        var updated = await _repository.RemoveMemberAsync(roomId, targetMemberId, ct);
        if (updated is null)
            throw new DomainException("member_not_found", "Thành viên không còn trong phòng.");

        return updated;
    }

    public async Task<RoomMember?> SetReadyAsync(string roomId, string memberId, bool isReady, CancellationToken ct = default)
    {
        var room = await _repository.GetByIdAsync(roomId, ct)
            ?? throw new DomainException("room_not_found", "Phòng không tồn tại.");

        var member = room.Members.FirstOrDefault(m => m.Id == memberId);
        if (member is null)
            throw new DomainException("member_not_found", "Bạn không còn trong phòng.");

        if (member.IsHost)
            throw new DomainException("not_host", "Chủ phòng không cần xác nhận sẵn sàng.");

        return await _repository.UpdateMemberFieldAsync(roomId, memberId, isReady, DateTime.UtcNow, ct);
    }

    public async Task<RoomMember?> HeartbeatAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        return await _repository.UpdateMemberFieldAsync(roomId, memberId, null, DateTime.UtcNow, ct);
    }

    public async Task<int> PruneStaleMembersAsync(string roomId, CancellationToken ct = default)
    {
        return await _repository.MarkStaleMembersOfflineAsync(roomId, OfflineAfter, ct);
    }

    public async Task<Room?> GetRoomWithPruneAsync(string roomId, CancellationToken ct = default)
    {
        await _repository.MarkStaleMembersOfflineAsync(roomId, OfflineAfter, ct);
        return await _repository.GetByIdAsync(roomId, ct);
    }

    // ── Game lifecycle (delegate to GameService) ──────────────────────

    public Task<Room> StartGameAsync(string roomId, string hostId, CancellationToken ct = default)
        => _gameService.StartGameAsync(roomId, hostId, ct);

    public Task<Room> RotateRoomAsync(string roomId, string hostId, CancellationToken ct = default)
        => _gameService.RotateRoomAsync(roomId, hostId, ct);

    // ── Game actions (delegate to GameService) ────────────────────────

    public Task<GameActionResult> PlayCardAsync(string roomId, string memberId, string cardKey, string? targetMemberId, ComboKind? comboKind, string? discardPickKey, CancellationToken ct = default)
        => _gameService.PlayCardAsync(roomId, memberId, cardKey, targetMemberId, comboKind, discardPickKey, ct);

    public Task<GameActionResult> DrawCardAsync(string roomId, string memberId, CancellationToken ct = default)
        => _gameService.DrawCardAsync(roomId, memberId, ct);

    public Task<GameActionResult> UseDefuseAsync(string roomId, string memberId, int slotIndex, CancellationToken ct = default)
        => _gameService.UseDefuseAsync(roomId, memberId, slotIndex, ct);

    public Task<GameActionResult> ChainNopeAsync(string roomId, string memberId, CancellationToken ct = default)
        => _gameService.ChainNopeAsync(roomId, memberId, ct);

    private async Task<string> ClaimUniqueCodeAsync(string roomId, CancellationToken ct)
    {
        for (var attempt = 0; attempt < MaxCodeAttempts; attempt++)
        {
            var code = _codeGenerator.Generate();
            if (await _repository.TryReserveCodeAsync(code, roomId, ct))
                return code;
        }
        throw new DomainException("code_exhausted", "Không thể tạo mã phòng duy nhất, vui lòng thử lại.");
    }
}
