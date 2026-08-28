// en-GB: Represents immutable audit evidence without coupling the domain to HTTP or PostgreSQL APIs.
using System.Text.Json;

namespace ShiftFlow.Domain.Audit;

public sealed record AuditLog(
    Guid Id,
    Guid? CompanyId,
    Guid? ClientId,
    Guid? TeamId,
    Guid? ShiftId,
    Guid? ActivityId,
    Guid? ShiftReportId,
    Guid? ActorUserId,
    string EntityType,
    string EntityId,
    string Action,
    JsonElement? Before,
    JsonElement? After,
    string? RequestId,
    string? IpAddress,
    string? UserAgent,
    DateTime CreatedAt);
