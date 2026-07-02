import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const chromeExecutablePath =
  process.env.PLAYWRIGHT_CHROME_EXECUTABLE_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run Playwright release gates.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "dist/playwright-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "dist/playwright-report" }]],
  timeout: 30_000,
  expect: {
    timeout: 7_500
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: chromeExecutablePath
    }
  },
  webServer: [
    {
      command: "npx tsx apps/api/src/server.ts",
      url: "http://localhost:3001/health",
      reuseExistingServer: false,
      timeout: 20_000,
      env: {
        DATABASE_URL: databaseUrl,
        JWT_SECRET: process.env.JWT_SECRET ?? "replace-with-a-local-secret",
        CORS_ORIGIN: "http://localhost:3000",
        API_PORT: "3001",
        API_RATE_LIMIT_MAX: "5000",
        AUTH_LOCKOUT_MAX_ATTEMPTS: "5000",
        AUTH_RATE_LIMIT_MAX: "5000"
      }
    },
    {
      command: "npx next dev apps/web -p 3000",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:3001"
      }
    }
  ],
  projects: [
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 900 }
      }
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"]
      }
    }
  ]
});
