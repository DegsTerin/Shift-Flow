// en-GB: Probes PostgreSQL reads and an ephemeral Redis write without mutating business data.
using Microsoft.Extensions.Caching.Distributed;
using Npgsql;
using ShiftFlow.Application.Platform;

namespace ShiftFlow.Infrastructure.Platform;

public sealed class DependencyReadinessProbe(
    NpgsqlDataSource dataSource,
    IDistributedCache distributedCache) : IDependencyReadinessProbe
{
    public async Task<DependencyReadiness> CheckAsync(CancellationToken cancellationToken)
    {
        var postgreSql = await CheckPostgreSqlAsync(cancellationToken);
        var redis = await CheckRedisAsync(cancellationToken);
        return new DependencyReadiness(postgreSql, redis);
    }

    private async Task<bool> CheckPostgreSqlAsync(CancellationToken cancellationToken)
    {
        try
        {
            const string sql = """
                SELECT
                  to_regclass('audit_logs') IS NOT NULL AND
                  to_regclass('users') IS NOT NULL AND
                  to_regclass('user_companies') IS NOT NULL AND
                  to_regclass('companies') IS NOT NULL AND
                  to_regclass('access_token_revocations') IS NOT NULL AND
                  to_regclass('user_role_assignments') IS NOT NULL AND
                  to_regclass('roles') IS NOT NULL AND
                  to_regclass('role_permissions') IS NOT NULL AND
                  to_regclass('permissions') IS NOT NULL AND
                  EXISTS (
                    SELECT 1
                    FROM "_prisma_migrations"
                    WHERE migration_name = '20260702193000_audit_full_residual_fixes'
                      AND finished_at IS NOT NULL
                      AND rolled_back_at IS NULL)
                """;
            await using var command = dataSource.CreateCommand(sql);
            return Convert.ToBoolean(
                await command.ExecuteScalarAsync(cancellationToken),
                System.Globalization.CultureInfo.InvariantCulture);
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            return false;
        }
    }

    private async Task<bool> CheckRedisAsync(CancellationToken cancellationToken)
    {
        var key = $"readiness:{Guid.NewGuid():N}";
        try
        {
            await distributedCache.SetAsync(
                key,
                [1],
                new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(10)
                },
                cancellationToken);
            var value = await distributedCache.GetAsync(key, cancellationToken);
            await distributedCache.RemoveAsync(key, cancellationToken);
            return value is [1];
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            return false;
        }
    }
}
