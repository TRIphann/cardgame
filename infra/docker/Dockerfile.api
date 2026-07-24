FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY backend/Arcana.sln ./
COPY backend/src/Arcana.Domain/Arcana.Domain.csproj          src/Arcana.Domain/
COPY backend/src/Arcana.Application/Arcana.Application.csproj src/Arcana.Application/
COPY backend/src/Arcana.Infrastructure/Arcana.Infrastructure.csproj src/Arcana.Infrastructure/
COPY backend/src/Arcana.Shared/Arcana.Shared.csproj          src/Arcana.Shared/
COPY backend/src/Arcana.Api/Arcana.Api.csproj                src/Arcana.Api/
RUN dotnet restore src/Arcana.Api/Arcana.Api.csproj

COPY backend/ ./
RUN dotnet publish src/Arcana.Api/Arcana.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./

ENV ASPNETCORE_URLS=http://0.0.0.0:10000
EXPOSE 10000

ENTRYPOINT ["dotnet", "Arcana.Api.dll"]
