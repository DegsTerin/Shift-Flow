// en-GB: Proves production startup rejects documented placeholders without disclosing their values.
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ShiftFlow.Api.Security;
using ShiftFlow.Infrastructure.Configuration;

namespace ShiftFlow.Api.Tests;

[TestClass]
public sealed class ProductionConfigurationTests
{
    [TestMethod]
    public void ProductionRejectsPlaceholderJwtSigningKey()
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["JWT_ACCESS_SECRET"] = "replace-with-a-local-access-secret",
            ["JWT_ISSUER"] = "shiftflow"
        });
        var services = new ServiceCollection();

        var exception = Assert.ThrowsExactly<InvalidOperationException>(() =>
            services.AddLegacyAuthentication(configuration, true));

        Assert.IsFalse(exception.Message.Contains(
            "replace-with-a-local-access-secret",
            StringComparison.Ordinal));
    }

    [TestMethod]
    public void ProductionRejectsPlaceholderPostgreSqlPassword()
    {
        var configuration = Configuration(new Dictionary<string, string?>
        {
            ["DATABASE_URL"] =
                "postgresql://shiftflow:replace-with-a-local-database-password@db.internal/shiftflow"
        });

        var exception = Assert.ThrowsExactly<InvalidOperationException>(() =>
            PostgreSqlConnectionString.Resolve(configuration, true));

        Assert.IsFalse(exception.Message.Contains(
            "replace-with-a-local-database-password",
            StringComparison.Ordinal));
    }

    private static IConfiguration Configuration(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();
}
