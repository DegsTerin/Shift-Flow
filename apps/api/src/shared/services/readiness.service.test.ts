import { afterEach, describe, expect, it, vi } from "vitest";
import { checkReadiness } from "./readiness.service.js";

const { queryRaw } = vi.hoisted(() => ({
  queryRaw: vi.fn()
}));

vi.mock("../lib/prisma.js", () => ({
  getPrisma: vi.fn().mockResolvedValue({
    $queryRaw: queryRaw
  })
}));

afterEach(() => {
  vi.unstubAllEnvs();
  queryRaw.mockReset();
});

describe("checkReadiness", () => {
  it("checks database connectivity outside test mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    await checkReadiness();

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("raises a service-unavailable error when the database check fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    queryRaw.mockRejectedValue(new Error("database unavailable"));

    await expect(checkReadiness()).rejects.toMatchObject({
      statusCode: 503,
      code: "READINESS_CHECK_FAILED"
    });
  });
});
