// en-GB: Coordinates the guarded local schema reset and realistic seed so destructive preflight always runs first.
/* global process */
import dotenv from "dotenv";
import { spawnSync } from "node:child_process";
import { assertSafeDestructiveSeed } from "./seed-safety.mjs";

const explicitDestructiveConfirmation = process.env.SHIFTFLOW_DESTRUCTIVE_SEED_CONFIRMATION;
dotenv.config();

const password = process.env.REALISTIC_SEED_PASSWORD ?? process.env.E2E_PASSWORD;

assertSafeDestructiveSeed({
  databaseUrl: process.env.DATABASE_URL,
  nodeEnv: process.env.NODE_ENV,
  confirmation: explicitDestructiveConfirmation,
  password
});

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "reset", "--force"]);
run(process.execPath, ["prisma/realistic-seed.mjs"]);
