// en-GB: Reads tenant-scoped audit evidence from the existing Prisma-owned PostgreSQL schema.
using System.Data;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;
using ShiftFlow.Application.Audit;
using ShiftFlow.Domain.Audit;

namespace ShiftFlow.Infrastructure.Audit;

public sealed class NpgsqlAuditLogReader(NpgsqlDataSource dataSource) : IAuditLogReader
{
    private const string FilterSql = """
        WHERE "companyId" = @companyId
          AND (@entityType IS NULL OR "entityType" = @entityType)
          AND (@entityId IS NULL OR "entityId" = @entityId)
          AND (@action IS NULL OR "action" = @action)
          AND (@actorUserId IS NULL OR "actorUserId" = @actorUserId)
        """;

    private const string SelectColumns = """
        "id", "companyId", "clientId", "teamId", "shiftId", "activityId",
        "shiftReportId", "actorUserId", "entityType", "entityId", "action",
        "before", "after", "requestId", "ipAddress", "userAgent", "createdAt"
        """;

    public async Task<AuditPage> ListAsync(
        Guid companyId,
        AuditFilter filter,
        PageRequest page,
        CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            cancellationToken);

        var total = await CountAsync(connection, transaction, companyId, filter, cancellationToken);
        var items = await ReadPageAsync(
            connection,
            transaction,
            companyId,
            filter,
            page,
            cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return new AuditPage(items, total, page.Page, page.PageSize);
    }

    public async Task<AuditLog?> FindAsync(
        Guid companyId,
        Guid auditLogId,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT "id", "companyId", "clientId", "teamId", "shiftId", "activityId",
                   "shiftReportId", "actorUserId", "entityType", "entityId", "action",
                   "before", "after", "requestId", "ipAddress", "userAgent", "createdAt"
            FROM "audit_logs"
            WHERE "id" = @auditLogId AND "companyId" = @companyId
            LIMIT 1
            """;

        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue("auditLogId", auditLogId);
        command.Parameters.AddWithValue("companyId", companyId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadAuditLog(reader) : null;
    }

    private static async Task<long> CountAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        Guid companyId,
        AuditFilter filter,
        CancellationToken cancellationToken)
    {
        var sql = $"SELECT COUNT(*) FROM \"audit_logs\" {FilterSql}";
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        AddFilterParameters(command, companyId, filter);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt64(result, System.Globalization.CultureInfo.InvariantCulture);
    }

    private static async Task<IReadOnlyList<AuditLog>> ReadPageAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        Guid companyId,
        AuditFilter filter,
        PageRequest page,
        CancellationToken cancellationToken)
    {
        var sql = $"""
            SELECT {SelectColumns}
            FROM "audit_logs"
            {FilterSql}
            ORDER BY "createdAt" DESC
            LIMIT @pageSize OFFSET @offset
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        AddFilterParameters(command, companyId, filter);
        command.Parameters.AddWithValue("pageSize", page.PageSize);
        command.Parameters.AddWithValue("offset", page.Offset);

        var items = new List<AuditLog>(page.PageSize);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(ReadAuditLog(reader));
        }

        return items;
    }

    private static void AddFilterParameters(
        NpgsqlCommand command,
        Guid companyId,
        AuditFilter filter)
    {
        command.Parameters.AddWithValue("companyId", companyId);
        AddNullable(command, "entityType", NpgsqlDbType.Varchar, filter.EntityType);
        AddNullable(command, "entityId", NpgsqlDbType.Varchar, filter.EntityId);
        AddNullable(command, "action", NpgsqlDbType.Varchar, filter.Action);
        AddNullable(command, "actorUserId", NpgsqlDbType.Uuid, filter.ActorUserId);
    }

    private static void AddNullable(
        NpgsqlCommand command,
        string name,
        NpgsqlDbType type,
        object? value)
    {
        command.Parameters.Add(new NpgsqlParameter(name, type) { Value = value ?? DBNull.Value });
    }

    private static AuditLog ReadAuditLog(NpgsqlDataReader reader)
    {
        return new AuditLog(
            reader.GetGuid(0),
            NullableGuid(reader, 1),
            NullableGuid(reader, 2),
            NullableGuid(reader, 3),
            NullableGuid(reader, 4),
            NullableGuid(reader, 5),
            NullableGuid(reader, 6),
            NullableGuid(reader, 7),
            reader.GetString(8),
            reader.GetString(9),
            reader.GetString(10),
            NullableJson(reader, 11),
            NullableJson(reader, 12),
            NullableString(reader, 13),
            NullableString(reader, 14),
            NullableString(reader, 15),
            reader.GetDateTime(16));
    }

    private static Guid? NullableGuid(NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetGuid(ordinal);

    private static string? NullableString(NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);

    private static JsonElement? NullableJson(NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal)
            ? null
            : JsonDocument.Parse(reader.GetString(ordinal)).RootElement.Clone();
}
