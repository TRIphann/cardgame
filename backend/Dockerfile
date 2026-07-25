# Multi-stage build for Arcana.Api on Render (free tier, 0.5 vCPU / 512 MB).
#
# Why not `runtime: dotnet`? Render's default `dotnet run` mode starts an inotify
# file watcher per config file. On the free Linux tier, the kernel's default
# `fs.inotify.max_user_instances` is 128. With Render's image the limit is
# exhausted before our app finishes loading configuration and the process
# crashes with:
#   System.IO.IOException: The configured user limit (128) on the number of
#   inotify instances has been reached...
#
# We fix this by running a published, self-contained production binary — no
# FileSystemWatcher, no inotify pressure, smaller image, faster cold start.
#
# Build context = repo root (Render sets rootDir to the repo root). The solution
# and projects live at:
#   ./Arcana.sln
#   ./backend/src/Arcana.Api/Arcana.Api.csproj
#   ./backend/src/Arcana.{Domain,Application,Infrastructure,Shared}/...

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY Arcana.sln ./
COPY backend/src/Arcana.Domain/Arcana.Domain.csproj           backend/src/Arcana.Domain/
COPY backend/src/Arcana.Application/Arcana.Application.csproj backend/src/Arcana.Application/
COPY backend/src/Arcana.Infrastructure/Arcana.Infrastructure.csproj backend/src/Arcana.Infrastructure/
COPY backend/src/Arcana.Api/Arcana.Api.csproj                 backend/src/Arcana.Api/
COPY backend/src/Arcana.Shared/Arcana.Shared.csproj           backend/src/Arcana.Shared/

RUN dotnet restore backend/src/Arcana.Api/Arcana.Api.csproj

COPY backend/src ./backend/src
RUN dotnet publish backend/src/Arcana.Api/Arcana.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

ENV DOTNET_USE_POLLING_FILE_WATCHER=false \
    DOTNET_FILEWATCHER_ENABLED=false \
    NUGET_XMLDOC_MODE=skip

COPY --from=build /app/publish ./

ENV ASPNETCORE_URLS=http://0.0.0.0:10000 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true

EXPOSE 10000

ENTRYPOINT ["dotnet", "Arcana.Api.dll"]