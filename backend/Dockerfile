# syntax=docker/dockerfile:1
# ─── Build stage ───
# NOTE: deploy build must NOT depend on backend/tests/ — unit tests are not
# needed to publish the API, and requiring them breaks the Render build when
# the tests folder is absent from the deployed branch. Restore/publish the
# Api project directly (it pulls src/* via ProjectReference).
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
# NOTE: Render builds with dockerContext = backend/ (Root Directory = backend),
# so paths here are relative to backend/ — NOT repo root. Do NOT prefix with
# backend/ and do NOT depend on backend/tests/ for publishing the API.
COPY src/ ./src/
RUN dotnet restore src/Arcana.Api/Arcana.Api.csproj
RUN dotnet publish src/Arcana.Api/Arcana.Api.csproj -c Release -o /app/publish --no-restore

# ─── Runtime stage ───
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Arcana.Api.dll"]
