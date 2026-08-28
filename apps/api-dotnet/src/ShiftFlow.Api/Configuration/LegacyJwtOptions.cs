// en-GB: Holds the temporary legacy JWT bridge configuration until the governed OIDC migration replaces it.
namespace ShiftFlow.Api.Configuration;

public sealed class LegacyJwtOptions
{
    public const string SectionName = "LegacyJwt";

    public required string Issuer { get; init; }

    public required string SigningKey { get; init; }
}
