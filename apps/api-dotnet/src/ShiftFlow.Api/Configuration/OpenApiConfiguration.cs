// en-GB: Documents the migrated REST contract, including legacy Bearer security and bounded Audit filters.
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace ShiftFlow.Api.Configuration;

public static class OpenApiConfiguration
{
    public static void Configure(OpenApiOptions options)
    {
        options.AddDocumentTransformer((document, _, _) =>
        {
            document.Components ??= new OpenApiComponents();
            document.Components.SecuritySchemes ??=
                new Dictionary<string, IOpenApiSecurityScheme>(StringComparer.Ordinal);
            document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                Description = "Temporary legacy HS256 access token during the strangler migration."
            };
            return Task.CompletedTask;
        });

        options.AddOperationTransformer((operation, context, _) =>
        {
            operation.Security ??= [];
            operation.Security.Add(new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference("Bearer", context.Document, null)] = []
            });

            if (operation.OperationId == "ListAuditLogs")
            {
                operation.Parameters ??= [];
                operation.Parameters.Add(IntegerParameter("page", 1, 1, 10_000));
                operation.Parameters.Add(IntegerParameter("pageSize", 25, 1, 100));
                operation.Parameters.Add(TextParameter("entityType", 120));
                operation.Parameters.Add(TextParameter("entityId", 80));
                operation.Parameters.Add(TextParameter("action", 120));
                operation.Parameters.Add(new OpenApiParameter
                {
                    Name = "actorUserId",
                    In = ParameterLocation.Query,
                    Required = false,
                    Schema = new OpenApiSchema
                    {
                        Type = JsonSchemaType.String,
                        Format = "uuid"
                    }
                });
            }

            return Task.CompletedTask;
        });
    }

    private static OpenApiParameter IntegerParameter(
        string name,
        int defaultValue,
        int minimum,
        int maximum) =>
        new()
        {
            Name = name,
            In = ParameterLocation.Query,
            Required = false,
            Schema = new OpenApiSchema
            {
                Type = JsonSchemaType.Integer,
                Format = "int32",
                Default = JsonValue.Create(defaultValue),
                Minimum = minimum.ToString(System.Globalization.CultureInfo.InvariantCulture),
                Maximum = maximum.ToString(System.Globalization.CultureInfo.InvariantCulture)
            }
        };

    private static OpenApiParameter TextParameter(string name, int maximumLength) =>
        new()
        {
            Name = name,
            In = ParameterLocation.Query,
            Required = false,
            Schema = new OpenApiSchema
            {
                Type = JsonSchemaType.String,
                MaxLength = maximumLength
            }
        };
}
