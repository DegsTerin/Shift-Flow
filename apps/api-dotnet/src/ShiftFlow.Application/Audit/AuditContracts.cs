// en-GB: Defines the migrated Audit query contract and its stable paginated result shape.
using ShiftFlow.Domain.Audit;

namespace ShiftFlow.Application.Audit;

public sealed record AuditFilter(
    string? EntityType,
    string? EntityId,
    string? Action,
    Guid? ActorUserId);

public sealed record PageRequest(int Page, int PageSize)
{
    public int Offset => checked((Page - 1) * PageSize);
}

public sealed record AuditPage(
    IReadOnlyList<AuditLog> Items,
    long Total,
    int Page,
    int PageSize);

public interface IAuditLogReader
{
    Task<AuditPage> ListAsync(
        Guid companyId,
        AuditFilter filter,
        PageRequest page,
        CancellationToken cancellationToken);

    Task<AuditLog?> FindAsync(
        Guid companyId,
        Guid auditLogId,
        CancellationToken cancellationToken);
}
