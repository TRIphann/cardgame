using Arcana.Api.Hubs;
using Arcana.Api.HostedServices;
using Arcana.Api.Middleware;
using Arcana.Application.Abstractions;
using Arcana.Infrastructure;
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
        options.AddDefaultPolicy(policy =>
        {
            policy.AllowAnyOrigin()
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
