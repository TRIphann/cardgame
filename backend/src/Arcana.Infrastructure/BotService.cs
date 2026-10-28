using Arcana.Application.Abstractions;
using Arcana.Application.Services;
using Arcana.Application.Game;
using Arcana.Domain.Common;
using Arcana.Domain.Entities;
using Arcana.Domain.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Arcana.Infrastructure;

/// <summary>
/// Background service that monitors active games and auto-draws for bot players.
/// Each room gets a dedicated scope so scoped services (GameService, repository)
/// are properly disposed after each draw operation.
/// </summary>
public sealed class BotService(
    IServiceScopeFactory scopeFactory,
    ILogger<BotService> logger,
    IActiveTestRoom activeTestRoom) : BackgroundService
{
    /// <summary>How often the background loop scans for bot turns.</summary>
    private const int PollIntervalMs = 1500;
    /// <summary>Fast poll interval for test mode (when BotTurnSeconds is set).</summary>
    private const int FastPollIntervalMs = 300;
    /// <summary>Backoff delay once we've seen Firestore quota errors.</summary>
    private const int QuotaBackoffMs = 30_000;
    /// <summary>How long to suppress polling after a quota error.</summary>
    private static readonly TimeSpan QuotaCooldown = TimeSpan.FromSeconds(60);

    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<BotService> _logger = logger;
    private readonly IActiveTestRoom _activeTestRoom = activeTestRoom;
    private long _quotaCooldownUntilTicks;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "BotService started (poll={PollMs}ms)",
            PollIntervalMs);

        while (!stoppingToken.IsCancellationRequested)
        {
            // Suppress polling when we're in a Firestore-quota cooldown window.
            // Without this, every 1.5s the loop hammers the project and we hit
            // RESOURCE_EXHAUSTED within seconds, drowning the log and starving
            // user-facing requests.
            var nowTicks = DateTime.UtcNow.Ticks;
            if (nowTicks < Interlocked.Read(ref _quotaCooldownUntilTicks))
            {
                await SafeDelay(PollIntervalMs, stoppingToken);
                continue;
            }

            try
            {
                // Use fast polling for test mode
                var hasTestRoom = HasTestRoomActive();
                var pollMs = hasTestRoom ? FastPollIntervalMs : PollIntervalMs;
                await TickAsync(stoppingToken);
                await SafeDelay(pollMs, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                if (IsQuotaError(ex))
                {
                    var until = DateTime.UtcNow + QuotaCooldown;
                    Interlocked.Exchange(ref _quotaCooldownUntilTicks, until.Ticks);
                    _logger.LogWarning(
                        "BotService hit Firestore quota; backing off until {Until:o}",
                        until);
                    await SafeDelay(QuotaBackoffMs, stoppingToken);
                    continue;
                }
                _logger.LogError(ex, "BotService tick failed");
            }

            await SafeDelay(PollIntervalMs, stoppingToken);
        }

        _logger.LogInformation("BotService stopped");
    }

    private static async Task SafeDelay(int ms, CancellationToken stoppingToken)
    {
        try { await Task.Delay(ms, stoppingToken); }
        catch (OperationCanceledException) { }
    }

    private bool HasTestRoomActive() => !string.IsNullOrEmpty(_activeTestRoom.CurrentRoomId);

    private static bool IsQuotaError(Exception ex)
    {
        for (var e = ex; e != null; e = e.InnerException)
        {
            var msg = e.Message;
            if (msg != null && msg.Contains("Quota exceeded", StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    private async Task TickAsync(CancellationToken ct)
    {
        // Create a fresh scope for this tick
        using var scope = _scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var gameService = sp.GetRequiredService<GameService>();

        // Poll rooms from the cache (zero Firestore reads during gameplay).
        // Cache is populated by every room mutation (join, draw, play, etc.),
        // so it's always warm for active games.
        var roomIds = sp.GetRequiredService<IRoomCache>().Keys();
        if (roomIds.Count == 0) return;

        foreach (var roomId in roomIds)
        {
            var cachedRoom = sp.GetRequiredService<IRoomCache>().Get(roomId);
            if (cachedRoom == null) continue;

            // Clone to avoid mutating the cached reference
            var room = CloneRoom(cachedRoom);
            var gs = room.GameState;
            if (gs == null || gs.EndedAt != null) continue;

            // Skip rooms where BotService is disabled (manual testing mode)
            if (gs.DisableBotService) continue;

            var currentTurnId = gs.CurrentTurnMemberId;
            if (string.IsNullOrEmpty(currentTurnId)) continue;

            // Find the current player
            var currentMember = room.Members.FirstOrDefault(m => m.Id == currentTurnId);
            if (currentMember == null) continue;

            // Only act for bots
            if (!currentMember.IsBot) continue;

            // Check if this bot should draw (not during pending action window)
            if (gs.PendingAction != null) continue;

            // Check bot turn timer - wait for the configured seconds before acting
            if (gs.BotTurnSeconds > 0 && gs.TurnStartedAt.HasValue)
            {
                var elapsed = (DateTime.UtcNow - gs.TurnStartedAt.Value).TotalSeconds;
                if (elapsed < gs.BotTurnSeconds)
                {
                    // Not yet time to act - wait for the remaining time
                    continue;
                }
            }

            // Determine bot behavior based on game state flags
            var shouldPlayCards = gs.PlayCardsBotIds?.Contains(currentTurnId) ?? false;
            var isDrawOnly = gs.DrawOnlyBotIds?.Contains(currentTurnId) ?? false;
            // "Play one specific card" mode: bot draws first (like draw-only),
            // then attempts to play the designated card if it's now in hand.
            // Distinct from `shouldPlayCards` (which plays any of the priority
            // action cards using `TryPlayActionCardAsync`). Distinct from
            // `isDrawOnly` (which NEVER plays cards).
            var isOneCardBot = !string.IsNullOrEmpty(gs.OneCardBotCardMap?.GetValueOrDefault(currentTurnId));

            // If bot is in none of the three sets, skip their turn entirely
            if (!isDrawOnly && !shouldPlayCards && !isOneCardBot)
            {
                continue;
            }

            _logger.LogDebug(
                "Bot {BotName} mode in room {RoomId}: drawOnly={DrawOnly} playCards={PlayCards} oneCard={OneCard}",
                currentMember.Name, roomId, isDrawOnly, shouldPlayCards, isOneCardBot);

            // ── Draw-only bot: draw, defuse if bomb (then die), or die ──
            if (isDrawOnly)
            {
                await HandleDrawOnlyBotAsync(gameService, room, currentTurnId, currentMember, ct);
                continue;
            }

            // ── One-card bot: draw first, THEN try to play the designated card ──
            // The draw happens unconditionally (same shape as a normal human
            // turn: you take a card, THEN you may play). After the draw we
            // check whether the requested card landed in hand — if not, the
            // turn ends naturally on the next loop iteration. We do NOT play
            // before drawing, because playing consumes the card from the
            // hand and would skip the required draw step.
            if (isOneCardBot && gs.AttackCounter == 0)
            {
                var drewAndPlayed = await HandleOneCardBotAsync(
                    gameService,
                    sp.GetRequiredService<IRoomCache>(),
                    room, currentTurnId, currentMember, gs, ct);

                // If turn advanced while we were working, skip the rest of
                // this tick. The cache re-fetch inside HandleOneCardBotAsync
                // catches the case where the play-card action queued a Nope
                // window (turn hasn't advanced yet but PendingAction != null
                // — we leave the resolution to the next tick).
                if (drewAndPlayed) continue;
            }

            // ── Play-cards bot: try to play an action card first ──
            if (shouldPlayCards && gs.AttackCounter == 0)
            {
                var hand = gs.Hands.TryGetValue(currentTurnId, out var h) ? h : null;
                if (hand != null && hand.Count > 0)
                {
                    var playedCard = await TryPlayActionCardAsync(gameService, sp.GetRequiredService<IRoomCache>(), room.Id, currentTurnId, hand, gs, ct);
                    if (playedCard != null)
                    {
                        _logger.LogInformation(
                            "Bot {BotName} played {CardKey} in room {RoomId}",
                            currentMember.Name,
                            playedCard,
                            room.Id);

                        // IMPORTANT: Re-fetch the room from cache to get ACTUAL state
                        // The cloned state above might not reflect DB changes yet.
                        // Without this, the loop sees stale gs.AttackCounter/gs.PendingAction
                        // and incorrectly thinks the turn didn't advance.
                        var updatedRoom = sp.GetRequiredService<IRoomCache>().Get(roomId);
                        if (updatedRoom?.GameState != null)
                        {
                            var updatedGs = updatedRoom.GameState;
                            // If turn advanced or there's a pending action, skip this bot for now
                            if (updatedGs.CurrentTurnMemberId != currentTurnId || updatedGs.PendingAction != null)
                            {
                                continue;
                            }
                        }
                        // Turn still on this player — done for this tick
                        continue;
                    }
                }
            }

            // Otherwise, auto-draw (normal draw behavior)
            try
            {
                // Loop until the attack chain is fully resolved or the deck runs dry.
                // DrawCardAsync returns RequiresMoreDraws when an attack chain has
                // remaining draws. We keep drawing until the turn actually advances
                // or the deck empties.
                var drawResult = await gameService.DrawCardAsync(room.Id, currentTurnId, ct: ct);

                if (drawResult.RequiresMoreDraws && drawResult.RemainingDraws > 0)
                {
                    // Still inside an attack chain — keep drawing for the same player.
                    // Add a small delay so rapid draws don't all land in the same
                    // server tick and make logs hard to read.
                    await Task.Delay(200, ct);
                    continue;
                }

                _logger.LogInformation(
                    "Bot {BotName} drew {CardKey} in room {RoomId}",
                    currentMember.Name,
                    drawResult.DrawnCardKey ?? "unknown",
                    room.Id);
            }
            catch (DomainException ex) when (ex.Code is "not_your_turn" or "action_pending")
            {
                // Race condition: turn changed or pending action appeared
                _logger.LogDebug(
                    "Bot {BotName} skipped draw in room {RoomId}: {Reason}",
                    currentMember.Name, room.Id, ex.Code);
            }
            catch (DomainException ex) when (ex.Code is "deck_empty" or "deck_empty_during_attack")
            {
                // Deck exhausted — the game logic already advanced the turn.
                // Log and continue to the next room.
                _logger.LogInformation(
                    "Bot {BotName} hit empty deck in room {RoomId}; game logic advanced the turn",
                    currentMember.Name, room.Id);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Bot draw failed for {BotName} in room {RoomId}",
                    currentMember.Name, room.Id);
            }
        }
    }

    /// <summary>
    /// Handles draw-only bots: continuously draw cards until the attack chain is resolved
    /// (or deck is empty). If bomb is drawn and bot has defuse, it defuses and dies.
    /// If bomb is drawn without defuse, the bot dies immediately.
    /// </summary>
    private async Task HandleDrawOnlyBotAsync(
        GameService gameService,
        Room room,
        string memberId,
        RoomMember currentMember,
        CancellationToken ct)
    {
        try
        {
            // Keep drawing until the attack chain is resolved or deck is empty
            while (true)
            {
                // Draw a card - DrawCardAsync returns fresh room state
                var drawResult = await gameService.DrawCardAsync(room.Id, memberId, ct: ct);
                var freshRoom = drawResult.Room;
                var freshGs = freshRoom?.GameState;
                var freshHand = freshGs?.Hands?.TryGetValue(memberId, out var fh) == true ? fh : null;

                if (drawResult.RequiresDefuse && freshHand != null)
                {
                    // Drew a bomb and has defuse - defuse at random position, then die
                    _logger.LogInformation(
                        "Draw-only bot {BotName} drew bomb, defusing in room {RoomId}",
                        currentMember.Name, room.Id);

                    // Use fresh deck count from the result room for slot position
                    var freshDeckCount = freshGs?.Deck?.Count ?? 0;
                    var slotIndex = Random.Shared.Next(freshDeckCount + 1);
                    await gameService.UseDefuseAsync(room.Id, memberId, slotIndex, ct);

                    _logger.LogInformation(
                        "Draw-only bot {BotName} defused bomb and died in room {RoomId}",
                        currentMember.Name, room.Id);
                    return; // Bot died, exit the loop
                }

                _logger.LogInformation(
                    "Draw-only bot {BotName} drew {CardKey} in room {RoomId}",
                    currentMember.Name,
                    drawResult.DrawnCardKey ?? "unknown",
                    room.Id);

                // Check if we need more draws (attack chain)
                if (!drawResult.RequiresMoreDraws || drawResult.RemainingDraws <= 0)
                {
                    // No more forced draws - either turn advanced or deck empty
                    return;
                }

                // Still in attack chain - small delay then continue drawing
                await Task.Delay(200, ct);
            }
        }
        catch (DomainException ex) when (ex.Code is "not_your_turn" or "action_pending")
        {
            _logger.LogDebug(
                "Draw-only bot {BotName} skipped in room {RoomId}: {Reason}",
                currentMember.Name, room.Id, ex.Code);
        }
        catch (DomainException ex) when (ex.Code is "deck_empty")
        {
            _logger.LogInformation(
                "Draw-only bot {BotName} hit empty deck in room {RoomId}",
                currentMember.Name, room.Id);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Draw-only bot failed for {BotName} in room {RoomId}",
                currentMember.Name, room.Id);
        }
    }

    /// <summary>
    /// Handles "play one specific card" bots. This bot will ONLY play the
    /// designated card if it's already in hand; it does NOT draw first.
    /// If the card isn't present, the bot falls back to the standard draw
    /// behavior (draw once, then advance turn).
    ///
    /// Returns true if the bot's turn ended (either by playing the card
    /// or by drawing and having no card to play). The outer TickAsync loop
    /// skips the rest of this tick on true so we don't re-fire against a
    /// stale `gs.CurrentTurnMemberId`.
    /// </summary>
    private async Task<bool> HandleOneCardBotAsync(
        GameService gameService,
        IRoomCache roomCache,
        Room room,
        string memberId,
        RoomMember currentMember,
        GameState gs,
        CancellationToken ct)
    {
        var designatedCard = gs.OneCardBotCardMap?.GetValueOrDefault(memberId);
        if (string.IsNullOrEmpty(designatedCard))
        {
            // Misconfigured — no card designated. Fall back to a draw so
            // the turn isn't dropped on the floor.
            _logger.LogWarning(
                "One-card bot {BotName} has no designated card in room {RoomId}; drawing only",
                currentMember.Name, room.Id);
            await SafeDrawAsync(gameService, room.Id, memberId, ct);
            return true;
        }

        var hand = gs.Hands.GetValueOrDefault(memberId);
        if (hand == null || !hand.Contains(designatedCard))
        {
            // Card not in hand — fall back to draw behavior
            _logger.LogInformation(
                "One-card bot {BotName} doesn't have {CardKey} in hand (room {RoomId}); drawing instead",
                currentMember.Name, designatedCard, room.Id);
            await SafeDrawAsync(gameService, room.Id, memberId, ct);
            return true;
        }

        // Card is in hand — play it (if eligible)
        // For Defuse variants we never auto-play (they're emergency cards).
        if (designatedCard is "defuse" or "ninja" or "superman" or "zombie" or "robot" or "hải-tặc")
        {
            _logger.LogInformation(
                "One-card bot {BotName} found {CardKey} but defuse variants can't be played from the hand (room {RoomId}); drawing instead",
                currentMember.Name, designatedCard, room.Id);
            await SafeDrawAsync(gameService, room.Id, memberId, ct);
            return true;
        }

        try
        {
            string? targetId = null;
            if (designatedCard is "favor")
            {
                // Re-fetch fresh state to get accurate alive list. Favor
                // requires the target to have at least 1 card in hand (the
                // server rejects with "target_empty" otherwise) — filter
                // candidates down to alive members who actually have cards,
                // not just "alive". Without this filter the bot could pick
                // an alive-but-empty-handed member (common in test-lobby
                // scenarios where only some players get custom hands) and
                // the play would always fail.
                var freshRoom = roomCache.Get(room.Id);
                var freshGs = freshRoom?.GameState ?? gs;
                var aliveOthers = freshGs.Alive
                    .Where(kv => kv.Value
                        && kv.Key != memberId
                        && (freshGs.Hands.GetValueOrDefault(kv.Key)?.Count ?? 0) > 0)
                    .Select(kv => kv.Key)
                    .ToList();
                if (aliveOthers.Count == 0)
                {
                    _logger.LogInformation(
                        "One-card bot {BotName} has no valid target (with cards) for {CardKey} (room {RoomId}); drawing instead",
                        currentMember.Name, designatedCard, room.Id);
                    await SafeDrawAsync(gameService, room.Id, memberId, ct);
                    return true;
                }
                targetId = aliveOthers[Random.Shared.Next(aliveOthers.Count)];
            }

            await gameService.PlayCardAsync(room.Id, memberId, designatedCard, targetId, null, null, ct);

            _logger.LogInformation(
                "One-card bot {BotName} played designated {CardKey} in room {RoomId}",
                currentMember.Name, designatedCard, room.Id);
            return true;
        }
        catch (DomainException ex)
        {
            // Card couldn't be played (server rejected: not in hand, no
            // targets, pending action, etc). Fall back to draw.
            _logger.LogInformation(
                "One-card bot {BotName} FAILED to play {CardKey} in room {RoomId}: {Reason}; drawing instead",
                currentMember.Name, designatedCard, room.Id, ex.Code);
            await SafeDrawAsync(gameService, room.Id, memberId, ct);
            return true;
        }
    }

    /// <summary>
    /// Lightweight single-shot draw helper used as a fallback when a bot
    /// is configured inconsistently (e.g. flagged as a "one-card" bot but
    /// without a designated card). Equivalent to a single iteration of the
    /// draw-only loop, with the same bomb/defuse semantics delegated to
    /// GameService.DrawCardAsync / UseDefuseAsync.
    /// </summary>
    private static async Task SafeDrawAsync(
        GameService gameService,
        string roomId,
        string memberId,
        CancellationToken ct)
    {
        try
        {
            await gameService.DrawCardAsync(roomId, memberId, ct: ct);
        }
        catch (DomainException)
        {
            // Ignore: not_your_turn / action_pending / deck_empty are all
            // situations where the next tick will re-evaluate.
        }
    }

    /// Attempts to play an action card from the bot's hand.
    /// Priority: Attack > Skip > Favor > Shuffle > Future > Nope > combo cards.
    /// Returns the card key if a card was played, null otherwise.
    /// </summary>
    private async Task<string?> TryPlayActionCardAsync(
        GameService gameService,
        IRoomCache roomCache,
        string roomId,
        string memberId,
        List<string> hand,
        GameState gs,
        CancellationToken ct)
    {
        // Priority order for action cards
        var priorityCards = new[]
        {
            CardCatalog.Attack,
            CardCatalog.Skip,
            CardCatalog.Favor,
            CardCatalog.Shuffle,
            CardCatalog.Future,
            CardCatalog.Nope,
        };

        foreach (var cardKey in priorityCards)
        {
            if (hand.Contains(cardKey))
            {
                // Try to play the card
                try
                {
                    // For Favor, we need a target
                    if (cardKey == CardCatalog.Favor)
                    {
                        // Only target alive members who actually have cards
                        // in hand — the server rejects Favor with
                        // "target_empty" if the target's hand is empty, so
                        // filtering here avoids a wasted PlayCardAsync call
                        // (and, worse, a permanently-consumed Favor card).
                        var aliveOthers = gs.Alive
                            .Where(kv => kv.Value
                                && kv.Key != memberId
                                && (gs.Hands.GetValueOrDefault(kv.Key)?.Count ?? 0) > 0)
                            .Select(kv => kv.Key)
                            .ToList();
                        if (aliveOthers.Count == 0) continue;

                        // Pick a random target
                        var targetId = aliveOthers[Random.Shared.Next(aliveOthers.Count)];
                        var result = await gameService.PlayCardAsync(roomId, memberId, cardKey, targetId, null, null, ct);

                        // The server splits Favor into two phases.
                        //   - Phase 1 (target chosen): server returns
                        //     RequiresFavorTargetPick=true and queues a 5s
                        //     Nope window via QueueNopeWindow. We must WAIT
                        //     for the window to expire before driving phase 2,
                        //     otherwise we bypass the Nope chain — which is
                        //     what human players see on their side (they'd
                        //     press Nope and watch the card swap in the
                        //     background, with no chance to react). The fix
                        //     is to wait for `gs.PendingAction == null` here
                        //     before invoking phase 2. The NopeWindowTimeout
                        //     background service will clear PendingAction
                        //     via ResolveExpiredNopeAsync after ~5s; we poll
                        //     the cached room with a small interval so we
                        //     don't hammer Firestore.
                        if (result.RequiresFavorTargetPick && !string.IsNullOrEmpty(result.FavorTargetId))
                        {
                            const int pollMs = 200;
                            const int maxWaitMs = 6000; // generous: 5s window + 1s slack
                            var waited = 0;
                            while (waited < maxWaitMs)
                            {
                                var cachedRoom = roomCache.Get(roomId);
                                if (cachedRoom?.GameState?.PendingAction is null) break;
                                await Task.Delay(pollMs, ct);
                                waited += pollMs;
                            }
                            // Re-fetch the room from cache to get ACTUAL state
                            // after the Nope window expired (the cloned state
                            // above might not reflect DB changes yet).
                            var updatedRoom = roomCache.Get(roomId);
                            var updatedGs = updatedRoom?.GameState;
                            var favPending = updatedGs?.PendingFavorPick;
                            var candidates = favPending?.ShuffledCandidates
                                ?? result.FavorCandidates
                                ?? [];
                            // Don't pick the bomb — the server rejects it.
                            var pool = candidates.Where(c => c != CardCatalog.Bomb).ToList();
                            if (pool.Count == 0)
                            {
                                _logger.LogInformation(
                                    "Bot played Favor but target has no giftable cards");
                            }
                            else
                            {
                                var pickedCard = pool[Random.Shared.Next(pool.Count)];
                                // Phase 2 for the bot: caller is the TARGET,
                                // not the actor. We pass the target member id
                                // and the picked card to PlayCardAsync — the
                                // server detects the favor target-phase2 path
                                // via the pending pick state.
                                await gameService.PlayCardAsync(
                                    roomId, result.FavorTargetId, cardKey, memberId, null, pickedCard, ct);
                            }
                        }
                        else if (result.RequiresFavorPick && result.FavorCandidates?.Count > 0)
                        {
                            // Legacy Favor phase 2 (actor picks) — same
                            // 5s Nope window is open. Wait for it to expire
                            // before resolving so a real Nope can still
                            // cancel the action.
                            const int pollMs2 = 200;
                            const int maxWaitMs2 = 6000;
                            var waited2 = 0;
                            while (waited2 < maxWaitMs2)
                            {
                                var cachedRoom2 = roomCache.Get(roomId);
                                if (cachedRoom2?.GameState?.PendingAction is null) break;
                                await Task.Delay(pollMs2, ct);
                                waited2 += pollMs2;
                            }
                            var pickedCard = result.FavorCandidates[Random.Shared.Next(result.FavorCandidates.Count)];
                            await gameService.PlayCardAsync(roomId, memberId, cardKey, targetId, null, pickedCard, ct);
                        }
                        return cardKey;
                    }

                    // For other cards, play directly
                    await gameService.PlayCardAsync(roomId, memberId, cardKey, null, null, null, ct);
                    return cardKey;
                }
                catch (DomainException)
                {
                    // Card couldn't be played (e.g., no valid target), try next
                    continue;
                }
            }
        }

        // Try combo cards (2+ same type)
        var comboCards = new[] { "ninja", "superman", "zombie", "robot", "hải-tặc" };
        foreach (var comboKey in comboCards)
        {
            var count = hand.Count(c => c == comboKey);
            if (count >= 2)
            {
                try
                {
                    // For 2-same combo, need a target
                    var aliveOthers = gs.Alive
                        .Where(kv => kv.Value && kv.Key != memberId)
                        .Select(kv => kv.Key)
                        .ToList();
                    if (aliveOthers.Count > 0)
                    {
                        var targetId = aliveOthers[Random.Shared.Next(aliveOthers.Count)];
                        var result = await gameService.PlayCardAsync(roomId, memberId, comboKey, targetId, null, null, ct);

                        // Phase 2: pick a random card from target's shuffled candidates.
                        // The combo 2-same server flow also uses RequiresFavorPick
                        // (re-using the favor pick plumbing). Same fix as Favor:
                        // also handle the case where the server returned the
                        // candidates inline so we don't leave the combo half-played.
                        if (result.RequiresFavorPick && result.FavorCandidates?.Count > 0)
                        {
                            var pickedCard = result.FavorCandidates[Random.Shared.Next(result.FavorCandidates.Count)];
                            await gameService.PlayCardAsync(roomId, memberId, comboKey, targetId, null, pickedCard, ct);
                        }
                        return comboKey;
                    }
                }
                catch (DomainException)
                {
                    continue;
                }
            }
        }

        return null;
    }

    private static Room CloneRoom(Room source)
    {
        var clone = new Room
        {
            Id = source.Id,
            Code = source.Code,
            HostId = source.HostId,
            HostName = source.HostName,
            Status = source.Status,
            MaxPlayers = source.MaxPlayers,
            CreatedAt = source.CreatedAt,
            GameState = CloneGameState(source.GameState),
        };

        foreach (var member in source.Members)
        {
            clone.Members.Add(new RoomMember
            {
                Id = member.Id,
                Name = member.Name,
                IsHost = member.IsHost,
                IsReady = member.IsReady,
                JoinedAt = member.JoinedAt,
                LastSeenAt = member.LastSeenAt,
                IsOnline = member.IsOnline,
                IsBot = member.IsBot,
            });
        }

        return clone;
    }

    private static GameState? CloneGameState(GameState? source)
    {
        if (source is null) return null;

        return new GameState
        {
            Deck = [.. source.Deck],
            DiscardPile = [.. source.DiscardPile],
            PreShuffleDeck = source.PreShuffleDeck?.ToList(),
            PreAttackCounter = source.PreAttackCounter,
            CurrentTurnMemberId = source.CurrentTurnMemberId,
            AttackCounter = source.AttackCounter,
            TurnStartedAt = source.TurnStartedAt,
            TurnOrder = [.. source.TurnOrder],
            WinnerId = source.WinnerId,
            StartedAt = source.StartedAt,
            EndedAt = source.EndedAt,
            ClientReady = source.ClientReady,
            FuturePeek = source.FuturePeek?.ToList(),
            FuturePeekAt = source.FuturePeekAt,
            PendingAction = ClonePendingAction(source.PendingAction),
            Hands = source.Hands.ToDictionary(k => k.Key, k => k.Value.ToList()),
            Alive = source.Alive.ToDictionary(k => k.Key, k => k.Value),
            DiedAt = source.DiedAt.ToDictionary(k => k.Key, k => k.Value),
            TurnsTaken = source.TurnsTaken.ToDictionary(k => k.Key, k => k.Value),
            CardsPlayed = source.CardsPlayed.ToDictionary(k => k.Key, k => k.Value),
            LastDrawnBy = source.LastDrawnBy,
            LastDrawnCardKey = source.LastDrawnCardKey,
            LastDrawnAt = source.LastDrawnAt,
            BombRevealActive = source.BombRevealActive,
            LastPlayedCardKey = source.LastPlayedCardKey,
            LastPlayedBy = source.LastPlayedBy,
            LastPlayedAt = source.LastPlayedAt,
            LastPlayedByNope = source.LastPlayedByNope,
            PendingFavorPick = source.PendingFavorPick,
            DisableBotService = source.DisableBotService,
            // Null-safe clone of bot configuration. The defensive
            // `?? new HashSet<string>()` avoids passing `null` into the
            // HashSet constructor (which would NRE) and keeps the cloned
            // state's HashSet fields non-nullable as the domain type
            // promises. The previous `? : null` arms triggered CS8601
            // ("possible null reference assignment") AND would NRE on the
            // next caller that iterated the set.
            DrawOnlyBotIds = source.DrawOnlyBotIds != null
                ? new HashSet<string>(source.DrawOnlyBotIds)
                : [],
            PlayCardsBotIds = source.PlayCardsBotIds != null
                ? new HashSet<string>(source.PlayCardsBotIds)
                : [],
            // FIX: OneCardBotCardMap was missing from the clone. Without this
            // the "play one specific card" bot mode silently degrades to
            // draw-only because the cached state the BotService reads had
            // no record of which card each bot was supposed to play.
            OneCardBotCardMap = source.OneCardBotCardMap != null
                ? new Dictionary<string, string>(source.OneCardBotCardMap)
                : [],
            AfkMemberIds = source.AfkMemberIds != null ? new HashSet<string>(source.AfkMemberIds) : [],
            // FIX: BotTurnSeconds was missing, causing bots to never act (they
            // check `elapsed < BotTurnSeconds` but cloned gs always has 0).
            BotTurnSeconds = source.BotTurnSeconds,
        };
    }

    private static PendingAction? ClonePendingAction(PendingAction? source)
    {
        if (source is null) return null;
        return new PendingAction
        {
            InitiatorId = source.InitiatorId,
            CardKey = source.CardKey,
            DiscardPickKey = source.DiscardPickKey,
            CreatedAt = source.CreatedAt,
            NopeChain = [.. source.NopeChain],
            // FIX: SkipTurnAdvance was missing from the clone.
            SkipTurnAdvance = source.SkipTurnAdvance,
        };
    }
}
