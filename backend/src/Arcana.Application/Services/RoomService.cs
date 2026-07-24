using Arcana.Domain.Common;
using Arcana.Domain.Entities;
using Arcana.Domain.Enums;
using Arcana.Domain.Repositories;

namespace Arcana.Application.Services;

public class RoomService : Abstractions.IRoomService
{
    private const int MaxPlayers = 8;
    private const int MaxCodeAttempts = 12;

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
        var room = new Room
        {
            Id = Guid.NewGuid().ToString("N"),
            Code = await GenerateUniqueCodeAsync(ct),
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

        if (room.Status != RoomStatus.Waiting)
            throw new DomainException("room_closed", "Phòng đã bắt đầu hoặc đã đóng.");

        if (room.Members.Count >= room.MaxPlayers)
            throw new DomainException("room_full", "Phòng đã đủ 8 người chơi.");

        var member = new RoomMember
        {
            Id = Guid.NewGuid().ToString("N"),
            Name = playerName.Trim(),
            IsHost = false,
            IsReady = false,
            JoinedAt = DateTime.UtcNow,
        };

        await _repository.AddMemberAsync(room.Id, member, ct);

        room.Members.Add(member);
        return room;
    }

    public async Task<Room?> GetRoomAsync(string id, CancellationToken ct = default)
    {
        return await _repository.GetByIdAsync(id, ct);
    }

    private async Task<string> GenerateUniqueCodeAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < MaxCodeAttempts; attempt++)
        {
            var code = _codeGenerator.Generate();
            if (!await _repository.CodeExistsAsync(code, ct))
                return code;
        }
        throw new DomainException("code_exhausted", "Không thể tạo mã phòng duy nhất, vui lòng thử lại.");
    }
}
