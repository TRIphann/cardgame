# Multi-stage build for Arcana.Api on Render (free tier, 0.5 vCPU / 512 MB).
#
# Why this Dockerfile exists
# ---------------------------
# Render's default .NET runtime on the free Linux tier hits two problems:
#   1. The default WebApplication.CreateBuilder enables `reloadOnChange: true`
#      for every appsettings*.json source, which creates one inotify watcher
#      per file. The kernel default `fs.inotify.max_user_instances` is 128,
#      and on Render free tier the per-instance ceiling is exhausted before
#      host startup completes — process exits with status 139.
#   2. Render expects the container to listen on $PORT (default 10000 on free
#      tier) for HTTP traffic.
#
# Solution
# ---------
# Build a slim production image (`aspnet:8.0`, ~220 MB) that only contains the
# published DLL. The published binary does not register any FileSystemWatcher
# at startup, so inotify pressure is zero. `ASPNETCORE_URLS` is set in the
# Dockerfile so the container listens on the port Render routes traffic to.

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore uses a separate layer from the source copy so package changes don't
# invalidate the build cache for plain code edits.
COPY Arcana.sln ./
COPY backend/src/Arcana.Domain/Arcana.Domain.csproj                 backend/src/Arcana.Domain/
COPY backend/src/Arcana.Application/Arcana.Application.csproj       backend/src/Arcana.Application/
COPY backend/src/Arcana.Infrastructure/Arcana.Infrastructure.csproj backend/src/Arcana.Infrastructure/
COPY backend/src/Arcana.Api/Arcana.Api.csproj                       backend/src/Arcana.Api/
COPY backend/src/Arcana.Shared/Arcana.Shared.csproj                 backend/src/Arcana.Shared/

RUN dotnet restore backend/src/Arcana.Api/Arcana.Api.csproj

COPY backend/src ./backend/src

RUN dotnet publish backend/src/Arcana.Api/Arcana.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Disable every code path that tries to register a FileSystemWatcher.
# Program.cs also disables JSON reload, but Razor runtime compilation and the
# host's own watcher can still kick in; these env vars short-circuit them.
ENV DOTNET_USE_POLLING_FILE_WATCHER=false \
    DOTNET_FILEWATCHER_ENABLED=false \
    NUGET_XMLDOC_MODE=skip \
    ASPNETCORE_URLS=http://0.0.0.0:10000 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true

COPY --from=build /app/publish ./

EXPOSE 10000

ENTRYPOINT ["dotnet", "Arcana.Api.dll"]