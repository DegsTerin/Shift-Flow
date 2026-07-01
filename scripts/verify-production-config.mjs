/* global console, process */

const productionEnv = {
  ...process.env,
  API_INSTANCE_COUNT: "1",
  CORS_ORIGIN: "https://app.shiftflow.example",
  DATABASE_URL: "postgresql://shiftflow:example-production-secret@db.internal:5432/shiftflow",
  JWT_ACCESS_SECRET: "replace-this-with-managed-secret-32chars",
  JWT_SECRET: "replace-this-with-managed-secret-32chars",
  NODE_ENV: "production",
  RATE_LIMIT_STORE: "memory",
  REQUIRE_ORIGIN_ON_UNSAFE_REQUESTS: "true"
};

process.env = productionEnv;

await import("../apps/api/src/shared/config/env.ts");

console.log(JSON.stringify({ status: "ok", profile: "production-config" }, null, 2));
