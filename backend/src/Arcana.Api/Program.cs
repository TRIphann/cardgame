using Arcana.Api.Controllers;
using Arcana.Api.Hubs;
using Arcana.Api.HostedServices;
using Arcana.Api.Middleware;
using Arcana.Application.Abstractions;
using Arcana.Infrastructure;
using Arcana.Domain.Repositories;
using Microsoft.OpenApi.Models;

// Disable FileSystemWatcher + config hot-reload. Render free-tier containers
// cap inotify instances at 128; each appsettings*.json provider opens its own
// watcher by default and crashes the host with:
//   System.IO.IOException: The configured user limit (128) on the number of
//   inotify instances has been reached ...
// Config is immutable in production (env vars + redeploy), so turn it off.
Environment.SetEnvironmentVariable("DOTNET_hostBuilder__reloadConfigOnChange", "false");
Environment.SetEnvironmentVariable("DOTNET_fileWatcher__enabled", "false");

var builder = WebApplication.CreateBuilder(args);

// Render / Docker: bind to the runtime-injected $PORT.
// (Docker bakes ENV at build time, so ASPNETCORE_URLS can't see Render's
// runtime PORT — read it here instead. Falls back to launchSettings locally.)
var portEnv = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(portEnv) && int.TryParse(portEnv, out var port))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Arcana API", Version = "v1" });
});

// ── Realtime push (SignalR) ──────────────────────────────────
// GameService broadcasts "room-updated" after each mutation so every
// browser tab subscribed to the room receives the notification within
// ~50ms instead of waiting up to POLL_MS for the next snapshot fetch.
builder.Services.AddSignalR();
builder.Services.AddSingleton<IGameBroadcaster, SignalRGameBroadcaster>();
builder.Services.AddHostedService<TurnClockService>();
builder.Services.AddHostedService<NopeTimeoutService>();
builder.Services.AddHostedService<FuturePeekSweeperService>();
builder.Services.AddHostedService<FavorPickAutoResolverService>();

// Debounced background pruner so /snapshot endpoints don't pay a
// Firestore read+write per request — the polling hook fires snapshot
// every 2-5s during lobby wait.
builder.Services.AddSingleton<StaleMemberPruner>();
// Scoped IRoomRepository is wired up by AddArcanaInfrastructure below;
// StaleMemberPruner grabs it lazily via IServiceScopeFactory so the
// debounced prune task can fire Firestore writes outside the HTTP scope.

builder.Services.AddArcanaInfrastructure(builder.Configuration);

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? Array.Empty<string>();

builder.Services.AddCors(options =>
{
    if (allowedOrigins.Length > 0)
    {
        options.AddDefaultPolicy(policy =>
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials();
        });
    }
    else
    {
        // No origins configured (e.g. env vars missing after a fresh Render
        // deploy). Fall back to "reflect the Origin header" so the browser
        // gets a valid Access-Control-Allow-Origin response and stops retrying.
        // Note: AllowCredentials() is intentionally omitted — the browser
        // requires a literal "Access-Control-Allow-Origin: <origin>" and
        // forbids the wildcard-credential combo, so the old AllowAnyOrigin
        // branch would 500 on every preflight and the front-end would retry
        // forever, burning through the Firestore quota.
        options.AddDefaultPolicy(policy =>
        {
            policy.SetIsOriginAllowed(_ => true)
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        });
    }
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseMiddleware<DomainExceptionMiddleware>();
app.MapControllers();
app.MapHub<GameHub>("/hubs/game");
app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTime.UtcNow }));

app.Run();
