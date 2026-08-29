// en-GB: Isolates opt-in PostgreSQL regressions from the credential-free unit-test gate.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["prisma/**/*.postgres.test.mjs"],
    exclude: ["node_modules/**", "generated/**"]
  }
});
