// en-GB: Validates the legacy HS256 token and current PostgreSQL principal state during coexistence.
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using ShiftFlow.Api.Configuration;
using ShiftFlow.Api.Http;
using ShiftFlow.Application.Security;

namespace ShiftFlow.Api.Security;

public static class LegacyAuthentication
{
    public static IServiceCollection AddLegacyAuthentication(
        this IServiceCollection services,
        IConfiguration configuration,
        bool isProduction)
    {
        var issuer = configuration["JWT_ISSUER"] ?? "shiftflow";
        var signingKey = configuration["JWT_ACCESS_SECRET"] ?? configuration["JWT_SECRET"];
        if (string.IsNullOrWhiteSpace(signingKey) || signingKey.Length < 32)
        {
            throw new InvalidOperationException(
                "JWT_ACCESS_SECRET or JWT_SECRET must contain at least 32 characters for the compatibility host.");
        }
        if (isProduction && System.Text.RegularExpressions.Regex.IsMatch(
                signingKey,
                "(replace|example|test|valid|invalid|missing|shiftflow)",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase |
                System.Text.RegularExpressions.RegexOptions.CultureInvariant |
                System.Text.RegularExpressions.RegexOptions.NonBacktracking,
                TimeSpan.FromMilliseconds(100)))
        {
            throw new InvalidOperationException(
                "JWT_ACCESS_SECRET or JWT_SECRET cannot use a placeholder value in production.");
        }

        var options = new LegacyJwtOptions { Issuer = issuer, SigningKey = signingKey };
        services.AddSingleton(options);
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(jwt =>
            {
                jwt.MapInboundClaims = false;
                jwt.SaveToken = false;
                jwt.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = options.Issuer,
                    ValidateAudience = false,
                    ValidateLifetime = true,
                    RequireExpirationTime = true,
                    RequireSignedTokens = true,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.SigningKey)),
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                    ClockSkew = TimeSpan.Zero,
                    NameClaimType = JwtRegisteredClaimNames.Sub
                };
                jwt.Events = new JwtBearerEvents
                {
                    OnTokenValidated = ValidateCurrentPrincipalAsync,
                    OnChallenge = async context =>
                    {
                        context.HandleResponse();
                        var message = context.AuthenticateFailure is null
                            ? "Authentication required"
                            : "Invalid or expired token";
                        await LegacyApiResults.WriteErrorAsync(
                            context.Response,
                            StatusCodes.Status401Unauthorized,
                            "UNAUTHORIZED",
                            message,
                            cancellationToken: context.HttpContext.RequestAborted);
                    },
                    OnForbidden = context => LegacyApiResults.WriteErrorAsync(
                        context.Response,
                        StatusCodes.Status403Forbidden,
                        "FORBIDDEN",
                        "audit:read is required",
                        cancellationToken: context.HttpContext.RequestAborted)
                };
            });

        return services;
    }

    private static async Task ValidateCurrentPrincipalAsync(TokenValidatedContext context)
    {
        try
        {
            var principal = context.Principal;
            var id = principal?.FindFirstValue("id");
            var subject = principal?.FindFirstValue(JwtRegisteredClaimNames.Sub);
            var jwtId = principal?.FindFirstValue(JwtRegisteredClaimNames.Jti);
            var companyId = principal?.FindFirstValue("companyId");
            var credentialClaim = principal?.FindFirstValue("credentialVersion");

            if (!Guid.TryParse(id, out var userId) ||
                !string.Equals(id, subject, StringComparison.Ordinal) ||
                string.IsNullOrWhiteSpace(jwtId) ||
                !Guid.TryParse(companyId, out var company) ||
                (credentialClaim is not null &&
                 (!long.TryParse(
                     credentialClaim,
                     System.Globalization.NumberStyles.None,
                     System.Globalization.CultureInfo.InvariantCulture,
                     out _) ||
                  credentialClaim.StartsWith('-'))))
            {
                context.Fail("The legacy token identity contract is invalid.");
                return;
            }

            if (principal is null ||
                !PortfolioSessionContract.TryApply(context.SecurityToken, principal))
            {
                context.Fail("The legacy token session contract is invalid.");
                return;
            }

            var credentialVersion = credentialClaim is null
                ? 0
                : long.Parse(credentialClaim, System.Globalization.CultureInfo.InvariantCulture);
            var validator = context.HttpContext.RequestServices
                .GetRequiredService<ILegacyPrincipalValidator>();
            var current = await validator.IsCurrentAsync(
                new LegacyPrincipalCandidate(userId, company, jwtId, credentialVersion),
                context.HttpContext.RequestAborted);
            if (!current)
            {
                context.Fail("The legacy token principal is no longer current.");
            }
        }
        catch (Exception)
        {
            context.Fail("The legacy token principal could not be validated.");
        }
    }
}
