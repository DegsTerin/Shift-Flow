// en-GB: Verifies authenticated browser configuration without reading dotenv files or starting servers.
/* global process */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv/config", () => ({}));

describe("Playwright configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([undefined, "demo"])(
    "requires authentication and isolates the shared identity when inherited AUTH_MODE is %s",
    async (authenticationMode) => {
      vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/playwright_config_only");
      vi.stubEnv("AUTH_MODE", authenticationMode);
      vi.resetModules();
      const { default: playwrightConfig } = await import("../playwright.config.ts");

      const apiServer = playwrightConfig.webServer.find(
        (server) => server.url === "http://localhost:3001/health"
      );
      expect(apiServer?.env.AUTH_MODE).toBe("required");
      expect(playwrightConfig.workers).toBe(1);
      expect(process.env.AUTH_MODE).toBe(authenticationMode);
    }
  );
});
