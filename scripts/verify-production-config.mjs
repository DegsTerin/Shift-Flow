// en-GB: Implements the verify production config check so automated gates enforce a stable repository invariant.
/* global console, process */

import crypto from "node:crypto";
import { validateProductionUrlContract } from "./production-url-contract.mjs";

const generatedSecret = crypto.randomBytes(32).toString("base64url");
const publicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://app.shiftflow.example";
const corsOrigin = process.env.CORS_ORIGIN ?? "https://app.shiftflow.example";

validateProductionUrlContract(corsOrigin, publicApiBaseUrl);

const productionEnv = {
  ...process.env,
  API_INSTANCE_COUNT: process.env.API_INSTANCE_COUNT ?? "1",
  CORS_ORIGIN: corsOrigin,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    `postgresql://shiftflow:${crypto.randomBytes(18).toString("hex")}@db.internal:5432/shiftflow`,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? generatedSecret,
  JWT_SECRET: process.env.JWT_SECRET,
  NODE_ENV: "production",
  NEXT_PUBLIC_API_BASE_URL: publicApiBaseUrl,
  RATE_LIMIT_STORE: process.env.RATE_LIMIT_STORE ?? "memory",
  REQUIRE_ORIGIN_ON_UNSAFE_REQUESTS: process.env.REQUIRE_ORIGIN_ON_UNSAFE_REQUESTS ?? "true"
};

process.env = productionEnv;

await import("../apps/api/src/shared/config/env.ts");

console.log(JSON.stringify({ status: "ok", profile: "production-config" }, null, 2));
