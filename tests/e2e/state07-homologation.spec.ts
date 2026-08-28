// en-GB: Verifies state07 homologation spec end-to-end so release behaviour remains observable in a real browser.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

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
    await page.getByRole("button", { name: /Collapse navigation|Recolher navegação/ }).click();
  }

  await page.getByRole("button", { name: "Kanban" }).click();
}

test.describe("STATE-07 homologation", () => {
  test("authenticates with seeded credentials and renders dashboard metrics", async ({ page }) => {
    await login(page);

    await expect(page.getByText(/INTEGRATION ADMIN/i)).toBeVisible();
    await expect(page.getByText(/Atividades totais|Total activities/)).toBeVisible();
    const referenceLabels = page.locator(".filter-bar .reference-field > span");
    await expect(referenceLabels).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(referenceLabels.nth(index)).toBeVisible();
    }
    await expect(page.locator(".filter-bar .reference-select-tools")).toHaveCount(0);
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
    await expect(page.locator(".metric-card")).toHaveCount(8);
    const requiredMetrics: Array<[RegExp, number]> = [
      [/Atividades totais|Total activities/, 4],
      [/Pendentes|Pending/, 1],
      [/Em andamento|In progress/, 1],
      [/Finalizadas|Completed/, 1],
      [/Críticas|Critical/, 1],
      [/SLA em risco|SLA at risk/, 1],
      [/Atrasadas|Overdue/, 1],
      [/Tempo médio|Average time/, 0]
    ];
    for (const [label, minimum] of requiredMetrics) {
      const card = page.locator(".metric-card").filter({ hasText: label }).first();
      await expect(card).toBeVisible();
      await expect
        .poll(async () => Number.parseFloat(await card.locator("strong").innerText()))
        .toBeGreaterThanOrEqual(minimum);
    }
    await expect(page.locator(".alert-list")).toBeVisible();
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

    await expect(page.locator("main")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: /Claro|Light/ }).click();
    await expect(page.locator("main")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: /Escuro|Dark/ }).click();
    await expect(page.locator("main")).toHaveAttribute("data-theme", "dark");

    await expect(page.getByRole("heading", { name: "Main Dashboard" })).toBeVisible();
    await page.getByRole("button", { name: /en-GB/ }).click();
    await expect(page.getByRole("heading", { name: "Dashboard Principal" })).toBeVisible();
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

    const shell = page.locator("div.app-shell");
    await expect(
      page.getByText(/Dados carregados de endpoints reais|Loaded from live endpoints/)
    ).toHaveCount(0);
    await page.getByRole("button", { name: /Recolher navegação|Collapse navigation/ }).click();
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
    await expect(page.getByRole("heading", { name: "Main Dashboard" })).toBeVisible();

    await expect(page.locator("body")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);

    await expect(page.getByRole("navigation")).toBeHidden();
    await page.getByRole("button", { name: /Collapse navigation|Recolher navegação/ }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page.getByRole("navigation")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Kanban" })).toBeVisible();
    await expect(page.getByPlaceholder(/Search|Pesquisar/)).toBeVisible();
    await expect(page.locator(".kanban-column").first()).toBeVisible();
  });
});
