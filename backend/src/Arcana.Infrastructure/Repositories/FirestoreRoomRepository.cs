using Arcana.Domain.Entities;
using Arcana.Domain.Enums;
using Arcana.Domain.Repositories;
using Google.Cloud.Firestore;

namespace Arcana.Infrastructure.Repositories;

public class FirestoreRoomRepository : IRoomRepository
{
    private const string RoomsCollection = "rooms";
    // Reservation collection: doc ID = invitation code, value = roomId it points to.
    // Atomic Create() on this document is the synchronization primitive — Firestore guarantees
    // that exactly one concurrent create succeeds; we use that to claim a code without a race.
    private const string CodesCollection = "room_codes";

    private readonly FirestoreDb _db;

    public FirestoreRoomRepository(FirestoreDb db)
    {
        _db = db;
    }

    public async Task<Room?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        var snapshot = await _db.Collection(RoomsCollection).Document(id).GetSnapshotAsync(ct);
        return snapshot.Exists ? await MapRoomAsync(snapshot, ct) : null;
    }

    public async Task<Room?> GetByCodeAsync(string code, CancellationToken ct = default)
    {
        var reserved = await _db.Collection(CodesCollection).Document(code).GetSnapshotAsync(ct);
        if (!reserved.Exists) return null;
        var roomId = reserved.GetValue<string>("roomId");
        return await GetByIdAsync(roomId, ct);
    }

    public async Task<bool> CodeExistsAsync(string code, CancellationToken ct = default)
    {
        var snapshot = await _db.Collection(CodesCollection).Document(code).GetSnapshotAsync(ct);
        return snapshot.Exists;
    }

    public async Task<bool> TryReserveCodeAsync(string code, string roomId, CancellationToken ct = default)
    {
        var docRef = _db.Collection(CodesCollection).Document(code);
        // Create() on a DocumentReference adds a precondition that the doc must not exist.
        // When another writer has already claimed the same code, Firestore raises
        // RpcException(AlreadyExists). We treat that as a taken-slot and return false;
        // the caller retries with a fresh code.
        try
        {
            await docRef.CreateAsync(new Dictionary<string, object>
            {
                ["roomId"] = roomId,
                ["createdAt"] = Timestamp.GetCurrentTimestamp(),
            }, cancellationToken: ct);
            return true;
        }
        catch (Grpc.Core.RpcException ex) when (ex.Status.StatusCode == Grpc.Core.StatusCode.AlreadyExists)
        {
            return false;
        }
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

    public async Task<Room?> TryJoinRoomAsync(string roomId, RoomMember candidate, CancellationToken ct = default)
    {
        var roomRef = _db.Collection(RoomsCollection).Document(roomId);
        var memberRef = roomRef.Collection("members").Document(candidate.Id);

        return await _db.RunTransactionAsync(async tx =>
        {
            var snapshot = await tx.GetSnapshotAsync(roomRef);
            if (!snapshot.Exists) return null;

            var status = snapshot.GetValue<string>("status");
            if (!string.Equals(status, "waiting", StringComparison.OrdinalIgnoreCase))
                return null;

            var maxPlayers = snapshot.GetValue<int>("maxPlayers");
            var membersSnap = await tx.GetSnapshotAsync(roomRef.Collection("members"));
            if (membersSnap.Count >= maxPlayers) return null;

            tx.Set(memberRef, BuildMemberDoc(candidate));
            return await MapRoomAsync(snapshot, ct, membersSnapshot: membersSnap);
        });
    }

    public async Task<Room?> RemoveMemberAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        var roomRef = _db.Collection(RoomsCollection).Document(roomId);
        var memberRef = roomRef.Collection("members").Document(memberId);

        return await _db.RunTransactionAsync(async tx =>
        {
            var roomSnap = await tx.GetSnapshotAsync(roomRef);
            if (!roomSnap.Exists) return null;

            var memberSnap = await tx.GetSnapshotAsync(memberRef);
            if (!memberSnap.Exists) return null;

            tx.Delete(memberRef);
            var membersSnapshot = await tx.GetSnapshotAsync(roomRef.Collection("members"));
            return await MapRoomAsync(roomSnap, ct, membersSnapshot: membersSnapshot);
        });
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

    private static async Task<Room> MapRoomAsync(DocumentSnapshot snapshot, CancellationToken ct, QuerySnapshot? membersSnapshot = null)
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

        membersSnapshot ??= await snapshot.Reference.Collection("members").GetSnapshotAsync(ct);
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
