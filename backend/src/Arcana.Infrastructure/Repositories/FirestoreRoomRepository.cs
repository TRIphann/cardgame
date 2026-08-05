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

    public async Task<Room?> TryJoinRoomAsync(string roomId, RoomMember candidate, CancellationToken ct = default)
    {
        var roomRef = _db.Collection(RoomsCollection).Document(roomId);
        var memberRef = roomRef.Collection("members").Document(candidate.Id);

        return await _db.RunTransactionAsync(async tx =>
        {
            // All reads must happen BEFORE any writes inside a Firestore transaction.
            var snapshot = await tx.GetSnapshotAsync(roomRef);
            if (!snapshot.Exists) return null;

            var status = snapshot.GetValue<string>("status");
            if (!string.Equals(status, "waiting", StringComparison.OrdinalIgnoreCase))
                return null;

            var maxPlayers = snapshot.GetValue<int>("maxPlayers");
            var membersSnap = await tx.GetSnapshotAsync(roomRef.Collection("members"));
            if (membersSnap.Count >= maxPlayers) return null;

            // Writes go after reads — Firestore enforces "reads before writes" inside tx.
            tx.Set(memberRef, BuildMemberDoc(candidate));
            // Reuse the already-fetched members snapshot; do NOT call GetSnapshotAsync
            // again here because that would be a read after a write and throw.
            return await MapRoomAsync(snapshot, ct, membersSnapshot: membersSnap);
        });
    }

    public async Task<Room?> RemoveMemberAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        var roomRef = _db.Collection(RoomsCollection).Document(roomId);
        var memberRef = roomRef.Collection("members").Document(memberId);

        return await _db.RunTransactionAsync(async tx =>
        {
            // Reads before writes: Firestore transactions require all reads to
            // happen before any writes. We pre-fetch the members snapshot here so
            // we can re-use it after the delete instead of calling GetSnapshotAsync
            // again (which would throw "reads after writes").
            var roomSnap = await tx.GetSnapshotAsync(roomRef);
            if (!roomSnap.Exists) return null;

            var memberSnap = await tx.GetSnapshotAsync(memberRef);
            if (!memberSnap.Exists) return null;

            var membersSnapshot = await tx.GetSnapshotAsync(roomRef.Collection("members"));

            tx.Delete(memberRef);
            return await MapRoomAsync(roomSnap, ct, membersSnapshot: membersSnapshot);
        });
    }

    public async Task<RoomMember?> UpdateMemberFieldAsync(
        string roomId,
        string memberId,
        bool? isReady,
        DateTime? lastSeenAt,
        CancellationToken ct = default)
    {
        var roomRef = _db.Collection(RoomsCollection).Document(roomId);
        var memberRef = roomRef.Collection("members").Document(memberId);

        // Read inside a transaction so we don't clobber concurrent writes
        // (heartbeat + ready toggle racing on the same member).
        return await _db.RunTransactionAsync(async tx =>
        {
            // Reads first.
            var memberSnap = await tx.GetSnapshotAsync(memberRef);
            if (!memberSnap.Exists) return null;

            var current = memberSnap.ToDictionary();
            var updated = new Dictionary<string, object>(current);
            if (isReady.HasValue) updated["isReady"] = isReady.Value;
            // Every call updates lastSeenAt to "now" by default — that is the
            // heartbeat signal. Callers pass an explicit value (or null) for
            // transitions like "explicitly went offline".
            updated["lastSeenAt"] = Timestamp.FromDateTime((lastSeenAt ?? DateTime.UtcNow).ToUniversalTime());
            updated["isOnline"] = true;

            // Write after reads.
            tx.Set(memberRef, updated);
            return new RoomMember
            {
                Id = memberId,
                Name = updated.TryGetValue("name", out var n) ? n as string ?? string.Empty : string.Empty,
                IsHost = updated.TryGetValue("isHost", out var ih) && ih is bool ihb && ihb,
                IsReady = updated.TryGetValue("isReady", out var ir) && ir is bool irb && irb,
                JoinedAt = updated.TryGetValue("joinedAt", out var ja) && ja is Timestamp jts ? jts.ToDateTime().ToUniversalTime() : DateTime.UtcNow,
                LastSeenAt = updated.TryGetValue("lastSeenAt", out var ls) && ls is Timestamp lts ? lts.ToDateTime().ToUniversalTime() : DateTime.UtcNow,
                IsOnline = true,
            };
        });
    }

    public async Task<int> MarkStaleMembersOfflineAsync(string roomId, TimeSpan offlineAfter, CancellationToken ct = default)
    {
        var roomRef = _db.Collection(RoomsCollection).Document(roomId);
        var membersRef = roomRef.Collection("members");

        var snapshot = await membersRef.GetSnapshotAsync(ct);
        var cutoff = DateTime.UtcNow - offlineAfter;
        var batch = _db.StartBatch();
        var touched = 0;
        foreach (var doc in snapshot.Documents)
        {
            var data = doc.ToDictionary();
            var isOnline = data.TryGetValue("isOnline", out var io) && io is bool iob && iob;
            if (!isOnline) continue;
            var lastSeen = data.TryGetValue("lastSeenAt", out var ls) && ls is Timestamp lts
                ? lts.ToDateTime().ToUniversalTime()
                : DateTime.UtcNow;
            if (lastSeen >= cutoff) continue;

            var updated = new Dictionary<string, object>(data) { ["isOnline"] = false };
            batch.Update(doc.Reference, updated);
            touched += 1;
        }
        if (touched > 0)
        {
            await batch.CommitAsync(ct);
        }
        return touched;
    }

    public async Task<Room?> UpdateGameStateAsync(
        string roomId,
        Domain.Entities.GameState? gameState,
        Domain.Enums.RoomStatus? status,
        CancellationToken ct = default)
    {
        var docRef = _db.Collection(RoomsCollection).Document(roomId);
        var updates = new Dictionary<string, object?>();
        if (status.HasValue)
        {
            updates["status"] = status.Value.ToString().ToLowerInvariant();
        }
        if (gameState is not null)
        {
            updates["gameState"] = BuildGameStateDoc(gameState);
        }
        else
        {
            updates["gameState"] = null;
        }
        await docRef.UpdateAsync(updates, cancellationToken: ct);
        return await GetByIdAsync(roomId, ct);
    }

    /// <summary>
    /// Returns rooms currently in the "playing" status that may have an
    /// outstanding FuturePeek state to clean up. Used by background
    /// sweepers that need to find stale per-game state without going
    /// through the lobby.
    ///
    /// Filter order matters: Firestore free tier indexes are
    /// auto-created for single-field queries, but composite indexes need
    /// manual setup. We therefore restrict the scan to rooms whose
    /// <c>futurePeekAt</c> is older than the peek lifetime — a
    /// single-field timestamp inequality that returns at most a handful of
    /// docs each tick — and let the in-process loop discard anything that
    /// isn't really "playing". Without this filter a full-collection scan
    /// on every tick blows through the Firestore free-tier quota.
    /// </summary>
    public async Task<IReadOnlyList<Room>> GetAllPlayingAsync(CancellationToken ct = default)
    {
        // Only rooms whose peek has aged past the sweeper's lifetime — a
        // single-field timestamp inequality (auto-indexed) avoids the
        // composite index requirement while still touching ≤ a handful
        // of docs per tick.
        var cutoff = Google.Cloud.Firestore.Timestamp.FromDateTime(
            DateTime.UtcNow.AddSeconds(-13));

        var query = _db.Collection(RoomsCollection)
            .WhereLessThanOrEqualTo("futurePeekAt", cutoff);

        var snap = await query.GetSnapshotAsync(ct);
        var rooms = new List<Room>();
        foreach (var doc in snap.Documents)
        {
            var data = doc.ToDictionary();
            if (!data.ContainsKey("gameState")) continue;

            // Filter in-process — at most a few stale peeks ever, so the
            // cost is negligible.
            var status = data.TryGetValue("status", out var s) ? s as string : null;
            if (!string.Equals(status, "playing", StringComparison.OrdinalIgnoreCase))
                continue;

            rooms.Add(await MapRoomAsync(doc, ct));
        }
        return rooms;
    }

    private static Dictionary<string, object?> BuildGameStateDoc(Domain.Entities.GameState gs)
    {
        var doc = new Dictionary<string, object?>
        {
            ["deck"] = gs.Deck,
            ["discardPile"] = gs.DiscardPile,
            ["hands"] = gs.Hands.ToDictionary(kv => kv.Key, kv => (object?)kv.Value),
            ["currentTurnMemberId"] = gs.CurrentTurnMemberId,
            ["attackCounter"] = gs.AttackCounter,
            ["turnsTaken"] = gs.TurnsTaken.ToDictionary(kv => kv.Key, kv => (object?)kv.Value),
            ["cardsPlayed"] = gs.CardsPlayed.ToDictionary(kv => kv.Key, kv => (object?)kv.Value),
            ["alive"] = gs.Alive.ToDictionary(kv => kv.Key, kv => (object?)kv.Value),
            ["diedAt"] = gs.DiedAt.ToDictionary(
                kv => kv.Key,
                kv => kv.Value.HasValue
                    ? (object?)Timestamp.FromDateTime(kv.Value.Value.ToUniversalTime())
                    : null),
            ["startedAt"] = gs.StartedAt.HasValue
                ? (object?)Timestamp.FromDateTime(gs.StartedAt.Value.ToUniversalTime())
                : null,
            ["endedAt"] = gs.EndedAt.HasValue
                ? (object?)Timestamp.FromDateTime(gs.EndedAt.Value.ToUniversalTime())
                : null,
            ["winnerId"] = gs.WinnerId ?? string.Empty,
            ["pendingAction"] = gs.PendingAction is null
                ? null
                : BuildPendingActionDoc(gs.PendingAction),
            ["turnStartedAt"] = gs.TurnStartedAt.HasValue
                ? (object?)Timestamp.FromDateTime(gs.TurnStartedAt.Value.ToUniversalTime())
                : null,
            ["turnOrder"] = gs.TurnOrder,
            ["futurePeek"] = gs.FuturePeek,
            ["futurePeekAt"] = gs.FuturePeekAt.HasValue
                ? (object?)Timestamp.FromDateTime(gs.FuturePeekAt.Value.ToUniversalTime())
                : null,
        };
        return doc;
    }

    private static Dictionary<string, object> BuildPendingActionDoc(Domain.Entities.PendingAction pa)
    {
        return new Dictionary<string, object>
        {
            ["initiatorId"] = pa.InitiatorId,
            ["cardKey"] = pa.CardKey,
            ["discardPickKey"] = pa.DiscardPickKey ?? string.Empty,
            ["nopeChain"] = pa.NopeChain,
            ["createdAt"] = Timestamp.FromDateTime(pa.CreatedAt.ToUniversalTime()),
        };
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
        ["lastSeenAt"] = Timestamp.FromDateTime(member.LastSeenAt.ToUniversalTime()),
        ["isOnline"] = member.IsOnline,
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
            MaxPlayers = data.TryGetValue("maxPlayers", out var mp) && mp is long mpL ? (int)mpL : 7,
            CreatedAt = data.TryGetValue("createdAt", out var ca) && ca is Timestamp ts ? ts.ToDateTime().ToUniversalTime() : DateTime.UtcNow,
            Members = new List<RoomMember>(),
        };

        if (data.TryGetValue("gameState", out var gsRaw) && gsRaw is Dictionary<string, object> gsDoc && gsDoc.Count > 0)
        {
            room.GameState = MapGameStateDoc(gsDoc);
        }

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
                LastSeenAt = md.TryGetValue("lastSeenAt", out var ls) && ls is Timestamp lts ? lts.ToDateTime().ToUniversalTime() : DateTime.UtcNow,
                IsOnline = md.TryGetValue("isOnline", out var io) && io is bool iob && iob,
            });
        }
        return room;
    }

    private static Domain.Entities.GameState MapGameStateDoc(Dictionary<string, object> doc)
    {
        var gs = new Domain.Entities.GameState();

        if (doc.TryGetValue("deck", out var d) && d is IEnumerable<object> deckList)
            gs.Deck = deckList.Select(x => x as string ?? string.Empty).Where(s => s.Length > 0).ToList();

        if (doc.TryGetValue("discardPile", out var dp) && dp is IEnumerable<object> discardList)
            gs.DiscardPile = discardList.Select(x => x as string ?? string.Empty).Where(s => s.Length > 0).ToList();

        if (doc.TryGetValue("hands", out var h) && h is Dictionary<string, object> handsDict)
        {
            foreach (var kv in handsDict)
            {
                if (kv.Value is IEnumerable<object> cards)
                    gs.Hands[kv.Key] = cards.Select(c => c as string ?? string.Empty).Where(s => s.Length > 0).ToList();
            }
        }

        gs.CurrentTurnMemberId = doc.TryGetValue("currentTurnMemberId", out var ctm) ? ctm as string ?? string.Empty : string.Empty;
        gs.AttackCounter = doc.TryGetValue("attackCounter", out var ac) && ac is long acl ? (int)acl : 0;

        if (doc.TryGetValue("turnsTaken", out var tt) && tt is Dictionary<string, object> ttDict)
            foreach (var kv in ttDict)
                if (kv.Value is long l) gs.TurnsTaken[kv.Key] = (int)l;

        if (doc.TryGetValue("cardsPlayed", out var cp) && cp is Dictionary<string, object> cpDict)
            foreach (var kv in cpDict)
                if (kv.Value is long l) gs.CardsPlayed[kv.Key] = (int)l;

        if (doc.TryGetValue("alive", out var al) && al is Dictionary<string, object> alDict)
            foreach (var kv in alDict)
                if (kv.Value is bool b) gs.Alive[kv.Key] = b;

        if (doc.TryGetValue("diedAt", out var da) && da is Dictionary<string, object> daDict)
            foreach (var kv in daDict)
                gs.DiedAt[kv.Key] = kv.Value is Timestamp ts ? ts.ToDateTime().ToUniversalTime() : (DateTime?)null;

        gs.StartedAt = doc.TryGetValue("startedAt", out var sa) && sa is Timestamp sats ? sats.ToDateTime().ToUniversalTime() : (DateTime?)null;
        gs.EndedAt = doc.TryGetValue("endedAt", out var ea) && ea is Timestamp eats ? eats.ToDateTime().ToUniversalTime() : (DateTime?)null;
        gs.WinnerId = doc.TryGetValue("winnerId", out var wi) ? wi as string : null;
        if (string.IsNullOrEmpty(gs.WinnerId)) gs.WinnerId = null;

        gs.TurnStartedAt = doc.TryGetValue("turnStartedAt", out var tsa) && tsa is Timestamp tsats
            ? tsats.ToDateTime().ToUniversalTime()
            : (DateTime?)null;

        if (doc.TryGetValue("turnOrder", out var tor) && tor is IEnumerable<object> torList)
            gs.TurnOrder = torList.Select(t => t as string ?? string.Empty).Where(s => s.Length > 0).ToList();

        if (doc.TryGetValue("futurePeek", out var fp) && fp is IEnumerable<object> fpList)
            gs.FuturePeek = fpList.Select(x => x as string ?? string.Empty).Where(s => s.Length > 0).ToList();

        if (doc.TryGetValue("futurePeekAt", out var fpa) && fpa is Timestamp fpaTs)
            gs.FuturePeekAt = fpaTs.ToDateTime().ToUniversalTime();

        if (doc.TryGetValue("pendingAction", out var pa) && pa is Dictionary<string, object> paDict)
        {
            gs.PendingAction = new Domain.Entities.PendingAction
            {
                InitiatorId = paDict.TryGetValue("initiatorId", out var pid) ? pid as string ?? string.Empty : string.Empty,
                CardKey = paDict.TryGetValue("cardKey", out var pck) ? pck as string ?? string.Empty : string.Empty,
                DiscardPickKey = paDict.TryGetValue("discardPickKey", out var dpk) ? dpk as string : null,
                CreatedAt = paDict.TryGetValue("createdAt", out var pca) && pca is Timestamp cats ? cats.ToDateTime().ToUniversalTime() : DateTime.UtcNow,
                NopeChain = paDict.TryGetValue("nopeChain", out var nc) && nc is IEnumerable<object> ncList
                    ? ncList.Select(n => n as string ?? string.Empty).Where(s => s.Length > 0).ToList()
                    : new List<string>(),
            };
            // Clean empty strings to null
            if (string.IsNullOrEmpty(gs.PendingAction.DiscardPickKey)) gs.PendingAction.DiscardPickKey = null;
        }

        return gs;
    }
}
