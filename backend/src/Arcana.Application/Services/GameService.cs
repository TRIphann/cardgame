using Arcana.Application.Abstractions;
using Arcana.Application.Game;
using Arcana.Domain.Common;
using Arcana.Domain.Entities;
using Arcana.Domain.Enums;
using Arcana.Domain.Repositories;

namespace Arcana.Application.Services;

public class GameService
{
    private const int NopeWindowSeconds = 3;

    private readonly IRoomRepository _repository;
    private readonly IGameBroadcaster _broadcaster;

    public GameService(IRoomRepository repository, IGameBroadcaster broadcaster)
    {
        _repository = repository;
        _broadcaster = broadcaster;
    }

    // ──────────────────────────────────────────────────────────────────
    //  Start / rotate
    // ──────────────────────────────────────────────────────────────────

    public async Task<Room> StartGameAsync(string roomId, string hostId, CancellationToken ct = default)
    {
        var room = await _repository.GetByIdAsync(roomId, ct)
            ?? throw new DomainException("room_not_found", "Phòng không tồn tại.");

        if (!string.Equals(room.HostId, hostId, StringComparison.Ordinal))
            throw new DomainException("not_host", "Chỉ chủ phòng mới có thể bắt đầu.");

        if (room.Status != RoomStatus.Waiting)
            throw new DomainException("game_already_started", "Ván chơi đã bắt đầu hoặc kết thúc.");

        var players = room.Members.Where(m => m.IsOnline || m.IsHost).ToList();
        if (!players.Any(m => m.Id == room.HostId))
            players.Add(room.Members.First(m => m.Id == room.HostId));

        if (players.Count < 2)
            throw new DomainException("cannot_start", "Cần ít nhất 2 người chơi để bắt đầu.");

        var deck = CardCatalog.BuildDeck(players.Count);
        var state = new GameState
        {
            Deck = deck,
            StartedAt = DateTime.UtcNow,
        };

        // ── Safe dealing protocol ────────────────────────────────────
        //
        // Deck starts with N+1 Defuse cards. We:
        //   1) Extract N Defuse from the deck (one per player).
        //   2) The last N players to receive a Defuse in this loop are the
        //      "survivor candidates" — whoever draws a bomb later still has their
        //      starting Defuse as a safety net.
        //   3) Deal 4 non-bomb cards to each player from a shuffled safe pool.
        //   4) The N-th (last) player gets the last Defuse → guaranteed survivor.
        //   5) Any leftover Defuse goes back into the deck.
        //
        // The result: every player starts with Defuse, NO bombs dealt, and exactly
        // 1 player can dodge every bomb and win.

        // Step 1: extract N defuses from the deck.
        var defuseReserve = new List<string>();
        for (var i = 0; i < players.Count; i++)
        {
            var idx = state.Deck.LastIndexOf(CardCatalog.Defuse);
            if (idx < 0) break;
            defuseReserve.Add(state.Deck[idx]);
            state.Deck.RemoveAt(idx);
        }

        // Step 2: shuffle the non-bomb cards for dealing.
        var safePool = state.Deck.Where(c => c != CardCatalog.Bomb).ToList();
        for (var i = safePool.Count - 1; i > 0; i--)
        {
            var j = Random.Shared.Next(i + 1);
            (safePool[i], safePool[j]) = (safePool[j], safePool[i]);
        }

        // Step 3: deal to each player.
        var safeIdx = 0;
        foreach (var p in players)
        {
            var hand = new List<string>();

            // Deal 4 non-bomb cards.
            for (var i = 0; i < 4 && safeIdx < safePool.Count; i++, safeIdx++)
                hand.Add(safePool[safeIdx]);

            // Give the player a Defuse (reverse order so last player gets last defuse).
            var defuseToGive = defuseReserve.Count > 0
                ? defuseReserve[defuseReserve.Count - 1]
                : CardCatalog.RollDefuseVariant();
            if (defuseReserve.Count > 0) defuseReserve.RemoveAt(defuseReserve.Count - 1);
            hand.Add(defuseToGive);

            state.Hands[p.Id] = hand;
            state.Alive[p.Id] = true;
            state.DiedAt[p.Id] = null;
            state.TurnsTaken[p.Id] = 0;
            state.CardsPlayed[p.Id] = 0;
        }

        // Step 4: put leftover Defuse back into the deck.
        foreach (var d in defuseReserve) state.Deck.Add(d);

        // Step 5: rebuild final deck (remaining safe + all bombs, shuffled).
        var bombs = state.Deck.Where(c => c == CardCatalog.Bomb).ToList();
        state.Deck = state.Deck.Where(c => c != CardCatalog.Bomb).ToList();
        // safePool[safeIdx..] are the undelt safe cards — state.Deck already has them.
        state.Deck.AddRange(bombs);
        for (var i = state.Deck.Count - 1; i > 0; i--)
        {
            var j = Random.Shared.Next(i + 1);
            (state.Deck[i], state.Deck[j]) = (state.Deck[j], state.Deck[i]);
        }

        state.CurrentTurnMemberId = players[Random.Shared.Next(players.Count)].Id;

        var updated = await _repository.UpdateGameStateAsync(roomId, state, RoomStatus.Playing, ct);
        return updated ?? throw new DomainException("room_not_found", "Phòng không tồn tại.");
    }

