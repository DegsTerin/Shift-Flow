// en-GB: Verifies that dependency readiness fails closed on schema and service incompatibility.
using System.Reflection;
using Microsoft.Extensions.Caching.Distributed;
using ShiftFlow.Infrastructure.Platform;

namespace ShiftFlow.Api.Tests;

[TestClass]
public sealed class DependencyReadinessProbeTests
{
    [TestMethod]
    public async Task CompatibleSchemaAndRedisAreReady()
    {
        string? executedSql = null;
        var cache = new RecordingDistributedCache();
        var probe = CreateProbe(
            (sql, _) =>
            {
                executedSql = sql;
                return Task.FromResult<object?>(true);
            },
            cache);

        var result = await probe.CheckAsync(CancellationToken.None);

        Assert.IsTrue(result.PostgreSql);
        Assert.IsTrue(result.Redis);
        Assert.IsTrue(result.IsReady);
        Assert.IsNotNull(executedSql);
        StringAssert.Contains(
            executedSql,
            "20260903023000_add_authentication_session_observations");
        StringAssert.Contains(executedSql, "finished_at IS NOT NULL");
        StringAssert.Contains(executedSql, "rolled_back_at IS NULL");
        StringAssert.Contains(executedSql, "authentication_session_observations");
        StringAssert.Contains(executedSql, "user_role_assignments_active_exact_key");
        StringAssert.Contains(executedSql, "namespace.nspname = current_schema()");
        StringAssert.Contains(
            executedSql,
            "relation_class.relnamespace = active_schema.schema_oid");
        StringAssert.Contains(executedSql, "relation_class.relkind IN ('r', 'p')");
        StringAssert.Contains(executedSql, "pg_catalog.to_regclass");
        StringAssert.Contains(
            executedSql,
            "pg_catalog.quote_ident(required_relation.relation_name)");
        Assert.IsFalse(executedSql.Contains("information_schema", StringComparison.Ordinal));
        foreach (var coreTable in new[]
        {
            "_prisma_migrations",
            "audit_logs",
            "users",
            "user_companies",
            "companies",
            "access_token_revocations",
            "user_role_assignments",
            "roles",
            "role_permissions",
            "permissions",
            "refresh_tokens",
            "authentication_session_observations"
        })
        {
            StringAssert.Contains(executedSql, $"('{coreTable}')");
        }

        foreach (var columnContract in new[]
        {
            "('refresh_tokens', 'sessionKind', 'AuthenticationSessionKind', true, -1, true)",
            "('refresh_tokens', 'familyId', 'uuid', false, -1, true)",
            "('authentication_session_observations', 'id', 'uuid', false, -1, true)",
            "('authentication_session_observations', 'emailHash', 'varchar', false, 68, true)",
            "('authentication_session_observations', 'requestId', 'varchar', false, 124, false)",
            "('authentication_session_observations', 'ipAddress', 'varchar', false, 84, false)",
            "('authentication_session_observations', 'userAgent', 'text', false, -1, false)",
            "('authentication_session_observations', 'observedAt', 'timestamptz', false, 6, true)"
        })
        {
            StringAssert.Contains(executedSql, columnContract);
        }

        foreach (var constraintName in new[]
        {
            "authentication_session_observations_pkey",
            "authentication_session_observations_userId_fkey",
            "authentication_session_observations_companyId_fkey"
        })
        {
            StringAssert.Contains(executedSql, constraintName);
        }

        StringAssert.Contains(executedSql, "'user_role_assignments_active_exact_key'");
        Assert.IsFalse(
            executedSql.Contains(
                "pg_catalog.left('user_role_assignments_active_exact_key'",
                StringComparison.Ordinal));
        foreach (var (logicalName, physicalName) in new[]
        {
            (
                "refresh_tokens_userId_companyId_sessionKind_expiresAt_revokedAt_idx",
                "refresh_tokens_userId_companyId_sessionKind_expiresAt_revokedAt"),
            (
                "refresh_tokens_userId_companyId_sessionKind_familyId_revokedAt_idx",
                "refresh_tokens_userId_companyId_sessionKind_familyId_revokedAt_"),
            (
                "authentication_session_observations_userId_companyId_observedAt_idx",
                "authentication_session_observations_userId_companyId_observedAt"),
            (
                "authentication_session_observations_companyId_sessionKind_observedAt_idx",
                "authentication_session_observations_companyId_sessionKind_obser")
        })
        {
            Assert.AreEqual(physicalName, logicalName[..63]);
            Assert.AreEqual(63, physicalName.Length);
            StringAssert.Contains(executedSql, $"'{logicalName}'");
            Assert.IsFalse(
                executedSql.Contains($"'{physicalName}'", StringComparison.Ordinal));
        }

        var normalisedExecutedSql = System.Text.RegularExpressions.Regex.Replace(
            executedSql,
            "\\s+",
            " ");
        const string physicalIndexNameDerivation =
            "index_class.relname::text = pg_catalog.left( " +
            "required_index.index_name, " +
            "pg_catalog.current_setting('max_identifier_length')::integer )";
        StringAssert.Contains(normalisedExecutedSql, physicalIndexNameDerivation);
        Assert.AreEqual(
            normalisedExecutedSql.IndexOf(physicalIndexNameDerivation, StringComparison.Ordinal),
            normalisedExecutedSql.LastIndexOf(
                physicalIndexNameDerivation,
                StringComparison.Ordinal));
        Assert.IsFalse(
            executedSql.Contains(
                "index_class.relname = required_index.index_name",
                StringComparison.Ordinal));

        StringAssert.Contains(executedSql, "ARRAY['PASSWORD', 'DEMO', 'PORTFOLIO']::text[]");
        StringAssert.Contains(executedSql, "primary_key.convalidated");
        StringAssert.Contains(executedSql, "user_foreign_key.confdeltype = 'c'");
        StringAssert.Contains(executedSql, "user_foreign_key.confupdtype = 'c'");
        StringAssert.Contains(executedSql, "company_foreign_key.confdeltype = 'c'");
        StringAssert.Contains(executedSql, "company_foreign_key.confupdtype = 'c'");
        StringAssert.Contains(
            executedSql,
            "index_metadata.indisunique = required_index.is_unique");
        StringAssert.Contains(executedSql, "index_metadata.indnullsnotdistinct");
        StringAssert.Contains(executedSql, "index_metadata.indisvalid");
        StringAssert.Contains(executedSql, "index_metadata.indisready");
        StringAssert.Contains(executedSql, "index_metadata.indislive");
        StringAssert.Contains(executedSql, "index_metadata.indnkeyatts");
        StringAssert.Contains(executedSql, "index_metadata.indnatts");
        StringAssert.Contains(executedSql, "pg_catalog.pg_get_indexdef");
        StringAssert.Contains(executedSql, "'\"deletedAt\"ISNULL'");
        Assert.AreEqual(1, cache.SetCalls);
        Assert.AreEqual(1, cache.GetCalls);
        Assert.AreEqual(1, cache.RemoveCalls);
    }

