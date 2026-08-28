// en-GB: Hosts the API with deterministic fakes so HTTP contract tests never require local credentials or services.
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShiftFlow.Application.Audit;
using ShiftFlow.Application.Platform;
using ShiftFlow.Application.Security;
using ShiftFlow.Domain.Audit;

namespace ShiftFlow.Api.Tests;

public sealed class CompatibilityHostFactory : WebApplicationFactory<Program>
{
    public const string SigningKey = "shiftflow-test-signing-key-32-bytes-minimum";
    public static readonly Guid UserId = Guid.Parse("11111111-1111-4111-8111-111111111111");
    public static readonly Guid CompanyId = Guid.Parse("22222222-2222-4222-8222-222222222222");

    public FakeAuditLogReader AuditReader { get; } = new();

    public FakeSecurityStore Security { get; } = new();

    public FakeReadinessProbe Readiness { get; } = new();

    public FakeRequestRateLimiter RateLimiter { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder
            .UseEnvironment("Testing")
            .UseSetting(
                "ConnectionStrings:PostgreSql",
                "Host=127.0.0.1;Port=1;Username=test;Password=test;Database=test")
            .UseSetting(
                "ConnectionStrings:Redis",
                "127.0.0.1:1,abortConnect=false,connectTimeout=50,syncTimeout=50")
            .UseSetting("JWT_ACCESS_SECRET", SigningKey)
            .UseSetting("JWT_ISSUER", "shiftflow")
            .UseSetting("REDIS_INSTANCE_NAME", "shiftflow:test:")
            .UseSetting("ENABLE_INTERNAL_RUNTIME_PROBES", "true");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAuditLogReader>();
            services.RemoveAll<ILegacyPrincipalValidator>();
            services.RemoveAll<IPermissionAuthorizer>();
            services.RemoveAll<IDependencyReadinessProbe>();
            services.RemoveAll<IRequestRateLimiter>();
            services.AddSingleton<IAuditLogReader>(AuditReader);
            services.AddSingleton<ILegacyPrincipalValidator>(Security);
            services.AddSingleton<IPermissionAuthorizer>(Security);
            services.AddSingleton<IDependencyReadinessProbe>(Readiness);
            services.AddSingleton<IRequestRateLimiter>(RateLimiter);
        });
    }
}

public sealed class FakeAuditLogReader : IAuditLogReader
{
    public Guid? LastCompanyId { get; private set; }

    public AuditPage Page { get; set; } = new(
        [
            new AuditLog(
                Guid.Parse("33333333-3333-4333-8333-333333333333"),
                CompatibilityHostFactory.CompanyId,
                null,
                null,
                null,
                null,
                null,
                CompatibilityHostFactory.UserId,
                "Client",
                "client-1",
                "CREATE",
                null,
                null,
                "request-1",
                null,
                null,
                new DateTime(2026, 8, 28, 12, 0, 0, DateTimeKind.Utc))
        ],
        1,
        1,
        25);

    public AuditLog? Item { get; set; }

    public Task<AuditPage> ListAsync(
        Guid companyId,
        AuditFilter filter,
        PageRequest page,
        CancellationToken cancellationToken)
    {
        _ = filter;
        _ = page;
        cancellationToken.ThrowIfCancellationRequested();
        LastCompanyId = companyId;
        return Task.FromResult(Page);
    }

    public Task<AuditLog?> FindAsync(
        Guid companyId,
        Guid auditLogId,
        CancellationToken cancellationToken)
    {
        _ = auditLogId;
        cancellationToken.ThrowIfCancellationRequested();
        LastCompanyId = companyId;
        return Task.FromResult(Item);
    }
}

public sealed class FakeSecurityStore : ILegacyPrincipalValidator, IPermissionAuthorizer
{
    public int PrincipalValidationCalls { get; private set; }

    public bool PrincipalIsCurrent { get; set; } = true;

    public bool PermissionGranted { get; set; } = true;

    public Task<bool> IsCurrentAsync(
        LegacyPrincipalCandidate candidate,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        PrincipalValidationCalls += 1;
        return Task.FromResult(
            PrincipalIsCurrent &&
            candidate.UserId == CompatibilityHostFactory.UserId &&
            candidate.CompanyId == CompatibilityHostFactory.CompanyId);
    }

    public Task<bool> HasPermissionAsync(
        Guid userId,
        Guid companyId,
        string resource,
        string action,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            PermissionGranted &&
            userId == CompatibilityHostFactory.UserId &&
            companyId == CompatibilityHostFactory.CompanyId &&
            resource == "audit" &&
            action == "read");
    }
}

public sealed class FakeReadinessProbe : IDependencyReadinessProbe
{
    public DependencyReadiness Result { get; set; } = new(true, true);

    public Task<DependencyReadiness> CheckAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(Result);
    }
}

public sealed class FakeRequestRateLimiter : IRequestRateLimiter
{
    public Exception? Failure { get; set; }

    public RequestRateLimitLease Lease { get; set; } = new(
        true,
        599,
        DateTimeOffset.UtcNow.AddMinutes(1));

    public string? LastKey { get; private set; }

    public Task<RequestRateLimitLease> AcquireAsync(
        string key,
        int permitLimit,
        TimeSpan window,
        CancellationToken cancellationToken)
    {
        _ = permitLimit;
        _ = window;
        cancellationToken.ThrowIfCancellationRequested();
        LastKey = key;
        if (Failure is not null)
        {
            throw Failure;
        }
        return Task.FromResult(Lease);
    }
}
