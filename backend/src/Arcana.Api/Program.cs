using Arcana.Api.Middleware;
using Arcana.Infrastructure;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// Render free tier shares the kernel inotify pool with other services.
// Disable the FileSystemWatcher that every JSON config source registers by
// default, otherwise host startup throws "user limit (128) on the number of
// inotify instances has been reached".
builder.Configuration.Sources.Clear();
builder.Configuration
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: false)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: false)
    .AddEnvironmentVariables();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Arcana API", Version = "v1" });
});

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
app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTime.UtcNow }));

app.Run();