    public async Task<Room> RotateRoomAsync(string roomId, string hostId, CancellationToken ct = default)
    {
        var old = await _repository.GetByIdAsync(roomId, ct)
            ?? throw new DomainException("room_not_found", "Phòng không tồn tại.");

        if (!string.Equals(old.HostId, hostId, StringComparison.Ordinal))
            throw new DomainException("not_host", "Chỉ chủ phòng mới có thể tạo ván mới.");

        if (old.Status != RoomStatus.Finished)
            throw new DomainException("game_not_ended", "Ván chơi chưa kết thúc.");

        var newRoomId = Guid.NewGuid().ToString("N");
        var code = await ClaimUniqueCodeAsync(newRoomId, ct);

        var newRoom = new Room
        {
            Id = newRoomId,
            Code = code,
            HostId = old.HostId,
            HostName = old.HostName,
            Status = RoomStatus.Waiting,
            MaxPlayers = old.MaxPlayers,
            CreatedAt = DateTime.UtcNow,
            Members = old.Members.Select(m => new RoomMember
            {
                Id = m.Id,
                Name = m.Name,
                IsHost = m.IsHost,
                IsReady = false,
                JoinedAt = m.JoinedAt,
                LastSeenAt = DateTime.UtcNow,
                IsOnline = true,
            }).ToList(),
        };
        await _repository.CreateAsync(newRoom, ct);
        return newRoom;
    }

