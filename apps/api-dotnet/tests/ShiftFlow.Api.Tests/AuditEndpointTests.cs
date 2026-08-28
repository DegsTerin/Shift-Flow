// en-GB: Proves the migrated Audit surface retains authentication, tenant, envelope and validation contracts.
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using ShiftFlow.Application.Audit;
using ShiftFlow.Application.Platform;

namespace ShiftFlow.Api.Tests;

[TestClass]
public sealed class AuditEndpointTests
{
    private static readonly string[] ErrorPropertyNames = ["code", "message"];
    private static readonly string?[] AuditQueryParameterNames =
        ["page", "pageSize", "entityType", "entityId", "action", "actorUserId"];

    [TestMethod]
    public async Task HealthIsDependencyFreeAndIdentifiesTheNewHost()
    {
        await using var factory = new CompatibilityHostFactory();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/health", UriKind.Relative));
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual("ok", json.RootElement.GetProperty("status").GetString());
        Assert.AreEqual("shiftflow-api-dotnet", json.RootElement.GetProperty("service").GetString());
    }

    [TestMethod]
    public async Task ReadinessFailsClosedWhenRedisIsUnavailable()
    {
        await using var factory = new CompatibilityHostFactory();
        factory.Readiness.Result = new DependencyReadiness(true, false);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/ready", UriKind.Relative));
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.AreEqual(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.AreEqual("not_ready", json.RootElement.GetProperty("status").GetString());
        Assert.AreEqual(
            "unavailable",
            json.RootElement.GetProperty("checks").GetProperty("redis").GetString());
        Assert.AreEqual(
            "available",
            json.RootElement.GetProperty("checks").GetProperty("dataProtection").GetString());
    }

    [TestMethod]
    public async Task InternalRuntimeProbeRoundTripsAProtectedPayload()
    {
        await using var factory = new CompatibilityHostFactory();
        using var client = factory.CreateClient();

        var protectedPayload = await client.GetStringAsync(
            new Uri("/internal/runtime/data-protection-probe", UriKind.Relative));
        using var response = await client.PostAsync(
            new Uri("/internal/runtime/data-protection-probe", UriKind.Relative),
            new StringContent(protectedPayload));

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
    }

    [TestMethod]
    public async Task AuditRequiresAuthenticationWithTheLegacyErrorEnvelope()
    {
        await using var factory = new CompatibilityHostFactory();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/api/audit", UriKind.Relative));
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.AreEqual("UNAUTHORIZED", json.RootElement.GetProperty("error").GetProperty("code").GetString());
        Assert.AreEqual(
            "Authentication required",
            json.RootElement.GetProperty("error").GetProperty("message").GetString());
        CollectionAssert.AreEquivalent(
            ErrorPropertyNames,
            json.RootElement.GetProperty("error").EnumerateObject().Select(property => property.Name).ToArray());
    }

    [TestMethod]
    public async Task AuditListUsesCurrentPermissionAndTokenCompanyNotPermissionClaims()
    {
        await using var factory = new CompatibilityHostFactory();
        using var client = AuthenticatedClient(factory);
        client.DefaultRequestHeaders.Add("x-request-id", "audit-contract-1");

        using var response = await client.GetAsync(new Uri("/api/audit?page=1&pageSize=25", UriKind.Relative));
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual("audit-contract-1", response.Headers.GetValues("x-request-id").Single());
        Assert.AreEqual(CompatibilityHostFactory.CompanyId, factory.AuditReader.LastCompanyId);
        Assert.AreEqual(1, json.RootElement.GetProperty("data").GetProperty("total").GetInt64());
        Assert.AreEqual(
            "Client",
            json.RootElement.GetProperty("data").GetProperty("items")[0]
                .GetProperty("entityType").GetString());
    }

    [TestMethod]
    public async Task AuditRejectsPermissionAbsenceAndMismatchedCompanyContext()
    {
        await using var factory = new CompatibilityHostFactory();
        factory.Security.PermissionGranted = false;
        using var deniedClient = AuthenticatedClient(factory);
        using var denied = await deniedClient.GetAsync(new Uri("/api/audit", UriKind.Relative));
        Assert.AreEqual(HttpStatusCode.Forbidden, denied.StatusCode);

        factory.Security.PermissionGranted = true;
        using var mismatchedClient = AuthenticatedClient(factory);
        mismatchedClient.DefaultRequestHeaders.Add(
            "x-company-id",
            "55555555-5555-4555-8555-555555555555");
        using var mismatched = await mismatchedClient.GetAsync(new Uri("/api/audit", UriKind.Relative));
        Assert.AreEqual(HttpStatusCode.Forbidden, mismatched.StatusCode);
    }

    [TestMethod]
    public async Task AuditPreservesTheGlobalRateLimitContractAcrossReplicas()
    {
        await using var factory = new CompatibilityHostFactory();
        factory.RateLimiter.Lease = new RequestRateLimitLease(
            false,
            0,
            DateTimeOffset.UtcNow.AddSeconds(30));
        using var client = AuthenticatedClient(factory);

        using var response = await client.GetAsync(new Uri("/api/audit", UriKind.Relative));
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.AreEqual(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.AreEqual("RATE_LIMITED", json.RootElement.GetProperty("error").GetProperty("code").GetString());
        Assert.AreEqual("600", response.Headers.GetValues("x-rate-limit-limit").Single());
        Assert.AreEqual("0", response.Headers.GetValues("x-rate-limit-remaining").Single());
        Assert.IsTrue(response.Headers.RetryAfter is not null);
        Assert.AreEqual(32, factory.RateLimiter.LastKey?.Length);
        Assert.IsFalse(factory.RateLimiter.LastKey?.Contains(
            CompatibilityHostFactory.UserId.ToString(),
            StringComparison.Ordinal) ?? true);
        Assert.AreEqual(0, factory.Security.PrincipalValidationCalls);
    }

    [TestMethod]
    public async Task RedisLimiterFailureFailsBusinessTrafficClosedBeforeAuthentication()
    {
        await using var factory = new CompatibilityHostFactory();
        factory.RateLimiter.Failure = new InvalidOperationException("synthetic Redis failure");
        using var client = AuthenticatedClient(factory);

        using var response = await client.GetAsync(new Uri("/api/audit", UriKind.Relative));
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.AreEqual(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.AreEqual(
            "SERVICE_UNAVAILABLE",
            json.RootElement.GetProperty("error").GetProperty("code").GetString());
        Assert.AreEqual(0, factory.Security.PrincipalValidationCalls);
    }

    [TestMethod]
    public async Task LivenessRemainsDependencyFreeWhenTheRedisLimiterIsUnavailable()
    {
        await using var factory = new CompatibilityHostFactory();
        factory.RateLimiter.Failure = new InvalidOperationException("synthetic Redis failure");
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/health", UriKind.Relative));

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.IsNull(factory.RateLimiter.LastKey);
    }

    [TestMethod]
    public async Task AuditRejectsInvalidPaginationAndIdentifier()
    {
        await using var factory = new CompatibilityHostFactory();
        using var client = AuthenticatedClient(factory);

        using var pagination = await client.GetAsync(new Uri("/api/audit?pageSize=101", UriKind.Relative));
        using var identifier = await client.GetAsync(new Uri("/api/audit/not-a-uuid", UriKind.Relative));

        Assert.AreEqual(HttpStatusCode.BadRequest, pagination.StatusCode);
        Assert.AreEqual(HttpStatusCode.BadRequest, identifier.StatusCode);
    }

    [TestMethod]
    public async Task AuditReturnsNotFoundWithoutCrossCompanyDisclosure()
    {
        await using var factory = new CompatibilityHostFactory();
        using var client = AuthenticatedClient(factory);

        using var response = await client.GetAsync(
            new Uri("/api/audit/66666666-6666-4666-8666-666666666666", UriKind.Relative));
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());

        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
        Assert.AreEqual("NOT_FOUND", json.RootElement.GetProperty("error").GetProperty("code").GetString());
    }

    [TestMethod]
    public async Task AuditRecursivelyRedactsHistoricalSecretsAtTheResponseBoundary()
    {
        await using var factory = new CompatibilityHostFactory();
        using var sensitiveJson = JsonDocument.Parse(
            """{"safe":"retained","password":"hidden","nested":[{"refresh_token":"hidden","value":7}]}""");
        var item = factory.AuditReader.Page.Items.Single() with
        {
            Before = sensitiveJson.RootElement.Clone()
        };
        factory.AuditReader.Page = new AuditPage([item], 1, 1, 25);
        using var client = AuthenticatedClient(factory);

        using var response = await client.GetAsync(new Uri("/api/audit", UriKind.Relative));
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        var before = json.RootElement.GetProperty("data").GetProperty("items")[0].GetProperty("before");

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual("retained", before.GetProperty("safe").GetString());
        Assert.IsFalse(before.TryGetProperty("password", out _));
        Assert.IsFalse(before.GetProperty("nested")[0].TryGetProperty("refresh_token", out _));
        Assert.AreEqual(7, before.GetProperty("nested")[0].GetProperty("value").GetInt32());
    }

    [TestMethod]
    public async Task OpenApiExposesOnlyTheMigratedBusinessSurface()
    {
        await using var factory = new CompatibilityHostFactory();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/openapi/v1.json", UriKind.Relative));
        var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        var paths = json.RootElement.GetProperty("paths");

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.IsTrue(paths.TryGetProperty("/api/audit", out _));
        Assert.IsTrue(paths.TryGetProperty("/api/audit/{id}", out _));
        Assert.AreEqual(2, paths.EnumerateObject().Count());
        var list = paths.GetProperty("/api/audit").GetProperty("get");
        CollectionAssert.AreEquivalent(
            AuditQueryParameterNames,
            list.GetProperty("parameters").EnumerateArray()
                .Select(parameter => parameter.GetProperty("name").GetString())
                .ToArray());
        Assert.AreEqual(
            "bearer",
            json.RootElement.GetProperty("components").GetProperty("securitySchemes")
                .GetProperty("Bearer").GetProperty("scheme").GetString());
        Assert.AreEqual(1, list.GetProperty("security").GetArrayLength());
        Assert.AreEqual(
            "#/components/schemas/ApiEnvelopeOfAuditLog",
            paths.GetProperty("/api/audit/{id}").GetProperty("get").GetProperty("responses")
                .GetProperty("200").GetProperty("content").GetProperty("application/json")
                .GetProperty("schema").GetProperty("$ref").GetString());
    }

    private static HttpClient AuthenticatedClient(CompatibilityHostFactory factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", LegacyTokenFactory.Create());
        return client;
    }
}
