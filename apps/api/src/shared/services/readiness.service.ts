// en-GB: Implements application rules so invariants remain centralised outside the transport layer.
import { getPrisma } from "../lib/prisma.js";
import { AppError } from "../errors/app-error.js";

type PrismaHealthClient = {
  $queryRaw<T = unknown>(query: TemplateStringsArray): Promise<T>;
};

type SchemaReadinessRow = {
  relationsCompatible: boolean;
  migrationExists: boolean;
  migrationFinished: boolean;
  migrationNotRolledBack: boolean;
  sessionKindEnumCompatible: boolean;
  authenticationColumnsCompatible: boolean;
  observationsPrimaryKeyCompatible: boolean;
  observationsUserForeignKeyCompatible: boolean;
  observationsCompanyForeignKeyCompatible: boolean;
  indexesCompatible: boolean;
};

export async function checkReadiness() {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  let rows: SchemaReadinessRow[];

  try {
    const prisma = (await getPrisma()) as PrismaHealthClient;
    rows = await prisma.$queryRaw<SchemaReadinessRow[]>`
      WITH active_schema AS (
        SELECT namespace.oid AS schema_oid
        FROM pg_catalog.pg_namespace AS namespace
        WHERE namespace.nspname = current_schema()
      ),
      required_relations(relation_name) AS (
        VALUES
          ('_prisma_migrations'),
          ('audit_logs'),
          ('users'),
          ('user_companies'),
          ('companies'),
          ('access_token_revocations'),
          ('user_role_assignments'),
          ('roles'),
          ('role_permissions'),
          ('permissions'),
          ('refresh_tokens'),
          ('authentication_session_observations')
      ),
      required_columns(
        relation_name,
        column_name,
        type_name,
        type_in_active_schema,
        type_modifier,
        is_not_null
      ) AS (
        VALUES
          ('refresh_tokens', 'sessionKind', 'AuthenticationSessionKind', true, -1, true),
          ('refresh_tokens', 'familyId', 'uuid', false, -1, true),
          ('authentication_session_observations', 'id', 'uuid', false, -1, true),
          ('authentication_session_observations', 'userId', 'uuid', false, -1, true),
          ('authentication_session_observations', 'companyId', 'uuid', false, -1, true),
          ('authentication_session_observations', 'sessionKind', 'AuthenticationSessionKind', true, -1, true),
          ('authentication_session_observations', 'emailHash', 'varchar', false, 68, true),
          ('authentication_session_observations', 'requestId', 'varchar', false, 124, false),
          ('authentication_session_observations', 'ipAddress', 'varchar', false, 84, false),
          ('authentication_session_observations', 'userAgent', 'text', false, -1, false),
          ('authentication_session_observations', 'observedAt', 'timestamptz', false, 6, true)
      ),
      required_indexes(
        index_name,
        relation_name,
        column_names,
        is_unique,
        nulls_not_distinct,
        predicate_normalised
      ) AS (
        VALUES
          (
            'user_role_assignments_active_exact_key',
            'user_role_assignments',
            ARRAY['companyId', 'userId', 'roleId', 'clientId', 'teamId', 'startsAt', 'endsAt']::text[],
            true,
            true,
            '"deletedAt"ISNULL'
          ),
          (
            'refresh_tokens_userId_companyId_sessionKind_expiresAt_revokedAt_idx',
            'refresh_tokens',
            ARRAY['userId', 'companyId', 'sessionKind', 'expiresAt', 'revokedAt']::text[],
            false,
            false,
            NULL
          ),
          (
            'refresh_tokens_userId_companyId_sessionKind_familyId_revokedAt_idx',
            'refresh_tokens',
            ARRAY['userId', 'companyId', 'sessionKind', 'familyId', 'revokedAt']::text[],
            false,
            false,
            NULL
          ),
          (
            'authentication_session_observations_userId_companyId_observedAt_idx',
            'authentication_session_observations',
            ARRAY['userId', 'companyId', 'observedAt']::text[],
            false,
            false,
            NULL
          ),
          (
            'authentication_session_observations_companyId_sessionKind_observedAt_idx',
            'authentication_session_observations',
            ARRAY['companyId', 'sessionKind', 'observedAt']::text[],
            false,
            false,
            NULL
          )
      ),
      required_migration AS (
        SELECT finished_at, rolled_back_at
        FROM "_prisma_migrations"
        WHERE migration_name = '20260903023000_add_authentication_session_observations'
        ORDER BY started_at DESC, id DESC
        LIMIT 1
      ),
      contract_checks AS (
        SELECT
          NOT EXISTS (
            SELECT 1
            FROM required_relations AS required_relation
            WHERE NOT EXISTS (
              SELECT 1
              FROM active_schema
              INNER JOIN pg_catalog.pg_class AS relation_class
                ON relation_class.relnamespace = active_schema.schema_oid
              WHERE relation_class.relname = required_relation.relation_name
                AND relation_class.relkind IN ('r', 'p')
                AND pg_catalog.to_regclass(
                  pg_catalog.quote_ident(required_relation.relation_name)
                ) = relation_class.oid
            )
          ) AS relations_compatible,
          EXISTS (SELECT 1 FROM required_migration) AS migration_exists,
          COALESCE(
            (SELECT finished_at IS NOT NULL FROM required_migration),
            false
          ) AS migration_finished,
          COALESCE(
            (SELECT rolled_back_at IS NULL FROM required_migration),
            false
          ) AS migration_not_rolled_back,
          EXISTS (
            SELECT 1
            FROM active_schema
            INNER JOIN pg_catalog.pg_type AS enum_type
              ON enum_type.typnamespace = active_schema.schema_oid
            WHERE enum_type.typname = 'AuthenticationSessionKind'
              AND enum_type.typtype = 'e'
              AND ARRAY(
                SELECT enum_value.enumlabel::text
                FROM pg_catalog.pg_enum AS enum_value
                WHERE enum_value.enumtypid = enum_type.oid
                ORDER BY enum_value.enumsortorder
              ) = ARRAY['PASSWORD', 'DEMO', 'PORTFOLIO']::text[]
          ) AS session_kind_enum_compatible,
          NOT EXISTS (
            SELECT 1
            FROM required_columns AS required_column
            WHERE NOT EXISTS (
              SELECT 1
              FROM active_schema
              INNER JOIN pg_catalog.pg_class AS relation_class
                ON relation_class.relnamespace = active_schema.schema_oid
               AND relation_class.relname = required_column.relation_name
               AND relation_class.relkind IN ('r', 'p')
              INNER JOIN pg_catalog.pg_attribute AS column_attribute
                ON column_attribute.attrelid = relation_class.oid
               AND column_attribute.attname = required_column.column_name
               AND column_attribute.attnum > 0
               AND NOT column_attribute.attisdropped
              INNER JOIN pg_catalog.pg_type AS column_type
                ON column_type.oid = column_attribute.atttypid
               AND column_type.typname = required_column.type_name
              INNER JOIN pg_catalog.pg_namespace AS type_namespace
                ON type_namespace.oid = column_type.typnamespace
              WHERE column_attribute.atttypmod = required_column.type_modifier
                AND column_attribute.attnotnull = required_column.is_not_null
                AND (
                  (
                    required_column.type_in_active_schema
                    AND type_namespace.oid = active_schema.schema_oid
                  ) OR (
                    NOT required_column.type_in_active_schema
                    AND type_namespace.nspname = 'pg_catalog'
                  )
                )
            )
          ) AS authentication_columns_compatible,
          EXISTS (
            SELECT 1
            FROM active_schema
            INNER JOIN pg_catalog.pg_class AS observation_table
              ON observation_table.relnamespace = active_schema.schema_oid
             AND observation_table.relname = 'authentication_session_observations'
             AND observation_table.relkind IN ('r', 'p')
            INNER JOIN pg_catalog.pg_constraint AS primary_key
              ON primary_key.conrelid = observation_table.oid
            WHERE primary_key.conname = 'authentication_session_observations_pkey'
              AND primary_key.contype = 'p'
              AND primary_key.convalidated
              AND ARRAY(
                SELECT key_attribute.attname::text
                FROM unnest(primary_key.conkey) WITH ORDINALITY
                  AS key_column(attribute_number, position)
                INNER JOIN pg_catalog.pg_attribute AS key_attribute
                  ON key_attribute.attrelid = observation_table.oid
                 AND key_attribute.attnum = key_column.attribute_number
                ORDER BY key_column.position
              ) = ARRAY['id']::text[]
          ) AS observations_primary_key_compatible,
          EXISTS (
            SELECT 1
            FROM active_schema
            INNER JOIN pg_catalog.pg_class AS observation_table
              ON observation_table.relnamespace = active_schema.schema_oid
             AND observation_table.relname = 'authentication_session_observations'
             AND observation_table.relkind IN ('r', 'p')
            INNER JOIN pg_catalog.pg_constraint AS user_foreign_key
              ON user_foreign_key.conrelid = observation_table.oid
            INNER JOIN pg_catalog.pg_class AS user_table
              ON user_table.oid = user_foreign_key.confrelid
             AND user_table.relnamespace = active_schema.schema_oid
             AND user_table.relname = 'users'
             AND user_table.relkind IN ('r', 'p')
            WHERE user_foreign_key.conname = 'authentication_session_observations_userId_fkey'
              AND user_foreign_key.contype = 'f'
              AND user_foreign_key.convalidated
              AND user_foreign_key.confdeltype = 'c'
              AND user_foreign_key.confupdtype = 'c'
              AND ARRAY(
                SELECT key_attribute.attname::text
                FROM unnest(user_foreign_key.conkey) WITH ORDINALITY
                  AS key_column(attribute_number, position)
                INNER JOIN pg_catalog.pg_attribute AS key_attribute
                  ON key_attribute.attrelid = observation_table.oid
                 AND key_attribute.attnum = key_column.attribute_number
                ORDER BY key_column.position
              ) = ARRAY['userId']::text[]
              AND ARRAY(
                SELECT key_attribute.attname::text
                FROM unnest(user_foreign_key.confkey) WITH ORDINALITY
                  AS key_column(attribute_number, position)
                INNER JOIN pg_catalog.pg_attribute AS key_attribute
                  ON key_attribute.attrelid = user_table.oid
                 AND key_attribute.attnum = key_column.attribute_number
                ORDER BY key_column.position
              ) = ARRAY['id']::text[]
          ) AS observations_user_foreign_key_compatible,
          EXISTS (
            SELECT 1
            FROM active_schema
            INNER JOIN pg_catalog.pg_class AS observation_table
              ON observation_table.relnamespace = active_schema.schema_oid
             AND observation_table.relname = 'authentication_session_observations'
             AND observation_table.relkind IN ('r', 'p')
            INNER JOIN pg_catalog.pg_constraint AS company_foreign_key
              ON company_foreign_key.conrelid = observation_table.oid
            INNER JOIN pg_catalog.pg_class AS company_table
              ON company_table.oid = company_foreign_key.confrelid
             AND company_table.relnamespace = active_schema.schema_oid
             AND company_table.relname = 'companies'
             AND company_table.relkind IN ('r', 'p')
            WHERE company_foreign_key.conname = 'authentication_session_observations_companyId_fkey'
              AND company_foreign_key.contype = 'f'
              AND company_foreign_key.convalidated
              AND company_foreign_key.confdeltype = 'c'
              AND company_foreign_key.confupdtype = 'c'
              AND ARRAY(
                SELECT key_attribute.attname::text
                FROM unnest(company_foreign_key.conkey) WITH ORDINALITY
                  AS key_column(attribute_number, position)
                INNER JOIN pg_catalog.pg_attribute AS key_attribute
                  ON key_attribute.attrelid = observation_table.oid
                 AND key_attribute.attnum = key_column.attribute_number
                ORDER BY key_column.position
              ) = ARRAY['companyId']::text[]
              AND ARRAY(
                SELECT key_attribute.attname::text
                FROM unnest(company_foreign_key.confkey) WITH ORDINALITY
                  AS key_column(attribute_number, position)
                INNER JOIN pg_catalog.pg_attribute AS key_attribute
                  ON key_attribute.attrelid = company_table.oid
                 AND key_attribute.attnum = key_column.attribute_number
                ORDER BY key_column.position
              ) = ARRAY['id']::text[]
          ) AS observations_company_foreign_key_compatible,
          NOT EXISTS (
            SELECT 1
            FROM required_indexes AS required_index
            WHERE NOT EXISTS (
              SELECT 1
              FROM active_schema
              INNER JOIN pg_catalog.pg_class AS indexed_table
                ON indexed_table.relnamespace = active_schema.schema_oid
               AND indexed_table.relname = required_index.relation_name
               AND indexed_table.relkind IN ('r', 'p')
              INNER JOIN pg_catalog.pg_index AS index_metadata
                ON index_metadata.indrelid = indexed_table.oid
              INNER JOIN pg_catalog.pg_class AS index_class
                ON index_class.oid = index_metadata.indexrelid
               AND index_class.relnamespace = active_schema.schema_oid
               AND index_class.relname::text = pg_catalog.left(
                 required_index.index_name,
                 pg_catalog.current_setting('max_identifier_length')::integer
               )
               AND index_class.relkind IN ('i', 'I')
              INNER JOIN pg_catalog.pg_am AS index_method
                ON index_method.oid = index_class.relam
               AND index_method.amname = 'btree'
              WHERE index_metadata.indisunique = required_index.is_unique
                AND index_metadata.indnullsnotdistinct = required_index.nulls_not_distinct
                AND index_metadata.indisvalid
                AND index_metadata.indisready
                AND index_metadata.indislive
                AND NOT index_metadata.indisprimary
                AND NOT index_metadata.indisexclusion
                AND index_metadata.indnkeyatts = cardinality(required_index.column_names)
                AND index_metadata.indnatts = cardinality(required_index.column_names)
                AND NOT EXISTS (
                  SELECT 1
                  FROM unnest(required_index.column_names) WITH ORDINALITY
                    AS expected_column(column_name, position)
                  WHERE pg_catalog.pg_get_indexdef(
                    index_class.oid,
                    expected_column.position::integer,
                    false
                  ) IS DISTINCT FROM pg_catalog.quote_ident(expected_column.column_name)
                )
                AND (
                  (
                    required_index.predicate_normalised IS NULL
                    AND index_metadata.indpred IS NULL
                  ) OR (
                    required_index.predicate_normalised IS NOT NULL
                    AND index_metadata.indpred IS NOT NULL
                    AND pg_catalog.regexp_replace(
                      pg_catalog.pg_get_expr(
                        index_metadata.indpred,
                        index_metadata.indrelid,
                        false
                      ),
                      '[()[:space:]]',
                      '',
                      'g'
                    ) = required_index.predicate_normalised
                  )
                )
            )
          ) AS indexes_compatible
      )
      SELECT
        relations_compatible AS "relationsCompatible",
        migration_exists AS "migrationExists",
        migration_finished AS "migrationFinished",
        migration_not_rolled_back AS "migrationNotRolledBack",
        session_kind_enum_compatible AS "sessionKindEnumCompatible",
        authentication_columns_compatible AS "authenticationColumnsCompatible",
        observations_primary_key_compatible AS "observationsPrimaryKeyCompatible",
        observations_user_foreign_key_compatible AS "observationsUserForeignKeyCompatible",
        observations_company_foreign_key_compatible AS "observationsCompanyForeignKeyCompatible",
        indexes_compatible AS "indexesCompatible"
      FROM contract_checks
    `;
  } catch (error) {
    const readinessError = new AppError(
      "Database readiness check failed",
      503,
      "READINESS_CHECK_FAILED"
    );
    readinessError.cause = error;
    throw readinessError;
  }

  const [schema] = rows;
  if (
    rows.length !== 1 ||
    !schema?.relationsCompatible ||
    !schema.migrationExists ||
    !schema.migrationFinished ||
    !schema.migrationNotRolledBack ||
    !schema.sessionKindEnumCompatible ||
    !schema.authenticationColumnsCompatible ||
    !schema.observationsPrimaryKeyCompatible ||
    !schema.observationsUserForeignKeyCompatible ||
    !schema.observationsCompanyForeignKeyCompatible ||
    !schema.indexesCompatible
  ) {
    throw new AppError("Database readiness check failed", 503, "READINESS_CHECK_FAILED");
  }
}
