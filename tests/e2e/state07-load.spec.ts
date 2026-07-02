import { expect, test } from "@playwright/test";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

function requiredE2eEnv(name: "E2E_EMAIL" | "E2E_PASSWORD") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to run authenticated E2E tests.`);
  }
  return value;
}

const credentials = {
  email: requiredE2eEnv("E2E_EMAIL"),
  password: requiredE2eEnv("E2E_PASSWORD")
};
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 8);
const minimumActivities = Number(process.env.LOAD_MIN_ACTIVITIES ?? 120);
const p95ThresholdMs = Number(process.env.LOAD_P95_THRESHOLD_MS ?? 2000);
const maxThresholdMs = Number(process.env.LOAD_MAX_THRESHOLD_MS ?? 3000);

async function timed<T>(operation: () => Promise<T>) {
  const startedAt = performance.now();
  const value = await operation();
  return { value, durationMs: performance.now() - startedAt };
}

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

test.describe("STATE-07 representative load", () => {
  test("keeps authenticated dashboard APIs responsive with homologation volume", async ({
    request,
    isMobile
  }) => {
    test.skip(isMobile, "API load scenario runs once in the desktop project.");

    const login = await request.post(`${apiBaseUrl}/api/auth/login`, { data: credentials });
    expect(login.ok()).toBe(true);
    const loginPayload = await login.json();
    const accessToken = loginPayload.data.accessToken as string;
    const headers = { Authorization: `Bearer ${accessToken}` };

    const summary = await request.get(`${apiBaseUrl}/api/dashboard/summary`, { headers });
    expect(summary.ok()).toBe(true);
    const summaryPayload = await summary.json();
    expect(summaryPayload.data.total).toBeGreaterThanOrEqual(minimumActivities);

    const endpoints = [
      "/api/dashboard/summary",
      "/api/dashboard/charts",
      "/api/dashboard/operational-list",
      "/api/activities",
      "/api/teams",
      "/api/shifts"
    ];
    const durations: number[] = [];

    await Promise.all(
      Array.from({ length: concurrency }, async (_, batchIndex) => {
        for (const endpoint of endpoints) {
          const { value: response, durationMs } = await timed(() =>
            request.get(`${apiBaseUrl}${endpoint}`, { headers })
          );
          expect(response.ok(), `${endpoint} batch ${batchIndex}`).toBe(true);
          durations.push(durationMs);
        }
      })
    );

    expect(durations).toHaveLength(concurrency * endpoints.length);
    expect(percentile(durations, 95)).toBeLessThan(p95ThresholdMs);
    expect(Math.max(...durations)).toBeLessThan(maxThresholdMs);
  });
});
