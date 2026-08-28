// en-GB: Uses one atomic Redis script so every API replica observes the same request-limit window.
using ShiftFlow.Application.Platform;
using StackExchange.Redis;

namespace ShiftFlow.Infrastructure.Platform;

public sealed class RedisRequestRateLimiter(
    RedisConnectionProvider connectionProvider,
    string keyPrefix) : IRequestRateLimiter
{
    private const string AcquireScript = """
        local count = redis.call('INCR', KEYS[1])
        if count == 1 then
          redis.call('PEXPIRE', KEYS[1], ARGV[1])
        end
        local remainingTtl = redis.call('PTTL', KEYS[1])
        return { count, remainingTtl }
        """;

    public async Task<RequestRateLimitLease> AcquireAsync(
        string key,
        int permitLimit,
        TimeSpan window,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var connection = await connectionProvider.GetConnectionAsync().WaitAsync(cancellationToken);
        var database = connection.GetDatabase();
        var result = (RedisResult[]?)await database.ScriptEvaluateAsync(
                AcquireScript,
                [(RedisKey)$"{keyPrefix}{key}"],
                [(RedisValue)Math.Max(1L, (long)window.TotalMilliseconds)])
            .WaitAsync(cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();

        if (result is null || result.Length != 2)
        {
            throw new InvalidOperationException("Redis returned an invalid rate-limit result.");
        }

        var count = (long)result[0];
        var remainingMilliseconds = Math.Max(1L, (long)result[1]);
        return new RequestRateLimitLease(
            count <= permitLimit,
            Math.Max(permitLimit - count, 0),
            DateTimeOffset.UtcNow.AddMilliseconds(remainingMilliseconds));
    }
}
