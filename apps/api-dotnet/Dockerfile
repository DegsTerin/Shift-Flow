# en-GB: Builds a locked ASP.NET Core image and runs it as a non-root Linux user.
FROM mcr.microsoft.com/dotnet/sdk:10.0.400-alpine3.23@sha256:b36516b249f0cccf9e5017082f51d4bda2d61469f205a7167fbf3b8498ecdd59 AS build
WORKDIR /source

COPY global.json ./
COPY apps/api-dotnet/ ./apps/api-dotnet/
RUN dotnet restore apps/api-dotnet/ShiftFlow.slnx --locked-mode
RUN dotnet publish apps/api-dotnet/src/ShiftFlow.Api/ShiftFlow.Api.csproj \
    --configuration Release \
    --no-restore \
    --output /app \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0.11-alpine3.23@sha256:4d5339ac9814f1a033a09e664bcf159e9fb386c89b6e7917b3dca7254e656027 AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_EnableDiagnostics=0
COPY --from=build --chown=$APP_UID:$APP_UID /app ./
RUN mkdir -p /var/lib/shiftflow/keys && chown -R $APP_UID:$APP_UID /var/lib/shiftflow
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "ShiftFlow.Api.dll"]
