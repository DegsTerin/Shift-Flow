// en-GB: Configures vitest config so tooling follows the repository testing and build conventions.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/api/src/**/*.test.ts",
      "apps/web/app/**/*.test.ts",
      "prisma/**/*.test.mjs",
      "scripts/**/*.test.mjs"
    ],
    exclude: ["node_modules/**", "tests/e2e/**", "apps/web/.next/**", "generated/**"]
  }
});
