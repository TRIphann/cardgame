using Arcana.Domain.Entities;
using Arcana.Domain.Enums;
using Arcana.Domain.Repositories;
using Google.Cloud.Firestore;

namespace Arcana.Infrastructure.Repositories;

public class FirestoreRoomRepository : IRoomRepository
{
    private const string RoomsCollection = "rooms";

    private readonly FirestoreDb _db;

    public FirestoreRoomRepository(FirestoreDb db)
    {
        _db = db;
    }

    public async Task<Room?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        var snapshot = await _db.Collection(RoomsCollection).Document(id).GetSnapshotAsync(ct);
        return snapshot.Exists ? MapRoom(snapshot) : null;
    }

    public async Task<Room?> GetByCodeAsync(string code, CancellationToken ct = default)
    {
        var query = _db.Collection(RoomsCollection).WhereEqualTo("code", code).Limit(1);
        var snapshot = await query.GetSnapshotAsync(ct);
        return snapshot.Documents.Count > 0 ? MapRoom(snapshot.Documents[0]) : null;
    }

    public async Task<bool> CodeExistsAsync(string code, CancellationToken ct = default)
    {
        var query = _db.Collection(RoomsCollection).WhereEqualTo("code", code).Limit(1);
        var snapshot = await query.GetSnapshotAsync(ct);
        return snapshot.Documents.Count > 0;
    }

    public async Task CreateAsync(Room room, CancellationToken ct = default)
    {
        var docRef = _db.Collection(RoomsCollection).Document(room.Id);
        var membersRef = docRef.Collection("members");

        var batch = _db.StartBatch();
        batch.Set(docRef, BuildRoomDoc(room));

        foreach (var member in room.Members)
        {
            batch.Set(membersRef.Document(member.Id), BuildMemberDoc(member));
        }

        await batch.CommitAsync(ct);
    }

    public async Task AddMemberAsync(string roomId, RoomMember member, CancellationToken ct = default)
    {
        var docRef = _db.Collection(RoomsCollection).Document(roomId).Collection("members").Document(member.Id);
        await docRef.SetAsync(BuildMemberDoc(member), cancellationToken: ct);
    }

    public async Task UpdateMemberAsync(string roomId, RoomMember member, CancellationToken ct = default)
    {
        var docRef = _db.Collection(RoomsCollection).Document(roomId).Collection("members").Document(member.Id);
        await docRef.SetAsync(BuildMemberDoc(member), SetOptions.Overwrite, cancellationToken: ct);
    }

    private static Dictionary<string, object> BuildRoomDoc(Room room) => new()
    {
        ["code"] = room.Code,
        ["hostId"] = room.HostId,
        ["hostName"] = room.HostName,
        ["status"] = room.Status.ToString().ToLowerInvariant(),
        ["maxPlayers"] = room.MaxPlayers,
        ["createdAt"] = Timestamp.FromDateTime(room.CreatedAt.ToUniversalTime()),
    };

    private static Dictionary<string, object> BuildMemberDoc(RoomMember member) => new()
    {
        ["name"] = member.Name,
        ["isHost"] = member.IsHost,
        ["isReady"] = member.IsReady,
        ["joinedAt"] = Timestamp.FromDateTime(member.JoinedAt.ToUniversalTime()),
    };

    private static Room MapRoom(DocumentSnapshot snapshot)
    {
        var data = snapshot.ToDictionary();
        var room = new Room
        {
            Id = snapshot.Id,
            Code = data.TryGetValue("code", out var c) ? c as string ?? string.Empty : string.Empty,
            HostId = data.TryGetValue("hostId", out var h) ? h as string ?? string.Empty : string.Empty,
            HostName = data.TryGetValue("hostName", out var hn) ? hn as string ?? string.Empty : string.Empty,
            Status = Enum.TryParse<RoomStatus>(data.TryGetValue("status", out var s) ? s as string : null, true, out var rs) ? rs : RoomStatus.Waiting,
            MaxPlayers = data.TryGetValue("maxPlayers", out var mp) && mp is long mpL ? (int)mpL : 8,
            CreatedAt = data.TryGetValue("createdAt", out var ca) && ca is Timestamp ts ? ts.ToDateTime().ToUniversalTime() : DateTime.UtcNow,
            Members = new List<RoomMember>(),
        };

        var membersSnapshot = snapshot.Reference.Collection("members").GetSnapshotAsync().GetAwaiter().GetResult();
        foreach (var memberDoc in membersSnapshot.Documents)
        {
            var md = memberDoc.ToDictionary();
            room.Members.Add(new RoomMember
            {
                Id = memberDoc.Id,
                Name = md.TryGetValue("name", out var n) ? n as string ?? string.Empty : string.Empty,
                IsHost = md.TryGetValue("isHost", out var ih) && ih is bool ihb && ihb,
                IsReady = md.TryGetValue("isReady", out var ir) && ir is bool irb && irb,
                JoinedAt = md.TryGetValue("joinedAt", out var ja) && ja is Timestamp jts ? jts.ToDateTime().ToUniversalTime() : DateTime.UtcNow,
            });
        }
        return room;
    }
}
