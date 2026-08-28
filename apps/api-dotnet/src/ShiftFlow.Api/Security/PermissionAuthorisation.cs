// en-GB: Resolves current tenant-scoped permissions from PostgreSQL instead of trusting token claims.
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using ShiftFlow.Application.Security;

namespace ShiftFlow.Api.Security;

public sealed record PermissionRequirement(string Resource, string Action) : IAuthorizationRequirement;

public sealed class PermissionAuthorisationHandler(
    IPermissionAuthorizer authorizer,
    IHttpContextAccessor contextAccessor) : AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PermissionRequirement requirement)
    {
        var httpContext = contextAccessor.HttpContext;
        var userIdValue = context.User.FindFirstValue("id") ??
            context.User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        var companyIdValue = context.User.FindFirstValue("companyId");
        if (httpContext is null ||
            !Guid.TryParse(userIdValue, out var userId) ||
            !Guid.TryParse(companyIdValue, out var companyId))
        {
            return;
        }

        var requestedCompany = httpContext.Request.Headers["x-company-id"].FirstOrDefault()?.Trim();
        if (!string.IsNullOrEmpty(requestedCompany) &&
            !requestedCompany.Equals(companyIdValue, StringComparison.Ordinal))
        {
            return;
        }

        if (await authorizer.HasPermissionAsync(
                userId,
                companyId,
                requirement.Resource,
                requirement.Action,
                httpContext.RequestAborted))
        {
            context.Succeed(requirement);
        }
    }
}
