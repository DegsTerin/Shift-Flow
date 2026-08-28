// en-GB: Preserves the legacy global abuse limit while making the migrated route safe across replicas.
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using ShiftFlow.Api.Http;
using ShiftFlow.Application.Platform;

namespace ShiftFlow.Api.Platform;

public sealed class DistributedRateLimitMiddleware(
    RequestDelegate next,
    ILogger<DistributedRateLimitMiddleware> logger,
    int permitLimit,
    TimeSpan window)
{
    private static readonly Action<ILogger, Exception?> LogUnavailable = LoggerMessage.Define(
        LogLevel.Error,
        new EventId(1001, "DistributedRateLimiterUnavailable"),
        "Distributed request limiter is unavailable");

    public async Task InvokeAsync(HttpContext context, IRequestRateLimiter limiter)
    {
        if (context.Request.Path == "/health" || context.Request.Path == "/ready")
        {
            await next(context);
            return;
        }

        RequestRateLimitLease lease;
        try
        {
            lease = await limiter.AcquireAsync(
                RateLimitKey(context),
                permitLimit,
                window,
                context.RequestAborted);
        }
        catch (Exception exception) when (!context.RequestAborted.IsCancellationRequested)
        {
            LogUnavailable(logger, exception);
            await LegacyApiResults.WriteErrorAsync(
                context.Response,
                StatusCodes.Status503ServiceUnavailable,
                "SERVICE_UNAVAILABLE",
                "Request protection is unavailable",
                cancellationToken: context.RequestAborted);
            return;
        }

        context.Response.Headers["x-rate-limit-limit"] = permitLimit.ToString(CultureInfo.InvariantCulture);
        context.Response.Headers["x-rate-limit-remaining"] = lease.Remaining.ToString(CultureInfo.InvariantCulture);
        context.Response.Headers["x-rate-limit-reset"] = lease.ResetsAt.UtcDateTime.ToString("O", CultureInfo.InvariantCulture);
        if (!lease.Acquired)
        {
            var retryAfter = Math.Max(1, (int)Math.Ceiling((lease.ResetsAt - DateTimeOffset.UtcNow).TotalSeconds));
            context.Response.Headers.RetryAfter = retryAfter.ToString(CultureInfo.InvariantCulture);
            await LegacyApiResults.WriteErrorAsync(
                context.Response,
                StatusCodes.Status429TooManyRequests,
                "RATE_LIMITED",
                "Too many requests",
                cancellationToken: context.RequestAborted);
            return;
        }

        await next(context);
    }

    private static string RateLimitKey(HttpContext context)
    {
        var source = $"ip:{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(source));
        return Convert.ToHexString(hash).ToLowerInvariant()[..32];
    }
}
