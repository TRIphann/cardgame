# Multi-stage build for Arcana.Api on Render (free tier, 0.5 vCPU / 512 MB).
#
# Build context
# -------------
# This Dockerfile is invoked by Render with `dockerfilePath: backend/Dockerfile`
# in render.yaml. Render sets the Docker build context to the directory that
# contains the Dockerfile, i.e. `backend/`. So all `COPY` paths below are
# relative to `backend/` — NOT to the repo root.
#
# (Earlier revisions were written assuming `context = repo root` and used
# paths like `COPY backend/src/...`. That broke once `dockerfilePath` was set,
# because `backend/backend/src/...` does not exist inside the build context.)
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
# invalidate the build cache for plain code edits. Paths are relative to the
# `backend/` build context (set automatically by Render when using
# `dockerfilePath: backend/Dockerfile`).
COPY Arcana.sln ./
COPY src/Arcana.Domain/Arcana.Domain.csproj                 src/Arcana.Domain/
COPY src/Arcana.Application/Arcana.Application.csproj       src/Arcana.Application/
COPY src/Arcana.Infrastructure/Arcana.Infrastructure.csproj src/Arcana.Infrastructure/
COPY src/Arcana.Api/Arcana.Api.csproj                       src/Arcana.Api/
COPY src/Arcana.Shared/Arcana.Shared.csproj                 src/Arcana.Shared/

RUN dotnet restore src/Arcana.Api/Arcana.Api.csproj

COPY src ./src

RUN dotnet publish src/Arcana.Api/Arcana.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Run as the pre-created non-root "app" user that ships with the
# aspnet image. Avoids the "Container is running as root" warning
# and limits blast radius if a managed dependency is ever compromised.
COPY --from=build --chown=app:app /app/publish ./

# Disable every code path that tries to register a FileSystemWatcher.
# `DOTNET_hostBuilder__reloadConfigOnChange=false` is read by
# HostingHostBuilderExtensions.ApplyDefaultAppConfiguration (see
# https://github.com/dotnet/runtime HostingHostBuilderExtensions.cs). Without
# it, WebApplication.CreateBuilder registers a FileSystemWatcher per
# appsettings*.json file and Render's shared inotify pool (max 128 instances
# per user) is exhausted at startup -> IOException -> exit 139.
ENV DOTNET_USE_POLLING_FILE_WATCHER=false \
    DOTNET_FILEWATCHER_ENABLED=false \
    DOTNET_hostBuilder__reloadConfigOnChange=false \
    NUGET_XMLDOC_MODE=skip \
    ASPNETCORE_URLS=http://0.0.0.0:10000 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true

EXPOSE 10000

USER app
ENTRYPOINT ["dotnet", "Arcana.Api.dll"]