// en-GB: Defines a distributed request-limit boundary without coupling HTTP policy to Redis commands.
namespace ShiftFlow.Application.Platform;

public sealed record RequestRateLimitLease(
    bool Acquired,
    long Remaining,
    DateTimeOffset ResetsAt);

public interface IRequestRateLimiter
{
    Task<RequestRateLimitLease> AcquireAsync(
        string key,
        int permitLimit,
        TimeSpan window,
        CancellationToken cancellationToken);
}
