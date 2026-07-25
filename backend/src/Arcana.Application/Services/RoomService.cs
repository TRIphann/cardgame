using Arcana.Domain.Common;
using Arcana.Domain.Entities;
using Arcana.Domain.Enums;
using Arcana.Domain.Repositories;

namespace Arcana.Application.Services;

public class RoomService : Abstractions.IRoomService
{
    private const int MaxPlayers = 8;
    // Code search space: 32^6 ≈ 1.07B. With 100k active rooms the collision probability
    // per attempt is ~9.3e-5. 16 attempts keeps the cumulative failure probability under 1.5e-3.
    private const int MaxCodeAttempts = 16;

    private readonly IRoomRepository _repository;
    private readonly Abstractions.IInvitationCodeGenerator _codeGenerator;

    public RoomService(IRoomRepository repository, Abstractions.IInvitationCodeGenerator codeGenerator)
    {
        _repository = repository;
        _codeGenerator = codeGenerator;
    }

    public async Task<Room> CreateRoomAsync(string hostName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(hostName))
            throw new DomainException("invalid_name", "Tên người chơi không được để trống.");

        var hostId = Guid.NewGuid().ToString("N");
        var roomId = Guid.NewGuid().ToString("N");

        // Atomically claim a unique invitation code. If two requests generate the same
        // string at the same time, exactly one of them wins the Create on
        // room_codes/{code}; the loser retries with a fresh code.
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
            ?? throw new DomainException("room_not_found", "Không tìm thấy phòng với mã này.");

        var member = new RoomMember
        {
            Id = Guid.NewGuid().ToString("N"),
            Name = playerName.Trim(),
            IsHost = false,
            IsReady = false,
            JoinedAt = DateTime.UtcNow,
        };

        // Atomic capacity check + add. If 9 requests race when one slot is left, all but
        // one get null back and surface a room_full error.
        var updated = await _repository.TryJoinRoomAsync(room.Id, member, ct);
        if (updated is null)
            throw new DomainException("room_full", "Phòng đã đủ người chơi hoặc đã bắt đầu.");

        // Surface the added member inside the returned DTO.
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