    [TestMethod]
    public async Task SchemaMismatchReportsOnlyPostgreSqlUnavailable()
    {
        var cache = new RecordingDistributedCache();
        var probe = CreateProbe((_, _) => Task.FromResult<object?>(false), cache);

        var result = await probe.CheckAsync(CancellationToken.None);

        Assert.IsFalse(result.PostgreSql);
        Assert.IsTrue(result.Redis);
        Assert.IsFalse(result.IsReady);
        Assert.AreEqual(1, cache.SetCalls);
        Assert.AreEqual(1, cache.GetCalls);
        Assert.AreEqual(1, cache.RemoveCalls);
    }

    [TestMethod]
    public async Task EmptySchemaResultReportsOnlyPostgreSqlUnavailable()
    {
        var cache = new RecordingDistributedCache();
        var probe = CreateProbe((_, _) => Task.FromResult<object?>(null), cache);

        var result = await probe.CheckAsync(CancellationToken.None);

        Assert.IsFalse(result.PostgreSql);
        Assert.IsTrue(result.Redis);
        Assert.IsFalse(result.IsReady);
    }

    [TestMethod]
    public async Task PostgreSqlQueryFailureReportsOnlyPostgreSqlUnavailable()
    {
        var cache = new RecordingDistributedCache();
        var probe = CreateProbe(
            (_, _) => throw new InvalidOperationException("private database detail"),
            cache);

        var result = await probe.CheckAsync(CancellationToken.None);

        Assert.IsFalse(result.PostgreSql);
        Assert.IsTrue(result.Redis);
        Assert.IsFalse(result.IsReady);
    }

