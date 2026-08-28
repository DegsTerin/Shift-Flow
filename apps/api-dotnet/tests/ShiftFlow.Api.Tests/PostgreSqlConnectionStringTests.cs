// en-GB: Verifies safe translation of the existing Prisma-style DATABASE_URL into Npgsql configuration.
using Npgsql;
using ShiftFlow.Infrastructure.Configuration;

namespace ShiftFlow.Api.Tests;

[TestClass]
public sealed class PostgreSqlConnectionStringTests
{
    [TestMethod]
    public void DatabaseUrlPreservesEncodedCredentialsDatabaseAndSchema()
    {
        var connection = PostgreSqlConnectionString.FromDatabaseUrl(
            "postgresql://shift%20user:p%40ss@db.internal:5433/shiftflow%20test?schema=tenant_data&sslmode=require");
        var parsed = new NpgsqlConnectionStringBuilder(connection);

        Assert.AreEqual("db.internal", parsed.Host);
        Assert.AreEqual(5433, parsed.Port);
        Assert.AreEqual("shift user", parsed.Username);
        Assert.AreEqual("p@ss", parsed.Password);
        Assert.AreEqual("shiftflow test", parsed.Database);
        Assert.AreEqual("tenant_data", parsed.SearchPath);
        Assert.AreEqual(SslMode.Require, parsed.SslMode);
    }

    [TestMethod]
    public void DatabaseUrlRejectsNonPostgreSqlSchemesWithoutEchoingTheSecret()
    {
        var exception = Assert.ThrowsExactly<InvalidOperationException>(() =>
            PostgreSqlConnectionString.FromDatabaseUrl("https://user:private-secret@example.com/db"));

        Assert.IsFalse(exception.Message.Contains("private-secret", StringComparison.Ordinal));
    }

    [TestMethod]
    public void DatabaseUrlMapsLibpqVerifyFullWithoutDowngradingTlsValidation()
    {
        var connection = PostgreSqlConnectionString.FromDatabaseUrl(
            "postgresql://user:private-secret@db.internal/shiftflow?sslmode=verify-full");

        Assert.AreEqual(SslMode.VerifyFull, new NpgsqlConnectionStringBuilder(connection).SslMode);
    }

    [TestMethod]
    public void DatabaseUrlRejectsUnknownSslModeWithoutEchoingTheSecret()
    {
        var exception = Assert.ThrowsExactly<InvalidOperationException>(() =>
            PostgreSqlConnectionString.FromDatabaseUrl(
                "postgresql://user:private-secret@db.internal/shiftflow?sslmode=not-a-mode"));

        Assert.IsFalse(exception.Message.Contains("private-secret", StringComparison.Ordinal));
    }
}
