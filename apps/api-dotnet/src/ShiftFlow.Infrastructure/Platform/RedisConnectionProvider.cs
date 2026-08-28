// en-GB: Shares one lazy Redis connection between cache, sessions, readiness and request limiting.
using StackExchange.Redis;

namespace ShiftFlow.Infrastructure.Platform;

public sealed class RedisConnectionProvider(string configuration)
{
    private readonly Lazy<Task<IConnectionMultiplexer>> connection = new(
        () => ConnectAsync(configuration),
        LazyThreadSafetyMode.ExecutionAndPublication);

    public Task<IConnectionMultiplexer> GetConnectionAsync() => connection.Value;

    private static async Task<IConnectionMultiplexer> ConnectAsync(string configuration) =>
        await ConnectionMultiplexer.ConnectAsync(ConfigurationOptions.Parse(configuration));
}