    [TestMethod]
    public async Task RedisFailureDoesNotDiscardPostgreSqlCompatibility()
    {
        var cache = new RecordingDistributedCache
        {
            Failure = new InvalidOperationException("cache unavailable")
        };
        var probe = CreateProbe((_, _) => Task.FromResult<object?>(true), cache);

        var result = await probe.CheckAsync(CancellationToken.None);

        Assert.IsTrue(result.PostgreSql);
        Assert.IsFalse(result.Redis);
        Assert.IsFalse(result.IsReady);
    }

    [TestMethod]
    public async Task CancellationIsNotConvertedIntoDependencyUnavailability()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var cache = new RecordingDistributedCache();
        var probe = CreateProbe(
            (_, token) => throw new OperationCanceledException(token),
            cache);

        await Assert.ThrowsExactlyAsync<OperationCanceledException>(
            () => probe.CheckAsync(cancellation.Token),
            "Cancellation must propagate rather than being reported as dependency failure.");

        Assert.AreEqual(0, cache.SetCalls);
        Assert.AreEqual(0, cache.GetCalls);
        Assert.AreEqual(0, cache.RemoveCalls);
    }

    private static DependencyReadinessProbe CreateProbe(
        Func<string, CancellationToken, Task<object?>> query,
        IDistributedCache cache)
    {
        var constructor = typeof(DependencyReadinessProbe).GetConstructor(
            BindingFlags.Instance | BindingFlags.NonPublic,
            binder: null,
            [typeof(Func<string, CancellationToken, Task<object>>), typeof(IDistributedCache)],
            modifiers: null) ?? throw new InvalidOperationException("Readiness test seam was not found.");

        return (DependencyReadinessProbe)constructor.Invoke([query, cache]);
    }

    private sealed class RecordingDistributedCache : IDistributedCache
    {
        private byte[]? value;

        public Exception? Failure { get; init; }

        public int SetCalls { get; private set; }

        public int GetCalls { get; private set; }

        public int RemoveCalls { get; private set; }

        public byte[]? Get(string key)
        {
            _ = key;
            ThrowIfFailed();
            GetCalls += 1;
            return value;
        }

        public Task<byte[]?> GetAsync(
            string key,
            CancellationToken token = default)
        {
            token.ThrowIfCancellationRequested();
            return Task.FromResult(Get(key));
        }

        public void Refresh(string key)
        {
            _ = key;
            ThrowIfFailed();
        }

        public Task RefreshAsync(
            string key,
            CancellationToken token = default)
        {
            token.ThrowIfCancellationRequested();
            Refresh(key);
            return Task.CompletedTask;
        }

        public void Remove(string key)
        {
            _ = key;
            ThrowIfFailed();
            RemoveCalls += 1;
            value = null;
        }

        public Task RemoveAsync(
            string key,
            CancellationToken token = default)
        {
            token.ThrowIfCancellationRequested();
            Remove(key);
            return Task.CompletedTask;
        }

        public void Set(
            string key,
            byte[] value,
            DistributedCacheEntryOptions options)
        {
            _ = key;
            _ = options;
            ThrowIfFailed();
            SetCalls += 1;
            this.value = [.. value];
        }

        public Task SetAsync(
            string key,
            byte[] value,
            DistributedCacheEntryOptions options,
            CancellationToken token = default)
        {
            token.ThrowIfCancellationRequested();
            Set(key, value, options);
            return Task.CompletedTask;
        }

        private void ThrowIfFailed()
        {
            if (Failure is not null)
            {
                throw Failure;
            }
        }
    }
}
