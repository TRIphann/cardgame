using Arcana.Application.Abstractions;
using Arcana.Application.Game;
using Arcana.Domain.Common;
using Arcana.Domain.Entities;
using Arcana.Domain.Enums;
using Arcana.Domain.Repositories;

namespace Arcana.Application.Services;

public class GameService(
    IRoomRepository repository,
    ITestRoomRepository? testRepository,
    IGameBroadcaster broadcaster,
    ITurnClockRegistry turnClock,
    INopeWindowRegistry nopeWindow,
    IFuturePeekRegistry futurePeek)
{
    // ──────────────────────────────────────────────────────────────
    // Unified 10-second timer rule
    // ──────────────────────────────────────────────────────────────
    // Every player gets 10 seconds to act. Every committed action (draw,
    // play card, defuse, advance-turn, etc.) resets the timer back to 10.
    // The same 10s budget applies to every picker that opens during the
    // action (Future peek, Nope chain, Favor target/card, Combo 2/3
    // target/card, Bomb placement) so the rule is uniform across every
    // lobby. Constants are kept public so other services (TurnClock,
    // TestController, GamePage) can mirror them without duplicating the
    // magic number in 6+ places.
    // ──────────────────────────────────────────────────────────────
    /// <summary>Per-turn budget. Mirrors <see cref="TurnClockService.TurnTimeLimitSeconds"/>.</summary>
    public const int TurnTimeLimitSeconds = 10;

    /// <summary>Nope chain window after every action card (Attack/Skip/Shuffle/Favor/Future).</summary>
    public const int NopeWindowSeconds = 10;

    /// <summary>Future peek lifetime (auto-close + reset parent timer).</summary>
    public const int FuturePeekSeconds = 10;

    /// <summary>Favor / Combo picker (target + card) timeout. Auto-picks random card on expiry.</summary>
    public const int PickerTimeoutSeconds = 10;

    /// <summary>Defuse → place Bomb timeout. Auto-places Bomb at random slot on expiry.</summary>
    public const int BombPlacementTimeoutSeconds = 10;

    private static readonly TimeSpan FuturePeekLifetime = TimeSpan.FromSeconds(FuturePeekSeconds);

    private readonly IRoomRepository _repository = repository;
    private readonly ITestRoomRepository? _testRepository = testRepository;
    private readonly IGameBroadcaster _broadcaster = broadcaster;
    private readonly ITurnClockRegistry _turnClock = turnClock;
    private readonly INopeWindowRegistry _nopeWindow = nopeWindow;
    private readonly IFuturePeekRegistry _futurePeek = futurePeek;

    public GameService(
        IRoomRepository repository,
        IGameBroadcaster broadcaster,
        ITurnClockRegistry turnClock,
        INopeWindowRegistry nopeWindow,
        IFuturePeekRegistry futurePeek)
        : this(repository, null, broadcaster, turnClock, nopeWindow, futurePeek)
    {
    }

    /// <summary>
    /// Gets the appropriate repository for the given room ID.
    /// If a test repository is available and the room exists there, use it.
    /// Otherwise, falls back to the standard repository.
    /// </summary>
    private async Task<Room?> GetRoomAsync(string roomId, CancellationToken ct)
    {
        if (_testRepository != null)
        {
            var testRoom = await _testRepository.GetByIdAsync(roomId, ct);
            if (testRoom != null) return testRoom;
        }
        return await _repository.GetByIdAsync(roomId, ct);
    }

    /// <summary>
    /// Gets the primary repository for write operations.
    /// Uses the test repo only if the room actually lives there — production
    /// rooms should never be written to the in-memory test repo (their state
    /// would be lost on restart). When the test repo doesn't have the room,
    /// falls through to the production repo so production-room writes work.
    /// </summary>
    private async Task<IRoomRepository> ResolveWriteRepositoryAsync(string roomId, CancellationToken ct)
    {
        if (_testRepository != null)
        {
            var testRoom = await _testRepository.GetByIdAsync(roomId, ct);
            if (testRoom != null) return _testRepository;
        }
        return _repository;
    }

    // ──────────────────────────────────────────────────────────────────
    //  Start / rotate
    // ──────────────────────────────────────────────────────────────────

    public async Task<Room> StartGameAsync(
        string roomId,
        string hostId,
        Dictionary<string, List<string>>? customHands = null,
        string? firstPlayerId = null,
        List<string>? customDeck = null,
        bool dealCards = true,
        HashSet<string>? drawOnlyBotIds = null,
        HashSet<string>? playCardsBotIds = null,
        Dictionary<string, string>? oneCardBotCardMap = null,
        bool disableBotService = false,
        int botTurnSeconds = 5,
        CancellationToken ct = default)
    {
        var room = await GetRoomAsync(roomId, ct)
            ?? throw new DomainException("room_not_found", "Phòng không tồn tại.");

        // Cap the bot turn delay. The Test Lobby UI clamps the slider to 30s
        // and the docs promise "Max = 30s" — but the API accepted any value,
        // so a client (or a hand-written test) could park a bot for minutes
        // and stall the whole table. Clamp server-side so the guarantee holds
        // no matter who calls the endpoint.
        const int MaxBotTurnSeconds = 30;
        if (botTurnSeconds < 0) botTurnSeconds = 0;
        if (botTurnSeconds > MaxBotTurnSeconds) botTurnSeconds = MaxBotTurnSeconds;

        if (!string.Equals(room.HostId, hostId, StringComparison.Ordinal))
            throw new DomainException("not_host", "Chỉ chủ phòng mới có thể bắt đầu.");

        if (room.Status != RoomStatus.Waiting)
            throw new DomainException("game_already_started", "Ván chơi đã bắt đầu hoặc kết thúc.");

        var players = room.Members.ToList();
        if (players.Count < 3)
            throw new DomainException("cannot_start", "Cần ít nhất 3 người chơi để bắt đầu.");

        // Deck: use customDeck if provided, otherwise build from CardCatalog.
        var deck = customDeck != null && customDeck.Count > 0
            ? new List<string>(customDeck)
            : CardCatalog.BuildDeck(players.Count);

        var state = new GameState
        {
            Deck = deck,
            StartedAt = DateTime.UtcNow,
            DrawOnlyBotIds = drawOnlyBotIds ?? [],
            PlayCardsBotIds = playCardsBotIds ?? [],
            // FIX: OneCardBotCardMap was never assigned here, so the whole
            // "play one specific card" bot mode was silently dropped on
            // game start: the map came back empty from the API and the
            // BotService saw isOneCardBot=false on every tick, degrading
            // the bot to plain "draw only".
            OneCardBotCardMap = oneCardBotCardMap != null
                ? new Dictionary<string, string>(oneCardBotCardMap)
                : [],
            DisableBotService = disableBotService,
            BotTurnSeconds = botTurnSeconds,
            // Explicitly reset AFK, cinematic state, AND the client-ready gate. A new
            // game should NOT inherit AFK flags from a previous round (would
            // otherwise keep the AFK modal pinned on a player who just
            // started fresh), should NOT carry over any leftover cinematic
            // overlay the previous game left dangling, AND should NOT have
            // its turn clock already armed. The clock is armed by the first
            // human client calling /api/rooms/{id}/ready, AFTER the UI has
            // finished rendering — otherwise the 10s window burns down
            // during the lobby→game navigation.
            AfkMemberIds = [],
            BombRevealActive = false,
            ClientReady = false,
            LastDrawnBy = null,
            LastDrawnCardKey = null,
            LastDrawnAt = null,
            LastPlayedCardKey = null,
            LastPlayedBy = null,
            LastPlayedAt = null,
            LastPlayedByNope = null,
            PendingAction = null,
            PendingFavorPick = null,
            FuturePeek = null,
            FuturePeekAt = null,
        };

        // ── Dealing protocol (per user-confirmed spec) ────────────────────
        //
        // When dealCards=true (normal mode):
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
        // When dealCards=false (test mode / empty hands):
        //   - No dealing is done. Hands start empty. Bombs are NOT inserted
        //     unless customDeck contains them (so testers can place bombs
        //     manually via customDeck if desired).
        //
        // Result (normal): every player starts with exactly one defuse, NO bombs dealt,
        // exactly 1 player can dodge every bomb and win.

        static bool IsDefuseClass(string key) =>
            key == CardCatalog.Defuse || CardCatalog.IsComboDefuse(key);

        // Bombs are NEVER dealt into a hand — they only ever live in the deck.
        //
        // We pull them out before shuffling/dealing and stash the count in
        // `stashBombs`; they are re-inserted into the deck once the hands are
        // dealt (see the re-insert block further down).
        //
        // This has to run for EVERY normal (dealCards=true) flow, not only the
        // custom-deck one. Previously the extraction was gated behind
        // `customDeck != null`, so in an ordinary game the shuffle could deal
        // a bomb straight into a player's hand. That is a dead card the player
        // can never play AND a bomb that is silently missing from the deck —
        // breaking the "N-1 bombs, exactly one player can dodge them all"
        // guarantee the whole design rests on.
        //
        // NOTE: with `dealCards=false` (the Test Lobby "custom deck" mode)
        // we must NOT touch the bombs at all — the tester placed them at
        // specific slots on purpose, and the deck order is pinned.
        var stashBombs = 0;
        if (dealCards)
        {
            for (var i = state.Deck.Count - 1; i >= 0; i--)
            {
                if (state.Deck[i] == CardCatalog.Bomb)
                {
                    state.Deck.RemoveAt(i);
                    stashBombs++;
                }
            }
        }

        // When dealCards=true, first give each player 1 defuse card.
        // Then we'll either:
        // - Deal 4 random cards to players NOT in customHands
        // - Apply custom hand to players IN customHands
        foreach (var p in players)
        {
            var hand = new List<string>();

            if (dealCards)
            {
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
                    defuseToGive = CardCatalog.RollDefuseVariant();
                }
                hand.Add(defuseToGive);
            }

            state.Hands[p.Id] = hand;
            state.Alive[p.Id] = true;
            state.DiedAt[p.Id] = null;
            state.TurnsTaken[p.Id] = 0;
            state.CardsPlayed[p.Id] = 0;
        }

        // ── Draw 4 random cards per player ────────────────────────────
        //
        // The 4-card deal must SKIP defuse-class cards: every player already
        // got exactly one defuse in the loop above, and the protocol says
        // "each player ends up with exactly 1 cứu + 4 random action cards".
        // Dealing a second defuse would hand some players two lives while
        // others have one, which breaks the bomb economy the deck composition
        // is built around (N+1 defuses for N players).
        //
        // The leftover defuse simply stays in the deck and can be drawn later.
        void DealRandomCards(string playerId, int count)
        {
            for (var i = 0; i < count; i++)
            {
                var pickIdx = -1;
                for (var d = 0; d < state.Deck.Count; d++)
                {
                    if (!IsDefuseClass(state.Deck[d])) { pickIdx = d; break; }
                }
                if (pickIdx < 0) break; // deck exhausted (or only defuses left)

                state.Hands[playerId].Add(state.Deck[pickIdx]);
                state.Deck.RemoveAt(pickIdx);
            }
        }

        // ── Custom deck: preserve the tester's exact order ───────────
        //
        // The Test Lobby "Deck Builder" tab lets the tester place cards at
        // specific slots, so the order they configured IS meaningful.
        // Two things used to break that:
        //
        //   1. The shuffle in the dealing phase randomised the deck, so slot 1
        //      was no longer the top of the deck.
        //   2. Bombs were pulled out of the deck up-front and then re-inserted
        //      at RANDOM positions — which meant a tester who deliberately
        //      placed a bomb at slot 3 could never actually draw it there.
        //
        // The deck is stored "top of deck first" (DrawCardAsync takes
        // gs.Deck[^1], so the LAST element is the one drawn first). The
        // tester's slot 1 therefore maps to the END of the list.
        //
        // When `dealCards=false` the tester is fully in control: no dealing,
        // no shuffling, no bomb re-insertion — the deck is EXACTLY what they
        // typed. When `dealCards=true` the normal dealing protocol still
        // applies (bombs extracted, deck shuffled, cards dealt).
        var hasCustomDeck = customDeck != null && customDeck.Count > 0;
        var pinDeckOrder = hasCustomDeck && !dealCards;

        if (pinDeckOrder)
        {
            state.Deck = customDeck!.AsEnumerable().Reverse().ToList();
        }

        // Determine if we should apply custom hands vs normal dealing.
        // For test mode: apply custom hands ONLY to players who have entries.
        // Players NOT in customHands should get 4 random cards (normal dealing).
        var hasAnyCustomHands = customHands != null && customHands.Any(ch => ch.Value != null && ch.Value.Count > 0);
        // Check if ALL players have custom hand entries
        var allPlayersHaveCustomHands = hasAnyCustomHands && players.All(p =>
            customHands.TryGetValue(p.Id, out var h) && h != null && h.Count > 0);

        Console.WriteLine($"[GameService] StartGame - hasAnyCustomHands={hasAnyCustomHands}, allPlayersHaveCustomHands={allPlayersHaveCustomHands}");
        Console.WriteLine($"[GameService] customHands keys: {string.Join(", ", customHands?.Keys ?? Enumerable.Empty<string>())}");

        // Branch on whether we have any custom-hand overrides. When a custom
        // hand is provided for ANY player, we apply that override for them
        // (regardless of `dealCards`); players without an override get the
        // normal 4-card random deal if `dealCards=true`, otherwise empty.
        //
        // The old code only applied custom hands when `dealCards=true`, which
        // silently dropped every test-room hand to `[]` whenever the tester
        // launched a session with `dealCards=false`. That bug surfaced as
        // empty seats + the bot immediately "losing" the turn.
        // ── Deck handling ─────────────────────────────────────────────
        //
        // Three modes:
        //
        // A) `pinDeckOrder` (customDeck + dealCards=false) — the Test Lobby
        //    "Deck Builder" mode. The deck is EXACTLY what the tester typed:
        //    no dealing, no shuffling, no bomb re-insertion. Every card the
        //    tester placed at slot N stays at slot N, and slot 1 is the first
        //    card drawn.
        //
        // B) `hasCustomDeck && dealCards=true` — the tester pinned an order
        //    but still wants the normal dealing protocol (bombs extracted,
        //    deck shuffled, 4 cards dealt per player). Bombs are re-inserted
        //    at random because the protocol deliberately keeps them out of
        //    dealt hands.
        //
        // C) No custom deck — plain normal dealing.
        if (hasAnyCustomHands)
        {
            // Shuffle the deck first so any leftover random deals land in a
            // different order than the custom hands we just placed — BUT
            // only when the tester did NOT pin the deck order. A pinned deck
            // is a deliberate, positional configuration and must survive
            // untouched.
            if (!pinDeckOrder)
            {
                for (var i = state.Deck.Count - 1; i > 0; i--)
                {
                    var j = Random.Shared.Next(i + 1);
                    (state.Deck[i], state.Deck[j]) = (state.Deck[j], state.Deck[i]);
                }
            }

            foreach (var player in players)
            {
                if (customHands.TryGetValue(player.Id, out var playerCustomHand) && playerCustomHand != null && playerCustomHand.Count > 0)
                {
                    Console.WriteLine($"[GameService] Applying custom hand to {player.Id}: [{string.Join(",", playerCustomHand)}]");

                    // The pre-deal loop above already gave the player a
                    // defuse — clear that out and replace with the tester's
                    // exact hand spec.
                    state.Hands[player.Id].Clear();

                    foreach (var card in playerCustomHand)
                    {
                        state.Hands[player.Id].Add(card);
                    }
                }
                else if (dealCards)
                {
                    // Player has no override — top up with a normal 4-card
                    // random deal so the rest of the game (bombs in deck,
                    // turn order, etc.) behaves the same as a fresh deal.
                    Console.WriteLine($"[GameService] Dealing 4 random cards to {player.Id} (no custom hand)");
                    DealRandomCards(player.Id, 4);
                }
                // else: dealCards=false AND no custom hand → leave hand empty
                // (intentional — testers sometimes want to script the very
                // first card via the deck order).
            }
        }
        else if (dealCards)
        {
            // Normal dealing: shuffle deck then deal 4 cards per player
            for (var i = state.Deck.Count - 1; i > 0; i--)
            {
                var j = Random.Shared.Next(i + 1);
                (state.Deck[i], state.Deck[j]) = (state.Deck[j], state.Deck[i]);
            }

            foreach (var player in players)
            {
                DealRandomCards(player.Id, 4);
            }
        }

        // Re-insert bombs at random positions — but ONLY for the normal
        // (non-pinned) flow. When the tester pinned a deck order the bombs
        // are already exactly where they put them and must stay there.
        //
        // `stashBombs` holds the bombs we pulled out before dealing, so the
        // deck ends up with exactly the number of bombs it started with.
        if (!pinDeckOrder)
        {
            var bombsRemaining = stashBombs + state.Deck.Count(b => b == CardCatalog.Bomb);
            state.Deck.RemoveAll(c => c == CardCatalog.Bomb);
            for (var i = 0; i < bombsRemaining; i++)
            {
                var pos = Random.Shared.Next(state.Deck.Count + 1);
                state.Deck.Insert(pos, CardCatalog.Bomb);
            }
        }

        state.CurrentTurnMemberId = players[Random.Shared.Next(players.Count)].Id;
        state.TurnStartedAt = DateTime.UtcNow;

        // Build turn order. In test mode (firstPlayerId provided), preserve the
        // members list order (host → bot1 → bot2 → bot3 → bot4) so that the UI
        // turn indicator is predictable. In normal mode, shuffle once.
        state.TurnOrder = players.Select(p => p.Id).ToList();

        // Only shuffle if this is NOT a test session (no firstPlayerId means normal game).
        if (string.IsNullOrEmpty(firstPlayerId))
        {
            for (var i = state.TurnOrder.Count - 1; i > 0; i--)
            {
                var j = Random.Shared.Next(i + 1);
                (state.TurnOrder[i], state.TurnOrder[j]) = (state.TurnOrder[j], state.TurnOrder[i]);
            }
        }

        // If a specific first player is requested (e.g., test mode), use that ID.
        // Otherwise, use the first player from the shuffled order.
        if (!string.IsNullOrEmpty(firstPlayerId) && state.TurnOrder.Contains(firstPlayerId))
        {
            // Move the requested player to index 0
            state.TurnOrder.Remove(firstPlayerId);
            state.TurnOrder.Insert(0, firstPlayerId);
        }
        state.CurrentTurnMemberId = state.TurnOrder[0];

        // Route through PersistAsync (not UpdateGameStateAsync directly) so any
        // pending nope window gets cleared from previous sessions. NOTE: we
        // intentionally do NOT register the turn clock here — ClientReady is
        // false until the first human client calls /api/rooms/{id}/ready.
        // Without this gate, the turn-clock would tick down during the time
        // the player is navigating from the lobby to the game tab, and the
        // UI would greet them with an AFK modal. MarkClientReadyAsync is
        // what arms the clock; see GameService.MarkClientReadyAsync.
        var persistResult = await (await ResolveWriteRepositoryAsync(roomId, ct)).UpdateGameStateAsync(
            roomId, state, RoomStatus.Playing, ct);
        var persistGs = persistResult?.GameState ?? state;
        // Make sure the clock is unregistered — it might be left over from a
        // previous game session in the same room (e.g. dev reload).
        _turnClock.Unregister(roomId);
        try
        {
            await _broadcaster.BroadcastRoomSnapshotAsync(roomId, persistResult, ct);
        }
        catch
        {
            // Broadcast failures must never corrupt the persisted state.
        }
        return persistResult ?? throw new DomainException("room_not_found", "Phòng không tồn tại.");
    }

    public async Task<Room> RotateRoomAsync(string roomId, string hostId, CancellationToken ct = default)
    {
        var old = await GetRoomAsync(roomId, ct)
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

        // Defensive clone — see CloneGameStateForMutation docs. Without this,
        // mutating `hand` later in this method could leak into the cache/dict
        // and corrupt the next read.
        {
            var clonedGs = CloneGameStateForMutation(gs);
            room = new Room
            {
                Id = room.Id,
                Code = room.Code,
                HostId = room.HostId,
                HostName = room.HostName,
                Status = room.Status,
                MaxPlayers = room.MaxPlayers,
                CreatedAt = room.CreatedAt,
                Members = room.Members,
                GameState = clonedGs,
            };
            gs = clonedGs;
        }

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
        var hand = gs.Hands.TryGetValue(memberId, out var hh) ? hh : [];

        if (!isFavorPhase2 && !isComboPhase2 && !isFavorTargetPhase2)
        {
            // Combo defuse variants are only playable as part of a combo (2/3/5).
            // If the client sends a combo card directly, detect the combo.
            if (CardCatalog.IsComboDefuse(cardKey))
            {
                var playerCount = gs.Alive.Values.Count(v => v);
                var combo = CardCatalog.DetectCombo(hand, playerCount) ?? throw new DomainException("combo_impossible",
                        "Cần ít nhất 2 lá combo giống nhau để dùng.");
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
                //    2 lá bài) bạn có dùng attack tiếp để cộng dồn attack
                //    cho người tiếp theo rút 3 lá bài".
                //
                // So a fresh attack sets counter = 2; chained attacks add 1
                // more draw per attack (already +1 from this turn, then +1
                // more carried over for the next player).
                //
                // Capture the PRE-attack value BEFORE mutating the counter.
                // The Nope-cancel path (see ResolveExpiredNopeAsync) restores
                // AttackCounter from this snapshot, so it must be the value
                // the counter had *before* this attack — not one less than
                // the post-attack value.
                //
                // The old code did `gs.PreAttackCounter = gs.AttackCounter - 1`
                // AFTER setting the counter, which only happened to be right
                // for the mid-chain case (1 → 2 → restore 1). For a FRESH
                // attack (0 → 2) it stored 1, so a Nope'd attack left
                // AttackCounter = 1 and the next player was forced to draw a
                // card for an attack that never happened.
                var preAttackCounter = gs.AttackCounter;

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
                // BUG-NEW fix (per user request): Attack IS now Nope-able for
                // the 5s reaction window like every other action card. We
                // queue the Nope window first; the actual AdvanceTurn effect
                // only fires once the window resolves without a Nope (handled
                // by ResolveExpiredNopeAsync). On Nope-cancel ChainNopeAsync
                // restores AttackCounter from PreAttackCounter.
                gs.PreAttackCounter = preAttackCounter;
                QueueNopeWindow(gs, memberId, CardCatalog.Attack);
                result.Toast = "Tấn công — đợi cản 5s.";
                break;

            case CardCatalog.Skip:
                RemoveFromHand(hand, CardCatalog.Skip);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                // BUG-NEW fix (per user request): Skip is now Nope-able like
                // every other action card. The previous behavior ("commit
                // immediately, consume 1 attack draw, end turn") was correct
                // in isolation but skipped the unified 5s reaction window.
                // We queue the Nope window; the actual turn advance + attack
                // counter decrement only fires on ResolveExpiredNopeAsync.
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                QueueNopeWindow(gs, memberId, CardCatalog.Skip);
                result.Toast = "Bỏ lượt — đợi cản 5s.";
                break;

            case CardCatalog.Favor:
                if (!isFavorTargetPhase2)
                {
                    // Phase 1a: actor hasn't picked a target yet. Return
                    // `RequiresTargetPick` so the client opens its player
                    // picker. We do NOT commit the Favor card yet and we do
                    // NOT advance the turn — the same pattern combo 2/3 use
                    // for target picking. Without this, the front-end gets a
                    // HTTP 400 ("requires_target") and the player has to
                    // guess they need to also send targetMemberId up front.
                    if (string.IsNullOrEmpty(targetMemberId))
                    {
                        result.RequiresTargetPick = true;
                        // Server-side 10s picker timeout (unified rule — the
                        // same budget as every other picker in the game).
                        // We record WHO is waiting, WHICH card opened the
                        // picker and the eligible targets, so the background
                        // sweeper can auto-cancel the action when the player
                        // walks away. Without this the room stalled forever:
                        // the actor's turn never advanced and nobody was
                        // asked to hand over a card.
                        //
                        // The candidate list is computed server-side (alive
                        // players other than the actor, with a non-empty
                        // hand) so the client picker and the auto-cancel
                        // path agree on who is selectable.
                        var favorCandidates = gs.Hands.Keys
                            .Where(id => id != memberId
                                && gs.Alive.GetValueOrDefault(id)
                                && gs.Hands.TryGetValue(id, out var h) && h.Count > 0)
                            .ToList();
                        gs.PendingTargetPick = new PendingTargetPick
                        {
                            Kind = TargetPickKind.FavorTarget,
                            CardKey = CardCatalog.Favor,
                            InitiatorId = memberId,
                            CandidateMemberIds = favorCandidates,
                            CreatedAt = DateTime.UtcNow,
                        };
                        result.FavorCandidates = favorCandidates;
                        // Persist so other viewers see a consistent snapshot
                        // (no hand change yet, but we still want a fresh
                        // room reference for the client).
                        CheckWinCondition(gs);
                        await PersistAsync(room.Id, gs, ct);
                        result.Room = (await GetRoomAsync(room.Id, ct))!;
                        return result;
                    }

                    // Phase 1b: actor picked a target. Validate and commit.
                    if (!gs.Hands.TryGetValue(targetMemberId, out List<string>? value))
                        throw new DomainException("target_not_found", "Đối thủ không hợp lệ.");
                    if (!gs.Alive.GetValueOrDefault(targetMemberId))
                        throw new DomainException("target_dead", "Đối thủ đã bị loại.");

                    var tgtHand = value;
                    if (tgtHand.Count == 0)
                        throw new DomainException("target_empty", "Đối thủ không còn lá bài.");

                    // Spend the Favor card (it's committed). Open a 5s Nope
                    // window so other players can chain Cản. After the window
                    // resolves, the target picks which of their cards to give
                    // to the actor (per user-confirmed spec).
                    RemoveFromHand(hand, CardCatalog.Favor);
                    // Phase 1 is over — the target picker is closed. Clear the
                    // timeout state so the sweeper doesn't auto-cancel an
                    // action that already advanced to phase 2.
                    gs.PendingTargetPick = null;

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
                    result.RequiresFavorTargetPick = true;
                    result.FavorTargetId = targetMemberId;
                    result.Toast = "Đã Xin — đợi đối thủ chọn lá để đưa.";
                    CheckWinCondition(gs);
                    await PersistAsync(room.Id, gs, ct);
                    result.Room = room;
                    return result;
                }

                // Phase 2 (target picks): the caller is the target member
                // and discardPickKey is the card they chose to give. Validate
                // it & hand it over to the Favor initiator.
                return await CompleteFavorPickAsync(room, gs, memberId, discardPickKey!, autoPicked: false, ct);

            case CardCatalog.Future:
                RemoveFromHand(hand, CardCatalog.Future);
                gs.DiscardPile.Add(CardCatalog.Future);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.FuturePeek = gs.Deck.TakeLast(3).Reverse().ToList();
                gs.FuturePeekAt = DateTime.UtcNow;
                result.FuturePeek = gs.FuturePeek;
                // BUG-NEW fix: Future does NOT advance the turn. Per Exploding
                // Kittens official rules, Future only lets you peek at the top
                // 3 cards of the deck — the same player still has to draw or
                // play another action card to end their turn. Opening a 5s
                // Nope window lets opponents cancel the peek, but the turn
                // never advances as part of the card's own effect.
                QueueNopeWindow(gs, memberId, CardCatalog.Future, skipTurnAdvance: true);
                _futurePeek.Register(room.Id, DateTime.UtcNow + FuturePeekLifetime);
                result.Toast = $"Xem trước 3 lá.";
                break;

            case CardCatalog.Shuffle:
                // Shuffle: re-order the deck. We commit the actual shuffle
                // immediately (it's idempotent and cheap to re-run on cancel —
                // we just shuffle again). The 5s Nope window applies for
                // parity with the other action cards.
                var preShuffle = gs.Deck.ToList();
                RemoveFromHand(hand, CardCatalog.Shuffle);
                gs.DiscardPile.Add(CardCatalog.Shuffle);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                for (var i = gs.Deck.Count - 1; i > 0; i--)
                {
                    var j = Random.Shared.Next(i + 1);
                    (gs.Deck[i], gs.Deck[j]) = (gs.Deck[j], gs.Deck[i]);
                }
                // BUG-NEW fix (per user request): Shuffle is now Nope-able.
                // We queue the window; the turn advance only fires when the
                // window resolves. If a Nope chain cancels, we restore the
                // pre-shuffle deck order so the cancellation is observable.
                // (Rollback happens via ChainNopeAsync → RefundInitiatorCard.)
                gs.PreShuffleDeck = preShuffle;
                // Shuffle does NOT end the player's turn — per the official
                // Exploding Kittens rules you shuffle the draw pile and then
                // keep going: "you shuffle the draw pile and then pick up the
                // top card to end your turn". The turn only ends when the
                // player draws (or plays Attack/Skip). Same as Future.
                //
                // Without skipTurnAdvance the Nope window expiry advanced the
                // turn, so a player who shuffled could no longer play their
                // remaining cards (e.g. "Shuffle → Future" per TC2.3 / TC3.3)
                // — the follow-up play-card call was rejected with
                // `not_your_turn`.
                QueueNopeWindow(gs, memberId, CardCatalog.Shuffle, skipTurnAdvance: true);
                result.Toast = "Đã xáo bộ bài — đợi cản 5s.";
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
        result.Room = (await GetRoomAsync(room.Id, ct))!;
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
                    result.Room = room;
                    return result; // client will retry
                }
                var t2 = gs.Hands.TryGetValue(targetMemberId, out var t2Hand) ? t2Hand : null;
                if (t2 is null || !gs.Alive.GetValueOrDefault(targetMemberId) || t2.Count == 0)
                {
                    // BUG-NEW: invalid target must still end the turn or the
                    // player gets stuck waiting on a turn that will never
                    // advance. Spend the combo and advance.
                    if (comboIsMix) SpendMixComboFromHand(gs, hand, 2);
                    else SpendComboFromHand(gs, hand, cardKey, 2);
                    gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                    gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                    AdvanceTurn(gs, room.Id);
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
                    result.Room = room;
                    return result;
                }
                // Phase 2: the actor picked discardPickKey from the shuffled list.
                // Validate it was in the target's hand at pick time.
                if (!t2.Contains(discardPickKey))
                    throw new DomainException("favor_card_gone", "Đối thủ không còn lá này.");
                if (comboIsMix) SpendMixComboFromHand(gs, hand, 2);
                else SpendComboFromHand(gs, hand, cardKey, 2);
                t2.Remove(discardPickKey);
                hand.Add(discardPickKey);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                // Combo 2-same is NOT Nope-able per game rules.
                AdvanceTurn(gs, room.Id);
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
                    if (comboIsMix) SpendMixComboFromHand(gs, hand, 3);
                    else SpendComboFromHand(gs, hand, cardKey, 3);
                    gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                    gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                    AdvanceTurn(gs, room.Id);
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
                    result.Room = room;
                    return result;
                }
                // Phase 2: actor named discardPickKey. Resolve server-side.
                // B-4 fix: if target HAS the named card → steal it. Otherwise → combo invalid.
                if (comboIsMix) SpendMixComboFromHand(gs, hand, 3);
                else SpendComboFromHand(gs, hand, cardKey, 3);
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
                AdvanceTurn(gs, room.Id);
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
                        SpendAnyComboFromHand(gs, hand, 5);
                        gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                        gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                        AdvanceTurn(gs, room.Id);
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
                    result.Room = room;
                    return result;
                }
                // Phase 2: player picked a card.
                if (!gs.DiscardPile.Contains(discardPickKey))
                {
                    // The card disappeared from the discard pile between
                    // phase 1 and phase 2 (e.g. someone nope'd a different
                    // action). End the turn anyway so the player isn't stuck.
                    SpendAnyComboFromHand(gs, hand, 5);
                    gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                    gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                    AdvanceTurn(gs, room.Id);
                    result.Toast = "Lá bài không còn trong chồng bỏ.";
                    break;
                }
                SpendAnyComboFromHand(gs, hand, 5);
                gs.DiscardPile.Remove(discardPickKey);
                hand.Add(discardPickKey);
                gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
                gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
                // Combo 5-any is NOT Nope-able.
                AdvanceTurn(gs, room.Id);
                result.Toast = "Lấy 1 lá từ chồng bỏ.";
                break;
        }

        CheckWinCondition(gs);
        await PersistAsync(room.Id, gs, ct);
        result.Room = (await GetRoomAsync(room.Id, ct))!;
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

    /// <summary>
    /// Auto-cancels a pending TARGET picker (Favor phase 1 — "pick who to
    /// ask") after the unified 10s picker timeout expires.
    ///
    /// Per <c>TIMER_10S_SPEC.md</c> §4: when the actor doesn't pick a
    /// target in time, the Favor is auto-cancelled — the card is spent, the
    /// turn advances, and nobody is asked to hand over a card.
    ///
    /// Called by the background sweeper (<c>TargetPickAutoResolver</c>).
    /// Idempotent: if the picker is already gone (the player picked in
    /// time, or the game ended) this is a no-op.
    /// </summary>
    public async Task<GameActionResult?> AutoCancelPendingTargetPickAsync(
        string roomId, CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        if (room is null) return null;
        var gs = room.GameState!;

        var pending = gs.PendingTargetPick;
        if (pending is null) return null;
        if (pending.Kind != TargetPickKind.FavorTarget) return null;

        // Defensive clone — same reasoning as every other mutation path.
        {
            var clonedGs = CloneGameStateForMutation(gs);
            room = new Room
            {
                Id = room.Id,
                Code = room.Code,
                HostId = room.HostId,
                HostName = room.HostName,
                Status = room.Status,
                MaxPlayers = room.MaxPlayers,
                CreatedAt = room.CreatedAt,
                Members = room.Members,
                GameState = clonedGs,
            };
            gs = clonedGs;
        }

        var initiator = gs.PendingTargetPick!.InitiatorId;

        // The Favor card is spent (the actor played it) and the turn ends.
        // The card lands in the discard pile so the deck composition stays
        // consistent.
        var hand = gs.Hands.TryGetValue(initiator, out var hh) ? hh : [];
        RemoveFromHand(hand, CardCatalog.Favor);
        gs.DiscardPile.Add(CardCatalog.Favor);
        gs.CardsPlayed[initiator] = gs.CardsPlayed.GetValueOrDefault(initiator) + 1;
        gs.TurnsTaken[initiator] = gs.TurnsTaken.GetValueOrDefault(initiator) + 1;

        gs.PendingTargetPick = null;
        gs.PendingFavorPick = null;

        // Drop the combo/peek cinematic overlay if it is still showing.
        gs.LastPlayedBy = null;
        gs.LastPlayedCardKey = null;
        gs.LastPlayedAt = null;

        AdvanceTurn(gs, room.Id);
        CheckWinCondition(gs);
        await PersistAsync(room.Id, gs, ct);

        return new GameActionResult
        {
            Room = (await GetRoomAsync(room.Id, ct))!,
            Toast = "Đã hủy Xin — hết thời gian chọn mục tiêu.",
        };
    }

    /// <summary>
    /// Completes a pending Favor pick: target gave a specific card (or the
    /// 10s auto-pick resolver picked one for them). Transfers the card from
    /// target's hand into the Favor actor's hand (or discard pile if the
    /// actor is gone), clears the pending pick, advances the turn, and
    /// persists.
    ///
    /// Shared between <see cref="PlayCardAsync"/> (manual target pick) and
    /// the <c>FavorPickAutoResolver</c> background sweep (10s timeout). When
    /// <paramref name="autoPicked"/> is true the toast surfaces to the actor
    /// only and we don't throw on a missing hand (resolver catches that).
    /// </summary>
    public async Task<GameActionResult> CompleteFavorPickAsync(
        Room room, GameState gs, string targetMemberId, string discardPickKey,
        bool autoPicked, CancellationToken ct = default)
    {
        if (gs.PendingAction is not null)
            throw new DomainException("action_pending", "Đang chờ phản ứng Nope.");

        var pendingFav = gs.PendingFavorPick ?? throw new DomainException("no_pending_favor", "Không có Lá Xin nào đang chờ.");

        // For manual picks, scope to the calling target. Auto-picks skip
        // this check since the resolver already validated the target id.
        if (!autoPicked && pendingFav.TargetMemberId != targetMemberId)
            throw new DomainException("not_favor_target", "Chỉ đối thủ được chọn mới có thể đưa lá.");

        var targetHand = gs.Hands.GetValueOrDefault(targetMemberId);
        if (targetHand is null || targetHand.Count == 0)
        {
            // Hand drained (e.g. simultaneous bot actions) → drop the pick.
            gs.PendingFavorPick = null;
            await PersistAsync(room.Id, gs, ct);
            return new GameActionResult { Room = room, Toast = "Đối thủ đã không còn lá." };
        }

        // If the discardPickKey isn't in the hand anymore (e.g. the target
        // died in a parallel draw and we don't want to throw 400 during an
        // auto-resolve), fall back to a random non-bomb card.
        if (string.IsNullOrEmpty(discardPickKey) || !targetHand.Contains(discardPickKey))
        {
            if (!autoPicked)
                throw new DomainException("favor_card_gone", "Bạn không còn lá này.");
            var pool = targetHand.Where(c => c != CardCatalog.Bomb).ToList();
            if (pool.Count == 0)
            {
                gs.PendingFavorPick = null;
                await PersistAsync(room.Id, gs, ct);
                return new GameActionResult { Room = room, Toast = "Đối thủ không có lá phù hợp." };
            }
            discardPickKey = pool[Random.Shared.Next(pool.Count)];
        }
        if (discardPickKey == CardCatalog.Bomb)
        {
            if (!autoPicked)
                throw new DomainException("cannot_give_bomb", "Không được đưa Lá Bom.");
            // Treat bomb as "no valid gift" — drop the pick.
            gs.PendingFavorPick = null;
            await PersistAsync(room.Id, gs, ct);
            return new GameActionResult { Room = room, Toast = "Đối thủ chỉ còn Lá Bom." };
        }

        targetHand.Remove(discardPickKey);
        var actorHand = gs.Hands.GetValueOrDefault(pendingFav.InitiatorId);
        // Defensive: if the actor was killed in the meantime, drop the
        // card to the discard pile so it isn't lost in limbo.
        if (actorHand is null)
        {
            gs.DiscardPile.Add(discardPickKey);
        }
        else
        {
            actorHand.Add(discardPickKey);
        }
        gs.PendingFavorPick = null;
        // The Favor card itself was removed from the initiator's hand at
        // play-time — it lands in the discard pile now that the pick
        // resolved (either the target chose a card, or the auto-resolver
        // picked one on their behalf).
        AddToDiscardPile(gs, CardCatalog.Favor);
        gs.CardsPlayed[pendingFav.InitiatorId] = gs.CardsPlayed.GetValueOrDefault(pendingFav.InitiatorId) + 1;
        gs.TurnsTaken[pendingFav.InitiatorId] = gs.TurnsTaken.GetValueOrDefault(pendingFav.InitiatorId) + 1;
        AdvanceTurn(gs, room.Id);
        var toast = autoPicked
            ? "Đối thủ không chọn — hệ thống đã lấy ngẫu nhiên 1 lá."
            : "Đối thủ đã đưa 1 lá.";
        CheckWinCondition(gs);
        await PersistAsync(room.Id, gs, ct);
        var updated = (await GetRoomAsync(room.Id, ct)) ?? room;
        return new GameActionResult { Room = updated, Toast = toast };
    }

    public async Task<GameActionResult> CancelPendingActionAsync(
        string roomId, string memberId, string cardKey, ComboKind comboKind,
        CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;

        // Defensive clone (see CloneGameStateForMutation).
        {
            var clonedGs = CloneGameStateForMutation(gs);
            room = new Room
            {
                Id = room.Id,
                Code = room.Code,
                HostId = room.HostId,
                HostName = room.HostName,
                Status = room.Status,
                MaxPlayers = room.MaxPlayers,
                CreatedAt = room.CreatedAt,
                Members = room.Members,
                GameState = clonedGs,
            };
            gs = clonedGs;
        }

        if (gs.CurrentTurnMemberId != memberId)
            throw new DomainException("not_your_turn", "Chưa tới lượt của bạn.");
        if (!gs.Alive.GetValueOrDefault(memberId))
            throw new DomainException("already_dead", "Bạn đã không còn trong trò chơi.");

        var hand = gs.Hands.TryGetValue(memberId, out var h) ? h : [];

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
            AdvanceTurn(gs, room.Id);
            var favResult = new GameActionResult { Toast = "Đã hủy Xin." };
            CheckWinCondition(gs);
            await PersistAsync(room.Id, gs, ct);
            favResult.Room = (await GetRoomAsync(room.Id, ct))!;
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
            SpendAnyComboFromHand(gs, hand, cost);
        }
        else
        {
            SpendComboFromHand(gs, hand, cardKey, cost);
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

        AdvanceTurn(gs, room.Id);

        var result = new GameActionResult
        {
            Toast = "Đã hủy combo.",
        };
        CheckWinCondition(gs);
        await PersistAsync(room.Id, gs, ct);
        result.Room = (await GetRoomAsync(room.Id, ct))!;
        return result;
    }

    //  Concede
    // ──────────────────────────────────────────────────────────────────

    public async Task<GameActionResult> ConcedeAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;

        // Defensive clone (see CloneGameStateForMutation).
        {
            var clonedGs = CloneGameStateForMutation(gs);
            room = new Room
            {
                Id = room.Id,
                Code = room.Code,
                HostId = room.HostId,
                HostName = room.HostName,
                Status = room.Status,
                MaxPlayers = room.MaxPlayers,
                CreatedAt = room.CreatedAt,
                Members = room.Members,
                GameState = clonedGs,
            };
            gs = clonedGs;
        }

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

        if (wasCurrentTurn) AdvanceTurn(gs, room.Id);

        CheckWinCondition(gs);

        // Persist game-state first, then remove the member from room.Members
        // so the lobby stops showing a dead player.
        await (await ResolveWriteRepositoryAsync(room.Id, ct)).UpdateGameStateAsync(room.Id, gs,
            gs.EndedAt is null ? null : Domain.Enums.RoomStatus.Finished, ct);

        var updated = await _repository.RemoveMemberAsync(room.Id, memberId, ct);
        var finalRoom = updated ?? (await GetRoomAsync(room.Id, ct)) ?? room;
        // If RemoveMemberAsync didn't touch gameState (in-memory impls may not
        // copy it back), graft the up-to-date gameState on.
        finalRoom.GameState ??= gs;

        // Re-arm the turn clock for the next player (PersistAsync is the
        // canonical place that wires up the background timer).
        await PersistAsync(room.Id, finalRoom.GameState!, ct);
        finalRoom = (await GetRoomAsync(room.Id, ct)) ?? finalRoom;

        return new GameActionResult
        {
            Room = finalRoom,
            Toast = "Bạn đã đầu hàng và bị loại khỏi ván chơi.",
        };
    }

    // ──────────────────────────────────────────────────────────────────
    //  Draw / Defuse / Nope
    // ──────────────────────────────────────────────────────────────────

    public async Task<GameActionResult> DrawCardAsync(
        string roomId,
        string memberId,
        bool isAutoDraw = false,
        CancellationToken ct = default)
        => await DrawCardAsync(roomId, memberId, preloadedRoom: null, isAutoDraw, ct);

    /// <summary>
    /// Overload that accepts a room snapshot the caller has already fetched.
    /// Background services (e.g. <c>TurnTimeoutHandler</c>) need this to avoid
    /// the double <c>GetByIdAsync</c> round-trip — they read once for the
    /// "is this still the right player?" guard and would otherwise trigger
    /// a second read inside <see cref="DrawCardAsync(string,string,CancellationToken,bool)"/>.
    /// </summary>
    public async Task<GameActionResult> DrawCardAsync(
        string roomId,
        string memberId,
        Room? preloadedRoom,
        bool isAutoDraw = false,
        CancellationToken ct = default)
    {
        var room = preloadedRoom ?? await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;

        // Defensive clone: the repository GetByIdAsync path is supposed to
        // return a snapshot, but in test mode (and after certain cache races)
        // two callers can end up holding references to the same Hands
        // dictionary. Mutating one side then corrupts the other — producing
        // the "all hands vanish" symptom when a bot tick observes a
        // partially-mutated state. Cloning here guarantees that every action
        // only ever touches its own GameState copy.
        if (preloadedRoom is null)
        {
            var clonedGs = CloneGameStateForMutation(gs);
            _ = new Room
            {
                Id = room.Id,
                Code = room.Code,
                HostId = room.HostId,
                HostName = room.HostName,
                Status = room.Status,
                MaxPlayers = room.MaxPlayers,
                CreatedAt = room.CreatedAt,
                Members = room.Members,
                GameState = clonedGs,
            };
            gs = clonedGs;
        }

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
            return await DrawMultipleAsync(roomId, gs, memberId, gs.AttackCounter, ct, isAutoDraw);
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
                result.Room = (await GetRoomAsync(roomId, ct))!;
                return result;
            }
            // No defuse → die. Clear the reveal flag here so the explosion
            // animation finishes; the snapshot will report Alive=false.
            gs.BombRevealActive = false;
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
            AdvanceTurn(gs, roomId);
            result.Toast = "Bạn đã chết.";
        }
        else
        {
            hand.Add(drawn);
            result.Toast = $"Rút được: {CardCatalog.Names.GetValueOrDefault(drawn, drawn)}.";
            gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
            AdvanceTurn(gs, roomId);
        }

        CheckWinCondition(gs);
        await MaybeMarkAfkAsync(roomId, memberId, isAutoDraw, gs, ct);
        await PersistAsync(roomId, gs, ct);
        result.Room = (await GetRoomAsync(roomId, ct))!;
        return result;
    }

    /// <summary>
    /// Helper for the Attack chain: the player must draw <paramref name="remaining"/>
    /// cards. We draw them one at a time so the bomb-reveal animation can fire
    /// per draw. After each draw, if the player drew a bomb and they have a
    /// defuse, we stop and return to the defuse flow. If the deck runs out
    /// mid-chain, we stop and advance the turn.
    /// </summary>
    private async Task<GameActionResult> DrawMultipleAsync(string roomId, GameState gs, string memberId, int remaining, CancellationToken ct, bool isAutoDraw = false)
    {
        if (remaining <= 0 || gs.Deck.Count == 0)
        {
            // Out of cards or no more draws required — end the chain.
            gs.AttackCounter = 0;
            gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
            AdvanceTurn(gs, roomId);
            CheckWinCondition(gs);
            await MaybeMarkAfkAsync(roomId, memberId, isAutoDraw, gs, ct);
            await PersistAsync(roomId, gs, ct);
            return new GameActionResult
            {
                Room = (await GetRoomAsync(roomId, ct))!,
                Toast = "Hết bài — lượt kết thúc.",
            };
        }

        string drawn;
        try
        {
            drawn = gs.Deck[^1];
            gs.Deck.RemoveAt(gs.Deck.Count - 1);
        }
        catch (ArgumentOutOfRangeException)
        {
            // Deck emptied between the guard check and the draw (race with
            // another tick). Treat as "deck empty" — end the attack chain.
            gs.AttackCounter = 0;
            gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
            AdvanceTurn(gs, roomId);
            CheckWinCondition(gs);
            await MaybeMarkAfkAsync(roomId, memberId, isAutoDraw, gs, ct);
            await PersistAsync(roomId, gs, ct);
            return new GameActionResult
            {
                Room = (await GetRoomAsync(roomId, ct))!,
                Toast = "Hết bài trong chồng.",
            };
        }
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
                result.Room = (await GetRoomAsync(roomId, ct))!;
                return result;
            }
            // No defuse → die. Bomb goes to discard pile, attack chain ends.
            gs.BombRevealActive = false;
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
            AdvanceTurn(gs, roomId);
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
                result.Room = (await GetRoomAsync(roomId, ct))!;
                return result;
            }
            // Chain finished — advance turn normally.
            result.Toast = $"Rút được: {CardCatalog.Names.GetValueOrDefault(drawn, drawn)}.";
            gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
            AdvanceTurn(gs, roomId);
        }

        CheckWinCondition(gs);
        await MaybeMarkAfkAsync(roomId, memberId, isAutoDraw, gs, ct);
        await PersistAsync(roomId, gs, ct);
        result.Room = (await GetRoomAsync(roomId, ct))!;
        return result;
    }

    public async Task<GameActionResult> UseDefuseAsync(string roomId, string memberId, int slotIndex, CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;

        // Defensive clone (see CloneGameStateForMutation).
        {
            var clonedGs = CloneGameStateForMutation(gs);
            _ = new Room
            {
                Id = room.Id,
                Code = room.Code,
                HostId = room.HostId,
                HostName = room.HostName,
                Status = room.Status,
                MaxPlayers = room.MaxPlayers,
                CreatedAt = room.CreatedAt,
                Members = room.Members,
                GameState = clonedGs,
            };
            gs = clonedGs;
        }

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

        // Resolve the actual insert slot.
        //
        // IMPORTANT: the server draws from gs.Deck[^1] — the LAST element of the
        // list is the TOP of the deck. Inserting at a small index therefore puts
        // the bomb DEEP in the deck, not near the top.
        //
        // The 4 numbered buttons (1..4) sit just below the top of the deck so the
        // player can decide how many "free cards" the next player gets before
        // hitting the bomb. "Đặt dưới cùng" (slotIndex=5) buries the bomb under
        // every other card.
        //
        //   slotIndex 1 → top of the deck        → insert index = Deck.Count
        //   slotIndex 2 → 1 card below the top    → insert index = Deck.Count - 1
        //   slotIndex 3 → 2 cards below the top   → insert index = Deck.Count - 2
        //   slotIndex 4 → 3 cards below the top   → insert index = Deck.Count - 3
        //   slotIndex 5 → bottom of the deck      → insert index = 0
        //   slotIndex -1 → random position        → uniform pick
        int safeSlot;
        var deckCount = gs.Deck.Count;
        if (slotIndex == -1)
        {
            safeSlot = Random.Shared.Next(0, deckCount + 1);
        }
        else if (slotIndex >= 1 && slotIndex <= 4)
        {
            // Clamp so we never underflow when the deck is smaller than 4 cards.
            safeSlot = Math.Max(0, deckCount - (slotIndex - 1));
        }
        else
        {
            // slotIndex 0 / 5 / out of range → bottom of the deck.
            safeSlot = 0;
        }

        var defuseKey = hand[defuseIdx];
        hand.RemoveAt(defuseIdx);
        gs.Deck.Insert(safeSlot, CardCatalog.Bomb);
        gs.BombRevealActive = false;

        // The Defuse card was used up (not spent on a normal action) → it
        // lands in the discard pile. The Bomb goes back into the deck.
        AddToDiscardPile(gs, defuseKey);
        gs.CardsPlayed[memberId] = gs.CardsPlayed.GetValueOrDefault(memberId) + 1;
        gs.TurnsTaken[memberId] = gs.TurnsTaken.GetValueOrDefault(memberId) + 1;
        AdvanceTurn(gs, roomId);

        CheckWinCondition(gs);
        await PersistAsync(roomId, gs, ct);
        return new GameActionResult
        {
            Room = (await GetRoomAsync(roomId, ct))!,
            Toast = "Bom đã được cứu và đặt lại vào chồng bài.",
        };
    }

    public async Task<GameActionResult> ChainNopeAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        var room = await LoadPlayingRoomAsync(roomId, ct);
        var gs = room.GameState!;

        // Defensive clone (see CloneGameStateForMutation).
        {
            var clonedGs = CloneGameStateForMutation(gs);
            _ = new Room
            {
                Id = room.Id,
                Code = room.Code,
                HostId = room.HostId,
                HostName = room.HostName,
                Status = room.Status,
                MaxPlayers = room.MaxPlayers,
                CreatedAt = room.CreatedAt,
                Members = room.Members,
                GameState = clonedGs,
            };
            gs = clonedGs;
        }

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
        AddToDiscardPile(gs, CardCatalog.Nope);
        // Restart the window clock so a counter-nope still has the full
        // reaction time (the window is shared by the whole chain).
        pending.CreatedAt = DateTime.UtcNow;
        // Re-arm the background resolver with the new timestamp so the
        // window is auto-resolved 10s after the LAST nope.
        _nopeWindow.Register(roomId, pending.CreatedAt);

        // Cinematic: each Nope resets the centre-screen reveal so the
        // newly-played Nope card is what everyone sees.
        gs.LastPlayedBy = memberId;
        gs.LastPlayedCardKey = CardCatalog.Nope;
        gs.LastPlayedAt = DateTime.UtcNow;
        gs.LastPlayedByNope = memberId;

        // BUG-NEW fix (per the multi-nope spec): the Nope window stays OPEN
        // after a Nope so another player can counter-nope. The final outcome
        // is decided when the window expires, based on the parity of the
        // chain:
        //   odd  number of Nope cards -> the original action is CANCELLED
        //   even number of Nope cards -> the original action STANDS
        //
        // Previously the action was cancelled immediately and PendingAction
        // was cleared, which made a counter-nope impossible (the endpoint
        // rejected it with "no_pending_action").
        //
        // The rollback side effects (deck restore, attack counter restore,
        // favor/future cleanup) are therefore deferred to
        // ResolveExpiredNopeAsync, which knows the final parity.

        CheckWinCondition(gs);
        await PersistAsync(roomId, gs, ct);
        return new GameActionResult
        {
            Room = (await GetRoomAsync(roomId, ct))!,
            Toast = pending.NopeChain.Count % 2 == 1
                ? "Hành động đã bị cản — chờ phản ứng."
                : "Bạn đã cản, chờ phản ứng.",
        };
    }

    /// <summary>
    /// Move a played action card into the discard pile.
    ///
    /// Per the user-confirmed spec every played card ends up in the discard
    /// pile (bài bỏ) once its action resolves. Only Future and Shuffle used
    /// to do this at play-time — Attack, Skip, Favor, Nope and the Defuse
    /// cards were removed from the hand and then silently vanished, so the
    /// discard pile stayed empty and Combo 5-any ("take a card back from the
    /// discard pile") had nothing to take.
    ///
    /// The card is added at COMMIT time (after the Nope window resolves),
    /// not at play-time, because a Nope'd action is cancelled and its card
    /// is refunded to the initiator's hand instead.
    /// </summary>
    private static void AddToDiscardPile(GameState gs, string cardKey, int count = 1)
    {
        for (var i = 0; i < count; i++) gs.DiscardPile.Add(cardKey);
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

        // Defensive clone (see CloneGameStateForMutation).
        {
            var clonedGs = CloneGameStateForMutation(gs);
            room = new Room
            {
                Id = room.Id,
                Code = room.Code,
                HostId = room.HostId,
                HostName = room.HostName,
                Status = room.Status,
                MaxPlayers = room.MaxPlayers,
                CreatedAt = room.CreatedAt,
                Members = room.Members,
                GameState = clonedGs,
            };
            gs = clonedGs;
        }

        var pending = gs.PendingAction;
        if (pending is null) return new GameActionResult { Room = room };

        // BUG-NEW fix (per the multi-nope spec): the Nope window stays OPEN
        // after a Nope so another player can counter-nope. The final outcome
        // is decided HERE, when the window expires, based on the parity of
        // the chain:
        //   odd  number of Nope cards -> the original action is CANCELLED
        //   even number of Nope cards -> the original action STANDS
        var chainLength = pending.NopeChain?.Count ?? 0;
        var actionCancelled = chainLength % 2 == 1;

        var initiatorHand = gs.Hands.TryGetValue(pending.InitiatorId, out var h) ? h : null;
        if (initiatorHand is null)
        {
            gs.PendingAction = null;
            ClearActionCinematic(gs);
            await PersistAsync(roomId, gs, ct);
            return new GameActionResult { Room = (await GetRoomAsync(roomId, ct))! };
        }

        if (actionCancelled)
        {
            // ── The action was cancelled by the Nope chain ──────────────
            // Roll back every side effect the original play had applied.
            RefundInitiatorCard(gs, pending);

            if (pending.CardKey == CardCatalog.Favor)
            {
                gs.PendingFavorPick = null;
            }
            if (pending.CardKey == CardCatalog.Future)
            {
                gs.FuturePeek = null;
                gs.FuturePeekAt = null;
                _futurePeek.Unregister(room.Id);
            }
            if (pending.CardKey == CardCatalog.Shuffle && gs.PreShuffleDeck is not null)
            {
                gs.Deck = new List<string>(gs.PreShuffleDeck);
                gs.PreShuffleDeck = null;
            }
            if (pending.CardKey == CardCatalog.Attack)
            {
                if (gs.PreAttackCounter is int preAttack)
                {
                    gs.AttackCounter = preAttack;
                    gs.PreAttackCounter = null;
                }
                else
                {
                    gs.AttackCounter = 0;
                }
            }

            gs.PendingAction = null;
            ClearActionCinematic(gs);
            // A cancelled action does NOT advance the turn and does NOT put
            // the card in the discard pile (the initiator keeps their turn).
            CheckWinCondition(gs);
            await PersistAsync(roomId, gs, ct);
            return new GameActionResult
            {
                Room = (await GetRoomAsync(roomId, ct))!,
                Toast = "Hành động đã bị cản.",
            };
        }

        // ── The action COMMITS (no Nope, or an even-length chain) ──────
        // BUG-NEW fix (per user request): every action card now goes through
        // a Nope window. The PlayCardAsync handlers queue the window and
        // record any state they need to roll back on cancel — but the actual
        // turn-advance / AttackCounter mutation only fires HERE, after the
        // window expires without a Nope. (For cards that already had a Nope
        // window — Future / Favor — the original logic is preserved.)
        switch (pending.CardKey)
        {
            case CardCatalog.Attack:
                // Attack already set AttackCounter at play-time (mid-chain
                // increment or fresh = 2). PreAttackCounter captured the
                // pre-increment value for the cancel path — clear it now
                // since the action is committing.
                gs.PreAttackCounter = null;
                // The action committed → the card goes to the discard pile.
                AddToDiscardPile(gs, CardCatalog.Attack);
                break;
            case CardCatalog.Skip:
                // Skip decrements one attack-chain draw, mirroring the
                // original "commit immediately" behavior so a skipped player
                // doesn't have to draw all their forced cards this turn.
                if (gs.AttackCounter > 0)
                {
                    gs.AttackCounter -= 1;
                }
                AddToDiscardPile(gs, CardCatalog.Skip);
                break;
            case CardCatalog.Shuffle:
                // Shuffle already ran at play-time. PreShuffleDeck is kept
                // around for the cancel path (rollback on Nope) but isn't
                // used here — on commit we just drop it.
                gs.PreShuffleDeck = null;
                break;
            case CardCatalog.Favor:
                // Favor was removed from the hand at play-time; the card
                // reaches the discard pile when the pick completes (see
                // CompleteFavorPickAsync) or is auto-picked on timeout.
                // Adding it here would double-count it.
                break;
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
                Room = (await GetRoomAsync(roomId, ct))!,
                Toast = $"Hết thời gian cản — chọn 1 lá để lấy từ đối thủ.",
            };
        }

        // Advance the turn so the initiator's turn actually ends and the
        // next player is on the clock.
        // AdvanceTurn only resets TurnStartedAt when the attack chain isn't
        // active. For Attack + Skip chains the prior turn's TurnStartedAt is
        // intentionally preserved — the attacked player must draw all their
        // attack cards inside the original 10s window. We mirror that here:
        // capture whether we're starting a fresh attack chain BEFORE the
        // decrement and skip the explicit reset in that case.
        //
        // BUG-NEW fix: respect PendingAction.SkipTurnAdvance so the player's
        // turn doesn't end automatically when they played a peek-style card
        // (e.g. Future). The Nope window expiry just clears the pending
        // state; the same player keeps their turn and must draw or play
        // another card to actually end it.
        if (!pending.SkipTurnAdvance)
        {
            var startingAttackChain = gs.AttackCounter > 0;
            AdvanceTurn(gs, roomId);
            if (gs.EndedAt is null && gs.TurnStartedAt is not null && !startingAttackChain)
            {
                gs.TurnStartedAt = DateTime.UtcNow;
            }
        }
        else
        {
            // The player keeps their turn (peek-style card such as Future).
            // Their turn budget was already consumed by the 10s Nope window,
            // so re-arm the clock — otherwise the turn-clock service would
            // instantly auto-draw for them the moment the window closed.
            if (gs.EndedAt is null)
            {
                gs.TurnStartedAt = DateTime.UtcNow;
            }
        }
        CheckWinCondition(gs);
        await PersistAsync(roomId, gs, ct);
        return new GameActionResult
        {
            Room = (await GetRoomAsync(roomId, ct))!,
            Toast = pending.SkipTurnAdvance
                ? $"Hết thời gian cản — bạn vẫn đang trong lượt."
                : $"Hết thời gian cản — {CardCatalog.Names.GetValueOrDefault(pending.CardKey, pending.CardKey)} đã có hiệu lực.",
        };
    }

    // ──────────────────────────────────────────────────────────────────
    //  Helpers
    // ──────────────────────────────────────────────────────────────────

    public async Task<Room> LoadPlayingRoomAsync(string roomId, CancellationToken ct)
    {
        var room = await GetRoomAsync(roomId, ct)
            ?? throw new DomainException("room_not_found", "Phòng không tồn tại.");
        if (room.GameState is null || room.Status != RoomStatus.Playing)
            throw new DomainException("game_not_started", "Ván chơi chưa bắt đầu hoặc đã kết thúc.");
        return room;
    }

    private async Task PersistAsync(string roomId, GameState gs, CancellationToken ct)
    {
        var status = gs.EndedAt is null ? (RoomStatus?)null : RoomStatus.Finished;
        await (await ResolveWriteRepositoryAsync(roomId, ct)).UpdateGameStateAsync(roomId, gs, status, ct);
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
            // AFK players get timeout=0 so the next tick fires immediately —
            // no 10s wait between turns while they're in auto-play mode.
            // ClientReady gate: skip arming the clock until the first
            // human client has loaded the game UI (MarkClientReadyAsync).
            // Without this, the 10s window would tick down during the
            // few seconds the client needs to navigate from the lobby to
            // the game tab, and the user would be greeted with an AFK
            // modal the moment the game UI appears.
            if (gs.ClientReady)
            {
                var timeoutSeconds = gs.AfkMemberIds.Contains(gs.CurrentTurnMemberId)
                    ? 0
                    : TurnTimeLimitSeconds;
                _turnClock.Register(roomId, gs.TurnStartedAt.Value, timeoutSeconds);
            }
            else
            {
                _turnClock.Unregister(roomId);
            }
        }
        // Server-push: every mutation fans out to every tab subscribed to
        // this room. Clients now get sub-100ms updates instead of waiting
        // for the next polling tick. Broadcast full room snapshot so all
        // clients receive the complete state.
        try
        {
            var room = await GetRoomAsync(roomId, ct);
            if (room != null)
            {
                await _broadcaster.BroadcastRoomSnapshotAsync(roomId, room, ct);
            }
        }
        catch (Exception)
        {
            // Broadcast failures must never corrupt the persisted state —
            // clients will re-sync via the next snapshot poll fallback.
        }
    }

    private static void QueueNopeWindow(GameState gs, string initiatorId, string cardKey, bool skipTurnAdvance = false)
    {
        gs.PendingAction = new PendingAction
        {
            InitiatorId = initiatorId,
            CardKey = cardKey,
            CreatedAt = DateTime.UtcNow,
            NopeChain = [],
            SkipTurnAdvance = skipTurnAdvance,
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
    /// <summary>
    /// Spend combo cards from the hand and move them into the discard pile.
    /// Every played card ends up in the discard pile (bài bỏ) once its action
    /// resolves, so Combo 5-any has material to take back.
    /// </summary>
    private static void SpendComboFromHand(GameState gs, List<string> hand, string key, int count)
    {
        for (var i = 0; i < count; i++)
        {
            if (hand.Remove(key)) AddToDiscardPile(gs, key);
        }
    }

    /// <summary>
    /// Spend <paramref name="count"/> combo cards (any types) from the hand.
    /// Used for mix-type combos (any 2 / any 3 combo cards when N&lt;5).
    /// </summary>
    private static void SpendMixComboFromHand(GameState gs, List<string> hand, int count)
    {
        var removed = 0;
        for (var i = hand.Count - 1; i >= 0 && removed < count; i--)
        {
            if (CardCatalog.IsComboDefuse(hand[i]))
            {
                var key = hand[i];
                hand.RemoveAt(i);
                AddToDiscardPile(gs, key);
                removed++;
            }
        }
    }

    private static void SpendAnyComboFromHand(GameState gs, List<string> hand, int count)
    {
        var removed = 0;
        for (var i = hand.Count - 1; i >= 0 && removed < count; i--)
        {
            if (CardCatalog.IsComboDefuse(hand[i]))
            {
                var key = hand[i];
                hand.RemoveAt(i);
                AddToDiscardPile(gs, key);
                removed++;
            }
        }
    }

    private void ClearFuturePeekAndUnregister(GameState gs, string roomId)
    {
        if (gs.FuturePeek is not null)
        {
            gs.FuturePeek = null;
            gs.FuturePeekAt = null;
            _futurePeek.Unregister(roomId);
        }
    }

    private void AdvanceTurn(GameState gs, string roomId)
    {
        var aliveIds = gs.Alive.Where(kv => kv.Value).Select(kv => kv.Key).ToList();
        if (aliveIds.Count <= 1) return;
        var currentIdx = aliveIds.IndexOf(gs.CurrentTurnMemberId);
        if (currentIdx < 0)
        {
            gs.CurrentTurnMemberId = aliveIds[0];
        }
        else
        {
            var nextIdx = (currentIdx + 1) % aliveIds.Count;
            gs.CurrentTurnMemberId = aliveIds[nextIdx];
        }
        gs.TurnStartedAt = DateTime.UtcNow;
        ClearFuturePeekAndUnregister(gs, roomId);
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
        // Drop dead players from the AFK set so we don't keep tracking them
        // across turns. The set is small (one bool per member) so the
        // linear scan is fine.
        if (gs.AfkMemberIds.Count > 0)
        {
            var aliveSet = new HashSet<string>(aliveIds);
            gs.AfkMemberIds.RemoveWhere(id => !aliveSet.Contains(id));
        }
        // Wipe stale cinematic/peek state on game end so reconnecting players
        // don't see leftover overlays.
        if (gs.EndedAt is not null)
        {
            gs.FuturePeek = null;
            gs.FuturePeekAt = null;
        }
    }

    private async Task MaybeMarkAfkAsync(string roomId, string memberId, bool isAutoDraw, GameState gs, CancellationToken ct)
    {
        if (!isAutoDraw) return;
        if (gs.AfkMemberIds.Contains(memberId)) return;
        if (!gs.Alive.GetValueOrDefault(memberId)) return;

        gs.AfkMemberIds.Add(memberId);
        var member = (await GetRoomAsync(roomId, ct))?.Members.FirstOrDefault(m => m.Id == memberId);
        var memberName = member?.Name ?? "Một người chơi";
        try
        {
            await _broadcaster.BroadcastRoomToastAsync(
                roomId,
                $"{memberName} đang AFK — hệ thống sẽ tự động rút bài.",
                [memberId],
                ct);
        }
        catch
        {
            // Broadcast failures must never corrupt the AFK state — the next
            // snapshot push will carry the AfkMemberIds flag for the UI.
        }
    }

    public async Task<Room> ResumeFromAfkAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        var room = await GetRoomAsync(roomId, ct)
            ?? throw new DomainException("room_not_found", "Phòng không tồn tại.");
        var gs = room.GameState;
        if (gs is null || gs.EndedAt is not null)
            throw new DomainException("game_not_running", "Ván chơi chưa bắt đầu hoặc đã kết thúc.");
        if (!room.Members.Any(m => m.Id == memberId))
            throw new DomainException("member_not_found", "Thành viên không còn trong phòng.");

        var wasAfk = gs.AfkMemberIds.Remove(memberId);
        if (!wasAfk)
        {
            // Idempotent: nothing to do but still return the room so the UI
            // can sync its state.
            return room;
        }

        var member = room.Members.First(m => m.Id == memberId);
        try
        {
            await _broadcaster.BroadcastRoomToastAsync(
                roomId,
                $"{member.Name} đã quay lại.",
                null,
                ct);
        }
        catch
        {
            // Broadcast failures must never corrupt the resume state.
        }

        await PersistAsync(roomId, gs, ct);
        return (await GetRoomAsync(roomId, ct))!;
    }

    /// <summary>
    /// Called by the game page once the UI has finished its initial render.
    /// Tells the server the player is in the room and ready for the turn
    /// clock to start ticking. Without this gate, the 10s AFK window would
    /// tick down during the few seconds the client needs to navigate from
    /// the lobby to the game tab, and the user would be greeted with an
    /// AFK modal the moment the game UI appears.
    /// </summary>
    /// <remarks>
    /// Idempotent: the first /ready call arms the clock and subsequent calls
    /// are no-ops (so two players calling it in close succession don't
    /// double-register). When the room is in a state that no longer needs a
    /// clock (ended game, nope window open, bomb reveal) we skip the
    /// registration — PersistAsync will arm it once the game returns to a
    /// normal state.
    /// </remarks>
    public async Task<Room> MarkClientReadyAsync(string roomId, string memberId, CancellationToken ct = default)
    {
        var room = await GetRoomAsync(roomId, ct)
            ?? throw new DomainException("room_not_found", "Phòng không tồn tại.");
        var gs = room.GameState;
        if (gs is null || gs.EndedAt is not null)
            throw new DomainException("game_not_running", "Ván chơi chưa bắt đầu hoặc đã kết thúc.");
        if (!room.Members.Any(m => m.Id == memberId))
            throw new DomainException("member_not_found", "Thành viên không còn trong phòng.");

        var wasReady = gs.ClientReady;
        gs.ClientReady = true;

        // Only arm the clock on the transition false→true so a reconnect
        // (where ClientReady is already true) doesn't reset TurnStartedAt
        // and accidentally give the current player a fresh 10s window.
        if (!wasReady
            && gs.EndedAt is null
            && gs.PendingAction is null
            && !gs.BombRevealActive
            && gs.TurnStartedAt is not null
            && !string.IsNullOrEmpty(gs.CurrentTurnMemberId))
        {
            // Fresh start — anchor the clock to "now" so the player gets a
            // full 10s window from the moment they actually see the game UI.
            // Otherwise the timer would have burned the seconds they spent
            // loading the page.
            gs.TurnStartedAt = DateTime.UtcNow;
            var timeoutSeconds = gs.AfkMemberIds.Contains(gs.CurrentTurnMemberId)
                ? 0
                : TurnTimeLimitSeconds;
            _turnClock.Register(roomId, gs.TurnStartedAt.Value, timeoutSeconds);
        }

        await PersistAsync(roomId, gs, ct);
        return (await GetRoomAsync(roomId, ct))!;
    }

    /// <summary>
    /// Defensive deep-clone of a <see cref="GameState"/> so the caller can
    /// mutate the returned copy without leaking into the cache or the
    /// repository's in-memory dict. Kept private to <see cref="GameService"/>
    /// (rather than relying on <c>RoomSnapshot</c> in Infrastructure) so the
    /// Application layer doesn't take a new dependency on Infrastructure.
    /// </summary>
    private static GameState CloneGameStateForMutation(GameState source)
    {
        return new GameState
        {
            Deck = [.. source.Deck],
            DiscardPile = [.. source.DiscardPile],
            PreShuffleDeck = source.PreShuffleDeck?.ToList(),
            PreAttackCounter = source.PreAttackCounter,
            Hands = source.Hands.ToDictionary(k => k.Key, k => k.Value.ToList()),
            CurrentTurnMemberId = source.CurrentTurnMemberId,
            AttackCounter = source.AttackCounter,
            TurnsTaken = source.TurnsTaken.ToDictionary(k => k.Key, k => k.Value),
            CardsPlayed = source.CardsPlayed.ToDictionary(k => k.Key, k => k.Value),
            Alive = source.Alive.ToDictionary(k => k.Key, k => k.Value),
            DiedAt = source.DiedAt.ToDictionary(k => k.Key, k => k.Value),
            StartedAt = source.StartedAt,
            EndedAt = source.EndedAt,
            WinnerId = source.WinnerId,
            PendingAction = source.PendingAction is null ? null : new PendingAction
            {
                InitiatorId = source.PendingAction.InitiatorId,
                CardKey = source.PendingAction.CardKey,
                DiscardPickKey = source.PendingAction.DiscardPickKey,
                CreatedAt = source.PendingAction.CreatedAt,
                NopeChain = [.. source.PendingAction.NopeChain],
                // BUG-NEW fix: SkipTurnAdvance MUST survive the clone. It is
                // what tells ResolveExpiredNopeAsync that a peek-style card
                // (Future) must NOT end the player's turn when the Nope
                // window closes. Without it every Future would silently
                // advance the turn.
                SkipTurnAdvance = source.PendingAction.SkipTurnAdvance,
            },
            TurnStartedAt = source.TurnStartedAt,
            ClientReady = source.ClientReady,
            TurnOrder = [.. source.TurnOrder],
            DrawOnlyBotIds = source.DrawOnlyBotIds is null ? [] : new HashSet<string>(source.DrawOnlyBotIds),
            PlayCardsBotIds = source.PlayCardsBotIds is null ? [] : new HashSet<string>(source.PlayCardsBotIds),
            DisableBotService = source.DisableBotService,
            BotTurnSeconds = source.BotTurnSeconds,
            LastDrawnBy = source.LastDrawnBy,
            LastDrawnCardKey = source.LastDrawnCardKey,
            LastDrawnAt = source.LastDrawnAt,
            BombRevealActive = source.BombRevealActive,
            LastPlayedCardKey = source.LastPlayedCardKey,
            LastPlayedBy = source.LastPlayedBy,
            LastPlayedAt = source.LastPlayedAt,
            LastPlayedByNope = source.LastPlayedByNope,
            PendingFavorPick = source.PendingFavorPick,
            // FIX: PendingTargetPick (Favor phase-1 / combo target picker)
            // was missing from the clone, so the 10s picker timeout state
            // was silently dropped every time the state was cloned for
            // mutation. The sweeper then never saw a pending picker and
            // the room stalled forever waiting for a target that the
            // server had already forgotten about.
            PendingTargetPick = source.PendingTargetPick is null ? null : new PendingTargetPick
            {
                Kind = source.PendingTargetPick.Kind,
                CardKey = source.PendingTargetPick.CardKey,
                InitiatorId = source.PendingTargetPick.InitiatorId,
                CandidateMemberIds = [.. source.PendingTargetPick.CandidateMemberIds],
                CreatedAt = source.PendingTargetPick.CreatedAt,
            },
            // FIX: OneCardBotCardMap was missing from the clone, so the
            // "play one specific card" bot mode silently degraded to
            // draw-only every time the state was cloned for mutation. The
            // BotService reads the map from the cached state — without it,
            // `isOneCardBot` was always false and the designated card was
            // never played.
            OneCardBotCardMap = source.OneCardBotCardMap != null
                ? new Dictionary<string, string>(source.OneCardBotCardMap)
                : [],
            FuturePeek = source.FuturePeek?.ToList(),
            FuturePeekAt = source.FuturePeekAt,
            AfkMemberIds = new HashSet<string>(source.AfkMemberIds),
        };
    }
}
