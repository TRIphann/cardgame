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
            _logger.LogWarning(ex, "Domain exception: {Code}", ex.Code);
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
                _ => StatusCodes.Status400BadRequest,
            };
            context.Response.ContentType = "application/json";
            await JsonSerializer.SerializeAsync(context.Response.Body, new ErrorResponse(ex.Code, ex.Message));
        }
    }
}
