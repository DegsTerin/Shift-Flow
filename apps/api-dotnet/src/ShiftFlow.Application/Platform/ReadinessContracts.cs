// en-GB: Defines dependency readiness independently from the ASP.NET Core health transport.
namespace ShiftFlow.Application.Platform;

public sealed record DependencyReadiness(bool PostgreSql, bool Redis)
{
    public bool IsReady => PostgreSql && Redis;
}

public interface IDependencyReadinessProbe
{
    Task<DependencyReadiness> CheckAsync(CancellationToken cancellationToken);
}
