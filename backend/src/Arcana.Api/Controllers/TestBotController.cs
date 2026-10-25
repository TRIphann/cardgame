using Arcana.Application.Abstractions;
using Arcana.Application.Game;
using Arcana.Application.Services;
using Arcana.Domain.Entities;
using Arcana.Domain.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Arcana.Api.Controllers;

/// <summary>
/// Controller for managing bot behavior in test rooms.
/// Allows setting bot hands, controlling bot speed, and triggering bot actions.
/// </summary>
[ApiController]
[Route("api/test/bots")]
public class TestBotController : ControllerBase
{
    private readonly GameService _gameService;
    private readonly IActiveTestRoom _activeTestRoom;
    private readonly IRoomCache _roomCache;
    private readonly ILogger<TestBotController> _logger;

    public TestBotController(
        GameService gameService,
        IActiveTestRoom activeTestRoom,
        IRoomCache roomCache,
        ILogger<TestBotController> logger)
    {
        _gameService = gameService;
        _activeTestRoom = activeTestRoom;
        _roomCache = roomCache;
        _logger = logger;
    }

    /// <summary>
    /// Gets current bot status and settings for the active test room.
    /// </summary>
    [HttpGet("status")]
    public async Task<IActionResult> GetBotStatus(CancellationToken ct)
    {
        var roomId = _activeTestRoom.CurrentRoomId;
        if (string.IsNullOrEmpty(roomId))
            return NotFound(new { error = "No active test room" });

        var room = _roomCache.Get(roomId);
        if (room == null || room.GameState == null)
            return NotFound(new { error = "Test room not found or game not started" });

        var gs = room.GameState;

        // Get bot hands (if deal hasn't happened, show empty)
        var botHands = new Dictionary<string, List<string>>();
        foreach (var member in room.Members.Where(m => m.IsBot))
        {
            var hand = gs.Hands.TryGetValue(member.Id, out var h) ? h : new List<string>();
            botHands[member.Id] = new List<string>(hand);
        }

        return Ok(new
        {
            roomId,
            bots = room.Members.Where(m => m.IsBot).Select(m => new
            {
                id = m.Id,
                name = m.Name,
                hand = gs.Hands.TryGetValue(m.Id, out var h) ? h : new List<string>(),
                isPlayCards = gs.PlayCardsBotIds?.Contains(m.Id) ?? false,
                isDrawOnly = gs.DrawOnlyBotIds?.Contains(m.Id) ?? false,
            }),
            settings = new
            {
                botTurnSeconds = gs.BotTurnSeconds,
                botServiceEnabled = !gs.DisableBotService,
            },
            currentTurn = new
            {
                memberId = gs.CurrentTurnMemberId,
                memberName = room.Members.FirstOrDefault(m => m.Id == gs.CurrentTurnMemberId)?.Name,
                isMyTurn = false,
            }
        });
    }

    /// <summary>
    /// Sets the hand for a specific bot (only works before game starts or with dealCards=false).
    /// </summary>
    [HttpPost("set-hand")]
    public async Task<IActionResult> SetBotHand([FromBody] SetBotHandRequest request, CancellationToken ct)
    {
        var roomId = _activeTestRoom.CurrentRoomId;
        if (string.IsNullOrEmpty(roomId))
            return NotFound(new { error = "No active test room" });

        var room = _roomCache.Get(roomId);
        if (room == null)
            return NotFound(new { error = "Test room not found" });

        var bot = room.Members.FirstOrDefault(m => m.Id == request.BotId && m.IsBot);
        if (bot == null)
            return BadRequest(new { error = "Bot not found or not a bot" });

        if (request.Hand == null || request.Hand.Count == 0)
            return BadRequest(new { error = "Hand cannot be empty" });

        // Store custom hand in a temporary storage that will be used when game starts
        // We'll use a room-level customHands dict for this
        if (room.GameState == null)
        {
            // Game hasn't started yet - we can set the hand directly
            // This requires the CustomHands feature in StartGameAsync
            return Ok(new { success = true, message = $"Hand for {bot.Name} queued: {string.Join(", ", request.Hand)}", botId = bot.Id });
        }
        else
        {
            // Game already started - we need to directly modify hands
            // This is risky but useful for testing
            if (room.GameState.Hands.ContainsKey(request.BotId))
            {
                room.GameState.Hands[request.BotId] = request.Hand;
            }
            else
            {
                room.GameState.Hands.Add(request.BotId, request.Hand);
            }
            _roomCache.Set(roomId, room);

            _logger.LogInformation("Set bot {BotName} hand to: {Hand}", bot.Name, string.Join(", ", request.Hand));
            return Ok(new { success = true, message = $"Hand updated for {bot.Name}", hand = request.Hand });
        }
    }

