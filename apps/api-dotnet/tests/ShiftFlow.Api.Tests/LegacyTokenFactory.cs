// en-GB: Creates deterministic HS256 tokens without bypassing the real compatibility authentication handler.
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ShiftFlow.Api.Tests;

public static class LegacyTokenFactory
{
    private static readonly string[] StalePermissions = ["stale:claim"];

    public static string Create(
        Guid? userId = null,
        Guid? companyId = null,
        string issuer = "shiftflow",
        DateTimeOffset? expiresAt = null,
        string? sessionKind = null,
        IReadOnlyCollection<string>? permissions = null,
        bool includePermissions = true,
        object? permissionsPayload = null,
        IReadOnlyDictionary<string, object?>? additionalClaims = null)
    {
        var resolvedUser = userId ?? CompatibilityHostFactory.UserId;
        var header = Encode(new { alg = "HS256", typ = "JWT" });
        var payloadValues = new Dictionary<string, object?>
        {
            ["id"] = resolvedUser,
            ["sub"] = resolvedUser,
            ["jti"] = "44444444-4444-4444-8444-444444444444",
            ["companyId"] = companyId ?? CompatibilityHostFactory.CompanyId,
            ["credentialVersion"] = 0,
            ["email"] = "integration.admin@shiftflow.local",
            ["iss"] = issuer,
            ["iat"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            ["exp"] = (expiresAt ?? DateTimeOffset.UtcNow.AddMinutes(5)).ToUnixTimeSeconds()
        };
        if (includePermissions)
        {
            payloadValues["permissions"] = permissionsPayload ?? permissions ?? StalePermissions;
        }
        if (sessionKind is not null)
        {
            payloadValues["sessionKind"] = sessionKind;
        }
        if (additionalClaims is not null)
        {
            foreach (var claim in additionalClaims)
            {
                payloadValues[claim.Key] = claim.Value;
            }
        }

        var payload = Encode(payloadValues);
        var unsigned = $"{header}.{payload}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(CompatibilityHostFactory.SigningKey));
        return $"{unsigned}.{Base64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(unsigned)))}";
    }

    private static string Encode<T>(T value) =>
        Base64Url(JsonSerializer.SerializeToUtf8Bytes(value));

    private static string Base64Url(byte[] value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
