using Arcana.Application.Abstractions;
using Arcana.Application.Services;
using Arcana.Domain.Entities;
using Arcana.Domain.Enums;
using Microsoft.AspNetCore.Mvc;

namespace Arcana.Api.Controllers;

[ApiController]
[Route("api/test")]
public class TestController(
    GameService gameService,
    ITestRoomRepository inMemoryRepository,
    IActiveTestRoom activeTestRoom,
    IGameBroadcaster broadcaster) : ControllerBase
{
    private readonly GameService _gameService = gameService;
    private readonly ITestRoomRepository _inMemoryRepository = inMemoryRepository;
    private readonly IActiveTestRoom _activeTestRoom = activeTestRoom;
    private readonly IGameBroadcaster _broadcaster = broadcaster;

    private static readonly string[] BotNames =
    [
        "🤖 Bot Alpha", "🤖 Bot Beta", "🤖 Bot Gamma", "🤖 Bot Delta"
    ];

    /// <summary>
    /// Creates a test room with 4 bots and returns the room info.
    /// Room code is always "TEST".
    /// Bots auto-ready and auto-draw when it's their turn.
    /// This method creates the room entirely in-memory, bypassing Firestore.
    /// </summary>
    [HttpPost("room")]
    public async Task<IActionResult> CreateTestRoom([FromBody] CreateTestRoomRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.HostName))
            return BadRequest(new { error = "Host name is required" });

        try
        {
            var hostId = Guid.NewGuid().ToString("N");
            var roomId = Guid.NewGuid().ToString("N");

            // Create room directly in memory (bypass RoomService to avoid Firestore)
            var room = new Room
            {
                Id = roomId,
                Code = "TEST",
                HostId = hostId,
                HostName = request.HostName.Trim(),
                Status = RoomStatus.Waiting,
                MaxPlayers = 8,
                CreatedAt = DateTime.UtcNow,
            };

            // Add host as member
            room.Members.Add(new RoomMember
            {
                Id = hostId,
                Name = request.HostName.Trim(),
                IsHost = true,
                IsReady = true,
                JoinedAt = DateTime.UtcNow,
                LastSeenAt = DateTime.UtcNow,
                IsOnline = true,
                IsBot = false,
            });

            // Add 4 bots as members
            for (int i = 0; i < 4; i++)
            {
                var botId = Guid.NewGuid().ToString("N");
                var botMember = new RoomMember
                {
                    Id = botId,
                    Name = BotNames[i],
                    IsHost = false,
                    IsReady = true,
                    JoinedAt = DateTime.UtcNow,
                    LastSeenAt = DateTime.UtcNow,
                    IsOnline = true,
                    IsBot = true,
                };
                room.Members.Add(botMember);
            }

            // Register in in-memory repository
            await _inMemoryRepository.CreateAsync(room, ct);
            await _inMemoryRepository.UpdateRoomCodeAsync(room.Id, "TEST", ct);

            // Re-fetch room to get fresh data with bots
            var updatedRoom = await _inMemoryRepository.GetByIdAsync(room.Id, ct);
            var finalRoom = updatedRoom ?? room;

            // Register as active test room (stops any previous test room)
            _activeTestRoom.Register(finalRoom.Id, finalRoom);

            // Broadcast updated room via SignalR
            try
            {
                await _broadcaster.BroadcastRoomSnapshotAsync(room.Id, finalRoom, ct);
            }
            catch { /* ignore */ }

            return Ok(new
            {
                roomId = finalRoom.Id,
                code = finalRoom.Code,
                hostId = finalRoom.HostId,
                memberId = finalRoom.HostId,
                hostName = finalRoom.HostName,
                members = finalRoom.Members.Select(m => new
                {
                    id = m.Id,
                    name = m.Name,
                    isHost = m.IsHost,
                    isReady = m.IsReady,
                    isBot = m.IsBot
                })
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = $"Test room creation failed: {ex.Message}" });
        }
    }

    /// <summary>
    /// Gets the test room by code "TEST" (or creates it if doesn't exist).
    /// </summary>
    [HttpGet("room/{code}")]
    public async Task<IActionResult> GetTestRoom(string code, CancellationToken ct)
    {
        if (!code.Equals("TEST", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Only TEST room is supported" });

        var roomId = _activeTestRoom.CurrentRoomId;
        if (roomId == null)
            return NotFound(new { error = "Test room not found. Create one first." });

        var room = await _inMemoryRepository.GetByIdAsync(roomId, ct);
        if (room == null)
        {
            _activeTestRoom.Clear();
            return NotFound(new { error = "Test room not found. Create one first." });
        }

        return Ok(new
        {
            roomId = room.Id,
            code = room.Code,
            status = room.Status.ToString().ToLowerInvariant(),
            members = room.Members.Select(m => new
            {
                id = m.Id,
                name = m.Name,
                isHost = m.IsHost,
                isReady = m.IsReady,
                isBot = m.IsBot
            })
        });
    }

    /// <summary>
    /// Gets the test room snapshot by room ID.
    /// Uses in-memory repository to avoid Firestore quota.
    /// </summary>
    [HttpGet("room/{roomId}/snapshot")]
    public async Task<IActionResult> GetTestRoomSnapshot(string roomId, CancellationToken ct)
    {
        var room = await _inMemoryRepository.GetByIdAsync(roomId, ct);
        if (room == null)
            return NotFound(new { error = "Test room not found" });

        // Build a camelCase DTO manually so the GameHub normalize path on the
        // client receives a consistent shape. Mapping through GameStateDto
        // would also work, but the test endpoint exposes a few extra fields
        // (deck, discardPile, member hands) that the production RoomDto hides.
        var gs = room.GameState;
        var gameState = gs is null ? null : new
        {
            discardCount = gs.DiscardPile.Count,
            handCounts = gs.Hands.ToDictionary(kv => kv.Key, kv => kv.Value.Count),
            turnsTaken = gs.TurnsTaken,
            cardsPlayed = gs.CardsPlayed,
            alive = gs.Alive,
            diedAt = gs.DiedAt.ToDictionary(
                kv => kv.Key,
                kv => kv.Value.HasValue ? (object?)kv.Value.Value.ToString("O") : null),
            currentTurnMemberId = gs.CurrentTurnMemberId,
            attackCounter = gs.AttackCounter,
            winnerId = gs.WinnerId,
            startedAt = gs.StartedAt?.ToString("O"),
            endedAt = gs.EndedAt?.ToString("O"),
            pendingAction = gs.PendingAction is null ? null : new
            {
                initiatorId = gs.PendingAction.InitiatorId,
                cardKey = gs.PendingAction.CardKey,
                nopeChain = gs.PendingAction.NopeChain,
                createdAt = gs.PendingAction.CreatedAt.ToString("O"),
            },
            lastDrawnBy = gs.LastDrawnBy,
            lastDrawnCardKey = gs.LastDrawnCardKey,
            lastDrawnAt = gs.LastDrawnAt?.ToString("O"),
            bombRevealActive = gs.BombRevealActive,
            lastPlayedCardKey = gs.LastPlayedCardKey,
            lastPlayedBy = gs.LastPlayedBy,
            lastPlayedAt = gs.LastPlayedAt?.ToString("O"),
            lastPlayedByNope = gs.LastPlayedByNope,
            turnStartedAt = gs.TurnStartedAt?.ToString("O"),
            turnTimeLimitSec = GameService.TurnTimeLimitSeconds,
            turnRemainingSec = gs.TurnStartedAt.HasValue
                ? Math.Max(0, (int)(GameService.TurnTimeLimitSeconds - (DateTime.UtcNow - gs.TurnStartedAt.Value).TotalSeconds))
                : GameService.TurnTimeLimitSeconds,
            turnOrder = gs.TurnOrder,
            futurePeek = gs.FuturePeek,
            pendingFavorPick = gs.PendingFavorPick is null ? null : new
            {
                targetMemberId = gs.PendingFavorPick.TargetMemberId,
                initiatorId = gs.PendingFavorPick.InitiatorId,
                shuffledCandidates = gs.PendingFavorPick.ShuffledCandidates,
            },
            afkMemberIds = gs.AfkMemberIds?.ToList() ?? [],
            clientReady = gs.ClientReady,
            botTurnSeconds = gs.BotTurnSeconds,
            oneCardBotCardMap = gs.OneCardBotCardMap ?? [],
            drawOnlyBotIds = gs.DrawOnlyBotIds?.ToList() ?? [],
            playCardsBotIds = gs.PlayCardsBotIds?.ToList() ?? [],
        };

        // myHand: the viewer's own hand (the host, since they're the only human
        // in a test room). This fixes the "hand doesn't update" bug where
        // safeSetRoom needs a top-level myHand to detect hand changes.
        var hostMember = room.Members.FirstOrDefault(m => m.Id == room.HostId);
        var myHand = gs?.Hands?.GetValueOrDefault(room.HostId) ?? [];

        return Ok(new
        {
            roomId = room.Id,
            code = room.Code,
            status = room.Status.ToString().ToLowerInvariant(),
            hostId = room.HostId,
            hostName = room.HostName,
            members = room.Members.Select(m => new
            {
                id = m.Id,
                name = m.Name,
                isHost = m.IsHost,
                isReady = m.IsReady,
                isOnline = m.IsOnline,
                isBot = m.IsBot,
                hand = gs?.Hands?.GetValueOrDefault(m.Id) ?? []
            }),
            myHand,
            gameState,
            deck = gs?.Deck?.ToList() ?? [],
            discardPile = gs?.DiscardPile?.ToList() ?? []
        });
    }

    /// <summary>
    /// Starts the test game with custom initial hands.
    /// Uses in-memory repository to avoid Firestore quota.
    /// </summary>
    [HttpPost("start")]
    public async Task<IActionResult> StartTestGame([FromBody] StartTestGameRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.RoomId))
            return BadRequest(new { error = "Room ID is required" });

        try
        {
            // Log incoming request for debugging
            Console.WriteLine($"[TestController] StartTestGame received: RoomId={request.RoomId}, DealCards={request.DealCards}");
            Console.WriteLine($"[TestController] CustomHands: {(request.CustomHands == null ? "null" : string.Join(", ", request.CustomHands.Select(kv => $"{kv.Key}:[{string.Join(",", kv.Value ?? [])}]")))}");

            var room = await _inMemoryRepository.GetByIdAsync(request.RoomId, ct);
            if (room == null)
                return NotFound(new { error = "Room not found" });

            Console.WriteLine($"[TestController] Room members: {string.Join(", ", room.Members.Select(m => $"{m.Id}({m.Name})"))}");

            // Start the game with test parameters.
            // If FirstPlayerId is provided, use it; otherwise use the host as first player.
            var firstPlayer = !string.IsNullOrEmpty(request.FirstPlayerId)
                ? request.FirstPlayerId
                : room.HostId;

            // Use the injected GameService which already has ITestRoomRepository configured
            // Default bot behaviour: in test mode every bot should auto-play when
            // the caller didn't specify otherwise — without this the BotService
            // short-circuits in BotService.TickAsync (`if (!isDrawOnly &&
            // !shouldPlayCards) continue;`) and bots just sit there doing
            // nothing while the human player waits for the turn to advance.
            var defaultPlayBotIds = new HashSet<string>(
                room.Members.Where(m => m.IsBot).Select(m => m.Id));
            var playBotIds = request.PlayCardsBotIds != null
                ? new HashSet<string>(request.PlayCardsBotIds)
                : defaultPlayBotIds;
            var drawOnlyBotIds = request.DrawOnlyBotIds != null
                ? new HashSet<string>(request.DrawOnlyBotIds)
                : [];
            // Per-bot "play one specific card" map. Bots whose id appears
            // here will draw on their turn and then try to play the
            // designated card. Empty / null = no bots in this mode.
            var oneCardBotCardMap = request.OneCardBotCardMap ?? [];

            var startedRoom = await _gameService.StartGameAsync(
                request.RoomId,
                room.HostId,
                request.CustomHands,
                firstPlayer,
                request.CustomDeck,
                request.DealCards,
                drawOnlyBotIds,
                playBotIds,
                oneCardBotCardMap,
                request.DisableBotService,
                request.BotTurnSeconds,
                ct);

            // Update the active test room in cache
            _activeTestRoom.Update(startedRoom);

            // Build a camelCase DTO so the client gets a consistent shape.
            // Use startedRoom directly (not re-fetched) to ensure we get the latest state
            var gs = startedRoom.GameState;
            var gameState = gs is null ? null : new
            {
                discardCount = gs.DiscardPile.Count,
                handCounts = gs.Hands.ToDictionary(kv => kv.Key, kv => kv.Value.Count),
                turnsTaken = gs.TurnsTaken,
                cardsPlayed = gs.CardsPlayed,
                alive = gs.Alive,
                diedAt = gs.DiedAt.ToDictionary(
                    kv => kv.Key,
                    kv => kv.Value.HasValue ? (object?)kv.Value.Value.ToString("O") : null),
                currentTurnMemberId = gs.CurrentTurnMemberId,
                attackCounter = gs.AttackCounter,
                winnerId = gs.WinnerId,
                startedAt = gs.StartedAt?.ToString("O"),
                endedAt = gs.EndedAt?.ToString("O"),
                pendingAction = gs.PendingAction is null ? null : new
                {
                    initiatorId = gs.PendingAction.InitiatorId,
                    cardKey = gs.PendingAction.CardKey,
                    nopeChain = gs.PendingAction.NopeChain,
                    createdAt = gs.PendingAction.CreatedAt.ToString("O"),
                },
                lastDrawnBy = gs.LastDrawnBy,
                lastDrawnCardKey = gs.LastDrawnCardKey,
                lastDrawnAt = gs.LastDrawnAt?.ToString("O"),
                bombRevealActive = gs.BombRevealActive,
                lastPlayedCardKey = gs.LastPlayedCardKey,
                lastPlayedBy = gs.LastPlayedBy,
                lastPlayedAt = gs.LastPlayedAt?.ToString("O"),
                lastPlayedByNope = gs.LastPlayedByNope,
                turnStartedAt = gs.TurnStartedAt?.ToString("O"),
                turnTimeLimitSec = GameService.TurnTimeLimitSeconds,
                turnRemainingSec = gs.TurnStartedAt.HasValue
                    ? Math.Max(0, (int)(GameService.TurnTimeLimitSeconds - (DateTime.UtcNow - gs.TurnStartedAt.Value).TotalSeconds))
                    : GameService.TurnTimeLimitSeconds,
                turnOrder = gs.TurnOrder,
                futurePeek = gs.FuturePeek,
                pendingFavorPick = gs.PendingFavorPick is null ? null : new
                {
                    targetMemberId = gs.PendingFavorPick.TargetMemberId,
                    initiatorId = gs.PendingFavorPick.InitiatorId,
                    shuffledCandidates = gs.PendingFavorPick.ShuffledCandidates,
                },
                afkMemberIds = gs.AfkMemberIds?.ToList() ?? [],
                clientReady = gs.ClientReady,
                botTurnSeconds = gs.BotTurnSeconds,
                oneCardBotCardMap = gs.OneCardBotCardMap ?? [],
                drawOnlyBotIds = gs.DrawOnlyBotIds?.ToList() ?? [],
                playCardsBotIds = gs.PlayCardsBotIds?.ToList() ?? [],
            };

            // myHand: the viewing player's hand (the host, since they're the
            // only human in a test room). Without this, the client caches the
            // start payload into sessionStorage and reloads the game page with
            // an empty `myHand` — the HandArc then falls back to `myMember.hand`
            // which is also empty for the very first render (the test start
            // response previously omitted both fields, making the player think
            // their hand was wiped after every draw/play).
            var hostHand = gs?.Hands?.GetValueOrDefault(room.HostId) ?? [];

            return Ok(new
            {
                roomId = startedRoom.Id,
                code = startedRoom.Code,
                status = startedRoom.Status.ToString().ToLowerInvariant(),
                hostId = startedRoom.HostId,
                hostName = startedRoom.HostName,
                members = startedRoom.Members.Select(m => new
                {
                    id = m.Id,
                    name = m.Name,
                    isHost = m.IsHost,
                    isReady = m.IsReady,
                    isOnline = m.IsOnline,
                    isBot = m.IsBot,
                    hand = gs?.Hands?.GetValueOrDefault(m.Id) ?? []
                }),
                myHand = hostHand,
                _viewerId = room.HostId,
                gameState,
                // Echo back the per-bot "play this card" map so the test
                // lobby can confirm what was persisted (and so future
                // re-joins inherit the configuration if the UI caches
                // the start payload).
                oneCardBotCardMap = gs?.OneCardBotCardMap ?? [],
                deck = gs?.Deck?.ToList() ?? [],
                discardPile = gs?.DiscardPile?.ToList() ?? []
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = $"Failed to start test game: {ex.Message}" });
        }
    }

    /// <summary>
    /// Deletes the current active test room (used by frontend to reset before creating new room).
    /// </summary>
    [HttpDelete("room/current")]
    public IActionResult DeleteCurrentTestRoom()
    {
        var currentId = _activeTestRoom.CurrentRoomId;
        if (currentId != null)
        {
            _inMemoryRepository.DeleteAsync(currentId, CancellationToken.None).ConfigureAwait(false);
        }
        _activeTestRoom.StopAndClear();
        return Ok(new { success = true, message = "Current test room cleared" });
    }

    /// <summary>
    /// Deletes the test room and clears the active test room reference.
    /// </summary>
    [HttpDelete("room/{roomId}")]
    public async Task<IActionResult> DeleteTestRoom(string roomId, CancellationToken ct)
    {
        try
        {
            await _inMemoryRepository.DeleteAsync(roomId, ct);
            if (_activeTestRoom.CurrentRoomId == roomId)
            {
                _activeTestRoom.Clear();
            }
            return Ok(new { success = true, message = "Test room deleted" });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = $"Failed to delete test room: {ex.Message}" });
        }
    }
}

