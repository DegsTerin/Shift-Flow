// en-GB: Reconstructs the signed portfolio permission ceiling from the validated JWT payload.
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ShiftFlow.Api.Security;

internal static class PortfolioSessionContract
{
    private const string PortfolioSessionKind = "portfolio";
    private const string SessionKindClaim = "sessionKind";
    private const string PermissionsClaim = "permissions";
    private const string TrustedSessionKindClaim = "urn:shiftflow:trusted-session-kind";
    private const string TrustedPermissionClaim = "urn:shiftflow:trusted-portfolio-permission";

    public static bool TryApply(SecurityToken securityToken, ClaimsPrincipal principal)
    {
        if (principal.Identity is not ClaimsIdentity identity ||
            !TryReadPayload(securityToken, out var payload))
        {
            return false;
        }

        RemoveTrustedClaims(identity);
        using (payload)
        {
            if (!payload.RootElement.TryGetProperty(SessionKindClaim, out var sessionKind))
            {
                return true;
            }

            if (sessionKind.ValueKind != JsonValueKind.String ||
                !string.Equals(
                    sessionKind.GetString(),
                    PortfolioSessionKind,
                    StringComparison.Ordinal))
            {
                return false;
            }

            if (!payload.RootElement.TryGetProperty(PermissionsClaim, out var permissions) ||
                permissions.ValueKind != JsonValueKind.Array)
            {
                return false;
            }

            var permissionValues = new List<string>();
            foreach (var permission in permissions.EnumerateArray())
            {
                if (permission.ValueKind != JsonValueKind.String ||
                    permission.GetString() is not { } permissionValue)
                {
                    return false;
                }

                permissionValues.Add(permissionValue);
            }

            identity.AddClaim(new Claim(
                TrustedSessionKindClaim,
                PortfolioSessionKind,
                ClaimValueTypes.String));
            foreach (var permissionValue in permissionValues)
            {
                identity.AddClaim(new Claim(
                    TrustedPermissionClaim,
                    permissionValue,
                    ClaimValueTypes.String));
            }
        }

        return true;
    }

    public static bool IsPortfolio(ClaimsPrincipal principal) =>
        principal.HasClaim(TrustedSessionKindClaim, PortfolioSessionKind);

    public static bool Grants(ClaimsPrincipal principal, string resource, string action)
    {
        var required = $"{resource}:{action}";
        return principal.FindAll(TrustedPermissionClaim).Any(claim =>
            string.Equals(claim.Value, required, StringComparison.Ordinal) ||
            string.Equals(claim.Value, "*:*", StringComparison.Ordinal));
    }

    private static bool TryReadPayload(SecurityToken securityToken, out JsonDocument payload)
    {
        var encodedPayload = securityToken switch
        {
            JsonWebToken jsonWebToken => jsonWebToken.EncodedPayload,
            JwtSecurityToken jwtSecurityToken => jwtSecurityToken.RawPayload,
            _ => null
        };

        if (string.IsNullOrWhiteSpace(encodedPayload))
        {
            payload = null!;
            return false;
        }

        try
        {
            payload = JsonDocument.Parse(Base64UrlEncoder.DecodeBytes(encodedPayload));
            return payload.RootElement.ValueKind == JsonValueKind.Object;
        }
        catch (Exception exception) when (
            exception is FormatException or JsonException or ArgumentException)
        {
            payload = null!;
            return false;
        }
    }

    private static void RemoveTrustedClaims(ClaimsIdentity identity)
    {
        foreach (var claim in identity.FindAll(TrustedSessionKindClaim).Concat(
                     identity.FindAll(TrustedPermissionClaim)).ToArray())
        {
            identity.RemoveClaim(claim);
        }
    }
}