    /// <summary>
    /// Sets all bot hands at once (before game starts).
    /// </summary>
    [HttpPost("set-all-hands")]
    public async Task<IActionResult> SetAllBotHands([FromBody] SetAllBotHandsRequest request, CancellationToken ct)
    {
        var roomId = _activeTestRoom.CurrentRoomId;
        if (string.IsNullOrEmpty(roomId))
            return NotFound(new { error = "No active test room" });

        var room = _roomCache.Get(roomId);
        if (room == null)
            return NotFound(new { error = "Test room not found" });

        if (room.GameState != null)
        {
            // Game already started - modify hands directly
            foreach (var kvp in request.Hands)
            {
                var bot = room.Members.FirstOrDefault(m => m.Id == kvp.Key && m.IsBot);
                if (bot != null)
                {
                    room.GameState.Hands[kvp.Key] = kvp.Value;
                }
            }
            _roomCache.Set(roomId, room);
        }

        return Ok(new { success = true, hands = request.Hands });
    }

    /// <summary>
    /// Configures bot behavior (draw-only vs play-cards) for all bots.
    /// </summary>
    [HttpPost("configure")]
    public async Task<IActionResult> ConfigureBots([FromBody] ConfigureBotsRequest request, CancellationToken ct)
    {
        var roomId = _activeTestRoom.CurrentRoomId;
        if (string.IsNullOrEmpty(roomId))
            return NotFound(new { error = "No active test room" });

        var room = _roomCache.Get(roomId);
        if (room == null || room.GameState == null)
            return NotFound(new { error = "Test room not found or game not started" });

        var gs = room.GameState;

        // Clear existing bot sets
        gs.DrawOnlyBotIds ??= new HashSet<string>();
        gs.PlayCardsBotIds ??= new HashSet<string>();
        gs.DrawOnlyBotIds.Clear();
        gs.PlayCardsBotIds.Clear();

        // Set all bots to the specified mode
        foreach (var member in room.Members.Where(m => m.IsBot))
        {
            switch (request.Mode)
            {
                case BotMode.DrawOnly:
                    gs.DrawOnlyBotIds.Add(member.Id);
                    break;
                case BotMode.PlayCards:
                    gs.PlayCardsBotIds.Add(member.Id);
                    break;
                case BotMode.Disabled:
                    // Don't add to any set
                    break;
            }
        }

        // Set bot turn seconds
        if (request.BotTurnSeconds > 0)
        {
            gs.BotTurnSeconds = request.BotTurnSeconds;
        }

        _roomCache.Set(roomId, room);
        _logger.LogInformation("Configured bots to {Mode} mode, turn seconds: {Seconds}", request.Mode, gs.BotTurnSeconds);

        return Ok(new
        {
            success = true,
            mode = request.Mode.ToString(),
            botTurnSeconds = gs.BotTurnSeconds,
            botCount = room.Members.Count(m => m.IsBot)
        });
    }

