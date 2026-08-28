// en-GB: Preserves the existing ShiftFlow REST success and error envelopes during route migration.
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace ShiftFlow.Api.Http;

public sealed record ApiEnvelope<T>(T Data);

public sealed record ApiErrorBody(
    string Code,
    string Message,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] object? Details = null);

public sealed record ApiErrorEnvelope(ApiErrorBody Error);

public static class LegacyApiResults
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> RedactedKeys = new(
        ["password", "passwordHash", "tokenHash"],
        StringComparer.Ordinal);
    private static readonly Regex RedactedKeyPattern = new(
        "(api[-_]?key|authorization|cookie|credential|jwt|password|refresh[-_]?token|secret|token[-_]?hash)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.NonBacktracking,
        TimeSpan.FromMilliseconds(100));

    public static IResult Ok<T>(T data) => Results.Json(Sanitise(new ApiEnvelope<T>(data)), JsonOptions);

    public static IResult Error(int statusCode, string code, string message, object? details = null) =>
        Results.Json(
            Sanitise(new ApiErrorEnvelope(new ApiErrorBody(code, message, details))),
            JsonOptions,
            statusCode: statusCode);

    public static Task WriteErrorAsync(
        HttpResponse response,
        int statusCode,
        string code,
        string message,
        object? details = null,
        CancellationToken cancellationToken = default)
    {
        response.StatusCode = statusCode;
        response.ContentType = "application/json; charset=utf-8";
        return response.WriteAsJsonAsync(
            Sanitise(new ApiErrorEnvelope(new ApiErrorBody(code, message, details))),
            JsonOptions,
            cancellationToken);
    }

    private static JsonNode? Sanitise<T>(T value)
    {
        var root = JsonSerializer.SerializeToNode(value, JsonOptions);
        SanitiseNode(root);
        return root;
    }

    private static void SanitiseNode(JsonNode? node)
    {
        if (node is JsonArray array)
        {
            foreach (var item in array)
            {
                SanitiseNode(item);
            }
            return;
        }

        if (node is not JsonObject jsonObject)
        {
            return;
        }

        foreach (var key in jsonObject.Select(property => property.Key).ToArray())
        {
            if (RedactedKeys.Contains(key) || RedactedKeyPattern.IsMatch(key))
            {
                jsonObject.Remove(key);
                continue;
            }

            SanitiseNode(jsonObject[key]);
        }
    }
}
