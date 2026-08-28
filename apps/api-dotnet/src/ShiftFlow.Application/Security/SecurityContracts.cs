// en-GB: Defines live security checks so token claims never become tenant or RBAC authority by themselves.
namespace ShiftFlow.Application.Security;

public sealed record LegacyPrincipalCandidate(
    Guid UserId,
    Guid CompanyId,
    string JwtId,
    long CredentialVersion);

public interface ILegacyPrincipalValidator
{
    Task<bool> IsCurrentAsync(
        LegacyPrincipalCandidate candidate,
        CancellationToken cancellationToken);
}

public interface IPermissionAuthorizer
{
    Task<bool> HasPermissionAsync(
        Guid userId,
        Guid companyId,
        string resource,
        string action,
        CancellationToken cancellationToken);
}
