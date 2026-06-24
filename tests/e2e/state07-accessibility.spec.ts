import AxeBuilder from "@axe-core/playwright";
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
  await page.getByLabel(/E-mail|Email/).fill(credentials.email);
  await page.getByLabel(/Senha|Password/).fill(credentials.password);
  await page.getByRole("button", { name: /Entrar|Sign in/ }).click();
  await expect(
    page.getByRole("heading", { name: /Dashboard Principal|Main Dashboard/ })
  ).toBeVisible();
}

async function expectNoSeriousAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blockingViolations = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? "")
  );

  expect(
    blockingViolations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
      help: violation.help,
      targets: violation.nodes.slice(0, 8).map((node) => node.target.join(" "))
    }))
  ).toEqual([]);
}

async function navigateToKanban(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("button", { name: /Collapse navigation|Recolher navegacao/ }).click();
  }

  await page.getByRole("button", { name: "Kanban" }).click();
}

test.describe("STATE-07 dedicated axe accessibility", () => {
  test.setTimeout(60_000);

  test("validates login, dashboard, dark mode and kanban with axe", async ({ page, isMobile }) => {
    await page.goto("/");
    await expectNoSeriousAxeViolations(page);

    await login(page);
    await expectNoSeriousAxeViolations(page);

    await page.getByRole("button", { name: /Escuro|Dark/ }).click();
    await expect(page.locator("main")).toHaveAttribute("data-theme", "dark");
    await expectNoSeriousAxeViolations(page);

    await navigateToKanban(page, isMobile);
    await expect(page.getByRole("heading", { name: "Kanban" })).toBeVisible();
    await expectNoSeriousAxeViolations(page);
  });
});
