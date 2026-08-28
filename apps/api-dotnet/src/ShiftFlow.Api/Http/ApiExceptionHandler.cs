// en-GB: Converts expected and unexpected failures into the stable legacy error envelope without leaking internals.
using Microsoft.AspNetCore.Diagnostics;

namespace ShiftFlow.Api.Http;

public sealed class ApiException(
    int statusCode,
    string code,
    string message,
    object? details = null) : Exception(message)
{
    public int StatusCode { get; } = statusCode;

    public string Code { get; } = code;

    public object? Details { get; } = details;
}

public sealed partial class ApiExceptionHandler(
    ILogger<ApiExceptionHandler> logger,
    IHostEnvironment environment) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        if (exception is ApiException expected)
        {
            await LegacyApiResults.WriteErrorAsync(
                httpContext.Response,
                expected.StatusCode,
                expected.Code,
                expected.Message,
                environment.IsProduction() ? null : expected.Details,
                cancellationToken);
            return true;
        }

        LogUnhandledFailure(logger, httpContext.TraceIdentifier, exception);
        await LegacyApiResults.WriteErrorAsync(
            httpContext.Response,
            StatusCodes.Status500InternalServerError,
            "INTERNAL_ERROR",
            environment.IsProduction() ? "Unexpected error" : exception.Message,
            cancellationToken: cancellationToken);
        return true;
    }

    [LoggerMessage(
        EventId = 1001,
        Level = LogLevel.Error,
        Message = "Unhandled API failure for request {RequestId}")]
    private static partial void LogUnhandledFailure(
        ILogger logger,
        string requestId,
        Exception exception);
}
