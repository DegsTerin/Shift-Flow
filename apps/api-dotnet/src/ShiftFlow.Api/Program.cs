// en-GB: Composes the provider-neutral ASP.NET Core compatibility host for reversible route migration.
using System.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using ShiftFlow.Api.Audit;
using ShiftFlow.Api.Configuration;
using ShiftFlow.Api.Http;
using ShiftFlow.Api.Platform;
using ShiftFlow.Api.Security;
using ShiftFlow.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole();
builder.WebHost.ConfigureKestrel(options =>
{
    options.AddServerHeader = false;
    options.Limits.MaxRequestBodySize = 1_048_576;
});

builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddProblemDetails();
builder.Services.AddHttpContextAccessor();
builder.Services.AddOpenApi(OpenApiConfiguration.Configure);
builder.Services.AddShiftFlowInfrastructure(builder.Configuration, builder.Environment.IsProduction());
builder.Services.AddLegacyAuthentication(builder.Configuration, builder.Environment.IsProduction());
var apiRateLimit = PositiveInteger(builder.Configuration, "API_RATE_LIMIT_MAX", 600, 100_000);
var apiRateLimitWindow = PositiveInteger(
    builder.Configuration,
    "API_RATE_LIMIT_WINDOW_MS",
    60_000,
    86_400_000);
var dataProtection = builder.Services.AddDataProtection().SetApplicationName("ShiftFlow");
var dataProtectionPath = builder.Configuration["DATA_PROTECTION_KEYS_PATH"];
if (!string.IsNullOrWhiteSpace(dataProtectionPath))
{
    dataProtection.PersistKeysToFileSystem(new DirectoryInfo(dataProtectionPath));
}
else if (builder.Environment.IsProduction())
{
    throw new InvalidOperationException(
        "DATA_PROTECTION_KEYS_PATH is required in production until a managed key repository is selected.");
}
builder.Services.AddSession(options =>
{
    options.Cookie.Name = "__Host-shiftflow_session";
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.Cookie.Path = "/";
    options.IdleTimeout = TimeSpan.FromMinutes(20);
});
builder.Services.AddScoped<IAuthorizationHandler, PermissionAuthorisationHandler>();
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(
        AuditEndpoints.ReadPolicy,
        policy => policy
            .RequireAuthenticatedUser()
            .AddRequirements(new PermissionRequirement("audit", "read")));
});
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor |
        ForwardedHeaders.XForwardedHost |
        ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;

    var configured = builder.Configuration["TRUSTED_PROXY_IPS"];
    if (!string.IsNullOrWhiteSpace(configured))
    {
        foreach (var candidate in configured.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            if (!IPAddress.TryParse(candidate.Trim(), out var address))
            {
                throw new InvalidOperationException("TRUSTED_PROXY_IPS contains an invalid address.");
            }

            options.KnownProxies.Add(address);
        }
    }
});

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseMiddleware<RequestContextMiddleware>();
app.UseMiddleware<DistributedRateLimitMiddleware>(apiRateLimit, TimeSpan.FromMilliseconds(apiRateLimitWindow));
app.UseSession();
app.UseAuthentication();
app.UseAuthorization();

app.MapPlatformHealth();
if (builder.Configuration.GetValue<bool>("ENABLE_INTERNAL_RUNTIME_PROBES"))
{
    app.MapInternalRuntimeProbes();
}
app.MapOpenApi("/openapi/{documentName}.json").AllowAnonymous();
app.MapAuditEndpoints();
app.MapFallback((HttpContext context) => LegacyApiResults.Error(
    StatusCodes.Status404NotFound,
    "NOT_FOUND",
    $"Route {context.Request.Method} {context.Request.Path} not found"));

app.Run();

static int PositiveInteger(
    IConfiguration configuration,
    string key,
    int defaultValue,
    int maximum)
{
    var supplied = configuration[key];
    if (string.IsNullOrWhiteSpace(supplied))
    {
        return defaultValue;
    }

    if (!int.TryParse(supplied, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var value) ||
        value <= 0 ||
        value > maximum)
    {
        throw new InvalidOperationException($"{key} must be a positive integer no greater than {maximum}.");
    }

    return value;
}

public partial class Program;
