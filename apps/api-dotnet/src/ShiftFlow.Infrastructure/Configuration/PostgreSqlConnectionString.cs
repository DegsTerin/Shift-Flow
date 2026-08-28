// en-GB: Resolves the shared PostgreSQL connection without exposing credentials or changing Prisma ownership.
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace ShiftFlow.Infrastructure.Configuration;

public static class PostgreSqlConnectionString
{
    public static string Resolve(IConfiguration configuration, bool isProduction = false)
    {
        var explicitConnection = configuration.GetConnectionString("PostgreSql");
        if (!string.IsNullOrWhiteSpace(explicitConnection))
        {
            return RejectProductionPlaceholder(explicitConnection, isProduction);
        }

        var databaseUrl = configuration["DATABASE_URL"];
        if (string.IsNullOrWhiteSpace(databaseUrl))
        {
            throw new InvalidOperationException(
                "ConnectionStrings:PostgreSql or DATABASE_URL is required for the ASP.NET Core host.");
        }

        return RejectProductionPlaceholder(FromDatabaseUrl(databaseUrl), isProduction);
    }

    public static string FromDatabaseUrl(string databaseUrl)
    {
        if (!Uri.TryCreate(databaseUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "postgresql" && uri.Scheme != "postgres"))
        {
            throw new InvalidOperationException("DATABASE_URL must be an absolute PostgreSQL URL.");
        }

        var credentials = uri.UserInfo.Split(':', 2, StringSplitOptions.None);
        if (credentials.Length != 2 || string.IsNullOrWhiteSpace(credentials[0]))
        {
            throw new InvalidOperationException("DATABASE_URL must contain a user name and password.");
        }

        var database = Uri.UnescapeDataString(uri.AbsolutePath.Trim('/'));
        if (string.IsNullOrWhiteSpace(database))
        {
            throw new InvalidOperationException("DATABASE_URL must identify a database.");
        }

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Username = Uri.UnescapeDataString(credentials[0]),
            Password = Uri.UnescapeDataString(credentials[1]),
            Database = database,
            ApplicationName = "shiftflow-api-dotnet"
        };

        foreach (var entry in ParseQuery(uri.Query))
        {
            if (entry.Key.Equals("schema", StringComparison.OrdinalIgnoreCase))
            {
                builder.SearchPath = entry.Value;
            }
            else if (entry.Key.Equals("sslmode", StringComparison.OrdinalIgnoreCase))
            {
                builder.SslMode = ParseSslMode(entry.Value);
            }
        }

        return builder.ConnectionString;
    }

    private static SslMode ParseSslMode(string value)
    {
        var normalised = value.Replace("-", string.Empty, StringComparison.Ordinal);
        if (Enum.TryParse<SslMode>(normalised, true, out var sslMode) &&
            Enum.IsDefined(sslMode))
        {
            return sslMode;
        }

        throw new InvalidOperationException("DATABASE_URL contains an unsupported sslmode value.");
    }

    private static string RejectProductionPlaceholder(string connectionString, bool isProduction)
    {
        if (isProduction)
        {
            var password = new NpgsqlConnectionStringBuilder(connectionString).Password;
            if (string.IsNullOrWhiteSpace(password) ||
                System.Text.RegularExpressions.Regex.IsMatch(
                    password,
                    "(replace|example|test|valid|invalid|missing|shiftflow)",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase |
                    System.Text.RegularExpressions.RegexOptions.CultureInvariant |
                    System.Text.RegularExpressions.RegexOptions.NonBacktracking,
                    TimeSpan.FromMilliseconds(100)))
            {
                throw new InvalidOperationException(
                    "The PostgreSQL password cannot be empty or use a placeholder value in production.");
            }
        }

        return connectionString;
    }

    private static IEnumerable<KeyValuePair<string, string>> ParseQuery(string query)
    {
        foreach (var pair in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2, StringSplitOptions.None);
            if (parts.Length == 2)
            {
                yield return KeyValuePair.Create(
                    Uri.UnescapeDataString(parts[0]),
                    Uri.UnescapeDataString(parts[1]));
            }
        }
    }
}
