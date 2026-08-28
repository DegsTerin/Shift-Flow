// en-GB: Registers concrete PostgreSQL and Redis adapters behind application-owned contracts.
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using ShiftFlow.Application.Audit;
using ShiftFlow.Application.Platform;
using ShiftFlow.Application.Security;
using ShiftFlow.Infrastructure.Audit;
using ShiftFlow.Infrastructure.Configuration;
using ShiftFlow.Infrastructure.Platform;
using ShiftFlow.Infrastructure.Security;

namespace ShiftFlow.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddShiftFlowInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        bool isProduction)
    {
        var postgreSql = PostgreSqlConnectionString.Resolve(configuration, isProduction);
        var redis = configuration.GetConnectionString("Redis") ?? configuration["REDIS_CONNECTION"];
        if (string.IsNullOrWhiteSpace(redis))
        {
            throw new InvalidOperationException(
                "ConnectionStrings:Redis or REDIS_CONNECTION is required for the ASP.NET Core host.");
        }

        var redisInstance = configuration["REDIS_INSTANCE_NAME"] ?? "shiftflow:local:";
        if (!redisInstance.EndsWith(':') || redisInstance.Length > 80)
        {
            throw new InvalidOperationException(
                "REDIS_INSTANCE_NAME must be at most 80 characters and end with a colon.");
        }

        services.AddSingleton(_ => NpgsqlDataSource.Create(postgreSql));
        var redisConnection = new RedisConnectionProvider(redis);
        services.AddSingleton(redisConnection);
        services.AddStackExchangeRedisCache(options =>
        {
            options.Configuration = redis;
            options.InstanceName = redisInstance;
            options.ConnectionMultiplexerFactory = redisConnection.GetConnectionAsync;
        });

        services.AddScoped<IAuditLogReader, NpgsqlAuditLogReader>();
        services.AddScoped<NpgsqlLegacySecurityStore>();
        services.AddScoped<ILegacyPrincipalValidator>(provider =>
            provider.GetRequiredService<NpgsqlLegacySecurityStore>());
        services.AddScoped<IPermissionAuthorizer>(provider =>
            provider.GetRequiredService<NpgsqlLegacySecurityStore>());
        services.AddScoped<IDependencyReadinessProbe, DependencyReadinessProbe>();
        services.AddSingleton<IRequestRateLimiter>(provider =>
            new RedisRequestRateLimiter(
                provider.GetRequiredService<RedisConnectionProvider>(),
                $"{redisInstance}rate-limit:"));

        return services;
    }
}
