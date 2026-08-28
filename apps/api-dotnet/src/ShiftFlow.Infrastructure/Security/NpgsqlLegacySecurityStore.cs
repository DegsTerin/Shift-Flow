// en-GB: Revalidates legacy token and RBAC state from PostgreSQL for the temporary coexistence bridge.
using Npgsql;
using ShiftFlow.Application.Security;

namespace ShiftFlow.Infrastructure.Security;

public sealed class NpgsqlLegacySecurityStore(NpgsqlDataSource dataSource) :
    ILegacyPrincipalValidator,
    IPermissionAuthorizer
{
    public async Task<bool> IsCurrentAsync(
        LegacyPrincipalCandidate candidate,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT u."passwordChangedAt"
            FROM "users" AS u
            INNER JOIN "user_companies" AS uc
                ON uc."userId" = u."id"
               AND uc."companyId" = @companyId
               AND uc."deletedAt" IS NULL
            INNER JOIN "companies" AS c
                ON c."id" = uc."companyId"
               AND c."status" = 'ACTIVE'
               AND c."deletedAt" IS NULL
            WHERE u."id" = @userId
              AND u."status" = 'ACTIVE'
              AND u."deletedAt" IS NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM "access_token_revocations" AS atr
                  WHERE atr."jwtId" = @jwtId)
            LIMIT 1
            """;

        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue("userId", candidate.UserId);
        command.Parameters.AddWithValue("companyId", candidate.CompanyId);
        command.Parameters.AddWithValue("jwtId", candidate.JwtId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return false;
        }

        var credentialVersion = reader.IsDBNull(0)
            ? 0
            : new DateTimeOffset(reader.GetDateTime(0)).ToUnixTimeMilliseconds();
        return credentialVersion == candidate.CredentialVersion;
    }

    public async Task<bool> HasPermissionAsync(
        Guid userId,
        Guid companyId,
        string resource,
        string action,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT EXISTS (
                SELECT 1
                FROM "user_role_assignments" AS ura
                INNER JOIN "users" AS u
                    ON u."id" = ura."userId"
                   AND u."status" = 'ACTIVE'
                   AND u."deletedAt" IS NULL
                INNER JOIN "user_companies" AS uc
                    ON uc."userId" = ura."userId"
                   AND uc."companyId" = ura."companyId"
                   AND uc."deletedAt" IS NULL
                INNER JOIN "companies" AS c
                    ON c."id" = ura."companyId"
                   AND c."status" = 'ACTIVE'
                   AND c."deletedAt" IS NULL
                INNER JOIN "roles" AS r
                    ON r."id" = ura."roleId"
                   AND r."isActive" = TRUE
                   AND r."deletedAt" IS NULL
                   AND (r."companyId" = @companyId OR r."companyId" IS NULL)
                INNER JOIN "role_permissions" AS rp
                    ON rp."roleId" = r."id"
                   AND (rp."companyId" = @companyId OR rp."companyId" IS NULL)
                INNER JOIN "permissions" AS p
                    ON p."id" = rp."permissionId"
                   AND p."deletedAt" IS NULL
                   AND (p."companyId" = @companyId OR p."companyId" IS NULL)
                WHERE ura."userId" = @userId
                  AND ura."companyId" = @companyId
                  AND ura."deletedAt" IS NULL
                  AND ura."startsAt" <= NOW()
                  AND (ura."endsAt" IS NULL OR ura."endsAt" > NOW())
                  AND ura."clientId" IS NULL
                  AND ura."teamId" IS NULL
                  AND r."scope" NOT IN ('CLIENT', 'TEAM')
                  AND ((p."resource" = @resource AND p."action" = @action)
                       OR (p."resource" = '*' AND p."action" = '*')))
            """;

        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue("userId", userId);
        command.Parameters.AddWithValue("companyId", companyId);
        command.Parameters.AddWithValue("resource", resource);
        command.Parameters.AddWithValue("action", action);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is true;
    }
}
