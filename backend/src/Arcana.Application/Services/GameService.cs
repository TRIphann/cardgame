using Arcana.Application.Abstractions;
using Arcana.Application.Game;
using Arcana.Domain.Common;
using Arcana.Domain.Entities;
using Arcana.Domain.Enums;
using Arcana.Domain.Repositories;

namespace Arcana.Application.Services;

public class GameService
{
    private const int NopeWindowSeconds = 5;

    private readonly IRoomRepository _repository;
    private readonly IGameBroadcaster _broadcaster;
    private readonly ITurnClockRegistry _turnClock;
    private readonly INopeWindowRegistry _nopeWindow;

    public GameService(IRoomRepository repository, IGameBroadcaster broadcaster, ITurnClockRegistry turnClock, INopeWindowRegistry nopeWindow)
    {
        _repository = repository;
        _broadcaster = broadcaster;
        _turnClock = turnClock;
        _nopeWindow = nopeWindow;
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

        // Everyone who's actually IN the room can start. We used to filter
        // by `IsOnline || IsHost` but that broke multi-tab testers: member
        // #2 might have just joined and their heartbeat hadn't propagated
        // yet, so the host would see "cannot_start" with 2 members on the
        // screen. Counting every room member is safer — if someone really
        // left, RoomService will have removed them.
        var players = room.Members.ToList();
        if (players.Count < 3)
            throw new DomainException("cannot_start", "Cần ít nhất 3 người chơi để bắt đầu.");

        var deck = CardCatalog.BuildDeck(players.Count);
        var state = new GameState
        {
            Deck = deck,
            StartedAt = DateTime.UtcNow,
        };

        // ── Dealing protocol (per user-confirmed spec) ────────────────────
        //
        //   1) Extract all bombs from the deck and stash them aside. The deck
        //      we're about to shuffle has ZERO bombs in it.
        //   2) Extract ALL (N+1) defuse variants and distribute exactly 1 to
        //      each player FIRST. The remaining 1 defuse stays in the deck —
        //      it can be dealt to anyone in step 4.
        //   3) Shuffle the bomb-free, defuse-free deck.
        //   4) Deal 4 cards from the top of the shuffled deck to each player.
        //      The 1 leftover defuse variant lives somewhere in here, so each
        //      player ends up with exactly 1 cứu + 4 random action cards.
        //   5) Insert all N-1 bombs at random positions into the remaining
        //      deck. They can land anywhere, including clustered together or
        //      on top (first card drawn). That's intentional.
        //
        // Result: every player starts with exactly one defuse, NO bombs dealt,
        // exactly 1 player can dodge every bomb and win.

        // Step 1: pull all bombs out of the deck first.
        var bombs = new List<string>();
        for (var i = state.Deck.Count - 1; i >= 0; i--)
        {
            if (state.Deck[i] == CardCatalog.Bomb)
            {
                bombs.Add(state.Deck[i]);
                state.Deck.RemoveAt(i);
            }
        }

        // Step 2: distribute one defuse card (combo variant OR base "defuse")
        // to each player. We walk the deck in order to find the first
        // defuse-class card and hand it over, then remove it. If we run
        // out mid-way (playerCount > total defuse count), fall back to
        // rolling a fresh defuse variant. The deal logic intentionally
        // checks BOTH the base "defuse" key and the 5 combo variants so
        // every player gets exactly one cứu — the spec requires "exactly 1
        // cứu per player + 1 leftover in the deck".
        static bool IsDefuseClass(string key) =>
            key == CardCatalog.Defuse || CardCatalog.IsComboDefuse(key);

        foreach (var p in players)
        {
            var hand = new List<string>();

            string defuseToGive;
            var defuseIdx = -1;
            for (var i = 0; i < state.Deck.Count; i++)
            {
                if (IsDefuseClass(state.Deck[i])) { defuseIdx = i; break; }
            }
            if (defuseIdx >= 0)
            {
                defuseToGive = state.Deck[defuseIdx];
                state.Deck.RemoveAt(defuseIdx);
            }
            else
            {
                // No defuse-class card left in the deck — fall back to a
                // freshly rolled one. This guarantees every player gets
                // exactly one cứu even when the deck ran out mid-distribution.
                defuseToGive = CardCatalog.RollDefuseVariant();
            }
            hand.Add(defuseToGive);

            state.Hands[p.Id] = hand;
            state.Alive[p.Id] = true;
            state.DiedAt[p.Id] = null;
            state.TurnsTaken[p.Id] = 0;
            state.CardsPlayed[p.Id] = 0;
        }

        // Step 3: shuffle the bomb-free + defuse-free deck.
        for (var i = state.Deck.Count - 1; i > 0; i--)
        {
            var j = Random.Shared.Next(i + 1);
            (state.Deck[i], state.Deck[j]) = (state.Deck[j], state.Deck[i]);
        }

        // Step 4: deal 4 cards to each player from the top of the shuffled
        // deck. Player count is small (3-7) so the 4-card deals can drain
        // 12-28 cards from the deck. The leftover defuse + N-1 bombs are
        // inserted AFTER dealing so every player has a fair distribution
        // and the dangerous cards live at draw-time only.
        foreach (var p in players)
        {
            for (var i = 0; i < 4 && state.Deck.Count > 0; i++)
            {
                state.Hands[p.Id].Add(state.Deck[0]);
                state.Deck.RemoveAt(0);
            }
        }

        // Step 5: insert all N-1 bombs at random positions into the remaining
        // deck. Anywhere means anywhere — top, bottom, clustered, solitary.
        foreach (var _ in bombs)
        {
            var pos = Random.Shared.Next(state.Deck.Count + 1); // 0..Count
            state.Deck.Insert(pos, CardCatalog.Bomb);
        }

        state.CurrentTurnMemberId = players[Random.Shared.Next(players.Count)].Id;
        state.TurnStartedAt = DateTime.UtcNow;
        // Turn order: shuffle a copy of the players list once. This is the
        // order we surface to clients ("Bạn sẽ đi thứ X").
        // IMPORTANT: we shuffle BEFORE picking the first player so that
        // CurrentTurnMemberId and TurnOrder[0] are always the same person.
        // Previously the code picked CurrentTurnMemberId first (from the
        // unshuffled list) then shuffled independently, causing the UI to
        // show "thứ 1" for a different player than the one who actually
        // goes first.
        state.TurnOrder = players.Select(p => p.Id).ToList();
        for (var i = state.TurnOrder.Count - 1; i > 0; i--)
        {
            var j = Random.Shared.Next(i + 1);
            (state.TurnOrder[i], state.TurnOrder[j]) = (state.TurnOrder[j], state.TurnOrder[i]);
        }
        state.CurrentTurnMemberId = state.TurnOrder[0];

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

        // Special case: Favor phase 2 — the TARGET (not the actor) is calling
        // PlayCardAsync to pick which card to give. The target does NOT have
        // to be the current turn player and does NOT need to actually hold
        // a Favor card. We skip BOTH turn + hand validation up front so the
        // favor target-pick flow doesn't trip the standard play-card guards.
        var isFavorTargetPhase2 = cardKey == CardCatalog.Favor
            && !string.IsNullOrEmpty(targetMemberId)
            && !string.IsNullOrEmpty(discardPickKey)
            && gs.PendingFavorPick is not null
            && gs.PendingFavorPick.TargetMemberId == memberId;

        // Standard Favor phase 2 with actor still has the card (legacy path
        // — kept for backward compat with any code that still calls this).
        var isFavorPhase2 = !isFavorTargetPhase2
            && cardKey == CardCatalog.Favor
            && !string.IsNullOrEmpty(targetMemberId)
            && !string.IsNullOrEmpty(discardPickKey);

        // B-5 fix: Combo phase 2 — player already spent combo cards in phase 1
        // (turn advanced, hand updated) and is now picking a target or card.
        // Skip hand validation so the combo cards don't need to still be in hand.
        var isComboPhase2 = CardCatalog.IsComboDefuse(cardKey)
            && (!string.IsNullOrEmpty(targetMemberId) || !string.IsNullOrEmpty(discardPickKey));

        // Standard play-card guards — NOT applied to the Favor target-pick
        // path. The Favor target isn't the current-turn player and may not
        // have any Favor card in hand (the actor already played it).
        if (!isFavorTargetPhase2)
        {
            if (gs.CurrentTurnMemberId != memberId)
                throw new DomainException("not_your_turn", "Chưa tới lượt của bạn.");
            if (gs.PendingAction is not null)
                throw new DomainException("action_pending", "Đang chờ phản ứng Nope.");
        }

        // The caller's hand is needed for every code path below — for the
        // target-pick call the caller's hand IS the target's hand (the one
        // they're choosing the gift FROM).
        var hand = gs.Hands.TryGetValue(memberId, out var hh) ? hh : new List<string>();

        if (!isFavorPhase2 && !isComboPhase2 && !isFavorTargetPhase2)
        {
            // Combo defuse variants are only playable as part of a combo (2/3/5).
            // If the client sends a combo card directly, detect the combo.
            if (CardCatalog.IsComboDefuse(cardKey))
            {
                var playerCount = gs.Alive.Values.Count(v => v);
                var combo = CardCatalog.DetectCombo(hand, playerCount);
                if (combo is null)
                {
                    throw new DomainException("combo_impossible",
                        "Cần ít nhất 2 lá combo giống nhau để dùng.");
                }
                // Fall through to ResolveComboAsync — do NOT call ValidateHandCard.
            }
            else
            {
                CardCatalog.ValidateHandCard(hand, cardKey);
            }
        }

        var result = new GameActionResult();

        switch (cardKey)
        {
            case CardCatalog.Attack:
                // Attack: the next player must draw 2 cards. We model this
                // as "AttackCounter = number of cards STILL TO DRAW on the
                // current turn's chain". Each draw decrements the counter
                // until it hits 0 and normal turn rotation resumes.
                //
                // Per spec:
                //   "người tiếp theo bắt buộc phải rút 2 lá bài".
                //   "nếu bạn đang bị người khác attack (tức bạn đang phải rút
                //    2 lá bài) bạn có thể dùng attack tiếp để cộng dồn attack
                //    cho người tiếp theo rút 3 lá bài".
                //
                // So a fresh attack sets counter = 2; chained attacks add 1
                // more draw per attack (already +1 from this turn, then +1
                // more carried over for the next player).
                if (gs.AttackCounter >= 1)
                {
                    // Mid-chain: actor's turn was extended via existing
                    // chain (they owed some draws to themselves or the next
                    // player). Add 1 more carry-over draw for the next
                    // player.
                    gs.AttackCounter += 1;
                }
                else
                {
                    // Standard case: 1 attack → next player draws 2.
                    gs.AttackCounter = 2;
                }
                RemoveFromHand(hand, CardCatalog.Attack);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                // B-1 fix: Attack is NOT Nope-able per spec.
                // Commit immediately — end current turn; next player draws N.
                AdvanceTurn(gs);
                result.Toast = "Tấn công! Đối phương phải rút nhiều lá.";
                break;

            case CardCatalog.Skip:
                RemoveFromHand(hand, CardCatalog.Skip);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                // B-2 fix: Skip is NOT Nope-able per spec.
                // Commit immediately — consume 1 draw from attack chain (if
                // any), end turn. The next player's chain (if AttackCounter
                // is still > 0) carries over.
                // Per spec: "nếu người tiếp theo dùng skip mà ko bị nope thì
                // người tiếp theo nữa sẽ phải bốc 2 lá bài". This is correct
                // behavior: skipping consumes one attack draw but doesn't
                // reset the chain — the attacked player just doesn't have to
                // do their full forced draw this turn.
                if (gs.AttackCounter > 0)
                {
                    gs.AttackCounter -= 1;
                    result.Toast = "Bỏ lượt (tiêu hao lượt tấn công).";
                }
                else
                {
                    result.Toast = "Bạn đã bỏ lượt.";
                }
                AdvanceTurn(gs);
                break;

            case CardCatalog.Favor:
                if (!isFavorTargetPhase2)
                {
                    // Phase 1: actor picks target. Apply the usual target
                    // validation.
                    if (string.IsNullOrEmpty(targetMemberId))
                        throw new DomainException("requires_target", "Lá Xin cần chọn đối thủ.");
                    if (!gs.Hands.ContainsKey(targetMemberId))
                        throw new DomainException("target_not_found", "Đối thủ không hợp lệ.");
                    if (!gs.Alive.GetValueOrDefault(targetMemberId))
                        throw new DomainException("target_dead", "Đối thủ đã bị loại.");

                    var tgtHand = gs.Hands[targetMemberId];
                    if (tgtHand.Count == 0)
                        throw new DomainException("target_empty", "Đối thủ không còn lá bài.");

                    // Spend the Favor card (it's committed). Open a 5s Nope
                    // window so other players can chain Cản. After the window
                    // resolves, the target picks which of their cards to give
                    // to the actor (per user-confirmed spec).
                    RemoveFromHand(hand, CardCatalog.Favor);

                    var shuffled = new List<string>(tgtHand);
                    for (var i = shuffled.Count - 1; i > 0; i--)
                    {
                        var j = Random.Shared.Next(i + 1);
                        (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
                    }
                    gs.PendingFavorPick = new PendingFavorPick
                    {
                        TargetMemberId = targetMemberId,
                        ShuffledCandidates = shuffled,
                        InitiatorId = memberId,
                    };
                    QueueNopeWindow(gs, memberId, CardCatalog.Favor);
                    result.Toast = "Đã Xin — đợi đối thủ chọn lá để đưa.";
                    CheckWinCondition(gs);
                    await PersistAsync(room.Id, gs, ct);
                    result.Room = (await _repository.GetByIdAsync(room.Id, ct))!;
                    return result;
                }

                // Phase 2 (target picks): the caller is the target member
                // and discardPickKey is the card they chose to give. Validate
                // it & hand it over to the Favor initiator.
                if (gs.PendingAction is not null)
                    throw new DomainException("action_pending", "Đang chờ phản ứng Nope.");
                var pendingFav = gs.PendingFavorPick;
                if (pendingFav is null)
                    throw new DomainException("no_pending_favor", "Không có Lá Xin nào đang chờ.");
                if (pendingFav.TargetMemberId != memberId)
                    throw new DomainException("not_favor_target", "Chỉ đối thủ được chọn mới có thể đưa lá.");
                var targetHand = gs.Hands.GetValueOrDefault(memberId);
                if (targetHand is null)
                    throw new DomainException("target_no_hand", "Tay của bạn không còn.");
                if (!targetHand.Contains(discardPickKey))
                    throw new DomainException("favor_card_gone", "Bạn không còn lá này.");
                targetHand.Remove(discardPickKey);
                var actorHand = gs.Hands.GetValueOrDefault(pendingFav.InitiatorId);
                // Defensive: if the actor was killed by another player in the
                // meantime, fall back to giving the card into the discard
                // pile so it isn't lost in limbo.
                if (actorHand is null)
                {
                    gs.DiscardPile.Add(discardPickKey);
                }
                else
                {
                    actorHand.Add(discardPickKey);
                }
                gs.PendingFavorPick = null;
                gs.CardsPlayed[pendingFav.InitiatorId] = gs.CardsPlayed.GetValueOrDefault(pendingFav.InitiatorId) + 1;
                gs.TurnsTaken[pendingFav.InitiatorId] = gs.TurnsTaken.GetValueOrDefault(pendingFav.InitiatorId) + 1;
                AdvanceTurn(gs);
                result.Toast = $"Đối thủ đã đưa 1 lá.";
                break;

            case CardCatalog.Future:
                RemoveFromHand(hand, CardCatalog.Future);
                gs.DiscardPile.Add(CardCatalog.Future);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.FuturePeek = gs.Deck.TakeLast(3).Reverse().ToList();
                result.FuturePeek = gs.FuturePeek;
                QueueNopeWindow(gs, memberId, CardCatalog.Future);
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
                // B-3 fix: Shuffle is NOT Nope-able per spec. Commit immediately.
                AdvanceTurn(gs);
                result.Toast = "Đã xáo lại bộ bài.";
                break;

            case CardCatalog.Nope:
                throw new DomainException("nope_direct_use", "Nope phải dùng trong 5s sau hành động của người khác.");

            default:
                // A combo defuse variant was played. Detect and execute the combo.
                // We already validated (in the pre-switch block) that a valid combo exists.
                var aliveCount = gs.Alive.Values.Count(v => v);
                var combo = CardCatalog.DetectCombo(hand, aliveCount) ?? comboKind;
                return await ResolveComboAsync(room, memberId, cardKey, combo ?? throw new DomainException("combo_impossible", "Cần ít nhất 2 lá giống nhau."), targetMemberId, discardPickKey, ct);
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
        var result = new GameActionResult();
        // Helper for spending combo cards. When playerCount < 5, combos are
        // "any 2 / any 3" (mixed types OK). When playerCount >= 5, the spec
        // wants same-type only (per the user-confirmed cascade: small games
        // can mix, large games revert to the strict same-type combo rule).
        var aliveCount = gs.Alive.Values.Count(v => v);
        var comboIsMix = aliveCount < 5;

        switch (combo)
        {
            case ComboKind.TwoSame:
                if (string.IsNullOrEmpty(targetMemberId))
                {
                    result.RequiresTargetPick = true;
                    // B-5 fix: show combo cinematic even though there's no Nope window.
                    SetComboCinematic(gs, memberId, cardKey);
                    // Persist so the cinematic state is visible to every
                    // viewer while the target picker is open.
                    CheckWinCondition(gs);
                    await PersistAsync(room.Id, gs, ct);
                    result.Room = (await _repository.GetByIdAsync(room.Id, ct))!;
                    return result; // client will retry
                }
                var t2 = gs.Hands.TryGetValue(targetMemberId, out var t2Hand) ? t2Hand : null;
                if (t2 is null || !gs.Alive.GetValueOrDefault(targetMemberId) || t2.Count == 0)
                {
                    // BUG-NEW: invalid target must still end the turn or the
                    // player gets stuck waiting on a turn that will never
                    // advance. Spend the combo and advance.
                    if (comboIsMix) SpendMixComboFromHand(hand, 2);
                    else SpendComboFromHand(hand, cardKey, 2);
                    gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                    gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                    AdvanceTurn(gs);
                    result.Toast = "Đối thủ không hợp lệ hoặc không còn bài.";
                    break;
                }
                // Phase 1: target chosen, now show the shuffled hand for the actor to pick.
                if (string.IsNullOrEmpty(discardPickKey))
                {
                    // Shuffle a copy for the actor to choose from. The actual hand
                    // stays untouched until the pick arrives.
                    var shuffled2 = t2.ToList();
                    for (var i = shuffled2.Count - 1; i > 0; i--)
                    {
                        var j = Random.Shared.Next(i + 1);
                        (shuffled2[i], shuffled2[j]) = (shuffled2[j], shuffled2[i]);
                    }
                    result.RequiresFavorPick = true;
                    result.FavorCandidates = shuffled2;
                    result.Toast = "Chọn 1 lá từ tay đối thủ.";
                    await PersistAsync(room.Id, gs, ct);
                    result.Room = (await _repository.GetByIdAsync(room.Id, ct))!;
                    return result;
                }
                // Phase 2: the actor picked discardPickKey from the shuffled list.
                // Validate it was in the target's hand at pick time.
                if (!t2.Contains(discardPickKey))
                    throw new DomainException("favor_card_gone", "Đối thủ không còn lá này.");
                if (comboIsMix) SpendMixComboFromHand(hand, 2);
                else SpendComboFromHand(hand, cardKey, 2);
                t2.Remove(discardPickKey);
                hand.Add(discardPickKey);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                // Combo 2-same is NOT Nope-able per game rules.
                AdvanceTurn(gs);
                result.Toast = "Lấy 1 lá từ tay đối thủ.";
                break;

            case ComboKind.ThreeSame:
                if (string.IsNullOrEmpty(targetMemberId))
                {
                    result.RequiresTargetPick = true;
                    // B-5 fix: show combo cinematic even though there's no Nope window.
                    SetComboCinematic(gs, memberId, cardKey);
                    return result;
                }
                var t3 = gs.Hands.TryGetValue(targetMemberId, out var t3Hand) ? t3Hand : null;
                if (t3 is null || !gs.Alive.GetValueOrDefault(targetMemberId))
                {
                    // BUG-NEW: invalid target must still end the turn.
                    if (comboIsMix) SpendMixComboFromHand(hand, 3);
                    else SpendComboFromHand(hand, cardKey, 3);
                    gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                    gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                    AdvanceTurn(gs);
                    result.Toast = "Đối thủ không hợp lệ.";
                    break;
                }
                // Phase 1: show the catalogue for the actor to name a card.
                // Per the user-confirmed spec, combo 3 lets the actor name
                // ANY card from the basic Exploding Kittens folder EXCEPT
                // the face-down back card and the bomb. Defuse is on the
                // table — including the 5 combo defuse variants — so the
                // actor can specifically request a defuse if they want.
                if (string.IsNullOrEmpty(discardPickKey))
                {
                    result.RequiresDiscardPick = true;
                    result.FavorCandidates = CardCatalog.PublicCardKeys
                        .Where(k => k != CardCatalog.Bomb && k != "back")
                        .ToList();
                    result.Toast = "Chọn 1 lá để yêu cầu đối thủ đưa.";
                    // B-5 fix: show combo cinematic even though there's no Nope window.
                    SetComboCinematic(gs, memberId, cardKey);
                    // Persist phase-1 state so the actor's hand count and the
                    // target pick selection are visible to all viewers while
                    // the picker modal is open.
                    CheckWinCondition(gs);
                    await PersistAsync(room.Id, gs, ct);
                    result.Room = (await _repository.GetByIdAsync(room.Id, ct))!;
                    return result;
                }
                // Phase 2: actor named discardPickKey. Resolve server-side.
                // B-4 fix: if target HAS the named card → steal it. Otherwise → combo invalid.
                if (comboIsMix) SpendMixComboFromHand(hand, 3);
                else SpendComboFromHand(hand, cardKey, 3);
                if (t3.Count > 0 && t3.Contains(discardPickKey))
                {
                    // Actor named a card that the target has → steal it.
                    t3.Remove(discardPickKey);
                    hand.Add(discardPickKey);
                    result.Toast = $"Đối thủ có lá — nhận được {CardCatalog.Names.GetValueOrDefault(discardPickKey, discardPickKey)}.";
                }
                else
                {
                    // Actor named a card the target doesn't have → combo invalid.
                    result.Toast = $"Đối thủ không có lá '{CardCatalog.Names.GetValueOrDefault(discardPickKey, discardPickKey)}' — combo vô hiệu.";
                }
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                // Combo 3-same is NOT Nope-able.
                AdvanceTurn(gs);
                break;

            case ComboKind.FiveAny:
                if (string.IsNullOrEmpty(discardPickKey))
                {
                    // Phase 1: show available cards in the discard pile.
                    var discardCandidates = gs.DiscardPile
                        .Distinct()
                        .Where(k => k != "bomb" && k != "back")
                        .ToList();
                if (discardCandidates.Count == 0)
                {
                    // BUG-NEW: empty discard pile must still end the turn.
                    SpendAnyComboFromHand(hand, 5);
                    gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                    gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                    AdvanceTurn(gs);
                    result.Toast = "Chồng bỏ trống — chưa có lá bài nào để lấy.";
                    break;
                }
                    result.RequiresDiscardPick = true;
                    result.FavorCandidates = discardCandidates;
                    result.Toast = "Chọn 1 lá đã được đánh để lấy lại.";
                    // Combo 5 is NOT Nope-able but we still need to persist
                    // the state so the actor's reduced hand count is visible
                    // to all viewers while the picker modal is open.
                    CheckWinCondition(gs);
                    await PersistAsync(room.Id, gs, ct);
                    result.Room = (await _repository.GetByIdAsync(room.Id, ct))!;
                    return result;
                }
                // Phase 2: player picked a card.
                if (!gs.DiscardPile.Contains(discardPickKey))
                {
                    // The card disappeared from the discard pile between
                    // phase 1 and phase 2 (e.g. someone nope'd a different
                    // action). End the turn anyway so the player isn't stuck.
                    SpendAnyComboFromHand(hand, 5);
                    gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                    gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                    AdvanceTurn(gs);
                    result.Toast = "Lá bài không còn trong chồng bỏ.";
                    break;
                }
                SpendAnyComboFromHand(hand, 5);
                gs.DiscardPile.Remove(discardPickKey);
                hand.Add(discardPickKey);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                // Combo 5-any is NOT Nope-able.
                AdvanceTurn(gs);
                result.Toast = "Lấy 1 lá từ chồng bỏ.";
                break;
        }

        CheckWinCondition(gs);
        await PersistAsync(room.Id, gs, ct);
        result.Room = (await _repository.GetByIdAsync(room.Id, ct))!;
        return result;
    }

    // ──────────────────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────────
    //  Cancel pending combo target pick
    //
    //  BUG-NEW: The 2-same and 3-same combo flows return RequiresTargetPick
    //  on phase 1 WITHOUT removing the combo cards from the actor's hand or
    //  advancing the turn. If the user clicks Cancel on the target picker,
    //  they're left holding the turn with the combo cinematic still queued.
    //  This endpoint lets the client force-finish the action: drop the
    //  pending cinematic, spend the combo cards anyway, and advance.
    //  ──────────────────────────────────────────────────────────────────

    public async Task<GameActionResult> CancelPendingActionAsync(
        string roomId, string memberId, string cardKey, ComboKind comboKind,
        CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;

        if (gs.CurrentTurnMemberId != memberId)
            throw new DomainException("not_your_turn", "Chưa tới lượt của bạn.");
        if (!gs.Alive.GetValueOrDefault(memberId))
            throw new DomainException("already_dead", "Bạn đã không còn trong trò chơi.");

        var hand = gs.Hands.TryGetValue(memberId, out var h) ? h : new List<string>();

        // Favor is special: it was already removed from hand on phase 1, we
        // just need to drop the pending pick, end the turn, and treat the
        // card as spent (no card-back to hand).
        if (cardKey == CardCatalog.Favor)
        {
            gs.PendingFavorPick = null;
            if (gs.PendingAction is not null && gs.PendingAction.CardKey == CardCatalog.Favor)
            {
                gs.PendingAction = null;
            }
            gs.LastPlayedCardKey = null;
            gs.LastPlayedBy = null;
            gs.LastPlayedAt = null;
            gs.LastPlayedByNope = null;
            gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
            gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
            AdvanceTurn(gs);
            var favResult = new GameActionResult { Toast = "Đã hủy Xin." };
            CheckWinCondition(gs);
            await PersistAsync(room.Id, gs, ct);
            favResult.Room = (await _repository.GetByIdAsync(room.Id, ct))!;
            return favResult;
        }

        if (!CardCatalog.IsComboDefuse(cardKey))
            throw new DomainException("not_combo", "Chỉ hủy được combo.");

        var cost = comboKind switch
        {
            ComboKind.TwoSame => 2,
            ComboKind.ThreeSame => 3,
            ComboKind.FiveAny => 5,
            _ => 0,
        };
        if (cost == 0)
            throw new DomainException("invalid_combo", "Loại combo không hợp lệ.");

        var have = hand.Count(c => comboKind == ComboKind.FiveAny
            ? CardCatalog.IsComboDefuse(c)
            : c == cardKey);
        if (have < cost)
            throw new DomainException("not_enough_combo_cards", "Không đủ lá combo.");

        if (comboKind == ComboKind.FiveAny)
        {
            SpendAnyComboFromHand(hand, cost);
        }
        else
        {
            SpendComboFromHand(hand, cardKey, cost);
        }

        gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
        gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;

        // Clear the queued cinematic so other players see the action as resolved.
        gs.LastPlayedCardKey = null;
        gs.LastPlayedBy = null;
        gs.LastPlayedAt = null;
        gs.LastPlayedByNope = null;

        // Clear combo cinematic if any (Phase 1 set LastPlayedCardKey without
        // an active PendingAction; we wipe it so other players don't see a
        // dangling "X played Y" overlay after we cancel).
        gs.LastPlayedByNope = null;

        AdvanceTurn(gs);

        var result = new GameActionResult
        {
            Toast = "Đã hủy combo.",
        };
        CheckWinCondition(gs);
        await PersistAsync(room.Id, gs, ct);
        result.Room = (await _repository.GetByIdAsync(room.Id, ct))!;
        return result;
    }

    //  Concede
    // ──────────────────────────────────────────────────────────────────

    public async Task<GameActionResult> ConcedeAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;

        if (!gs.Alive.GetValueOrDefault(memberId))
            throw new DomainException("already_dead", "Bạn đã không còn trong trò chơi.");

        // If this player currently holds the turn, move it forward BEFORE
        // removing them so AdvanceTurn skips them naturally.
        var wasCurrentTurn = gs.CurrentTurnMemberId == memberId;

        gs.Alive[memberId] = false;
        gs.DiedAt[memberId] = DateTime.UtcNow;

        // Move the conceded player's hand to the discard pile so their cards
        // remain in circulation (they just can't be used anymore).
        if (gs.Hands.TryGetValue(memberId, out var hand))
        {
            gs.DiscardPile.AddRange(hand);
            gs.Hands.Remove(memberId);
        }
        // Clear per-player counters so stale entries don't leak into the DTO.
        gs.TurnsTaken.Remove(memberId);
        gs.CardsPlayed.Remove(memberId);

        // Clean up any pending picker state that referenced this player so
        // the modal doesn't keep showing stale candidates after they leave.
        if (gs.PendingFavorPick is not null &&
            (gs.PendingFavorPick.TargetMemberId == memberId ||
             gs.PendingFavorPick.InitiatorId == memberId))
        {
            gs.PendingFavorPick = null;
        }

        if (wasCurrentTurn) AdvanceTurn(gs);

        CheckWinCondition(gs);

        // Persist game-state first, then remove the member from room.Members
        // so the lobby stops showing a dead player.
        await _repository.UpdateGameStateAsync(room.Id, gs,
            gs.EndedAt is null ? null : Domain.Enums.RoomStatus.Finished, ct);

        var updated = await _repository.RemoveMemberAsync(room.Id, memberId, ct);
        var finalRoom = updated ?? (await _repository.GetByIdAsync(room.Id, ct)) ?? room;
        // If RemoveMemberAsync didn't touch gameState (in-memory impls may not
        // copy it back), graft the up-to-date gameState on.
        finalRoom.GameState ??= gs;

        // Re-arm the turn clock for the next player (PersistAsync is the
        // canonical place that wires up the background timer).
        await PersistAsync(room.Id, finalRoom.GameState!, ct);
        finalRoom = (await _repository.GetByIdAsync(room.Id, ct)) ?? finalRoom;

        return new GameActionResult
        {
            Room = finalRoom,
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

        // AttackCounter-driven multi-draw: when an Attack card is played, the
        // next player must draw 2 cards instead of 1. The player's UI shows a
        // "Bạn phải rút 2 lá" hint and after the first draw they auto-prompt
        // for the next one. If the player has a Skip card, they can play it
        // (consume one draw) instead of drawing cards.
        if (gs.AttackCounter > 0)
        {
            return await DrawMultipleAsync(roomId, gs, memberId, gs.AttackCounter, ct);
        }

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
                // Treat BOTH the base "defuse" key and the 5 combo variants
                // as defuse-class cards. The player's starting hand may be
                // either type depending on how the dealing protocol rolled.
                if (hand[i] == CardCatalog.Defuse || CardCatalog.IsComboDefuse(hand[i]))
                {
                    defuseIdx = i;
                    break;
                }
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
            // Move the dead player's hand to the discard pile so the cards
            // aren't floating in limbo, and advance the turn so the next
            // alive player actually gets the clock. Without AdvanceTurn here
            // the dead player would keep "holding" the turn forever and
            // TurnClockService would just keep auto-drawing into their hand.
            if (gs.Hands.TryGetValue(memberId, out var deadHand))
            {
                gs.DiscardPile.AddRange(deadHand);
                gs.Hands.Remove(memberId);
            }
            gs.TurnsTaken.Remove(memberId);
            gs.CardsPlayed.Remove(memberId);
            AdvanceTurn(gs);
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

    /// <summary>
    /// Helper for the Attack chain: the player must draw <paramref name="remaining"/>
    /// cards. We draw them one at a time so the bomb-reveal animation can fire
    /// per draw. After each draw, if the player drew a bomb and they have a
    /// defuse, we stop and return to the defuse flow. If the deck runs out
    /// mid-chain, we stop and advance the turn.
    /// </summary>
    private async Task<GameActionResult> DrawMultipleAsync(string roomId, GameState gs, string memberId, int remaining, CancellationToken ct)
    {
        if (remaining <= 0 || gs.Deck.Count == 0)
        {
            // Out of cards or no more draws required — end the chain.
            gs.AttackCounter = 0;
            gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
            AdvanceTurn(gs);
            CheckWinCondition(gs);
            await PersistAsync(roomId, gs, ct);
            return new GameActionResult
            {
                Room = (await _repository.GetByIdAsync(roomId, ct))!,
                Toast = "Hết bài — lượt kết thúc.",
            };
        }

        var drawn = gs.Deck[^1];
        gs.Deck.RemoveAt(gs.Deck.Count - 1);
        var hand = gs.Hands[memberId];
        var result = new GameActionResult { DrawnCardKey = drawn };

        // Broadcast for cinematic overlay
        gs.LastDrawnBy = memberId;
        gs.LastDrawnCardKey = drawn;
        gs.LastDrawnAt = DateTime.UtcNow;
        gs.BombRevealActive = drawn == CardCatalog.Bomb;

        if (drawn == CardCatalog.Bomb)
        {
            var defuseIdx = -1;
            for (var i = 0; i < hand.Count; i++)
            {
                if (hand[i] == CardCatalog.Defuse || CardCatalog.IsComboDefuse(hand[i]))
                {
                    defuseIdx = i;
                    break;
                }
            }
            if (defuseIdx >= 0)
            {
                // Consume the chain — defusing the bomb ends the player's turn.
                gs.AttackCounter = 0;
                result.RequiresDefuse = true;
                result.Toast = $"Rút trúng bom trong lượt tấn công — hãy chọn vị trí đặt lại.";
                await PersistAsync(roomId, gs, ct);
                result.Room = (await _repository.GetByIdAsync(roomId, ct))!;
                return result;
            }
            // No defuse → die. Bomb goes to discard pile, attack chain ends.
            gs.Alive[memberId] = false;
            gs.DiedAt[memberId] = DateTime.UtcNow;
            gs.AttackCounter = 0;
            // Move the dead player's hand to the discard pile so the cards
            // aren't floating in limbo, and advance the turn so the next
            // alive player actually gets the clock.
            if (gs.Hands.TryGetValue(memberId, out var deadHand2))
            {
                gs.DiscardPile.AddRange(deadHand2);
                gs.Hands.Remove(memberId);
            }
            gs.TurnsTaken.Remove(memberId);
            gs.CardsPlayed.Remove(memberId);
            AdvanceTurn(gs);
            result.Toast = "Bạn đã chết.";
        }
        else
        {
            hand.Add(drawn);
            gs.AttackCounter -= 1;
            if (gs.AttackCounter > 0)
            {
                // More draws required — leave the turn on this player.
                result.Toast = $"Rút được: {CardCatalog.Names.GetValueOrDefault(drawn, drawn)}. Còn {gs.AttackCounter} lá phải rút.";
                result.RequiresMoreDraws = true;
                result.RemainingDraws = gs.AttackCounter;
                await PersistAsync(roomId, gs, ct);
                result.Room = (await _repository.GetByIdAsync(roomId, ct))!;
                return result;
            }
            // Chain finished — advance turn normally.
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
            if (hand[i] == CardCatalog.Defuse || CardCatalog.IsComboDefuse(hand[i]))
            {
                defuseIdx = i;
                break;
            }
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
            // If the cancelled action was a Favor, clear the pending pick too
            // so the modal doesn't keep showing stale candidates.
            if (pending.CardKey == CardCatalog.Favor)
            {
                gs.PendingFavorPick = null;
            }
            // If the cancelled action was a Future, clear any peek state
            // set by QueueNopeWindow / the original Future play so the
            // local UI doesn't auto-open a stale peek modal on reconnect.
            if (pending.CardKey == CardCatalog.Future)
            {
                gs.FuturePeek = null;
            }
            gs.PendingAction = null;
            // Action resolved (cancelled) — clear cinematic.
            ClearActionCinematic(gs);
            // NOTE: Nope is a ZERO-turn action — the player who played Nope
            // did NOT spend their turn. The initiator also did NOT spend their
            // turn (the card effect never resolved). So we do NOT call
            // AdvanceTurn here. The initiator stays at their current turn and
            // the Nope player stays at theirs. The Nope card itself was
            // consumed from their hand but neither player's turn count advances.
        }

        CheckWinCondition(gs);
        await PersistAsync(roomId, gs, ct);
        return new GameActionResult
        {
            Room = (await _repository.GetByIdAsync(roomId, ct))!,
            Toast = pending.NopeChain.Count % 2 == 1 ? "Hành động đã bị cản." : "Bạn đã cản, chờ phản ứng.",
        };
    }

    /// <summary>
    /// When a Nope chain resolves (cancelled or committed), the original
    /// action's card is now in the discard pile — per the user-confirmed
    /// spec the card does NOT bounce back to the initiator's hand. For
    /// combo cards we only spent the visible 2 copies (the canonical
    /// "minimum" combo size); if the original play was 3-same or 5-any,
    /// we put those 2 cards into the discard and let the remaining copies
    /// stay in the initiator's hand.
    /// </summary>
    private static void RefundInitiatorCard(GameState gs, PendingAction pending)
    {
        var card = pending.CardKey;
        var refundCount = CardCatalog.IsComboDefuse(card) ? 2 : 1;
        for (var i = 0; i < refundCount; i++) gs.DiscardPile.Add(card);
    }

    /// <summary>
    /// Background hook: the Nope window for <paramref name="roomId"/> expired
    /// without any player chaining a Nope (or the chain ended on an EVEN
    /// length, which is impossible from this code path but guarded against).
    /// We commit the original action: Skip/Attack advance turn (Attack also
    /// adds to the attack counter), Future/Future peek is preserved, Shuffle
    /// already ran the shuffle on play. Then we clear PendingAction and
    /// advance the turn if it hasn't been already.
    /// </summary>
    public async Task<GameActionResult> ResolveExpiredNopeAsync(string roomId, CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;
        var pending = gs.PendingAction;
        if (pending is null) return new GameActionResult { Room = room };

        // Edge case: if the chain ended on an odd number (i.e. someone noped
        // and the action was cancelled), the ChainNopeAsync already cleared
        // PendingAction. Nothing to do.
        var initiatorHand = gs.Hands.TryGetValue(pending.InitiatorId, out var h) ? h : null;
        if (initiatorHand is null)
        {
            gs.PendingAction = null;
            ClearActionCinematic(gs);
            await PersistAsync(roomId, gs, ct);
            return new GameActionResult { Room = (await _repository.GetByIdAsync(roomId, ct))! };
        }

        // Commit the original action's effect — for the cards that take
        // effect immediately we already removed them from hand on play; for
        // the cards that ADVANCE the turn conditionally (Skip during Attack,
        // Skip alone) the logic in PlayCardAsync already ran BEFORE the Nope
        // window opened. So nothing further to do except clear the window
        // and make sure the next turn's clock is armed.
        gs.PendingAction = null;
        ClearActionCinematic(gs);

        // For Favor, the card was removed from hand and the Nope window
        // opened, but the player still needs to pick which card to take.
        // Don't advance the turn yet — the actor will call PlayCardAsync
        // again with the discardPickKey set, which will execute the swap
        // and advance the turn at that point.
        if (pending.CardKey == CardCatalog.Favor && gs.PendingFavorPick is not null)
        {
            CheckWinCondition(gs);
            await PersistAsync(roomId, gs, ct);
            return new GameActionResult
            {
                Room = (await _repository.GetByIdAsync(roomId, ct))!,
                Toast = $"Hết thời gian cản — chọn 1 lá để lấy từ đối thủ.",
            };
        }

        // Advance the turn so the initiator's turn actually ends and the
        // next player is on the clock.
        // AdvanceTurn only resets TurnStartedAt when the attack chain isn't
        // active. For Attack + Skip chains the prior turn's TurnStartedAt is
        // intentionally preserved — the attacked player must draw all their
        // attack cards inside the original 60s window. We mirror that here:
        // capture whether we're starting a fresh attack chain BEFORE the
        // decrement and skip the explicit reset in that case.
        var startingAttackChain = gs.AttackCounter > 0;
        AdvanceTurn(gs);
        if (gs.EndedAt is null && gs.TurnStartedAt is not null && !startingAttackChain)
        {
            gs.TurnStartedAt = DateTime.UtcNow;
        }
        CheckWinCondition(gs);
        await PersistAsync(roomId, gs, ct);
        return new GameActionResult
        {
            Room = (await _repository.GetByIdAsync(roomId, ct))!,
            Toast = $"Hết thời gian cản — {CardCatalog.Names.GetValueOrDefault(pending.CardKey, pending.CardKey)} đã có hiệu lực.",
        };
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
        // Turn clock: while the game is live and the nope window is closed,
        // the current player is on the clock. While PendingAction is set we
        // leave the entry untouched so a chain-Nope timeout doesn't draw on
        // behalf of a player whose action is still being decided on.
        if (gs.EndedAt is not null)
        {
            _turnClock.Unregister(roomId);
            _nopeWindow.Unregister(roomId);
        }
        else if (gs.PendingAction is not null)
        {
            // Nope window is open — track so the background service can
            // auto-resolve it after 3s. While pending we don't arm the
            // turn clock (the original action's effect hasn't been
            // committed yet, so the next turn player isn't on the clock).
            _turnClock.Unregister(roomId);
            _nopeWindow.Register(roomId, gs.PendingAction.CreatedAt);
        }
        else if (gs.BombRevealActive && gs.LastDrawnBy is not null && gs.Alive.GetValueOrDefault(gs.LastDrawnBy))
        {
            // Bomb was drawn and the player still has a chance to defuse.
            // Per the user-confirmed spec ("riêng lá bom, vì sau khi ấn bốc
            // là hết thời gian đếm của player rồi, nên nếu bốc trúng bom,
            // thời gian defause sẽ là thời gian hệ thống, ko tính vào thời
            // gian của player"), we pause the player's turn clock for the
            // system-driven defuse modal — the 3s bomb reveal + the slot
            // picker is its own internal timer, not the player's. Once the
            // defuse resolves (BombRevealActive=false) PersistAsync will
            // re-register the clock.
            _turnClock.Unregister(roomId);
        }
        else if (gs.TurnStartedAt is not null)
        {
            _nopeWindow.Unregister(roomId);
            _turnClock.Register(roomId, gs.TurnStartedAt.Value);
        }
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

    private static void QueueNopeWindow(GameState gs, string initiatorId, string cardKey)
    {
        gs.PendingAction = new PendingAction
        {
            InitiatorId = initiatorId,
            CardKey = cardKey,
            CreatedAt = DateTime.UtcNow,
            NopeChain = new List<string>(),
        };
        // Cinematic: surface the played card for everyone.
        gs.LastPlayedBy = initiatorId;
        gs.LastPlayedCardKey = cardKey;
        gs.LastPlayedAt = DateTime.UtcNow;
        gs.LastPlayedByNope = null;
    }

    // B-5 fix: set cinematic for combo cards (not Nope-able) so everyone sees the
    // combo animation on screen even though no Nope window is opened.
    private static void SetComboCinematic(GameState gs, string initiatorId, string cardKey)
    {
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

    /// <summary>
    /// Spend <paramref name="count"/> copies of <paramref name="key"/> from
    /// the hand. Used for same-type combos (e.g. 3 ninja + 1 target when N>=5).
    /// </summary>
    private static void SpendComboFromHand(List<string> hand, string key, int count)
    {
        for (var i = 0; i < count; i++) hand.Remove(key);
    }

    /// <summary>
    /// Spend <paramref name="count"/> combo cards (any types) from the hand.
    /// Used for mix-type combos (any 2 / any 3 combo cards when N&lt;5).
    /// </summary>
    private static void SpendMixComboFromHand(List<string> hand, int count)
    {
        var removed = 0;
        for (var i = hand.Count - 1; i >= 0 && removed < count; i--)
        {
            if (CardCatalog.IsComboDefuse(hand[i])) { hand.RemoveAt(i); removed++; }
        }
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
        // Move the current-turn pointer forward over alive players only.
        // AttackCounter is decremented separately (at draw / skip time) —
        // NOT here, because the attacked player still has draws to take on
        // their turn before the regular rotation resumes.
        var currentIdx = aliveIds.IndexOf(gs.CurrentTurnMemberId);
        if (currentIdx < 0)
        {
            gs.CurrentTurnMemberId = aliveIds[0];
        }
        else
        {
            // Skip dead members when rotating, but AttackCounter handles its
            // own budget per draw instead of per turn-skip.
            var nextIdx = (currentIdx + 1) % aliveIds.Count;
            gs.CurrentTurnMemberId = aliveIds[nextIdx];
        }
        gs.TurnStartedAt = DateTime.UtcNow;
        // Clear the FuturePeek visual field so stale peek results don't linger
        // across turn boundaries.
        gs.FuturePeek = null;
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
            // Everyone is dead (e.g. last survivor conceded). No real winner —
            // leave WinnerId null so the UI can show "no winner" instead of
            // crowning the last player who just gave up.
            gs.EndedAt = DateTime.UtcNow;
        }
        // Wipe stale cinematic/peek state on game end so reconnecting players
        // don't see leftover overlays.
        if (gs.EndedAt is not null)
        {
            gs.FuturePeek = null;
        }
    }
}
