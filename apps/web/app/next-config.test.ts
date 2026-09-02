// en-GB: Verifies visual-baseline configuration without starting the Next.js runtime.
import { afterEach, describe, expect, it, vi } from "vitest";

describe("Next.js configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps normal development indicators at the framework default", async () => {
    vi.stubEnv("VISUAL_REGRESSION", "0");
    vi.resetModules();
    const { default: nextConfig } = await import("../next.config");

    expect(nextConfig.devIndicators).toBeUndefined();
  });

  it("keeps development indicators out of visual baselines", async () => {
    vi.stubEnv("VISUAL_REGRESSION", "1");
    vi.resetModules();
    const { default: nextConfig } = await import("../next.config");

    expect(nextConfig.devIndicators).toBe(false);
  });
});
