import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const credentials = {
  email: process.env.E2E_EMAIL ?? "integration.admin@shiftflow.local",
  password: process.env.E2E_PASSWORD ?? "replace-with-a-local-e2e-password"
};

async function login(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Acesso operacional|Operations access/ })
  ).toBeVisible();
  await page.getByLabel(/E-mail|Email/).fill(credentials.email);
  await page.getByLabel(/Senha|Password/).fill(credentials.password);
  await page.getByRole("button", { name: /Entrar|Sign in/ }).click();
  await expect(
    page.getByRole("heading", { name: /Dashboard Principal|Main Dashboard/ })
  ).toBeVisible();
}

async function navigateToKanban(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("button", { name: /Collapse navigation|Recolher navegacao/ }).click();
  }

  await page.getByRole("button", { name: "Kanban" }).click();
}

test.describe("STATE-07 homologation", () => {
  test("authenticates with seeded credentials and renders dashboard metrics", async ({ page }) => {
    await login(page);

    await expect(page.getByText(/INTEGRATION ADMIN/i)).toBeVisible();
    await expect(page.getByText(/Atividades totais|Total activities/)).toBeVisible();
    await expect
      .poll(
        async () =>
          (await page.locator(".metric-card strong").allTextContents()).map((value) =>
            Number(value)
          )[0],
        {
          message: "dashboard total metric should load from the API"
        }
      )
      .toBeGreaterThanOrEqual(4);
    const metrics = (await page.locator(".metric-card strong").allTextContents()).map((value) =>
      Number(value)
    );
    expect(metrics).toHaveLength(6);
    expect(metrics[0]).toBeGreaterThanOrEqual(4);
    expect(metrics[1]).toBeGreaterThanOrEqual(1);
    expect(metrics[2]).toBeGreaterThanOrEqual(1);
    expect(metrics[3]).toBeGreaterThanOrEqual(1);
    expect(metrics[4]).toBeGreaterThanOrEqual(1);
    expect(metrics[5]).toBeGreaterThanOrEqual(1);
  });

  test("keeps the authenticated session after page reload", async ({ page }) => {
    await login(page);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("shiftflow.session")))
      .toBeNull();

    await page.reload();

    await expect(
      page.getByRole("heading", { name: /Dashboard Principal|Main Dashboard/ })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Acesso operacional|Operations access/ })
    ).toHaveCount(0);
  });

  test("supports dark mode and EN-GB Kanban labels", async ({ page, isMobile }) => {
    await login(page);

    await page.getByRole("button", { name: /Escuro|Dark/ }).click();
    await expect(page.locator("main")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: /pt-BR/ }).click();
    await expect(page.getByRole("heading", { name: "Main Dashboard" })).toBeVisible();

    await navigateToKanban(page, isMobile);
    await expect(page.getByRole("heading", { name: "Kanban" })).toBeVisible();
    await expect(page.locator(".kanban-column h2")).toHaveText([
      "Pending",
      "In progress",
      "Waiting for customer",
      "Waiting for third party",
      "Monitoring",
      "Completed",
      "Cancelled"
    ]);
  });

  test("keeps TV mode full width after desktop navigation is collapsed", async ({
    page,
    isMobile
  }) => {
    test.skip(isMobile, "Desktop-only TV mode assertion.");

    await login(page);

    const shell = page.locator("main.app-shell");
    await expect(
      page.getByText(/Dados carregados de endpoints reais|Loaded from live endpoints/)
    ).toHaveCount(0);
    await page.getByRole("button", { name: /Recolher navegacao|Collapse navigation/ }).click();
    await expect(shell).toHaveClass(/nav-collapsed/);

    await page.getByRole("button", { name: /Modo TV|TV Mode/ }).click();
    await expect(shell).toHaveClass(/monitor-mode/);
    await expect(shell).not.toHaveClass(/nav-collapsed/);
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await expect(
      page.getByText(/Dados carregados de endpoints reais|Loaded from live endpoints/)
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /Dashboard Principal|Main Dashboard/ })
    ).toHaveCSS("font-size", "26.4px");
    await expect
      .poll(() => shell.evaluate((element) => getComputedStyle(element).gridTemplateColumns))
      .not.toMatch(/^76px\b/);
  });

  test("keeps mobile dashboard responsive and accessible at a basic level", async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, "Mobile-only responsive assertion.");

    await login(page);
    await page.getByRole("button", { name: /pt-BR/ }).click();
    await expect(page.getByRole("heading", { name: "Main Dashboard" })).toBeVisible();

    await expect(page.locator("body")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);

    await expect(page.getByRole("navigation")).toBeHidden();
    await page.getByRole("button", { name: /Collapse navigation|Recolher navegacao/ }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page.getByRole("navigation")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Kanban" })).toBeVisible();
    await expect(page.getByPlaceholder(/Search|Pesquisar/)).toBeVisible();
    await expect(page.locator(".kanban-column").first()).toBeVisible();
  });
});
