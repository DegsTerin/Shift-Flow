// en-GB: Verifies that every editable source file documents its responsibility in British English.
/* global console, process */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import postcss from "postcss";

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/u)
  .filter(Boolean);

const commentableExtensions = new Set([
  ".css",
  ".mjs",
  ".prisma",
  ".ps1",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".yml"
]);
const commentableConfigurationFiles = new Set([
  ".editorconfig",
  ".env.example",
  ".github/CODEOWNERS",
  ".gitignore",
  ".prettierignore"
]);
const strictOrGeneratedFiles = new Set([
  ".prettierrc",
  "apps/web/next-env.d.ts",
  "package-lock.json",
  "package.json",
  "prisma/migrations/migration_lock.toml"
]);
const immutableMigrationFiles = new Set([
  "prisma/migrations/20260621120000_state_03_database_modeling/migration.sql",
  "prisma/migrations/20260622010000_prompt_revision_activity_fields/migration.sql",
  "prisma/migrations/20260622090000_remove_team_from_shifts/migration.sql",
  "prisma/migrations/20260622093000_allow_reuse_deleted_team_names/migration.sql",
  "prisma/migrations/20260622094000_allow_reuse_deleted_client_names_codes/migration.sql",
  "prisma/migrations/20260622103000_operational_dossier_status_service/migration.sql",
  "prisma/migrations/20260623010000_refresh_tokens_company_scope/migration.sql",
  "prisma/migrations/20260701120000_auth_session_hardening/migration.sql",
  "prisma/migrations/20260701182603_add_dashboard_personalization/migration.sql",
  "prisma/migrations/20260701193000_activity_internal_kanban_and_role_management/migration.sql",
  "prisma/migrations/20260701203000_dashboard_widget_layout_flexibility/migration.sql",
  "prisma/migrations/20260702193000_audit_full_residual_fixes/migration.sql"
]);

function isCommentableJson(file) {
  return file === "tsconfig.json" || file.endsWith("/tsconfig.json");
}

function isCommentable(file) {
  if (strictOrGeneratedFiles.has(file) || immutableMigrationFiles.has(file)) return false;
  return (
    commentableExtensions.has(extname(file)) ||
    commentableConfigurationFiles.has(file) ||
    isCommentableJson(file)
  );
}

const undocumented = [];
const commentableFiles = trackedFiles.filter(isCommentable);
const exceptionManifest = readFileSync("docs/source-commenting-manifest.md", "utf8");
const documentedExceptionFiles = [...strictOrGeneratedFiles, ...immutableMigrationFiles];
const undocumentedExceptions = documentedExceptionFiles.filter(
  (file) => !exceptionManifest.includes(`\`${file}\``)
);

for (const file of commentableFiles) {
  const openingLines = readFileSync(file, "utf8").split(/\r?\n/u).slice(0, 12).join("\n");
  if (!/en-GB:\s+\S/u.test(openingLines)) undocumented.push(file);
}

const css = readFileSync("apps/web/app/globals.css", "utf8");
const cssRoot = postcss.parse(css);
let cssDeclarations = 0;
let documentedCssDeclarations = 0;
cssRoot.walkDecls((declaration) => {
  cssDeclarations += 1;
  const previous = declaration.prev();
  if (previous?.type === "comment" && previous.text.trim().startsWith("en-GB:")) {
    documentedCssDeclarations += 1;
  }
});

if (
  undocumented.length ||
  undocumentedExceptions.length ||
  documentedCssDeclarations !== cssDeclarations
) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        undocumented,
        undocumentedExceptions,
        cssDeclarations,
        documentedCssDeclarations
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      documentedSourceFiles: commentableFiles.length,
      cssDeclarations,
      documentedCssDeclarations,
      documentedExceptions: documentedExceptionFiles.length
    },
    null,
    2
  )
);
