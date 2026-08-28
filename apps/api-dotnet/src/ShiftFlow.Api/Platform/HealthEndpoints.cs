// en-GB: Separates dependency-free liveness from fail-closed data, cache and key-ring readiness.
using Microsoft.AspNetCore.DataProtection;
using ShiftFlow.Application.Platform;

namespace ShiftFlow.Api.Platform;

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapPlatformHealth(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/health", () => Results.Ok(new
        {
            status = "ok",
            service = "shiftflow-api-dotnet"
        }))
            .AllowAnonymous()
            .ExcludeFromDescription();

        endpoints.MapGet("/ready", CheckReadyAsync)
            .AllowAnonymous()
            .ExcludeFromDescription();

        return endpoints;
    }

    public static IEndpointRouteBuilder MapInternalRuntimeProbes(
        this IEndpointRouteBuilder endpoints)
    {
        const string path = "/internal/runtime/data-protection-probe";
        endpoints.MapGet(path, CreateProtectedProbe)
            .AllowAnonymous()
            .ExcludeFromDescription();
        endpoints.MapPost(path, ValidateProtectedProbeAsync)
            .AllowAnonymous()
            .ExcludeFromDescription();

        return endpoints;
    }

    private static async Task<IResult> CheckReadyAsync(
        IDependencyReadinessProbe probe,
        IDataProtectionProvider dataProtectionProvider,
        IHostEnvironment environment,
        CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(3));
        DependencyReadiness readiness;
        var dataProtection = false;
        try
        {
            readiness = await probe.CheckAsync(timeout.Token);
            var protector = dataProtectionProvider.CreateProtector("ShiftFlow.Readiness.v1");
            const string probeValue = "shiftflow-ready";
            dataProtection = protector.Unprotect(protector.Protect(probeValue)) == probeValue;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            readiness = new DependencyReadiness(false, false);
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            readiness = new DependencyReadiness(false, false);
        }

        var isReady = readiness.IsReady && dataProtection;
        return Results.Json(
            new
            {
                status = isReady ? "ready" : "not_ready",
                service = "shiftflow-api-dotnet",
                environment = environment.EnvironmentName.ToLowerInvariant(),
                checks = new
                {
                    postgresql = readiness.PostgreSql ? "available" : "unavailable",
                    redis = readiness.Redis ? "available" : "unavailable",
                    dataProtection = dataProtection ? "available" : "unavailable"
                }
            },
            statusCode: isReady
                ? StatusCodes.Status200OK
                : StatusCodes.Status503ServiceUnavailable);
    }

    private static IResult CreateProtectedProbe(IDataProtectionProvider dataProtectionProvider)
    {
        var protector = dataProtectionProvider.CreateProtector("ShiftFlow.RuntimeProbe.v1");
        return Results.Text(protector.Protect("shiftflow-runtime-probe"), "text/plain");
    }

    private static async Task<IResult> ValidateProtectedProbeAsync(
        HttpRequest request,
        IDataProtectionProvider dataProtectionProvider,
        CancellationToken cancellationToken)
    {
        if (request.ContentLength is > 16_384)
        {
            return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        }

        using var reader = new StreamReader(request.Body);
        var payload = await reader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(payload) || payload.Length > 16_384)
        {
            return Results.BadRequest();
        }

        try
        {
            var protector = dataProtectionProvider.CreateProtector("ShiftFlow.RuntimeProbe.v1");
            return protector.Unprotect(payload) == "shiftflow-runtime-probe"
                ? Results.Ok(new { status = "available" })
                : Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
        }
        catch (System.Security.Cryptography.CryptographicException)
        {
            return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
        }
    }
}
