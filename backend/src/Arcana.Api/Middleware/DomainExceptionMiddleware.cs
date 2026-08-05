using System.Text.Json;
using Arcana.Domain.Common;
using Arcana.Shared.Contracts;

namespace Arcana.Api.Middleware;

public class DomainExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<DomainExceptionMiddleware> _logger;

    public DomainExceptionMiddleware(RequestDelegate next, ILogger<DomainExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (DomainException ex)
        {
            // DomainException covers every business-rule rejection — join full,
            // not-your-turn, card-not-in-hand, nope-window-closed, etc. These
            // are 4xx outcomes driven by the client's input/state, NOT server
            // bugs. Logging them at Warning would create dozens of lines per
            // game (every nope-chain race, every stale-snapshot click), which
            // buries real errors when triaging logs. Use Debug so they're
            // available when explicitly enabled, silent by default.
            _logger.LogDebug("Domain exception: {Code}", ex.Code);
            context.Response.StatusCode = ex.Code switch
            {
                "room_not_found" => StatusCodes.Status404NotFound,
                "room_full" => StatusCodes.Status409Conflict,
                "room_closed" => StatusCodes.Status409Conflict,
                "invalid_code" => StatusCodes.Status400BadRequest,
                "invalid_name" => StatusCodes.Status400BadRequest,
                "code_exhausted" => StatusCodes.Status503ServiceUnavailable,
                "not_host" => StatusCodes.Status403Forbidden,
                "cannot_kick_host" => StatusCodes.Status400BadRequest,
                "member_not_found" => StatusCodes.Status404NotFound,
                "cannot_start" => StatusCodes.Status400BadRequest,
                "not_your_turn" => StatusCodes.Status403Forbidden,
                "card_not_in_hand" => StatusCodes.Status400BadRequest,
                "card_not_playable" => StatusCodes.Status400BadRequest,
                "combo_wrong_count" => StatusCodes.Status400BadRequest,
                "defuse_required" => StatusCodes.Status400BadRequest,
                "game_already_started" => StatusCodes.Status409Conflict,
                "game_not_started" => StatusCodes.Status409Conflict,
                "game_not_ended" => StatusCodes.Status409Conflict,
                "nope_direct_use" => StatusCodes.Status400BadRequest,
                "nope_window_closed" => StatusCodes.Status400BadRequest,
                "no_nope_card" => StatusCodes.Status400BadRequest,
                "no_pending_action" => StatusCodes.Status400BadRequest,
                "already_noped" => StatusCodes.Status400BadRequest,
                "action_pending" => StatusCodes.Status409Conflict,
                "requires_target" => StatusCodes.Status400BadRequest,
                "target_not_found" => StatusCodes.Status404NotFound,
                "target_dead" => StatusCodes.Status400BadRequest,
                "target_empty" => StatusCodes.Status400BadRequest,
                "combo_impossible" => StatusCodes.Status400BadRequest,
                "favor_card_gone" => StatusCodes.Status400BadRequest,
                "already_dead" => StatusCodes.Status400BadRequest,
                "cannot_nope_self" => StatusCodes.Status400BadRequest,
                "no_defuse" => StatusCodes.Status400BadRequest,
                "deck_empty" => StatusCodes.Status400BadRequest,
                _ => StatusCodes.Status400BadRequest,
            };
            context.Response.ContentType = "application/json";
            await JsonSerializer.SerializeAsync(context.Response.Body, new ErrorResponse(ex.Code, ex.Message));
        }
    }
}
