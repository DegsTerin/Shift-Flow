// en-GB: Maps the first read-only strangler slice while preserving the current Audit REST contract.
using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Primitives;
using ShiftFlow.Api.Http;
using ShiftFlow.Application.Audit;

namespace ShiftFlow.Api.Audit;

public static class AuditEndpoints
{
    public const string ReadPolicy = "permission:audit:read";

    public static IEndpointRouteBuilder MapAuditEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/audit")
            .RequireAuthorization(ReadPolicy)
            .WithTags("Audit");

        group.MapGet("/", ListAsync)
            .WithName("ListAuditLogs")
            .WithSummary("Lists tenant-scoped audit evidence")
            .Produces<ApiEnvelope<AuditPage>>()
            .Produces<ApiErrorEnvelope>(StatusCodes.Status400BadRequest)
            .Produces<ApiErrorEnvelope>(StatusCodes.Status401Unauthorized)
            .Produces<ApiErrorEnvelope>(StatusCodes.Status403Forbidden);

        group.MapGet("/{id}", FindAsync)
            .WithName("GetAuditLog")
            .WithSummary("Gets one tenant-scoped audit record")
            .Produces<ApiEnvelope<ShiftFlow.Domain.Audit.AuditLog>>(StatusCodes.Status200OK)
            .Produces<ApiErrorEnvelope>(StatusCodes.Status400BadRequest)
            .Produces<ApiErrorEnvelope>(StatusCodes.Status401Unauthorized)
            .Produces<ApiErrorEnvelope>(StatusCodes.Status403Forbidden)
            .Produces<ApiErrorEnvelope>(StatusCodes.Status404NotFound);

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        HttpContext context,
        IAuditLogReader reader,
        CancellationToken cancellationToken)
    {
        if (!TryParseQuery(context.Request.Query, out var filter, out var page))
        {
            return LegacyApiResults.Error(
                StatusCodes.Status400BadRequest,
                "BAD_REQUEST",
                "Validation failed");
        }

        var companyId = CurrentCompany(context.User);
        var result = await reader.ListAsync(companyId, filter!, page!, cancellationToken);
        return LegacyApiResults.Ok(result);
    }

    private static async Task<IResult> FindAsync(
        string id,
        ClaimsPrincipal user,
        IAuditLogReader reader,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(id, out var auditLogId))
        {
            return LegacyApiResults.Error(
                StatusCodes.Status400BadRequest,
                "BAD_REQUEST",
                "Invalid id");
        }

        var item = await reader.FindAsync(CurrentCompany(user), auditLogId, cancellationToken);
        return item is null
            ? LegacyApiResults.Error(
                StatusCodes.Status404NotFound,
                "NOT_FOUND",
                "AuditLog not found")
            : LegacyApiResults.Ok(item);
    }

    private static Guid CurrentCompany(ClaimsPrincipal principal)
    {
        if (Guid.TryParse(principal.FindFirstValue("companyId"), out var companyId))
        {
            return companyId;
        }

        throw new ApiException(
            StatusCodes.Status400BadRequest,
            "BAD_REQUEST",
            "Company context is required");
    }

    private static bool TryParseQuery(
        IQueryCollection query,
        out AuditFilter? filter,
        out PageRequest? page)
    {
        filter = null;
        page = null;
        if (!TryNumber(query, "page", 1, 1, 10_000, out var pageNumber) ||
            !TryNumber(query, "pageSize", 25, 1, 100, out var pageSize) ||
            !TryText(query, "entityType", 120, out var entityType) ||
            !TryText(query, "entityId", 80, out var entityId) ||
            !TryText(query, "action", 120, out var action) ||
            !TryGuid(query, "actorUserId", out var actorUserId))
        {
            return false;
        }

        filter = new AuditFilter(entityType, entityId, action, actorUserId);
        page = new PageRequest(pageNumber, pageSize);
        return true;
    }

    private static bool TryNumber(
        IQueryCollection query,
        string key,
        int defaultValue,
        int minimum,
        int maximum,
        out int value)
    {
        value = defaultValue;
        if (!query.TryGetValue(key, out var supplied))
        {
            return true;
        }

        if (!Single(supplied, out var text) ||
            !double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) ||
            !double.IsFinite(number) ||
            number != Math.Truncate(number) ||
            number < minimum ||
            number > maximum)
        {
            return false;
        }

        value = (int)number;
        return true;
    }

    private static bool TryText(
        IQueryCollection query,
        string key,
        int maximumLength,
        out string? value)
    {
        value = null;
        if (!query.TryGetValue(key, out var supplied))
        {
            return true;
        }

        if (!Single(supplied, out var text) || text.Length > maximumLength)
        {
            return false;
        }

        value = string.IsNullOrEmpty(text) ? null : text;
        return true;
    }

    private static bool TryGuid(IQueryCollection query, string key, out Guid? value)
    {
        value = null;
        if (!query.TryGetValue(key, out var supplied))
        {
            return true;
        }

        if (!Single(supplied, out var text) || !Guid.TryParse(text, out var parsed))
        {
            return false;
        }

        value = parsed;
        return true;
    }

    private static bool Single(StringValues values, out string value)
    {
        value = values.FirstOrDefault() ?? string.Empty;
        return values.Count == 1;
    }
}
