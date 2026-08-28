// en-GB: Establishes one bounded request identifier for response correlation and structured logging.
using System.Text.RegularExpressions;

namespace ShiftFlow.Api.Http;

public sealed partial class RequestContextMiddleware(RequestDelegate next)
{
    private const int MaximumRequestIdLength = 120;

    public async Task InvokeAsync(HttpContext context)
    {
        var supplied = context.Request.Headers["x-request-id"].FirstOrDefault();
        var requestId = IsValid(supplied) ? supplied! : Guid.NewGuid().ToString("N");
        context.TraceIdentifier = requestId;
        context.Response.Headers["x-request-id"] = requestId;

        await next(context);
    }

    private static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value) &&
        value.Length <= MaximumRequestIdLength &&
        RequestIdPattern().IsMatch(value);

    [GeneratedRegex("^[A-Za-z0-9._:-]+$", RegexOptions.CultureInvariant)]
    private static partial Regex RequestIdPattern();
}