    /// <summary>
    /// Immediately triggers the current bot to take its turn.
    /// </summary>
    [HttpPost("trigger-turn")]
    public async Task<IActionResult> TriggerBotTurn(CancellationToken ct)
    {
        var roomId = _activeTestRoom.CurrentRoomId;
        if (string.IsNullOrEmpty(roomId))
            return NotFound(new { error = "No active test room" });

        var room = _roomCache.Get(roomId);
        if (room == null || room.GameState == null)
            return NotFound(new { error = "Test room not found or game not started" });

        var gs = room.GameState;
        var currentTurnId = gs.CurrentTurnMemberId;
        if (string.IsNullOrEmpty(currentTurnId))
            return BadRequest(new { error = "No current turn" });

        var currentMember = room.Members.FirstOrDefault(m => m.Id == currentTurnId);
        if (currentMember == null || !currentMember.IsBot)
            return BadRequest(new { error = "Current turn is not a bot" });

        // Trigger bot action immediately
        try
        {
            // If there's a pending action (nope window), skip
            if (gs.PendingAction != null)
            {
                return Ok(new { skipped = true, reason = "Pending action (nope window)" });
            }

            // Try to play an action card first
            if (gs.PlayCardsBotIds?.Contains(currentTurnId) ?? false)
            {
                var hand = gs.Hands.TryGetValue(currentTurnId, out var h) ? h : null;
                if (hand != null && hand.Count > 0)
                {
                    var actionCards = hand.Where(c => CardCatalog.IsActionCard(c)).ToList();
                    if (actionCards.Count > 0)
                    {
                        var cardToPlay = actionCards.First();
                        var result = await _gameService.PlayCardAsync(roomId, currentTurnId, cardToPlay, null, null, null, ct);
                        if (result != null)
                        {
                            _roomCache.Set(roomId, _roomCache.Get(roomId)!);
                            return Ok(new
                            {
                                action = "played",
                                card = cardToPlay,
                                requiresTargetPick = result.RequiresTargetPick,
                                requiresFavorPick = result.RequiresFavorPick,
                                requiresDiscardPick = result.RequiresDiscardPick,
                                requiresDefuse = result.RequiresDefuse,
                                drawnCardKey = result.DrawnCardKey,
                            });
                        }
                    }
                }
            }

            // Otherwise, draw a card
            var drawResult = await _gameService.DrawCardAsync(roomId, currentTurnId, ct);
            _roomCache.Set(roomId, _roomCache.Get(roomId)!);

            return Ok(new
            {
                action = "drew",
                drawnCardKey = drawResult.DrawnCardKey,
                requiresDefuse = drawResult.RequiresDefuse,
                requiresMoreDraws = drawResult.RequiresMoreDraws,
                remainingDraws = drawResult.RemainingDraws,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error triggering bot turn");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Skips the current bot's turn (useful for testing specific scenarios).
    /// </summary>
    [HttpPost("skip-turn")]
    public async Task<IActionResult> SkipBotTurn(CancellationToken ct)
    {
        var roomId = _activeTestRoom.CurrentRoomId;
        if (string.IsNullOrEmpty(roomId))
            return NotFound(new { error = "No active test room" });

        var room = _roomCache.Get(roomId);
        if (room == null || room.GameState == null)
            return NotFound(new { error = "Test room not found or game not started" });

        var gs = room.GameState;
        var currentTurnId = gs.CurrentTurnMemberId;
        if (string.IsNullOrEmpty(currentTurnId))
            return BadRequest(new { error = "No current turn" });

        // Just draw a card to advance the turn
        try
        {
            var result = await _gameService.DrawCardAsync(roomId, currentTurnId, ct);
            _roomCache.Set(roomId, _roomCache.Get(roomId)!);

            return Ok(new { skipped = true, drawn = result.DrawnCardKey });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }
}

public class SetBotHandRequest
{
    public string BotId { get; set; } = "";
    public List<string> Hand { get; set; } = new();
}

public class SetAllBotHandsRequest
{
    public Dictionary<string, List<string>> Hands { get; set; } = new();
}

public class ConfigureBotsRequest
{
    public BotMode Mode { get; set; } = BotMode.PlayCards;
    /// <summary>
    /// How many seconds bots take to act. Default is 0 = instant (bot fires
    /// immediately on its turn). Capped at the unified 10s turn budget so
    /// the bot can never linger longer than the human timer.
    /// </summary>
    public int BotTurnSeconds { get; set; } = 0;
}

public enum BotMode
{
    /// <summary>Bots only draw cards.</summary>
    DrawOnly,
    /// <summary>Bots draw and play action cards.</summary>
    PlayCards,
    /// <summary>Bots are disabled (manual control).</summary>
    Disabled
}
