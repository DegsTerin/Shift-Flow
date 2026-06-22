import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const credentials = {
  email: "integration.admin@shiftflow.local",
  password: "ShiftFlow#2026"
};

async function login(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Acesso operacional|Operations access/ })).toBeVisible();
  await expect(page.getByLabel(/E-mail|Email/)).toHaveValue(credentials.email);
  await expect(page.getByLabel(/Senha|Password/)).toHaveValue(credentials.password);
  await page.getByRole("button", { name: /Entrar|Sign in/ }).click();
  await expect(page.getByRole("heading", { name: /Dashboard Principal|Main Dashboard/ })).toBeVisible();
}

test.describe("STATE-07 homologation", () => {
  test("authenticates with seeded credentials and renders dashboard metrics", async ({ page }) => {
    await login(page);

    await expect(page.getByText(/INTEGRATION ADMIN/i)).toBeVisible();
    await expect(page.getByText(/Atividades totais|Total activities/)).toBeVisible();
    await expect
      .poll(async () => (await page.locator(".metric-card strong").allTextContents()).map((value) => Number(value))[0], {
        message: "dashboard total metric should load from the API",
      })
      .toBeGreaterThanOrEqual(4);
    const metrics = (await page.locator(".metric-card strong").allTextContents()).map((value) =>
      Number(value),
    );
    expect(metrics).toHaveLength(6);
    expect(metrics[0]).toBeGreaterThanOrEqual(4);
    expect(metrics[1]).toBeGreaterThanOrEqual(1);
    expect(metrics[2]).toBeGreaterThanOrEqual(1);
    expect(metrics[3]).toBeGreaterThanOrEqual(1);
    expect(metrics[4]).toBeGreaterThanOrEqual(1);
    expect(metrics[5]).toBeGreaterThanOrEqual(1);
  });

  test("supports dark mode and EN-GB Kanban labels", async ({ page }) => {
    await login(page);

    await page.getByRole("button", { name: /Escuro|Dark/ }).click();
    await expect(page.locator("main")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: /pt-BR/ }).click();
    await expect(page.getByRole("heading", { name: "Main Dashboard" })).toBeVisible();

    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page.getByRole("heading", { name: "Kanban" })).toBeVisible();
    await expect(page.locator(".kanban-column h2")).toHaveText([
      "Pending",
      "In progress",
      "Waiting for third party",
      "Monitoring",
      "Completed"
    ]);
  });

  test("keeps mobile dashboard responsive and accessible at a basic level", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only responsive assertion.");

    await login(page);
    await page.getByRole("button", { name: /pt-BR/ }).click();
    await expect(page.getByRole("heading", { name: "Main Dashboard" })).toBeVisible();

    await expect(page.locator("body")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);

    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByPlaceholder(/Search|Pesquisar/)).toBeVisible();
    await expect(page.locator("table").first()).toContainText(/Client|Cliente|Integration Client/);
  });
});
