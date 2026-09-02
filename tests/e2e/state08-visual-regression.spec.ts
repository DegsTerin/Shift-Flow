// en-GB: Protects the stable login and authenticated workspace layouts with browser-specific visual baselines.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

function requiredE2eEnv(name: "E2E_EMAIL" | "E2E_PASSWORD") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to run authenticated visual regression tests.`);
  }
  return value;
}

async function settleVisualState(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `
  });
  await page.evaluate(async () => document.fonts.ready);
}

async function login(page: Page) {
  const credentials = {
    email: requiredE2eEnv("E2E_EMAIL"),
    password: requiredE2eEnv("E2E_PASSWORD")
  };
  await page.getByLabel(/E-mail|Email/).fill(credentials.email);
  await page.getByLabel(/Senha|Password/).fill(credentials.password);
  await page.getByRole("button", { name: /Entrar|Sign in/ }).click();
  await expect(
    page.getByRole("heading", { name: /Dashboard Principal|Main Dashboard/ })
  ).toBeVisible();
}

async function waitForDashboard(page: Page) {
  await expect(page.locator('main.workspace[aria-busy="false"]')).toBeVisible();
  const referenceLabels = page.locator(".filter-bar .reference-field > span");
  await expect(referenceLabels).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await expect(referenceLabels.nth(index)).toBeVisible();
  }
  await expect(page.locator(".metric-card")).toHaveCount(8);
  await expect
    .poll(async () =>
      Number((await page.locator(".metric-card strong").first().innerText()).trim())
    )
    .toBeGreaterThanOrEqual(4);
  await expect(page.locator(".alert-list")).toBeVisible();
  await expect(page.locator(".form-error.app-message")).toHaveCount(0);
}

test.describe("STATE-08 visual regression", () => {
  test.skip(
    process.platform !== "win32" ||
      process.env.PLAYWRIGHT_CHROME_EXECUTABLE_PATH !== "bundled" ||
      process.env.VISUAL_REGRESSION !== "1",
    "Visual baselines require the dedicated Windows managed-browser gate."
  );

  test("preserves the login layout", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Acesso operacional|Operations access/ })
    ).toBeVisible();
    const loginShell = page.locator("main.auth-shell");
    await expect(loginShell).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: /Entrar|Sign in/ })).toBeEnabled();
    await settleVisualState(page);

    await expect(loginShell).toHaveScreenshot("login.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css"
    });
  });

  test("preserves the authenticated dashboard layout", async ({ page }) => {
    await page.goto("/");
    await login(page);
    await waitForDashboard(page);
    const workspaceShell = page.locator("div.app-shell");
    await expect(workspaceShell).toHaveAttribute("data-theme", "dark");
    await settleVisualState(page);

    const tableDynamicCells = [
      page.locator(".compact-table tbody td:first-child"),
      page.locator(".compact-table tbody td:nth-child(8)"),
      page.locator(".compact-table tbody td:nth-child(10)")
    ];
    const dynamicCells = [
      page.locator(".notification-badge"),
      page
        .locator(".metric-card")
        .filter({ hasText: /Tempo médio|Average time/ })
        .locator("strong"),
      ...tableDynamicCells
    ];

    // The complete shell intentionally protects cross-section composition; the targeted table capture covers its hidden edge.
    await expect(workspaceShell).toHaveScreenshot("dashboard.png", {
      animations: "disabled",
      caret: "hide",
      mask: dynamicCells,
      scale: "css"
    });

    const tableViewport = page.locator(".compact-table .table-wrap");
    await page.addStyleTag({
      content: ".topbar, .sidebar { visibility: hidden !important; }"
    });
    await tableViewport.evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY - 180;
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    });
    await tableViewport.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect
      .poll(async () => tableViewport.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    await expect(tableViewport).toHaveScreenshot("dashboard-table-right.png", {
      animations: "disabled",
      caret: "hide",
      mask: tableDynamicCells,
      scale: "css"
    });
  });
});