    private async Task<string> ClaimUniqueCodeAsync(string roomId, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 16; attempt++)
        {
            var code = GenerateCode();
            if (await _repository.TryReserveCodeAsync(code, roomId, ct))
                return code;
        }
        throw new DomainException("code_exhausted", "Không thể tạo mã phòng duy nhất, vui lòng thử lại.");
    }

    private static string GenerateCode()
    {
        const string chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        var rng = Random.Shared;
        return new string(Enumerable.Range(0, 6).Select(_ => chars[rng.Next(chars.Length)]).ToArray());
    }

    // ──────────────────────────────────────────────────────────────────
    //  Play (most-spawns-most-bugs path)
    // ──────────────────────────────────────────────────────────────────

    public async Task<GameActionResult> PlayCardAsync(
        string roomId, string memberId, string cardKey,
        string? targetMemberId, ComboKind? comboKind, string? discardPickKey,
        CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;

        if (gs.CurrentTurnMemberId != memberId)
            throw new DomainException("not_your_turn", "Chưa tới lượt của bạn.");
        if (gs.PendingAction is not null)
            throw new DomainException("action_pending", "Đang chờ phản ứng Nope.");

        var hand = gs.Hands.TryGetValue(memberId, out var h) ? h : new List<string>();
        CardCatalog.ValidateHandCard(hand, cardKey);

        var result = new GameActionResult();

        switch (cardKey)
        {
            case CardCatalog.Attack:
                gs.AttackCounter += 1;
                RemoveFromHand(hand, CardCatalog.Attack);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                QueueNopeWindow(gs, memberId, CardCatalog.Attack);
                result.PlayedCardKey = CardCatalog.Attack;
                result.Toast = "Tấn công! Đối phương phải chơi thêm 1 lượt.";
                break;

            case CardCatalog.Skip:
                RemoveFromHand(hand, CardCatalog.Skip);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                QueueNopeWindow(gs, memberId, CardCatalog.Skip);
                if (gs.AttackCounter > 0)
                {
                    gs.AttackCounter -= 1;
                    result.Toast = "Bỏ lượt (tiêu hao lượt tấn công).";
                }
                else
                {
                    result.Toast = "Bạn đã bỏ lượt.";
                    AdvanceTurn(gs);
                }
                result.PlayedCardKey = CardCatalog.Skip;
                break;

            case CardCatalog.Favor:
                if (string.IsNullOrEmpty(targetMemberId))
                    throw new DomainException("requires_target", "Lá Xin cần chọn đối thủ.");
                if (!gs.Hands.ContainsKey(targetMemberId))
                    throw new DomainException("target_not_found", "Đối thủ không hợp lệ.");
                if (!gs.Alive.GetValueOrDefault(targetMemberId))
                    throw new DomainException("target_dead", "Đối thủ đã bị loại.");

                var tgtHandF = gs.Hands[targetMemberId];
                if (tgtHandF.Count == 0)
                    throw new DomainException("target_empty", "Đối thủ không còn lá bài.");

                // Spending the Favor card now (it's committed). Return the
                // target's shuffled hand so the player picks which one to take.
                RemoveFromHand(hand, CardCatalog.Favor);

                if (string.IsNullOrEmpty(discardPickKey))
                {
                    // Phase 1: server shuffles a snapshot copy for the actor
                    // to choose from. NOTE: gs.Hands is the source of truth.
                    var shuffled = new List<string>(tgtHandF);
                    for (var i = shuffled.Count - 1; i > 0; i--)
                    {
                        var j = Random.Shared.Next(i + 1);
                        (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
                    }
                    // Persist before returning pick state so others see updated handCounts.
                    await PersistAsync(room.Id, gs, ct);
                    result.Room = (await _repository.GetByIdAsync(room.Id, ct))!;
                    result.PlayedCardKey = CardCatalog.Favor;
                    result.RequiresFavorPick = true;
                    result.FavorCandidates = shuffled;
                    result.Toast = "Chọn 1 lá để lấy từ tay đối thủ.";
                    return result;
                }

                // Phase 2: player chose which card to take.
                if (!tgtHandF.Contains(discardPickKey))
                    throw new DomainException("favor_card_gone", "Đối thủ không còn lá này.");
                tgtHandF.Remove(discardPickKey);
                hand.Add(discardPickKey);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                AdvanceTurn(gs);
                result.PlayedCardKey = CardCatalog.Favor;
                result.Toast = $"Lấy 1 lá từ đối thủ.";
                break;

            case CardCatalog.Future:
                RemoveFromHand(hand, CardCatalog.Future);
                gs.DiscardPile.Add(CardCatalog.Future);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                result.FuturePeek = gs.Deck.TakeLast(3).Reverse().ToList();
                QueueNopeWindow(gs, memberId, CardCatalog.Future);
                result.PlayedCardKey = CardCatalog.Future;
                result.Toast = $"Xem trước 3 lá.";
                break;

            case CardCatalog.Shuffle:
                RemoveFromHand(hand, CardCatalog.Shuffle);
                gs.DiscardPile.Add(CardCatalog.Shuffle);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                for (var i = gs.Deck.Count - 1; i > 0; i--)
                {
                    var j = Random.Shared.Next(i + 1);
                    (gs.Deck[i], gs.Deck[j]) = (gs.Deck[j], gs.Deck[i]);
                }
                QueueNopeWindow(gs, memberId, CardCatalog.Shuffle);
                result.PlayedCardKey = CardCatalog.Shuffle;
                result.Toast = "Đã xáo lại bộ bài.";
                break;

            case CardCatalog.Nope:
                throw new DomainException("nope_direct_use", "Nope phải dùng trong 3s sau hành động của người khác.");

            default:
                if (!CardCatalog.IsComboDefuse(cardKey))
                    throw new DomainException("card_not_playable", "Lá bài này không thể dùng trực tiếp.");

                var combo = CardCatalog.DetectCombo(hand) ?? comboKind;
                if (combo is null)
                {
                    result.Toast = "Cần 2 lá giống nhau (hoặc nhiều hơn) để dùng combo.";
                    result.PlayedCardKey = cardKey;
                    break;
                }
                return await ResolveComboAsync(room, memberId, cardKey, combo.Value, targetMemberId, discardPickKey, ct);
        }

        CheckWinCondition(gs);
        await PersistAsync(room.Id, gs, ct);
        result.Room = (await _repository.GetByIdAsync(room.Id, ct))!;
        return result;
    }

    private async Task<GameActionResult> ResolveComboAsync(
        Room room, string memberId, string cardKey, ComboKind combo,
        string? targetMemberId, string? discardPickKey,
        CancellationToken ct)
    {
        var gs = room.GameState!;
        var hand = gs.Hands[memberId];
        var result = new GameActionResult { ComboKind = combo, PlayedCardKey = cardKey };

        switch (combo)
        {
            case ComboKind.TwoSame:
                if (string.IsNullOrEmpty(targetMemberId))
                {
                    result.RequiresTargetPick = true;
                    return result; // client will retry
                }
                var t2 = gs.Hands.TryGetValue(targetMemberId, out var t2Hand) ? t2Hand : null;
                if (t2 is null || !gs.Alive.GetValueOrDefault(targetMemberId) || t2.Count == 0)
                {
                    result.Toast = "Đối thủ không hợp lệ hoặc không còn bài.";
                    return result;
                }
                // Combo 2-same per spec: SERVER picks 1 random card from target.
                var stolenIdx = Random.Shared.Next(t2.Count);
                var stolenKey = t2[stolenIdx];
                SpendComboFromHand(hand, cardKey, 2);
                t2.RemoveAt(stolenIdx);
                hand.Add(stolenKey);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                // Combo 2-same is NOT Nope-able per game rules.
                AdvanceTurn(gs);
                result.PlayedCardKey = cardKey;
                result.Toast = "Lấy 1 lá ngẫu nhiên từ tay đối thủ.";
                break;

            case ComboKind.ThreeSame:
                if (string.IsNullOrEmpty(targetMemberId))
                {
                    result.RequiresTargetPick = true;
                    return result;
                }
                var t3 = gs.Hands.TryGetValue(targetMemberId, out var t3Hand) ? t3Hand : null;
                if (t3 is null || !gs.Alive.GetValueOrDefault(targetMemberId))
                {
                    result.Toast = "Đối thủ không hợp lệ.";
                    return result;
                }
                // Per spec: show player the FULL cloudinary list (except bomb/back)
                // and let them pick. If target doesn't have the picked card → combo
                // fizzles (cards spent, turn advances).
                if (string.IsNullOrEmpty(discardPickKey))
                {
                    // Return ALL non-bomb/non-back card keys for selection.
                    result.RequiresDiscardPick = true;
                    result.FavorCandidates = CardCatalog.PublicCardKeys.ToList();
                    result.Toast = "Chọn 1 lá để yêu cầu đối thủ đưa.";
                    return result;
                }
                SpendComboFromHand(hand, cardKey, 3);
                if (t3.Contains(discardPickKey))
                {
                    t3.Remove(discardPickKey);
                    hand.Add(discardPickKey);
                    result.Toast = "Đối thủ có lá — lấy về.";
                }
                else
                {
                    result.Toast = "Đối thủ không có lá này — combo vô hiệu.";
                }
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                // Combo 3-same is NOT Nope-able.
                AdvanceTurn(gs);
                result.PlayedCardKey = cardKey;
                break;

            case ComboKind.FiveAny:
                if (string.IsNullOrEmpty(discardPickKey))
                {
                    // Return the unique keys in the discard pile (deduped).
                    result.RequiresDiscardPick = true;
                    result.FavorCandidates = gs.DiscardPile
                        .Distinct()
                        .Where(k => k != "bomb" && k != "back")
                        .ToList();
                    result.Toast = "Chọn 1 lá đã được đánh để lấy lại.";
                    return result;
                }
                if (!gs.DiscardPile.Contains(discardPickKey))
                {
                    result.Toast = "Lá bài không còn trong chồng bỏ.";
                    return result;
                }
                SpendAnyComboFromHand(hand, 5);
                gs.DiscardPile.Remove(discardPickKey);
                hand.Add(discardPickKey);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                // Combo 5-any is NOT Nope-able.
                AdvanceTurn(gs);
                result.PlayedCardKey = "5-any";
                result.Toast = "Lấy 1 lá từ chồng bỏ.";
                break;
        }

        CheckWinCondition(gs);
        await PersistAsync(room.Id, gs, ct);
        result.Room = (await _repository.GetByIdAsync(room.Id, ct))!;
        return result;
    }

    // ──────────────────────────────────────────────────────────────────
    //  Concede
    // ──────────────────────────────────────────────────────────────────

    public async Task<GameActionResult> ConcedeAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;

        if (!gs.Alive.GetValueOrDefault(memberId))
            throw new DomainException("already_dead", "Bạn đã không còn trong trò chơi.");

        gs.Alive[memberId] = false;
        gs.DiedAt[memberId] = DateTime.UtcNow;

        CheckWinCondition(gs);
        await PersistAsync(room.Id, gs, ct);
        return new GameActionResult
        {
            Room = (await _repository.GetByIdAsync(room.Id, ct))!,
            Toast = "Bạn đã đầu hàng và bị loại khỏi ván chơi.",
        };
    }

    // ──────────────────────────────────────────────────────────────────
    //  Draw / Defuse / Nope
    // ──────────────────────────────────────────────────────────────────

    public async Task<GameActionResult> DrawCardAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;

        if (gs.CurrentTurnMemberId != memberId)
            throw new DomainException("not_your_turn", "Chưa tới lượt của bạn.");
        if (gs.PendingAction is not null)
            throw new DomainException("action_pending", "Đang chờ phản ứng Nope.");
        if (gs.Deck.Count == 0)
            throw new DomainException("deck_empty", "Hết bài trong chồng.");

        var drawn = gs.Deck[^1];
        gs.Deck.RemoveAt(gs.Deck.Count - 1);
        var hand = gs.Hands[memberId];

        var result = new GameActionResult { DrawnCardKey = drawn };

        // Broadcast state for cinematic overlays. Every viewer will see
        // "X rút trúng bom" + the reveal animation in sync.
        gs.LastDrawnBy = memberId;
        gs.LastDrawnCardKey = drawn;
        gs.LastDrawnAt = DateTime.UtcNow;
        gs.BombRevealActive = drawn == CardCatalog.Bomb;

        if (drawn == CardCatalog.Bomb)
        {
            var defuseIdx = -1;
            for (var i = 0; i < hand.Count; i++)
            {
                if (CardCatalog.IsComboDefuse(hand[i])) { defuseIdx = i; break; }
            }
            if (defuseIdx >= 0)
            {
                result.RequiresDefuse = true;
                result.Toast = "Bạn rút trúng bom! Hãy chọn vị trí đặt lại.";
                await PersistAsync(roomId, gs, ct);
                result.Room = (await _repository.GetByIdAsync(roomId, ct))!;
                return result;
            }
            // No defuse → die. Clear the reveal flag here so the explosion
            // animation finishes; the snapshot will report Alive=false.
            gs.Alive[memberId] = false;
            gs.DiedAt[memberId] = DateTime.UtcNow;
            result.Toast = "Bạn đã chết.";
        }
        else
        {
            hand.Add(drawn);
            result.Toast = $"Rút được: {CardCatalog.Names.GetValueOrDefault(drawn, drawn)}.";
            gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
            AdvanceTurn(gs);
        }

        CheckWinCondition(gs);
        await PersistAsync(roomId, gs, ct);
        result.Room = (await _repository.GetByIdAsync(roomId, ct))!;
        return result;
    }

    public async Task<GameActionResult> UseDefuseAsync(string roomId, string memberId, int slotIndex, CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;

        if (gs.CurrentTurnMemberId != memberId)
            throw new DomainException("not_your_turn", "Chưa tới lượt của bạn.");

        var hand = gs.Hands[memberId];
        var defuseIdx = -1;
        for (var i = 0; i < hand.Count; i++)
        {
            if (CardCatalog.IsComboDefuse(hand[i])) { defuseIdx = i; break; }
        }
        if (defuseIdx < 0)
            throw new DomainException("no_defuse", "Bạn không có lá cứu.");

        hand.RemoveAt(defuseIdx);
        var safeSlot = Math.Clamp(slotIndex, 0, gs.Deck.Count);
        gs.Deck.Insert(safeSlot, CardCatalog.Bomb);
        gs.BombRevealActive = false;

        gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
        gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
        AdvanceTurn(gs);

        CheckWinCondition(gs);
        await PersistAsync(roomId, gs, ct);
        return new GameActionResult
        {
            Room = (await _repository.GetByIdAsync(roomId, ct))!,
            Toast = "Bom đã được cứu và đặt lại vào chồng bài.",
            PlayedCardKey = CardCatalog.Defuse,
        };
    }

    public async Task<GameActionResult> ChainNopeAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;
        var pending = gs.PendingAction
            ?? throw new DomainException("no_pending_action", "Không có hành động nào để Nope.");

        if (pending.InitiatorId == memberId)
            throw new DomainException("cannot_nope_self", "Bạn không thể cản hành động do chính mình.");

        if ((DateTime.UtcNow - pending.CreatedAt).TotalSeconds > NopeWindowSeconds)
        {
            // Auto-clear stale pending — but the original action already executed.
            gs.PendingAction = null;
            ClearActionCinematic(gs);
            await PersistAsync(roomId, gs, ct);
            throw new DomainException("nope_window_closed", "Đã hết thời gian Nope.");
        }

        if (pending.NopeChain.Contains(memberId))
            throw new DomainException("already_noped", "Bạn đã Nope rồi.");
        if (!gs.Hands.TryGetValue(memberId, out var hand) || !hand.Contains(CardCatalog.Nope))
            throw new DomainException("no_nope_card", "Bạn không có lá Cản.");

        hand.Remove(CardCatalog.Nope);
        pending.NopeChain.Add(memberId);

        // Cinematic: each Nope resets the centre-screen reveal so the
        // newly-played Nope card is what everyone sees.
        gs.LastPlayedBy = memberId;
        gs.LastPlayedCardKey = CardCatalog.Nope;
        gs.LastPlayedAt = DateTime.UtcNow;
        gs.LastPlayedByNope = memberId;

        if (pending.NopeChain.Count % 2 == 1)
        {
            // Last noper wins — cancel the action.
            // Restore initiator's hand (where possible).
            RefundInitiatorCard(gs, pending);
            gs.PendingAction = null;
            // Action resolved (cancelled) — clear cinematic.
            ClearActionCinematic(gs);
            // Advance turn because the action was cancelled — initiator is done.
            AdvanceTurn(gs);
        }

        CheckWinCondition(gs);
        await PersistAsync(roomId, gs, ct);
        return new GameActionResult
        {
            Room = (await _repository.GetByIdAsync(roomId, ct))!,
            Toast = pending.NopeChain.Count % 2 == 1 ? "Hành động đã bị cản." : "Bạn đã cản, chờ phản ứng.",
            PlayedCardKey = CardCatalog.Nope,
        };
    }

    private static void RefundInitiatorCard(GameState gs, PendingAction pending)
    {
        if (!gs.Hands.TryGetValue(pending.InitiatorId, out var hand)) return;
        var card = pending.CardKey;
        // Combo refund is tricky — we only re-add the most-likely-spent set.
        // For MVP simplicity, refund 2 cards for combos (works for 2/3/5
        // because the smallest count is 2; 5-any refunds 5).
        var refundCount = CardCatalog.IsComboDefuse(card) ? 2 : 1;
        for (var i = 0; i < refundCount; i++) hand.Add(card);
    }

    // ──────────────────────────────────────────────────────────────────
    //  Helpers
    // ──────────────────────────────────────────────────────────────────

    private async Task<Room> LoadPlayingRoomAsync(string roomId, CancellationToken ct)
    {
        var room = await _repository.GetByIdAsync(roomId, ct)
            ?? throw new DomainException("room_not_found", "Phòng không tồn tại.");
        if (room.GameState is null || room.Status != RoomStatus.Playing)
            throw new DomainException("game_not_started", "Ván chơi chưa bắt đầu hoặc đã kết thúc.");
        return room;
    }

    private async Task PersistAsync(string roomId, GameState gs, CancellationToken ct)
    {
        var status = gs.EndedAt is null ? (RoomStatus?)null : RoomStatus.Finished;
        await _repository.UpdateGameStateAsync(roomId, gs, status, ct);
        // Server-push: every mutation fans out to every tab subscribed to
        // this room. Clients now get sub-100ms updates instead of waiting
        // for the next polling tick.
        try
        {
            var viewerId = gs.PendingAction?.InitiatorId ?? string.Empty;
            await _broadcaster.BroadcastRoomUpdatedAsync(roomId, new { roomId, viewerId }, ct);
        }
        catch (Exception)
        {
            // Broadcast failures must never corrupt the persisted state —
            // clients will re-sync via the next snapshot poll fallback.
        }
    }

    private static void QueueNopeWindow(GameState gs, string initiatorId, string cardKey, string? target = null)
    {
        gs.PendingAction = new PendingAction
        {
            InitiatorId = initiatorId,
            CardKey = cardKey,
            TargetMemberId = target,
            CreatedAt = DateTime.UtcNow,
            NopeChain = new List<string>(),
        };
        // Cinematic: surface the played card for everyone.
        gs.LastPlayedBy = initiatorId;
        gs.LastPlayedCardKey = cardKey;
        gs.LastPlayedAt = DateTime.UtcNow;
        gs.LastPlayedByNope = null;
    }

    private static void ClearActionCinematic(GameState gs)
    {
        gs.LastPlayedBy = null;
        gs.LastPlayedCardKey = null;
        gs.LastPlayedAt = null;
        gs.LastPlayedByNope = null;
    }

    private static void RemoveFromHand(List<string> hand, string key) => hand.Remove(key);

    private static void SpendComboFromHand(List<string> hand, string key, int count)
    {
        for (var i = 0; i < count; i++) hand.Remove(key);
    }

    private static void SpendAnyComboFromHand(List<string> hand, int count)
    {
        var removed = 0;
        for (var i = hand.Count - 1; i >= 0 && removed < count; i--)
        {
            if (CardCatalog.IsComboDefuse(hand[i])) { hand.RemoveAt(i); removed++; }
        }
    }

    private static void AdvanceTurn(GameState gs)
    {
        var aliveIds = gs.Alive.Where(kv => kv.Value).Select(kv => kv.Key).ToList();
        if (aliveIds.Count <= 1) return;
        if (gs.AttackCounter > 0)
        {
            gs.AttackCounter -= 1;
            return;
        }
        var currentIdx = aliveIds.IndexOf(gs.CurrentTurnMemberId);
        if (currentIdx < 0)
        {
            gs.CurrentTurnMemberId = aliveIds[0];
            return;
        }
        var nextIdx = (currentIdx + 1) % aliveIds.Count;
        gs.CurrentTurnMemberId = aliveIds[nextIdx];
    }

    private static void CheckWinCondition(GameState gs)
    {
        var aliveIds = gs.Alive.Where(kv => kv.Value).Select(kv => kv.Key).ToList();
        if (aliveIds.Count == 1 && gs.WinnerId is null)
        {
            gs.WinnerId = aliveIds[0];
            gs.EndedAt = DateTime.UtcNow;
        }
        else if (aliveIds.Count == 0 && gs.WinnerId is null)
        {
            var lastDied = gs.DiedAt
                .Where(kv => kv.Value.HasValue)
                .OrderByDescending(kv => kv.Value!.Value)
                .Select(kv => kv.Key)
                .FirstOrDefault();
            gs.WinnerId = lastDied;
            gs.EndedAt = DateTime.UtcNow;
        }
    }
}
