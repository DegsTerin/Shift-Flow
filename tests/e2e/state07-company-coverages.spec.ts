// en-GB: Exercises real Company authentication and timezone-qualified Shift coverages without retaining credentials.
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Locator, Page, Response, Route } from "@playwright/test";
import { messages } from "../../apps/web/app/lib/i18n";
import type { LoginResponse, Locale } from "../../apps/web/app/lib/types";

const companyA = "ShiftFlow Integration Company";
const companyB = "ShiftFlow London Integration Company";
const markerKey = "shiftflow.reauthentication-required";
const apiOrigin = "http://localhost:3001";

function credential(name: "E2E_EMAIL" | "E2E_PASSWORD") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the authenticated Company regression.`);
  return value;
}

function authResponse(page: Page, path = "/api/auth/login") {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path && response.request().method() === "POST"
  );
}

async function sessionFrom(response: Response) {
  expect(response.status()).toBe(200);
  const envelope = (await response.json()) as { data: LoginResponse };
  // Assertions deliberately inspect only booleans and public metadata, never the complete session.
  expect(
    typeof envelope.data?.accessToken === "string" && envelope.data.accessToken.length > 0
  ).toBe(true);
  return envelope.data;
}

async function localeOf(page: Page, locale: Locale) {
  const other = locale === "en-GB" ? "pt-BR" : "en-GB";
  const toggle = page.getByRole("button", { name: other, exact: true });
  if (await toggle.count()) await toggle.click();
  await expect(page.getByRole("button", { name: locale, exact: true })).toBeVisible();
}

async function login(page: Page, locale: Locale = "en-GB") {
  await page.goto("/");
  await page.getByLabel(/E-mail|Email/, { exact: true }).fill(credential("E2E_EMAIL"));
  await page.getByLabel(/Senha|Password/, { exact: true }).fill(credential("E2E_PASSWORD"));
  const response = authResponse(page);
  await page.getByRole("button", { name: /Entrar|Sign in/, exact: true }).click();
  const session = await sessionFrom(await response);
  await expect(
    page.getByRole("heading", { name: /Dashboard Principal|Main Dashboard/, exact: true })
  ).toBeVisible();
  await localeOf(page, locale);
  await contextIs(page, locale, companyA, "America/Sao_Paulo");
  return session;
}

function switchForm(page: Page, locale: Locale) {
  return page.getByRole("form", { name: messages[locale].switchCompany, exact: true });
}

async function companySwitchIsDisabled(page: Page, locale: Locale) {
  const form = switchForm(page, locale);
  const t = messages[locale];
  await expect(form.locator("fieldset")).toHaveJSProperty("disabled", true);
  await expect(
    form.getByRole("combobox", { name: t.companyDestination, exact: true })
  ).toBeDisabled();
  await expect(form.getByLabel(t.password, { exact: true })).toBeDisabled();
  await expect(form.getByRole("button", { name: t.switchCompany, exact: true })).toBeDisabled();
}

async function contextIs(page: Page, locale: Locale, name: string, timezone: string) {
  await expect(page.getByLabel(messages[locale].activeCompany, { exact: true })).toHaveText(
    `${name} · ${timezone}`
  );
  await expect(page.getByText("Integration Admin", { exact: true })).toBeVisible();
}

async function prepareSwitch(page: Page, locale: Locale, session: LoginResponse, name: string) {
  const destination = session.user.companies?.find((company) => company.name === name);
  if (!destination) throw new Error("The projected Company fixture is unavailable");
  const form = switchForm(page, locale);
  await form.getByRole("combobox").selectOption(destination.id);
  await form
    .getByLabel(messages[locale].password, { exact: true })
    .fill(credential("E2E_PASSWORD"));
  return form;
}

async function switchToLondon(page: Page, locale: Locale, session: LoginResponse) {
  const form = await prepareSwitch(page, locale, session, companyB);
  const response = authResponse(page);
  await form.getByRole("button", { name: messages[locale].switchCompany, exact: true }).click();
  const next = await sessionFrom(await response);
  await contextIs(page, locale, companyB, "Europe/London");
  expect(next.user.permissions?.slice().sort()).toEqual([
    "dashboard:read",
    "shifts:read",
    "shifts:write",
    "users:read"
  ]);
  return next;
}

async function marker(page: Page) {
  return page.evaluate((key) => sessionStorage.getItem(key), markerKey);
}

async function surfaceChecks(page: Page, selector: string) {
  const result = await new AxeBuilder({ page })
    .include(selector)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    result.violations
      .filter((item) => ["serious", "critical"].includes(item.impact ?? ""))
      .map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length }))
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false
  );
  expect(
    await page.locator(selector).evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return (
        bounds.left >= -1 &&
        bounds.right <= window.innerWidth + 1 &&
        element.scrollWidth <= element.clientWidth + 1
      );
    })
  ).toBe(true);
}

// Tokens come only from this browser's actual UI login. Cookie-free fixture/negative calls
// cannot rotate the cookie under test; transport errors are reduced to a non-secret status.
async function api<T>(
  page: Page,
  session: LoginResponse,
  path: string,
  method = "GET",
  body?: unknown
) {
  return page.evaluate(
    async ({ origin, accessToken, path, method, body }) => {
      try {
        const response = await fetch(`${origin}${path}`, {
          method,
          credentials: "omit",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const envelope = await response.json();
        return { status: response.status, data: envelope.data as T };
      } catch {
        return { status: 0, data: undefined as T | undefined };
      }
    },
    { origin: apiOrigin, accessToken: session.accessToken, path, method, body }
  );
}

type Shift = { id: string; name: string; startsAt: string; endsAt: string; timezone: string };
type Coverage = { id: string; note: string; startsAt: string; endsAt: string; type: string };
type Listing<T> = { items: T[]; total: number; page: number; pageSize: number };

async function shifts(page: Page, session: LoginResponse, name: string) {
  const result = await api<Listing<Shift>>(
    page,
    session,
    `/api/shifts?search=${encodeURIComponent(name)}`
  );
  expect(result.status).toBe(200);
  const shift = result.data?.items.find((item) => item.name === name);
  if (!shift) throw new Error("The scoped Shift fixture is unavailable");
  return shift;
}

async function openShift(page: Page, locale: Locale, isMobile: boolean, name: string) {
  const t = messages[locale];
  if (!(await page.getByRole("heading", { name: t.shifts, exact: true }).count())) {
    if (isMobile)
      await page
        .getByRole("button", { name: /Collapse navigation|Recolher navegação/, exact: true })
        .click();
    await page.getByRole("button", { name: t.shifts, exact: true }).click();
  }
  await page.getByRole("button", { name: `${t.details}: ${name}`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

function coveragePanel(page: Page, locale: Locale) {
  return page.getByRole("region", { name: messages[locale].shiftCoverages, exact: true });
}

async function fillCoverage(
  panel: Locator,
  userId: string,
  start: string,
  end: string,
  note: string
) {
  await panel.locator('select[name="userId"]').selectOption(userId);
  await panel.locator('input[name="startsAt"]').fill(start);
  await panel.locator('input[name="endsAt"]').fill(end);
  await panel.locator('textarea[name="note"]').fill(note);
}

// A bounded network barrier holds the real browser request before forwarding. It neither
// fabricates a success nor overwrites cookies, session storage, Web Locks or application APIs.
async function holdNext(
  page: Page,
  path: string,
  method: string,
  abort = false,
  repeatRead = false
) {
  if (repeatRead && (method !== "GET" || !abort)) {
    throw new Error("Repeated interception is restricted to the bounded read-failure fixture");
  }
  let arrive!: () => void;
  let release!: () => void;
  let used = false;
  let intercepted = 0;
  let expired = false;
  const completions: Promise<void>[] = [];
  const arrived = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pattern = `${apiOrigin}${path}`;
  const timer = setTimeout(() => {
    expired = true;
    release();
  }, 15_000);
  const releaseRequest = () => {
    clearTimeout(timer);
    release();
  };
  const handler = async (route: Route) => {
    if ((used && !repeatRead) || route.request().method() !== method) return route.continue();
    used = true;
    intercepted += 1;
    arrive();
    const completion = (async () => {
      await released;
      if (abort) await route.abort("connectionfailed");
      else await route.continue();
    })();
    completions.push(completion);
    await completion;
  };
  await page.route(pattern, handler);
  return {
    async entered() {
      await Promise.race([arrived, released]);
      expect(used && !expired).toBe(true);
    },
    release: releaseRequest,
    count: () => intercepted,
    async dispose() {
      releaseRequest();
      const failures: unknown[] = [];
      try {
        await page.unroute(pattern, handler);
      } catch (error) {
        failures.push(error);
      }
      const settled = await Promise.allSettled(completions);
      for (const completion of settled) {
        if (completion.status === "rejected") failures.push(completion.reason);
      }
      clearTimeout(timer);
      if (failures.length)
        throw new AggregateError(failures, "Intercepted requests did not settle cleanly");
      expect(expired).toBe(false);
    }
  };
}

// Credential-bearing network traces are not safe evidence, including on failure.
test.use({ trace: "off" });

test.describe("STATE-07 Company and Shift coverage integration", () => {
  test.setTimeout(120_000);

  for (const locale of ["pt-BR", "en-GB"] as const) {
    test(`preserves A on rejection and restores a real B session after reload (${locale})`, async ({
      page
    }) => {
      const t = messages[locale];
      const initial = await login(page, locale);
      await surfaceChecks(page, ".topbar");
      await surfaceChecks(page, 'form[aria-label="' + t.switchCompany + '"]');
      const form = await prepareSwitch(page, locale, initial, companyB);
      await form.getByLabel(t.password, { exact: true }).fill(randomUUID());
      const rejected = authResponse(page);
      await form.getByRole("button", { name: t.switchCompany, exact: true }).click();
      expect((await rejected).status()).toBe(401);
      await expect(page.locator("main.workspace").getByRole("alert")).toHaveText(
        t.companySwitchRejected
      );
      await contextIs(page, locale, companyA, "America/Sao_Paulo");
      expect(await marker(page)).toBeNull();
      const london = await switchToLondon(page, locale, initial);
      expect(london.user.companyId).not.toBe(initial.user.companyId);
      const refresh = authResponse(page, "/api/auth/refresh");
      await page.reload();
      const restored = await sessionFrom(await refresh);
      expect(restored.user.companyId).toBe(london.user.companyId);
      await localeOf(page, locale);
      await contextIs(page, locale, companyB, "Europe/London");
      expect(await marker(page)).toBeNull();
    });

    test(`requires explicit same-tab authentication after uncertain transport (${locale})`, async ({
      page
    }) => {
      const t = messages[locale];
      const initial = await login(page, locale);
      const form = await prepareSwitch(page, locale, initial, companyB);
      const held = await holdNext(page, "/api/auth/login", "POST", true);
      try {
        await form.getByRole("button", { name: t.switchCompany, exact: true }).click();
        await held.entered();
        held.release();
        await expect(page.getByRole("heading", { name: t.loginTitle, exact: true })).toBeVisible();
        await expect(page.locator("form.login-card").getByRole("alert")).toContainText(
          t.companySwitchUncertain
        );
        expect(await marker(page)).toBe("1");
      } finally {
        await held.dispose();
      }
      let restores = 0;
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/auth/refresh") restores += 1;
      });
      await page.reload();
      await expect(
        page.getByRole("heading", { name: /Acesso operacional|Operations access/, exact: true })
      ).toBeVisible();
      expect(await marker(page)).toBe("1");
      expect(restores).toBe(0);
      // Reload may reset the interface locale; restoration remains blocked irrespective of copy.
      await page.getByLabel(/E-mail|Email/, { exact: true }).fill(credential("E2E_EMAIL"));
      await page.getByLabel(/Senha|Password/, { exact: true }).fill(credential("E2E_PASSWORD"));
      const response = authResponse(page);
      await page.getByRole("button", { name: /Entrar|Sign in/, exact: true }).click();
      const recovered = await sessionFrom(await response);
      expect(recovered.user.companyId).toBe(initial.user.companyId);
      await localeOf(page, locale);
      await contextIs(page, locale, companyA, "America/Sao_Paulo");
      expect(await marker(page)).toBeNull();
      expect(restores).toBe(0);
    });

    test(`persists London coverage, excludes drafts and rejects foreign writes (${locale})`, async ({
      page,
      isMobile
    }) => {
      const t = messages[locale];
      const initial = await login(page, locale);
      const foreignShift = await shifts(page, initial, "Integration Day Shift");
      const users = await api<Listing<{ id: string; displayName: string }>>(
        page,
        initial,
        "/api/users?search=Integration%20Analyst"
      );
      expect(users.status).toBe(200);
      const analystId = users.data?.items.find(
        (user) => user.displayName === "Integration Analyst"
      )?.id;
      if (!analystId) throw new Error("The A-only analyst fixture is unavailable");
      const london = await switchToLondon(page, locale, initial);
      const seeded = await shifts(page, london, "London Integration Shift");
      expect({
        startsAt: seeded.startsAt,
        endsAt: seeded.endsAt,
        timezone: seeded.timezone
      }).toEqual({
        startsAt: "2026-07-04T08:00:00.123Z",
        endsAt: "2026-07-04T17:00:00.456Z",
        timezone: "Europe/London"
      });
      // Each browser project owns one additional ephemeral Shift; only 26 coverages are needed
      // to prove a second page. The source seed's A benchmark and fixed B oracle remain intact.
      const fixtureName = `Coverage browser ${randomUUID()}`;
      const created = await api<Shift>(page, london, "/api/shifts", "POST", {
        name: fixtureName,
        startsAt: seeded.startsAt,
        endsAt: seeded.endsAt,
        timezone: seeded.timezone,
        status: "OPEN"
      });
      expect(created.status).toBe(201);
      if (!created.data) throw new Error("The owned coverage Shift was not created");
      const shift = created.data;
      const path = `/api/shifts/${shift.id}/coverages`;
      const heldRead = await holdNext(page, `${path}?page=1&pageSize=25`, "GET", true, true);
      let dialog: Locator;
      try {
        dialog = await openShift(page, locale, isMobile, fixtureName);
        await heldRead.entered();
        const panel = coveragePanel(page, locale);
        await expect(panel.locator('[aria-busy="true"]')).toBeVisible();
        await expect(panel.getByText(t.coverageEmpty, { exact: true })).toHaveCount(0);
        heldRead.release();
        await expect(panel.getByRole("alert")).toHaveText(t.coverageLoadFailed);
        await expect(panel.getByText(t.coverageEmpty, { exact: true })).toHaveCount(0);
        console.log(JSON.stringify({ coverageReadInterceptions: heldRead.count() }));
      } finally {
        await heldRead.dispose();
      }
      const panel = coveragePanel(page, locale);
      const readBack = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === path && response.request().method() === "GET"
      );
      await panel.getByRole("button", { name: t.refresh, exact: true }).click();
      expect((await readBack).status()).toBe(200);
      await expect(panel.getByText(t.coverageEmpty, { exact: true })).toBeVisible();
      await expect(
        panel.getByText(`${t.coverageZone}: Europe/London`, { exact: true })
      ).toBeVisible();
      await expect(panel.locator('select[name="type"] option')).toHaveCount(5);
      await surfaceChecks(page, ".record-modal");

      // The modal itself is the visible exclusion boundary; this does not claim isolated
      // evidence for the lower-level unsafe-request counter.
      await dialog.getByRole("button", { name: t.edit, exact: true }).click();
      const draft = dialog.locator('input[name="name"]');
      await draft.fill(`${fixtureName} draft`);
      await companySwitchIsDisabled(page, locale);
      await expect(panel.getByRole("button", { name: t.addCoverage, exact: true })).toBeDisabled();
      await expect(draft).toHaveValue(`${fixtureName} draft`);
      await dialog
        .locator("form")
        .first()
        .getByRole("button", { name: t.close, exact: true })
        .click();

      let posts = 0;
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === path && request.method() === "POST") posts += 1;
      });
      const rejectedNote = `negative-${randomUUID()}`;
      for (const [start, end] of [
        ["2026-03-29T01:30", "2026-03-29T03:30"],
        ["2026-10-25T01:30", "2026-10-25T03:30"]
      ]) {
        await fillCoverage(panel, london.user.id, start, end, rejectedNote);
        await panel.getByRole("button", { name: t.addCoverage, exact: true }).click();
        await expect(panel.getByRole("alert")).toHaveText(t.coverageInvalidPeriod);
        expect(posts).toBe(0);
      }
      const note = `London civil-time proof ${randomUUID()}`;
      await fillCoverage(panel, london.user.id, "2026-07-04T10:00", "2026-07-04T11:00", note);
      await panel.locator('select[name="replacementForUserId"]').selectOption(london.user.id);
      await panel.locator('select[name="type"]').selectOption("SUBSTITUTE");
      const heldWrite = await holdNext(page, path, "POST");
      const posted = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === path && response.request().method() === "POST"
      );
      const reconciled = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === path && response.request().method() === "GET"
      );
      try {
        await panel.getByRole("button", { name: t.addCoverage, exact: true }).click();
        await heldWrite.entered();
        await companySwitchIsDisabled(page, locale);
        await expect(
          panel.getByRole("button", { name: t.addCoverage, exact: true })
        ).toBeDisabled();
        await expect(panel.locator('textarea[name="note"]')).toHaveValue(note);
        await expect(dialog.locator(".modal-header button")).toBeDisabled();
        expect(posts).toBe(1);
        heldWrite.release();
        const response = await posted;
        expect(response.status()).toBe(201);
        const envelope = (await response.json()) as { data: Coverage };
        expect({
          startsAt: envelope.data.startsAt,
          endsAt: envelope.data.endsAt,
          type: envelope.data.type
        }).toEqual({
          startsAt: "2026-07-04T09:00:00.000Z",
          endsAt: "2026-07-04T10:00:00.000Z",
          type: "SUBSTITUTE"
        });
        expect((await reconciled).status()).toBe(200);
        await expect(panel.getByText(note, { exact: true })).toBeVisible();
      } finally {
        await heldWrite.dispose();
      }
      await dialog.locator(".modal-header button").click();
      await openShift(page, locale, isMobile, fixtureName);
      await expect(coveragePanel(page, locale).getByText(note, { exact: true })).toBeVisible();
      await page.getByRole("dialog").locator(".modal-header button").click();
      const refresh = authResponse(page, "/api/auth/refresh");
      await page.reload();
      expect((await sessionFrom(await refresh)).user.companyId).toBe(london.user.companyId);
      await localeOf(page, locale);
      await openShift(page, locale, isMobile, fixtureName);
      await expect(coveragePanel(page, locale).getByText(note, { exact: true })).toBeVisible();

      const payload = {
        userId: london.user.id,
        startsAt: "2026-07-04T12:00:00.000Z",
        endsAt: "2026-07-04T13:00:00.000Z",
        note: rejectedNote
      };
      expect((await api(page, london, `/api/shifts/${foreignShift.id}/coverages`)).status).toBe(
        404
      );
      expect(
        (await api(page, london, `/api/shifts/${foreignShift.id}/coverages`, "POST", payload))
          .status
      ).toBe(404);
      expect(
        (await api(page, london, path, "POST", { ...payload, userId: analystId })).status
      ).toBe(403);
      expect(
        (await api(page, london, path, "POST", { ...payload, replacementForUserId: analystId }))
          .status
      ).toBe(403);
      const negativeA = await api<Listing<Coverage>>(
        page,
        initial,
        `/api/shifts/${foreignShift.id}/coverages?pageSize=100`
      );
      const negativeB = await api<Listing<Coverage>>(page, london, `${path}?pageSize=100`);
      expect(negativeA.status).toBe(200);
      expect(negativeB.status).toBe(200);
      expect(negativeA.data?.items.some((item) => item.note === rejectedNote)).toBe(false);
      expect(negativeB.data?.items.some((item) => item.note === rejectedNote)).toBe(false);
      expect(negativeB.data?.total).toBe(1);

      for (let index = 0; index < 25; index += 1) {
        const start = new Date(Date.UTC(2026, 6, 4, 14, index)).toISOString();
        const end = new Date(Date.UTC(2026, 6, 4, 15, index)).toISOString();
        expect(
          (
            await api(page, london, path, "POST", {
              userId: london.user.id,
              startsAt: start,
              endsAt: end,
              type: "REGULAR",
              note: `Owned page fixture ${index}`
            })
          ).status
        ).toBe(201);
      }
      const currentPanel = coveragePanel(page, locale);
      await currentPanel.getByRole("button", { name: t.refresh, exact: true }).click();
      await expect(currentPanel.locator("li")).toHaveCount(25);
      await expect(
        currentPanel.getByText(`${t.page} 1 · 26 ${t.records}`, { exact: true })
      ).toBeVisible();
      const secondPage = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === path && url.searchParams.get("page") === "2";
      });
      await currentPanel.getByRole("button", { name: t.next, exact: true }).click();
      expect((await secondPage).status()).toBe(200);
      await expect(currentPanel.locator("li")).toHaveCount(1);
      await expect(currentPanel.getByText("Owned page fixture 24", { exact: true })).toBeVisible();
      await expect(currentPanel.getByRole("button", { name: t.next, exact: true })).toBeDisabled();
      await expect(
        currentPanel.getByRole("button", { name: t.previous, exact: true })
      ).toBeEnabled();
      await surfaceChecks(page, ".record-modal");
    });
  }

  test("serialises an A refresh and B login across two real browser tabs", async ({
    page,
    context
  }) => {
    const locale = "en-GB";
    const initial = await login(page, locale);
    expect(await page.evaluate(() => Boolean(navigator.locks))).toBe(true);
    const second = await context.newPage();
    const held = await holdNext(second, "/api/auth/refresh", "POST");
    const refreshed = authResponse(second, "/api/auth/refresh");
    let forwardedLogins = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/auth/login") forwardedLogins += 1;
    });
    try {
      await second.goto("/");
      await held.entered();
      const form = await prepareSwitch(page, locale, initial, companyB);
      const switched = authResponse(page);
      await form.getByRole("button", { name: messages[locale].switchCompany, exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const locks = await navigator.locks.query();
            return {
              held: locks.held?.filter((lock) => lock.name === "shiftflow-auth-refresh").length,
              pending: locks.pending?.filter((lock) => lock.name === "shiftflow-auth-refresh")
                .length
            };
          })
        )
        .toEqual({ held: 1, pending: 1 });
      expect(forwardedLogins).toBe(0);
      held.release();
      const a = await sessionFrom(await refreshed);
      expect(a.user.companyId).toBe(initial.user.companyId);
      const b = await sessionFrom(await switched);
      expect(b.user.company?.name).toBe(companyB);
      expect(forwardedLogins).toBe(1);
      await contextIs(page, locale, companyB, "Europe/London");
      await contextIs(second, locale, companyA, "America/Sao_Paulo");
      expect(await marker(page)).toBeNull();
      const restored = authResponse(page, "/api/auth/refresh");
      await page.reload();
      expect((await sessionFrom(await restored)).user.companyId).toBe(b.user.companyId);
      await contextIs(page, locale, companyB, "Europe/London");
    } finally {
      await held.dispose();
      await second.close();
    }
  });
});