public class CreateTestRoomRequest
{
    public string HostName { get; set; } = "";
}

public class StartTestGameRequest
{
    public string RoomId { get; set; } = "";
    /// <summary>
    /// Optional: force a specific player to go first (for testing).
    /// </summary>
    public string? FirstPlayerId { get; set; }
    /// <summary>
    /// Optional custom hands for players. Key = memberId, Value = list of card keys.
    /// If null or member not present, uses default dealing.
    /// </summary>
    public Dictionary<string, List<string>>? CustomHands { get; set; }
    /// <summary>
    /// If true, deal cards normally (extract bombs, give each player 1 defuse + 4 random cards).
    /// If false, start with empty hands (no dealing). CustomHands will still be applied if provided.
    /// Default: true.
    /// </summary>
    public bool DealCards { get; set; } = true;
    /// <summary>
    /// Optional custom deck order. If provided, the deck is set to exactly this order.
    /// Bombs in customDeck will be placed at the positions you specify.
    /// </summary>
    public List<string>? CustomDeck { get; set; }
    /// <summary>
    /// Bot IDs in draw-only mode: only draw cards. If bomb is drawn, defuse if available (then die),
    /// otherwise die immediately. No action cards are played.
    /// </summary>
    public List<string>? DrawOnlyBotIds { get; set; }
    /// <summary>
    /// Bot IDs that will auto-draw AND play action cards when it's their turn.
    /// </summary>
    public List<string>? PlayCardsBotIds { get; set; }
    /// <summary>
    /// Per-bot "play this exact card on my turn" map. Bot draws first, then
    /// if the designated card is in hand, plays it. Key = bot memberId,
    /// Value = card key (e.g. "attack", "skip", "favor"). Bots listed here
    /// take precedence over PlayCardsBotIds / DrawOnlyBotIds membership.
    /// </summary>
    public Dictionary<string, string>? OneCardBotCardMap { get; set; }
    /// <summary>
    /// If true, BotService will NOT process this room, giving full manual control.
    /// Default: false.
    /// </summary>
    public bool DisableBotService { get; set; } = false;
    /// <summary>
    /// How many seconds bots take to act. Default is 0 = instant (bot fires
    /// immediately on its turn). Set to a positive value to slow the bot
    /// down — useful for screenshot capture. Capped at the unified 10s turn
    /// budget so a bot can never linger longer than the human timer.
    /// </summary>
    public int BotTurnSeconds { get; set; } = 0;
}
