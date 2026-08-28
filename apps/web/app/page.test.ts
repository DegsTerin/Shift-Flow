// en-GB: Exercises the real page orchestration across request, pagination and session boundaries.
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityItem, DashboardConfiguration, LoginResponse } from "./lib/types";

const hookBridge = vi.hoisted(() => ({
  useState: (initial: unknown): unknown => {
    void initial;
    throw new Error("Hook runtime is not installed");
  },
  useRef: (initial: unknown): unknown => {
    void initial;
    throw new Error("Hook runtime is not installed");
  },
  useMemo: (factory: () => unknown, dependencies: readonly unknown[]): unknown => {
    void factory;
    void dependencies;
    throw new Error("Hook runtime is not installed");
  },
  useCallback: (callback: unknown, dependencies: readonly unknown[]): unknown => {
    void callback;
    void dependencies;
    throw new Error("Hook runtime is not installed");
  },
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]): void => {
    void effect;
    void dependencies;
    throw new Error("Hook runtime is not installed");
  },
  useLayoutEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]): void => {
    void effect;
    void dependencies;
    throw new Error("Hook runtime is not installed");
  }
}));

const apiBridge = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  restoreApiSession: vi.fn()
}));

const pageDataBridge = vi.hoisted(() => ({
  fetchPageData: vi.fn(),
  fetchManagementData: vi.fn(),
  fetchReferenceData: vi.fn(),
  fetchRbacData: vi.fn(),
  fetchUnreadData: vi.fn()
}));

vi.mock("react", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useState: (initial: unknown) => hookBridge.useState(initial),
    useRef: (initial: unknown) => hookBridge.useRef(initial),
    useMemo: (factory: () => unknown, dependencies: readonly unknown[]) =>
      hookBridge.useMemo(factory, dependencies),
    useCallback: (callback: unknown, dependencies: readonly unknown[]) =>
      hookBridge.useCallback(callback, dependencies),
    useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) =>
      hookBridge.useEffect(effect, dependencies),
    useLayoutEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) =>
      hookBridge.useLayoutEffect(effect, dependencies)
  };
});

vi.mock("./lib/api", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiBridge.apiRequest(...args),
    restoreApiSession: () => apiBridge.restoreApiSession()
  };
});

vi.mock("./lib/page-data", () => ({
  activityTablePageSize: 12,
  kanbanPageSize: 100,
  managementPageSize: 12,
  rbacPageSize: 12,
  isManagementView: (view: string) => ["users", "clients", "teams", "shifts"].includes(view),
  lastPageForTotal: (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize)),
  fetchPageData: (...args: unknown[]) => pageDataBridge.fetchPageData(...args),
  fetchManagementData: (...args: unknown[]) => pageDataBridge.fetchManagementData(...args),
  fetchReferenceData: (...args: unknown[]) => pageDataBridge.fetchReferenceData(...args),
  fetchRbacData: (...args: unknown[]) => pageDataBridge.fetchRbacData(...args),
  fetchUnreadData: (...args: unknown[]) => pageDataBridge.fetchUnreadData(...args)
}));

import Page from "./page";
import { ActivityList, ManagementTable } from "./components/lists";
import { FilterBar, IconToggle, ReferenceSelectInput, Select } from "./components/controls";
import { RecordModal } from "./components/record-modal";
import { RoleManagementView } from "./components/role-management-view";
import { KanbanBoard, MainDashboard, ReportsView, TeamDashboard } from "./components/views";
import { captureApiSessionEpoch, clearApiSession, setApiSession } from "./lib/api";
import { messages } from "./lib/i18n";

type StateSlot = { kind: "state"; value: unknown };
type RefSlot = { kind: "ref"; value: { current: unknown } };
type MemoSlot = { kind: "memo"; value: unknown; dependencies: readonly unknown[] };
type EffectSlot = {
  kind: "effect";
  phase: "layout" | "passive";
  dependencies: readonly unknown[];
  cleanup?: () => void;
};
type HookSlot = StateSlot | RefSlot | MemoSlot | EffectSlot;

function dependenciesMatch(left: readonly unknown[], right: readonly unknown[]) {
  return (
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  );
}

class HookRuntime {
  private cursor = 0;
  private readonly slots: HookSlot[] = [];
  private pendingLayoutEffects: Array<() => void> = [];
  private pendingPassiveEffects: Array<() => void> = [];

  useState(initial: unknown) {
    const index = this.cursor++;
    if (!this.slots[index]) {
      this.slots[index] = {
        kind: "state",
        value: typeof initial === "function" ? (initial as () => unknown)() : initial
      };
    }
    const slot = this.slots[index] as StateSlot;
    return [
      slot.value,
      (next: unknown) => {
        slot.value =
          typeof next === "function" ? (next as (previous: unknown) => unknown)(slot.value) : next;
      }
    ];
  }

  useRef(initial: unknown) {
    const index = this.cursor++;
    if (!this.slots[index]) {
      this.slots[index] = { kind: "ref", value: { current: initial } };
    }
    return (this.slots[index] as RefSlot).value;
  }

  useMemo(factory: () => unknown, dependencies: readonly unknown[]) {
    const index = this.cursor++;
    const current = this.slots[index] as MemoSlot | undefined;
    if (!current || !dependenciesMatch(current.dependencies, dependencies)) {
      const value = factory();
      this.slots[index] = { kind: "memo", value, dependencies };
      return value;
    }
    return current.value;
  }

  useCallback(callback: unknown, dependencies: readonly unknown[]) {
    return this.useMemo(() => callback, dependencies);
  }

  useEffect(effect: () => void | (() => void), dependencies: readonly unknown[]) {
    const index = this.cursor++;
    const current = this.slots[index] as EffectSlot | undefined;
    if (current?.phase === "passive" && dependenciesMatch(current.dependencies, dependencies))
      return;
    this.pendingPassiveEffects.push(() => {
      current?.cleanup?.();
      const cleanup = effect();
      this.slots[index] = {
        kind: "effect",
        phase: "passive",
        dependencies,
        ...(typeof cleanup === "function" ? { cleanup } : {})
      };
    });
  }

  useLayoutEffect(effect: () => void | (() => void), dependencies: readonly unknown[]) {
    const index = this.cursor++;
    const current = this.slots[index] as EffectSlot | undefined;
    if (current?.phase === "layout" && dependenciesMatch(current.dependencies, dependencies))
      return;
    this.pendingLayoutEffects.push(() => {
      current?.cleanup?.();
      const cleanup = effect();
      this.slots[index] = {
        kind: "effect",
        phase: "layout",
        dependencies,
        ...(typeof cleanup === "function" ? { cleanup } : {})
      };
    });
  }

  render() {
    const tree = this.renderThroughLayout();
    this.flushPassiveEffects();
    return tree;
  }

  renderThroughLayout() {
    this.cursor = 0;
    this.pendingLayoutEffects = [];
    this.pendingPassiveEffects = [];
    const tree = Page();
    const layoutEffects = this.pendingLayoutEffects;
    this.pendingLayoutEffects = [];
    layoutEffects.forEach((effect) => effect());
    return tree;
  }

  flushPassiveEffects() {
    const passiveEffects = this.pendingPassiveEffects;
    this.pendingPassiveEffects = [];
    passiveEffects.forEach((effect) => effect());
  }

  renderWithoutEffects() {
    this.cursor = 0;
    this.pendingLayoutEffects = [];
    this.pendingPassiveEffects = [];
    const tree = Page();
    this.pendingLayoutEffects = [];
    this.pendingPassiveEffects = [];
    return tree;
  }

  cleanup() {
    this.slots.forEach((slot) => {
      if (slot.kind === "effect") slot.cleanup?.();
    });
  }
}

class FakeClock {
  private now = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { at: number; callback: () => void }>();

  setTimeout(callback: () => void, delay = 0) {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + delay, callback });
    return id;
  }

  clearTimeout(id: number) {
    this.tasks.delete(id);
  }

  advanceBy(milliseconds: number) {
    const target = this.now + milliseconds;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!next) break;
      const [id, task] = next;
      this.tasks.delete(id);
      this.now = task.at;
      task.callback();
    }
    this.now = target;
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function elements(node: unknown): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement;
  return [element, ...elements((element.props as { children?: unknown }).children)];
}

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return textOf(((node as ReactElement).props as { children?: unknown }).children);
}

function findByType(tree: ReactElement, type: unknown) {
  const match = elements(tree).find((element) => element.type === type);
  if (!match) throw new Error("Expected component was not found");
  return match;
}

function findIconToggle(tree: ReactElement, label: string) {
  const match = elements(tree).find(
    (element) =>
      element.type === IconToggle && (element.props as { label?: string }).label === label
  );
  if (!match) throw new Error(`Icon toggle not found: ${label}`);
  return match;
}

function findButton(tree: ReactElement, label: string) {
  const match = elements(tree).find(
    (element) => element.type === "button" && textOf(element).trim() === label
  );
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

function clickButton(tree: ReactElement, label: string) {
  const button = findButton(tree, label);
  (button.props as { onClick: () => void }).onClick();
}

function activity(id: string, status = "PENDING"): ActivityItem {
  return { id, title: id, status, updatedAt: "2026-08-27T12:00:00.000Z" };
}

function session(): LoginResponse {
  return {
    accessToken: "access-token",
    user: {
      id: "user-a",
      email: "user-a@example.com",
      companyId: "company-a",
      permissions: ["dashboard:read", "activities:read", "activities:write", "notifications:read"]
    }
  };
}

function scopedSession(
  permissions: string[],
  userId = "user-a",
  companyId = "company-a"
): LoginResponse {
  return {
    accessToken: `${userId}-access-token`,
    user: {
      id: userId,
      email: `${userId}@example.com`,
      companyId,
      permissions
    }
  };
}

const charts = { byTeam: [], byClient: [], byStatus: [], byPriority: [], byShift: [] };
const layouts = {
  MAIN: { dashboardType: "MAIN", gridColumns: 12, gridGap: 16, widgets: [] },
  TEAM: { dashboardType: "TEAM", gridColumns: 12, gridGap: 16, widgets: [] }
} as Record<"MAIN" | "TEAM", DashboardConfiguration>;

function dashboardSnapshot(id: string, total: number) {
  return {
    dashboard: {
      summary: {
        total,
        pending: 0,
        inProgress: 0,
        done: 0,
        critical: 0,
        slaAtRisk: 0,
        overdue: 0,
        averageResolutionHours: 0
      },
      charts,
      operationalActivities: [activity(id)],
      layouts
    },
    activities: undefined,
    clients: undefined,
    users: undefined,
    teams: undefined,
    shifts: undefined,
    rbac: undefined,
    unread: undefined
  };
}

function activitySnapshot(items: ActivityItem[], total: number, page = 1, pageSize = 12) {
  return {
    dashboard: undefined,
    activities: { items, total, page, pageSize },
    clients: undefined,
    users: undefined,
    teams: undefined,
    shifts: undefined,
    rbac: undefined,
    unread: undefined
  };
}

function reportSnapshot(total: number) {
  return {
    report: { total, byStatus: [], byPriority: [] },
    errors: []
  };
}

describe("Page request lifecycle", () => {
  let runtime: HookRuntime;
  let clock: FakeClock;

  async function authenticate(nextSession = session()) {
    runtime.render();
    setApiSession(nextSession);
    await flushPromises();
    runtime.render();
    await flushPromises();
    return runtime.render();
  }

  beforeEach(() => {
    clearApiSession();
    runtime = new HookRuntime();
    clock = new FakeClock();
    hookBridge.useState = runtime.useState.bind(runtime);
    hookBridge.useRef = runtime.useRef.bind(runtime);
    hookBridge.useMemo = runtime.useMemo.bind(runtime);
    hookBridge.useCallback = runtime.useCallback.bind(runtime);
    hookBridge.useEffect = runtime.useEffect.bind(runtime);
    hookBridge.useLayoutEffect = runtime.useLayoutEffect.bind(runtime);
    apiBridge.apiRequest.mockReset();
    apiBridge.restoreApiSession.mockReset().mockResolvedValue(undefined);
    pageDataBridge.fetchPageData.mockReset().mockResolvedValue(dashboardSnapshot("default", 1));
    pageDataBridge.fetchManagementData
      .mockReset()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 12 });
    pageDataBridge.fetchReferenceData.mockReset().mockResolvedValue({});
    pageDataBridge.fetchRbacData.mockReset().mockResolvedValue(undefined);
    pageDataBridge.fetchUnreadData.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn() });
    vi.stubGlobal("document", { documentElement: { lang: "pt-BR" }, title: "" });
    vi.stubGlobal("window", {
      setTimeout: clock.setTimeout.bind(clock),
      clearTimeout: clock.clearTimeout.bind(clock),
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
      matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      print: vi.fn()
    });
  });

  afterEach(() => {
    runtime.cleanup();
    clearApiSession();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("marks the rendered application subtree with the active locale", async () => {
    let tree = runtime.render();
    expect((tree.props as { lang?: string }).lang).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(document.title).toBe(`${messages["pt-BR"].loginTitle} | ShiftFlow`);

    tree = await authenticate();
    expect((tree.props as { lang?: string }).lang).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(document.title).toBe(`${messages["pt-BR"].dashboard} | ShiftFlow`);

    clickButton(tree, messages["pt-BR"].activities);
    tree = runtime.render();
    expect(document.title).toBe(`${messages["pt-BR"].activities} | ShiftFlow`);

    (findIconToggle(tree, "pt-BR").props as { onClick: () => void }).onClick();
    tree = runtime.render();

    expect((tree.props as { lang?: string }).lang).toBe("en-GB");
    expect(document.documentElement.lang).toBe("en-GB");
    expect(document.title).toBe(`${messages["en-GB"].activities} | ShiftFlow`);
    expect(findIconToggle(tree, messages["en-GB"].signOut)).toBeDefined();
  });

  it("commits only the latest complete page snapshot", async () => {
    const first = deferred<ReturnType<typeof dashboardSnapshot>>();
    const second = deferred<ReturnType<typeof dashboardSnapshot>>();
    pageDataBridge.fetchPageData
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    let tree = await authenticate();
    const refresh = elements(tree).find(
      (element) =>
        element.type === IconToggle &&
        (element.props as { label?: string }).label === messages["pt-BR"].refresh
    );
    if (!refresh) throw new Error("Refresh control was not found");
    (refresh.props as { onClick: () => void }).onClick();

    second.resolve(dashboardSnapshot("new-snapshot", 2));
    await flushPromises();
    tree = runtime.render();
    let dashboard = findByType(tree, MainDashboard);
    expect((dashboard.props as { summary: { total: number } }).summary.total).toBe(2);
    expect((dashboard.props as { activities: ActivityItem[] }).activities[0]?.id).toBe(
      "new-snapshot"
    );

    first.resolve(dashboardSnapshot("stale-snapshot", 1));
    await flushPromises();
    tree = runtime.render();
    dashboard = findByType(tree, MainDashboard);
    expect((dashboard.props as { summary: { total: number } }).summary.total).toBe(2);
    expect((dashboard.props as { activities: ActivityItem[] }).activities[0]?.id).toBe(
      "new-snapshot"
    );
  });

  it("keeps the active view load running when its navigation item is selected again", async () => {
    const pendingDashboard = deferred<ReturnType<typeof dashboardSnapshot>>();
    let requestSignal: AbortSignal | undefined;
    pageDataBridge.fetchPageData.mockReset().mockImplementationOnce((input: unknown) => {
      requestSignal = (input as { signal?: AbortSignal }).signal;
      return pendingDashboard.promise;
    });
    let tree = await authenticate();

    clickButton(tree, messages["pt-BR"].dashboard);
    runtime.render();
    expect(requestSignal?.aborted).toBe(false);
    expect(pageDataBridge.fetchPageData).toHaveBeenCalledOnce();

    pendingDashboard.resolve(dashboardSnapshot("completed-active-view", 7));
    await flushPromises();
    tree = runtime.render();
    const dashboard = findByType(tree, MainDashboard);
    expect((dashboard.props as { summary: { total: number } }).summary.total).toBe(7);
    expect((dashboard.props as { activities: ActivityItem[] }).activities[0]?.id).toBe(
      "completed-active-view"
    );
  });

  it("renders reports from its own capability without exposing unsupported query controls", async () => {
    pageDataBridge.fetchPageData.mockReset().mockResolvedValue(reportSnapshot(9));
    await authenticate(scopedSession(["reports:read"]));
    await flushPromises();
    const tree = runtime.render();
    const report = findByType(tree, ReportsView);
    const filterBar = findByType(tree, FilterBar);
    const visibleFilters = (filterBar.props as { visibleFilters: ReadonlySet<string> })
      .visibleFilters;
    const renderedFilterBar = FilterBar(filterBar.props as Parameters<typeof FilterBar>[0]);
    const renderedSelectLabels = elements(renderedFilterBar)
      .filter((element) => element.type === Select || element.type === ReferenceSelectInput)
      .map((element) => (element.props as { label: string }).label);
    const renderedDateLabels = elements(renderedFilterBar)
      .filter((element) => element.type === "input")
      .map((element) => (element.props as { "aria-label"?: string })["aria-label"]);

    expect((report.props as { summary: { total: number } }).summary.total).toBe(9);
    expect([...visibleFilters]).toEqual(["clientId", "teamId", "shiftId", "status", "from", "to"]);
    expect(renderedSelectLabels).toEqual([
      messages["pt-BR"].filterClient,
      messages["pt-BR"].filterTeam,
      messages["pt-BR"].filterShift,
      messages["pt-BR"].filterStatus
    ]);
    expect(renderedDateLabels).toEqual([
      messages["pt-BR"].filterStartDate,
      messages["pt-BR"].filterEndDate
    ]);
    expect(
      elements(tree).some(
        (element) =>
          element.type === "input" &&
          (element.props as { "aria-label"?: string })["aria-label"] === messages["pt-BR"].search
      )
    ).toBe(false);
  });

  it("cancels a pending search debounce when the committed view changes", async () => {
    pageDataBridge.fetchPageData.mockReset().mockResolvedValue(activitySnapshot([], 0));
    let tree = await authenticate(scopedSession(["activities:read", "reports:read"]));
    const search = elements(tree).find(
      (element) =>
        element.type === "input" &&
        (element.props as { "aria-label"?: string })["aria-label"] === messages["pt-BR"].search
    );
    if (!search) throw new Error("Search input was not found");

    (search.props as { onChange: (event: { target: { value: string } }) => void }).onChange({
      target: { value: "stale activity search" }
    });
    tree = runtime.render();
    clock.advanceBy(299);
    clickButton(tree, messages["pt-BR"].reports);
    runtime.render();
    await flushPromises();
    runtime.render();
    const callsAfterReportCommit = pageDataBridge.fetchPageData.mock.calls.length;

    clock.advanceBy(1000);
    await flushPromises();
    runtime.render();

    expect(pageDataBridge.fetchPageData).toHaveBeenCalledTimes(callsAfterReportCommit);
    expect(
      pageDataBridge.fetchPageData.mock.calls.some(
        ([request]) => (request as { search?: string }).search === "stale activity search"
      )
    ).toBe(false);
  });

  it("surfaces resolved lane errors and clears them after a successful reload", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce({
        ...dashboardSnapshot("degraded", 1),
        errors: [new Error("Resolved dashboard lane failure")]
      })
      .mockResolvedValue(dashboardSnapshot("recovered", 2));
    let tree = await authenticate(scopedSession(["dashboard:read"]));

    expect(textOf(tree)).toContain("Resolved dashboard lane failure");
    (findIconToggle(tree, messages["pt-BR"].refresh).props as { onClick: () => void }).onClick();
    await flushPromises();
    tree = runtime.render();

    expect(textOf(tree)).not.toContain("Resolved dashboard lane failure");
    expect(
      (findByType(tree, MainDashboard).props as { summary: { total: number } }).summary.total
    ).toBe(2);
  });

  it("blocks an inverted date-only range and performs one load after correction", async () => {
    let tree = await authenticate(scopedSession(["dashboard:read"]));
    let filterBar = findByType(tree, FilterBar);
    const initialProps = filterBar.props as {
      filters: Parameters<typeof FilterBar>[0]["filters"];
      setFilters: Parameters<typeof FilterBar>[0]["setFilters"];
    };
    const loadsBeforeInvalidRange = pageDataBridge.fetchPageData.mock.calls.length;

    initialProps.setFilters({
      ...initialProps.filters,
      from: "2026-08-28",
      to: "2026-08-27"
    });
    runtime.render();
    await flushPromises();
    tree = runtime.render();

    expect(pageDataBridge.fetchPageData).toHaveBeenCalledTimes(loadsBeforeInvalidRange);
    filterBar = findByType(tree, FilterBar);
    expect(textOf(FilterBar(filterBar.props as Parameters<typeof FilterBar>[0]))).toContain(
      messages["pt-BR"].invalidDateRange
    );

    const invalidProps = filterBar.props as {
      filters: Parameters<typeof FilterBar>[0]["filters"];
      setFilters: Parameters<typeof FilterBar>[0]["setFilters"];
    };
    invalidProps.setFilters({ ...invalidProps.filters, to: "2026-08-28" });
    runtime.render();
    await flushPromises();
    tree = runtime.render();

    expect(pageDataBridge.fetchPageData).toHaveBeenCalledTimes(loadsBeforeInvalidRange + 1);
    filterBar = findByType(tree, FilterBar);
    expect(textOf(FilterBar(filterBar.props as Parameters<typeof FilterBar>[0]))).not.toContain(
      messages["pt-BR"].invalidDateRange
    );
  });

  it("keeps operational data separate and wires server pagination through Page", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("page-one")], 30, 1))
      .mockResolvedValueOnce(activitySnapshot([activity("page-two")], 30, 2));
    let tree = await authenticate();
    expect(
      (findByType(tree, MainDashboard).props as { activities: ActivityItem[] }).activities[0]?.id
    ).toBe("operational");

    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    let list = findByType(tree, ActivityList);
    expect((list.props as { activities: ActivityItem[] }).activities[0]?.id).toBe("page-one");
    const firstPagination = (
      list.props as {
        pagination: {
          page: number;
          pageSize: number;
          total: number;
          onPage: (page: number) => void;
        };
      }
    ).pagination;
    expect(firstPagination).toMatchObject({ page: 1, pageSize: 12, total: 30 });

    firstPagination.onPage(2);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const lastRequest = pageDataBridge.fetchPageData.mock.calls.at(-1)?.[0] as {
      activityPage: number;
      view: string;
    };
    expect(lastRequest).toMatchObject({ activityPage: 2, view: "activities" });
    list = findByType(tree, ActivityList);
    expect((list.props as { activities: ActivityItem[] }).activities[0]?.id).toBe("page-two");
  });

  it("keeps the confirmed page and rows together when a requested page fails", async () => {
    const failedPage = deferred<ReturnType<typeof activitySnapshot>>();
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("page-one")], 30, 1))
      .mockImplementationOnce(() => failedPage.promise)
      .mockResolvedValueOnce(activitySnapshot([activity("page-two-retry")], 30, 2));
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const pagination = (
      findByType(tree, ActivityList).props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination;

    pagination.onPage(2);
    tree = runtime.render();
    let list = findByType(tree, ActivityList);
    expect((list.props as { pagination: { page: number } }).pagination.page).toBe(1);
    expect((list.props as { activities: ActivityItem[] }).activities[0]?.id).toBe("page-one");

    failedPage.reject(new Error("page two failed"));
    await flushPromises();
    tree = runtime.render();
    list = findByType(tree, ActivityList);
    expect((list.props as { pagination: { page: number } }).pagination.page).toBe(1);
    expect((list.props as { activities: ActivityItem[] }).activities[0]?.id).toBe("page-one");
    expect(textOf(tree)).toContain("page two failed");

    const retryPagination = (
      list.props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination;
    retryPagination.onPage(2);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const requestedPages = pageDataBridge.fetchPageData.mock.calls
      .map(([input]) => input as { view: string; activityPage: number })
      .filter(({ view }) => view === "activities")
      .map(({ activityPage }) => activityPage);
    expect(requestedPages).toEqual([1, 2, 2]);
    list = findByType(tree, ActivityList);
    expect((list.props as { pagination: { page: number } }).pagination.page).toBe(2);
    expect((list.props as { activities: ActivityItem[] }).activities[0]?.id).toBe("page-two-retry");
  });

  it("refetches the last valid activity page before committing a shrunken result", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("page-one")], 25, 1))
      .mockResolvedValueOnce(activitySnapshot([], 24, 3))
      .mockResolvedValueOnce(activitySnapshot([activity("recovered-page-two")], 24, 2));
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const pageOne = (
      findByType(tree, ActivityList).props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination;

    pageOne.onPage(3);
    runtime.render();
    await flushPromises();
    runtime.render();
    await flushPromises();
    tree = runtime.render();

    const requestedPages = pageDataBridge.fetchPageData.mock.calls
      .map(([input]) => input as { view: string; activityPage: number })
      .filter(({ view }) => view === "activities")
      .map(({ activityPage }) => activityPage);
    expect(requestedPages).toEqual([1, 3, 2]);
    const list = findByType(tree, ActivityList);
    expect((list.props as { activities: ActivityItem[] }).activities[0]?.id).toBe(
      "recovered-page-two"
    );
    expect((list.props as { pagination: { page: number } }).pagination.page).toBe(2);
  });

  it("never labels stale rows as the recovered page when shrink recovery fails", async () => {
    const failedRecovery = deferred<ReturnType<typeof activitySnapshot>>();
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("page-one")], 25, 1))
      .mockResolvedValueOnce(activitySnapshot([], 24, 3))
      .mockImplementationOnce(() => failedRecovery.promise);
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const pagination = (
      findByType(tree, ActivityList).props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination;

    pagination.onPage(3);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    let list = findByType(tree, ActivityList);
    expect((list.props as { pagination: { page: number } }).pagination.page).toBe(2);
    expect((list.props as { activities: ActivityItem[] }).activities).toEqual([]);

    failedRecovery.reject(new Error("recovery failed"));
    await flushPromises();
    tree = runtime.render();
    list = findByType(tree, ActivityList);
    expect((list.props as { pagination: { page: number } }).pagination.page).toBe(2);
    expect((list.props as { activities: ActivityItem[] }).activities).toEqual([]);
    expect(textOf(tree)).toContain("recovery failed");
  });

  it("makes Kanban records beyond the first bounded page reachable", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("kanban-page-one")], 101, 1, 100))
      .mockResolvedValueOnce(activitySnapshot([activity("kanban-page-two")], 101, 2, 100));
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].kanban);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    let board = findByType(tree, KanbanBoard);
    const pagination = (
      board.props as {
        pagination: {
          page: number;
          pageSize: number;
          total: number;
          onPage: (page: number) => void;
        };
      }
    ).pagination;
    expect(pagination).toMatchObject({ page: 1, pageSize: 100, total: 101 });

    pagination.onPage(2);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const lastRequest = pageDataBridge.fetchPageData.mock.calls.at(-1)?.[0] as {
      kanbanPage: number;
      view: string;
    };
    expect(lastRequest).toMatchObject({ kanbanPage: 2, view: "kanban" });
    board = findByType(tree, KanbanBoard);
    expect((board.props as { activities: ActivityItem[] }).activities[0]?.id).toBe(
      "kanban-page-two"
    );
  });

  it("retries the same rejected Kanban page as a new request intent", async () => {
    const failedPage = deferred<ReturnType<typeof activitySnapshot>>();
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("kanban-page-one")], 150, 1, 100))
      .mockImplementationOnce(() => failedPage.promise)
      .mockResolvedValueOnce(activitySnapshot([activity("kanban-page-two-retry")], 150, 2, 100));
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].kanban);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    let board = findByType(tree, KanbanBoard);
    const pageOne = (
      board.props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination;

    pageOne.onPage(2);
    failedPage.reject(new Error("kanban page two failed"));
    await flushPromises();
    tree = runtime.render();
    board = findByType(tree, KanbanBoard);
    expect((board.props as { pagination: { page: number } }).pagination.page).toBe(1);
    expect((board.props as { activities: ActivityItem[] }).activities[0]?.id).toBe(
      "kanban-page-one"
    );

    (
      board.props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination.onPage(2);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const requestedPages = pageDataBridge.fetchPageData.mock.calls
      .map(([input]) => input as { view: string; kanbanPage: number })
      .filter(({ view }) => view === "kanban")
      .map(({ kanbanPage }) => kanbanPage);
    expect(requestedPages).toEqual([1, 2, 2]);
    board = findByType(tree, KanbanBoard);
    expect((board.props as { pagination: { page: number } }).pagination.page).toBe(2);
    expect((board.props as { activities: ActivityItem[] }).activities[0]?.id).toBe(
      "kanban-page-two-retry"
    );
  });

  it("commits an activity page independently from a failing unread lane", async () => {
    const unreadRequest = deferred<{ unread: number }>();
    pageDataBridge.fetchUnreadData.mockReset().mockImplementationOnce(() => unreadRequest.promise);
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("independent-page")], 1, 1));
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    expect(
      (findByType(tree, ActivityList).props as { activities: ActivityItem[] }).activities[0]?.id
    ).toBe("independent-page");
    expect(textOf(tree)).not.toContain(messages["pt-BR"].loading);

    unreadRequest.reject(new Error("unread lane failed"));
    await flushPromises();
    tree = runtime.render();
    expect(
      (findByType(tree, ActivityList).props as { activities: ActivityItem[] }).activities[0]?.id
    ).toBe("independent-page");
    expect(textOf(tree)).toContain("unread lane failed");
  });

  it("renders a resolved management lane while references remain pending and refreshes references", async () => {
    const references = deferred<{
      users: { items: Array<{ id: string; email: string }>; total: number };
    }>();
    pageDataBridge.fetchReferenceData
      .mockReset()
      .mockImplementationOnce(() => references.promise)
      .mockResolvedValue({
        users: { items: [{ id: "user-a", email: "a@example.com" }], total: 1 }
      });
    let tree = await authenticate(scopedSession(["dashboard:read", "users:read"]));

    clickButton(tree, messages["pt-BR"].users);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    expect(elements(tree).some((element) => element.type === ManagementTable)).toBe(true);
    expect(textOf(tree)).not.toContain(messages["pt-BR"].loading);

    references.resolve({ users: { items: [{ id: "user-a", email: "a@example.com" }], total: 1 } });
    await flushPromises();
    tree = runtime.render();
    expect(elements(tree).some((element) => element.type === ManagementTable)).toBe(true);
    expect(textOf(tree)).not.toContain(messages["pt-BR"].loading);

    const pageLoadsBeforeRefresh = pageDataBridge.fetchPageData.mock.calls.length;
    const referenceLoadsBeforeRefresh = pageDataBridge.fetchReferenceData.mock.calls.length;
    (findIconToggle(tree, messages["pt-BR"].refresh).props as { onClick: () => void }).onClick();
    await flushPromises();

    expect(pageDataBridge.fetchReferenceData).toHaveBeenCalledTimes(
      referenceLoadsBeforeRefresh + 1
    );
    expect(pageDataBridge.fetchPageData).toHaveBeenCalledTimes(pageLoadsBeforeRefresh);
  });

  it("commits a reference resource before the aggregate reference load settles", async () => {
    const aggregate = deferred<Record<string, never>>();
    pageDataBridge.fetchReferenceData.mockImplementation(
      ({ onSettled }: { onSettled?: (settlement: unknown) => void }) => {
        onSettled?.({
          resource: "clients",
          value: {
            items: [{ id: "client-a", name: "Client A" }],
            total: 1,
            page: 1,
            pageSize: 25
          }
        });
        return aggregate.promise;
      }
    );

    await authenticate(scopedSession(["dashboard:read", "clients:read"]));
    await flushPromises();
    const tree = runtime.render();
    const filter = findByType(tree, FilterBar);

    expect((filter.props as { clients: Array<{ id: string; name: string }> }).clients).toEqual([
      { id: "client-a", name: "Client A" }
    ]);

    aggregate.resolve({});
    await flushPromises();
  });

  it("does not publish an unrelated reference failure into a resolved management view", async () => {
    pageDataBridge.fetchManagementData.mockResolvedValue({
      items: [{ id: "client-a", name: "Client A" }],
      total: 1,
      page: 1,
      pageSize: 12
    });
    pageDataBridge.fetchReferenceData.mockResolvedValue({
      clients: {
        items: [{ id: "client-a", name: "Client A" }],
        total: 1,
        page: 1,
        pageSize: 25
      },
      errors: { shifts: new Error("shifts lane failed") }
    });

    await authenticate(scopedSession(["clients:read", "shifts:read"]));
    await flushPromises();
    const tree = runtime.render();

    expect(
      (findByType(tree, ManagementTable).props as { rows: Array<{ id: string; name?: string }> })
        .rows
    ).toEqual([{ id: "client-a", name: "Client A" }]);
    expect(textOf(tree)).not.toContain("shifts lane failed");
  });

  it("navigates to the twenty-sixth management record through server pagination", async () => {
    pageDataBridge.fetchManagementData.mockImplementation(async ({ page }: { page: number }) => ({
      items:
        page === 2
          ? [{ id: "user-26", displayName: "User 26", email: "user26@example.com" }]
          : Array.from({ length: 12 }, (_, index) => ({
              id: `user-${index + 1}`,
              displayName: `User ${index + 1}`,
              email: `user${index + 1}@example.com`
            })),
      total: 26,
      page,
      pageSize: 12
    }));
    await authenticate(scopedSession(["users:read"]));
    await flushPromises();
    let tree = runtime.render();
    const firstTable = findByType(tree, ManagementTable);
    const pagination = (
      firstTable.props as {
        pagination: { onPage: (page: number) => void; total: number };
      }
    ).pagination;

    expect(pagination.total).toBe(26);
    pagination.onPage(2);
    runtime.render();
    await flushPromises();
    tree = runtime.render();

    expect(
      (findByType(tree, ManagementTable).props as { rows: Array<{ id: string }> }).rows
    ).toEqual([expect.objectContaining({ id: "user-26" })]);
    expect(pageDataBridge.fetchManagementData).toHaveBeenLastCalledWith(
      expect.objectContaining({ view: "users", page: 2 })
    );
  });

  it("retries the same rejected management page as a new request intent", async () => {
    const failedPage = deferred<{
      items: Array<{ id: string; displayName: string; email: string }>;
      total: number;
      page: number;
      pageSize: number;
    }>();
    pageDataBridge.fetchManagementData
      .mockReset()
      .mockResolvedValueOnce({
        items: [{ id: "user-1", displayName: "User 1", email: "user1@example.com" }],
        total: 26,
        page: 1,
        pageSize: 12
      })
      .mockImplementationOnce(() => failedPage.promise)
      .mockResolvedValueOnce({
        items: [{ id: "user-13", displayName: "User 13", email: "user13@example.com" }],
        total: 26,
        page: 2,
        pageSize: 12
      });
    await authenticate(scopedSession(["users:read"]));
    await flushPromises();
    let tree = runtime.render();
    let table = findByType(tree, ManagementTable);
    const pageOne = (
      table.props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination;

    pageOne.onPage(2);
    runtime.render();
    failedPage.reject(new Error("management page two failed"));
    await flushPromises();
    tree = runtime.render();
    table = findByType(tree, ManagementTable);
    expect((table.props as { pagination: { page: number } }).pagination.page).toBe(1);
    expect((table.props as { rows: Array<{ id: string }> }).rows[0]?.id).toBe("user-1");
    expect(textOf(tree)).toContain("management page two failed");

    (
      table.props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination.onPage(2);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const requestedPages = pageDataBridge.fetchManagementData.mock.calls.map(
      ([input]) => (input as { page: number }).page
    );
    expect(requestedPages).toEqual([1, 2, 2]);
    table = findByType(tree, ManagementTable);
    expect((table.props as { pagination: { page: number } }).pagination.page).toBe(2);
    expect((table.props as { rows: Array<{ id: string }> }).rows[0]?.id).toBe("user-13");
    expect(textOf(tree)).not.toContain("management page two failed");
  });

  it("does not expose a management error after Dashboard becomes the active view", async () => {
    pageDataBridge.fetchManagementData.mockRejectedValueOnce(new Error("users lane failed"));
    let tree = await authenticate(scopedSession(["dashboard:read", "users:read"]));
    clickButton(tree, messages["pt-BR"].users);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    expect(textOf(tree)).toContain("users lane failed");

    clickButton(tree, messages["pt-BR"].dashboard);
    runtime.render();
    await flushPromises();
    tree = runtime.render();

    expect(textOf(tree)).not.toContain("users lane failed");
    expect(elements(tree).some((element) => element.type === MainDashboard)).toBe(true);
  });

  it("does not expose a data-lane error in Settings", async () => {
    pageDataBridge.fetchPageData.mockRejectedValueOnce(new Error("dashboard lane failed"));
    let tree = await authenticate(scopedSession(["dashboard:read", "users:read"]));
    expect(textOf(tree)).toContain("dashboard lane failed");

    clickButton(tree, messages["pt-BR"].settings);
    tree = runtime.render();

    expect(textOf(tree)).not.toContain("dashboard lane failed");
  });

  it("issues the positive debounced management search instead of only cancelling", async () => {
    pageDataBridge.fetchManagementData.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 12
    });
    let tree = await authenticate(scopedSession(["users:read"]));
    const searchInput = elements(tree).find(
      (element) =>
        element.type === "input" &&
        (element.props as { "aria-label"?: string })["aria-label"] === messages["pt-BR"].search
    );
    if (!searchInput) throw new Error("Search input was not found");

    (searchInput.props as { onChange: (event: { target: { value: string } }) => void }).onChange({
      target: { value: "user-26" }
    });
    runtime.render();
    clock.advanceBy(300);
    runtime.render();
    await flushPromises();
    tree = runtime.render();

    expect(tree).toBeDefined();
    expect(pageDataBridge.fetchManagementData).toHaveBeenLastCalledWith(
      expect.objectContaining({ view: "users", page: 1, search: "user-26" })
    );
  });

  it("keeps the roles view factual while loading and refreshes its active lane", async () => {
    const rbac = deferred<{
      roles: { items: Array<{ id: string; name: string; scope: string }>; total: number };
      permissions: { items: never[]; total: number };
    }>();
    const rbacSnapshot = {
      roles: { items: [{ id: "role-a", name: "Role A", scope: "COMPANY" }], total: 1 },
      permissions: { items: [] as never[], total: 0 }
    };
    pageDataBridge.fetchRbacData
      .mockReset()
      .mockImplementationOnce(() => rbac.promise)
      .mockResolvedValue(rbacSnapshot);
    let tree = await authenticate(scopedSession(["dashboard:read", "rbac:read"]));

    clickButton(tree, messages["pt-BR"].roles);
    runtime.render();
    tree = runtime.render();
    expect(textOf(tree)).toContain(messages["pt-BR"].loading);
    expect(elements(tree).some((element) => element.type === RoleManagementView)).toBe(false);

    rbac.resolve(rbacSnapshot);
    await flushPromises();
    tree = runtime.render();
    expect(elements(tree).some((element) => element.type === RoleManagementView)).toBe(true);
    expect(textOf(tree)).not.toContain(messages["pt-BR"].loading);

    const pageLoadsBeforeRefresh = pageDataBridge.fetchPageData.mock.calls.length;
    const rbacLoadsBeforeRefresh = pageDataBridge.fetchRbacData.mock.calls.length;
    (findIconToggle(tree, messages["pt-BR"].refresh).props as { onClick: () => void }).onClick();
    await flushPromises();

    expect(pageDataBridge.fetchRbacData).toHaveBeenCalledTimes(rbacLoadsBeforeRefresh + 1);
    expect(pageDataBridge.fetchPageData).toHaveBeenCalledTimes(pageLoadsBeforeRefresh);
  });

  it("navigates to the twenty-sixth role through independent server pagination", async () => {
    pageDataBridge.fetchRbacData.mockImplementation(async ({ page }: { page: number }) => ({
      roles: {
        items: [
          {
            id: page === 3 ? "role-26" : "role-1",
            name: page === 3 ? "Role 26" : "Role 1",
            scope: "COMPANY"
          }
        ],
        total: 26,
        page,
        pageSize: 12
      },
      permissions: { items: [], total: 0, page: 1, pageSize: 100 }
    }));
    await authenticate(scopedSession(["rbac:read"]));
    await flushPromises();
    let tree = runtime.render();
    let roleView = findByType(tree, RoleManagementView);
    const pagination = (
      roleView.props as {
        pagination: { onPage: (page: number) => void; total: number };
      }
    ).pagination;

    expect(pagination.total).toBe(26);
    pagination.onPage(3);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    roleView = findByType(tree, RoleManagementView);

    expect((roleView.props as { roles: Array<{ id: string }> }).roles).toEqual([
      expect.objectContaining({ id: "role-26" })
    ]);
    expect(pageDataBridge.fetchRbacData).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 3 })
    );
  });

  it("retries the same rejected role page without relabelling confirmed roles", async () => {
    const failedPage = deferred<{
      roles: {
        items: Array<{ id: string; name: string; scope: string }>;
        total: number;
        page: number;
        pageSize: number;
      };
      permissions: { items: never[]; total: number; page: number; pageSize: number };
    }>();
    const rbacPage = (page: number, id: string) => ({
      roles: {
        items: [{ id, name: id, scope: "COMPANY" }],
        total: 26,
        page,
        pageSize: 12
      },
      permissions: { items: [] as never[], total: 0, page: 1, pageSize: 100 }
    });
    pageDataBridge.fetchRbacData
      .mockReset()
      .mockResolvedValueOnce(rbacPage(1, "role-1"))
      .mockResolvedValueOnce(rbacPage(2, "role-13"))
      .mockImplementationOnce(() => failedPage.promise)
      .mockResolvedValueOnce(rbacPage(3, "role-26"));
    await authenticate(scopedSession(["rbac:read"]));
    await flushPromises();
    let tree = runtime.render();
    let roleView = findByType(tree, RoleManagementView);

    (
      roleView.props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination.onPage(2);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    roleView = findByType(tree, RoleManagementView);
    expect((roleView.props as { roles: Array<{ id: string }> }).roles[0]?.id).toBe("role-13");

    (
      roleView.props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination.onPage(3);
    runtime.render();
    failedPage.reject(new Error("role page three failed"));
    await flushPromises();
    tree = runtime.render();
    roleView = findByType(tree, RoleManagementView);
    expect((roleView.props as { pagination: { page: number } }).pagination.page).toBe(2);
    expect((roleView.props as { roles: Array<{ id: string }> }).roles[0]?.id).toBe("role-13");
    expect(textOf(tree)).toContain("role page three failed");

    (
      roleView.props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination.onPage(3);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    roleView = findByType(tree, RoleManagementView);
    const requestedPages = pageDataBridge.fetchRbacData.mock.calls.map(
      ([input]) => (input as { page: number }).page
    );
    expect(requestedPages).toEqual([1, 2, 3, 3]);
    expect((roleView.props as { pagination: { page: number } }).pagination.page).toBe(3);
    expect((roleView.props as { roles: Array<{ id: string }> }).roles[0]?.id).toBe("role-26");
    expect(textOf(tree)).not.toContain("role page three failed");
  });

  it("renders the Main Dashboard from the same paged team directory it navigates", async () => {
    pageDataBridge.fetchPageData.mockImplementation(async ({ teamPage }: { teamPage: number }) => ({
      ...dashboardSnapshot("dashboard", 1),
      teamDirectory: {
        items: [
          {
            id: teamPage === 2 ? "team-13" : "team-1",
            name: teamPage === 2 ? "Team 13" : "Team 1"
          }
        ],
        total: 13,
        page: teamPage,
        pageSize: 12
      }
    }));
    await authenticate(scopedSession(["dashboard:read", "teams:read"]));
    await flushPromises();
    let tree = runtime.render();
    let dashboard = findByType(tree, MainDashboard);
    expect((dashboard.props as { teams: Array<{ id: string }> }).teams[0]?.id).toBe("team-1");
    const pagination = (
      dashboard.props as {
        pagination: { onPage: (page: number) => void; total: number };
      }
    ).pagination;

    expect(pagination.total).toBe(13);
    pagination.onPage(2);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    dashboard = findByType(tree, MainDashboard);

    expect((dashboard.props as { teams: Array<{ id: string }> }).teams).toEqual([
      expect.objectContaining({ id: "team-13" })
    ]);
    expect(pageDataBridge.fetchPageData).toHaveBeenLastCalledWith(
      expect.objectContaining({ view: "dashboard", teamPage: 2 })
    );
  });

  it("navigates the Team Dashboard to a team available only on the third server page", async () => {
    pageDataBridge.fetchPageData.mockImplementation(
      async ({ view, teamPage }: { view: string; teamPage: number }) => ({
        ...dashboardSnapshot(view === "team-dashboard" ? "team-operational" : "dashboard", 1),
        teamDirectory:
          view === "team-dashboard"
            ? {
                items: [
                  {
                    id: teamPage === 3 ? "team-26" : "team-1",
                    name: teamPage === 3 ? "Team 26" : "Team 1"
                  }
                ],
                total: 26,
                page: teamPage,
                pageSize: 12
              }
            : undefined
      })
    );
    let tree = await authenticate(scopedSession(["dashboard:read", "teams:read"]));
    clickButton(tree, messages["pt-BR"].teamDashboard);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    let teamDashboard = findByType(tree, TeamDashboard);
    const pagination = (
      teamDashboard.props as {
        pagination: { onPage: (page: number) => void; total: number };
      }
    ).pagination;

    expect(pagination.total).toBe(26);
    pagination.onPage(3);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    teamDashboard = findByType(tree, TeamDashboard);

    expect((teamDashboard.props as { teams: Array<{ id: string }> }).teams).toEqual([
      expect.objectContaining({ id: "team-26" })
    ]);
    expect(pageDataBridge.fetchPageData).toHaveBeenLastCalledWith(
      expect.objectContaining({ view: "team-dashboard", teamPage: 3 })
    );
  });

  it("keeps Kanban page metadata factual when shrink recovery fails", async () => {
    const failedRecovery = deferred<ReturnType<typeof activitySnapshot>>();
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("kanban-page-one")], 201, 1, 100))
      .mockResolvedValueOnce(activitySnapshot([], 150, 3, 100))
      .mockImplementationOnce(() => failedRecovery.promise);
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].kanban);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const pagination = (
      findByType(tree, KanbanBoard).props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination;

    pagination.onPage(3);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    let board = findByType(tree, KanbanBoard);
    expect((board.props as { pagination: { page: number } }).pagination.page).toBe(2);
    expect((board.props as { activities: ActivityItem[] }).activities).toEqual([]);

    failedRecovery.reject(new Error("kanban recovery failed"));
    await flushPromises();
    tree = runtime.render();
    board = findByType(tree, KanbanBoard);
    const requestedPages = pageDataBridge.fetchPageData.mock.calls
      .map(([input]) => input as { view: string; kanbanPage: number })
      .filter(({ view }) => view === "kanban")
      .map(({ kanbanPage }) => kanbanPage);
    expect(requestedPages).toEqual([1, 3, 2]);
    expect((board.props as { pagination: { page: number } }).pagination.page).toBe(2);
    expect((board.props as { activities: ActivityItem[] }).activities).toEqual([]);
    expect(textOf(tree)).toContain("kanban recovery failed");
  });

  it("does not open a partial modal when detail loading fails", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 1));
    apiBridge.apiRequest.mockRejectedValueOnce(new Error("detail failed"));
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const list = findByType(tree, ActivityList);
    (list.props as { onOpen: (item: ActivityItem) => void }).onOpen(activity("activity-a"));

    await flushPromises();
    tree = runtime.render();
    expect(elements(tree).some((element) => element.type === RecordModal)).toBe(false);
    expect(textOf(tree)).toContain("detail failed");
  });

  it("shows a newer data failure ahead of an older detail failure", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 1))
      .mockRejectedValueOnce(new Error("newer data failure"));
    apiBridge.apiRequest.mockRejectedValueOnce(new Error("older detail failure"));
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    (findByType(tree, ActivityList).props as { onOpen: (item: ActivityItem) => void }).onOpen(
      activity("activity-a")
    );
    await flushPromises();
    tree = runtime.render();
    expect(textOf(tree)).toContain("older detail failure");

    const refresh = elements(tree).find(
      (element) =>
        element.type === IconToggle &&
        (element.props as { label?: string }).label === messages["pt-BR"].refresh
    );
    if (!refresh) throw new Error("Refresh control was not found");
    (refresh.props as { onClick: () => void }).onClick();
    await flushPromises();
    tree = runtime.render();

    expect(textOf(tree)).toContain("newer data failure");
    expect(textOf(tree)).not.toContain("older detail failure");
  });

  it("cancels pending detail intent when navigation changes", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 1))
      .mockResolvedValue(dashboardSnapshot("dashboard-after-navigation", 1));
    const detail = deferred<ActivityItem>();
    let detailSignal: AbortSignal | undefined;
    apiBridge.apiRequest.mockImplementationOnce((...args: unknown[]) => {
      detailSignal = (args[2] as RequestInit | undefined)?.signal ?? undefined;
      return detail.promise;
    });
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    (findByType(tree, ActivityList).props as { onOpen: (item: ActivityItem) => void }).onOpen(
      activity("activity-a")
    );

    clickButton(tree, messages["pt-BR"].dashboard);
    runtime.render();
    expect(detailSignal?.aborted).toBe(true);
    detail.resolve(activity("late-detail"));
    await flushPromises();
    tree = runtime.render();
    expect(elements(tree).some((element) => element.type === RecordModal)).toBe(false);
  });

  it("routes a late modal reload through the currently committed view", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("dashboard-initial", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 1))
      .mockResolvedValue(dashboardSnapshot("dashboard-current", 2));
    apiBridge.apiRequest.mockResolvedValueOnce(activity("activity-a"));
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    (findByType(tree, ActivityList).props as { onOpen: (item: ActivityItem) => void }).onOpen(
      activity("activity-a")
    );
    await flushPromises();
    tree = runtime.render();
    const lateReload = (
      findByType(tree, RecordModal).props as { onReload: (epoch: number) => Promise<void> }
    ).onReload;

    clickButton(tree, messages["pt-BR"].dashboard);
    runtime.render();
    await flushPromises();
    runtime.render();
    const epoch = captureApiSessionEpoch();
    if (epoch === null) throw new Error("Authenticated epoch was not available");
    const callsBeforeLateReload = pageDataBridge.fetchPageData.mock.calls.length;
    await lateReload(epoch);

    expect(pageDataBridge.fetchPageData).toHaveBeenCalledTimes(callsBeforeLateReload + 1);
    expect((pageDataBridge.fetchPageData.mock.calls.at(-1)?.[0] as { view: string }).view).toBe(
      "dashboard"
    );
  });

  it("cancels pending detail intent when the activity query page changes", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 30, 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-b")], 30, 2));
    const detail = deferred<ActivityItem>();
    let detailSignal: AbortSignal | undefined;
    apiBridge.apiRequest.mockImplementationOnce((...args: unknown[]) => {
      detailSignal = (args[2] as RequestInit | undefined)?.signal ?? undefined;
      return detail.promise;
    });
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const list = findByType(tree, ActivityList);
    (list.props as { onOpen: (item: ActivityItem) => void }).onOpen(activity("activity-a"));
    (
      list.props as {
        pagination: { onPage: (page: number) => void };
      }
    ).pagination.onPage(2);

    runtime.render();
    expect(detailSignal?.aborted).toBe(true);
    detail.resolve(activity("late-detail"));
    await flushPromises();
    tree = runtime.render();
    expect(elements(tree).some((element) => element.type === RecordModal)).toBe(false);
  });

  it("keeps the Kanban read-only when activity write permission is absent", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValue(activitySnapshot([activity("activity-a")], 1, 1, 100));
    let tree = await authenticate(scopedSession(["activities:read"]));
    clickButton(tree, messages["pt-BR"].kanban);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const board = findByType(tree, KanbanBoard);

    expect((board.props as { canMove: boolean }).canMove).toBe(false);
    await (board.props as { onMove: (id: string, status: string) => Promise<void> }).onMove(
      "activity-a",
      "DONE"
    );

    expect(apiBridge.apiRequest).not.toHaveBeenCalled();
  });

  it("propagates independent record capabilities and keeps create fail-closed", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValue(activitySnapshot([activity("activity-a")], 1));
    apiBridge.apiRequest.mockResolvedValue(activity("activity-a"));
    let tree = await authenticate(
      scopedSession(["activities:read", "activities:delete", "comments:write"])
    );
    const list = findByType(tree, ActivityList);

    expect((list.props as { onNew?: () => void }).onNew).toBeUndefined();
    (list.props as { onOpen: (item: ActivityItem) => void }).onOpen(activity("activity-a"));
    await flushPromises();
    tree = runtime.render();
    const modal = findByType(tree, RecordModal);

    expect((modal.props as { capabilities: Record<string, boolean> }).capabilities).toEqual({
      canWrite: false,
      canDelete: true,
      canComment: true,
      canAddMembers: false,
      canRemoveMembers: false
    });
  });

  it("opens create only with write authority and exposes no delete capability implicitly", async () => {
    pageDataBridge.fetchPageData.mockReset().mockResolvedValue(activitySnapshot([], 0));
    pageDataBridge.fetchReferenceData.mockResolvedValue({
      clients: { items: [{ id: "client-a", name: "Client A" }], total: 1 },
      teams: { items: [{ id: "team-a", name: "Team A" }], total: 1 }
    });
    let tree = await authenticate(
      scopedSession(["activities:read", "activities:write", "clients:read", "teams:read"])
    );
    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const onNew = (findByType(tree, ActivityList).props as { onNew?: () => void }).onNew;

    expect(onNew).toBeTypeOf("function");
    onNew?.();
    tree = runtime.render();

    expect(
      (findByType(tree, RecordModal).props as { capabilities: Record<string, boolean> })
        .capabilities
    ).toEqual({
      canWrite: true,
      canDelete: false,
      canComment: false,
      canAddMembers: false,
      canRemoveMembers: false
    });
    expect(apiBridge.apiRequest).not.toHaveBeenCalled();
  });

  it("explains why activity creation is unavailable without required reference reads", async () => {
    pageDataBridge.fetchPageData.mockReset().mockResolvedValue(activitySnapshot([], 0));
    const tree = await authenticate(scopedSession(["activities:read", "activities:write"]));
    const properties = findByType(tree, ActivityList).props as {
      onNew?: () => void;
      newDisabledReason?: string;
    };

    expect(properties.onNew).toBeUndefined();
    expect(properties.newDisabledReason).toBe(messages["pt-BR"].activityReferenceAccessRequired);
  });

  it("keeps dashboard configuration inert without dashboard write authority", async () => {
    const tree = await authenticate(scopedSession(["dashboard:read"]));
    const dashboard = findByType(tree, MainDashboard);
    const properties = dashboard.props as {
      canConfigure: boolean;
      onSaveLayout: (config: DashboardConfiguration) => Promise<DashboardConfiguration | void>;
      onResetLayout: () => Promise<DashboardConfiguration | void>;
    };

    expect(properties.canConfigure).toBe(false);
    expect(
      elements(tree).some(
        (element) =>
          element.type === IconToggle &&
          (element.props as { label?: string }).label === messages["pt-BR"].customizeDashboard
      )
    ).toBe(false);
    await properties.onSaveLayout(layouts.MAIN);
    await properties.onResetLayout();
    expect(apiBridge.apiRequest).not.toHaveBeenCalled();
  });

  it("keeps dashboard configuration inert until its tenant layout is confirmed", async () => {
    const pendingDashboard = deferred<ReturnType<typeof dashboardSnapshot>>();
    pageDataBridge.fetchPageData.mockReset().mockImplementationOnce(() => pendingDashboard.promise);
    const tree = await authenticate(scopedSession(["dashboard:read", "dashboard:write"]));
    const dashboard = findByType(tree, MainDashboard);
    const properties = dashboard.props as {
      canConfigure: boolean;
      onSaveLayout: (config: DashboardConfiguration) => Promise<DashboardConfiguration | void>;
      onResetLayout: () => Promise<DashboardConfiguration | void>;
    };

    expect(properties.canConfigure).toBe(false);
    expect(
      elements(tree).some(
        (element) =>
          element.type === IconToggle &&
          (element.props as { label?: string }).label === messages["pt-BR"].customizeDashboard
      )
    ).toBe(false);
    await properties.onSaveLayout(layouts.MAIN);
    await properties.onResetLayout();
    expect(apiBridge.apiRequest).not.toHaveBeenCalled();

    pendingDashboard.resolve(dashboardSnapshot("confirmed", 1));
    await flushPromises();
  });

  it("rejects a dashboard save callback captured for a prior tenant", async () => {
    const tree = await authenticate(
      scopedSession(["dashboard:read", "dashboard:write"], "user-a", "company-a")
    );
    const oldSave = (
      findByType(tree, MainDashboard).props as {
        onSaveLayout: (config: DashboardConfiguration) => Promise<DashboardConfiguration | void>;
      }
    ).onSaveLayout;
    apiBridge.apiRequest.mockReset().mockResolvedValue(layouts.MAIN);

    setApiSession(scopedSession(["dashboard:read", "dashboard:write"], "user-b", "company-b"));
    await oldSave(layouts.MAIN);

    expect(apiBridge.apiRequest).not.toHaveBeenCalled();
  });

  it("keeps move settlement bound to the last committed render", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 1, 1, 100))
      .mockResolvedValue(activitySnapshot([activity("activity-a", "DONE")], 1, 1, 100));
    const move = deferred<ActivityItem>();
    apiBridge.apiRequest.mockImplementationOnce(() => move.promise);
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].kanban);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const command = (
      findByType(tree, KanbanBoard).props as {
        onMove: (id: string, status: string) => Promise<void>;
      }
    ).onMove("activity-a", "DONE");
    await vi.waitFor(() => expect(apiBridge.apiRequest).toHaveBeenCalledOnce());
    expect(apiBridge.apiRequest).toHaveBeenCalledWith(
      "/api/activities/activity-a/move",
      "access-token",
      { method: "POST", body: JSON.stringify({ status: "DONE" }) }
    );

    clickButton(tree, messages["pt-BR"].dashboard);
    runtime.renderWithoutEffects();
    const loadsBeforeSettlement = pageDataBridge.fetchPageData.mock.calls.length;
    move.resolve(activity("activity-a", "DONE"));
    await command;

    const lastLoad = pageDataBridge.fetchPageData.mock.calls.at(-1)?.[0] as { view: string };
    expect(pageDataBridge.fetchPageData).toHaveBeenCalledTimes(loadsBeforeSettlement + 1);
    expect(lastLoad.view).toBe("kanban");
  });

  it("reconciles the committed Dashboard after a Kanban move settles", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 1, 1, 100))
      .mockResolvedValue(dashboardSnapshot("committed-dashboard", 2));
    const move = deferred<ActivityItem>();
    apiBridge.apiRequest.mockImplementationOnce(() => move.promise);
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].kanban);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const command = (
      findByType(tree, KanbanBoard).props as {
        onMove: (id: string, status: string) => Promise<void>;
      }
    ).onMove("activity-a", "DONE");
    await vi.waitFor(() => expect(apiBridge.apiRequest).toHaveBeenCalledOnce());

    clickButton(tree, messages["pt-BR"].dashboard);
    runtime.render();
    await flushPromises();
    runtime.render();
    const loadsAfterDashboardCommit = pageDataBridge.fetchPageData.mock.calls.length;
    move.resolve(activity("activity-a", "DONE"));
    await command;

    expect(pageDataBridge.fetchPageData).toHaveBeenCalledTimes(loadsAfterDashboardCommit + 1);
    expect((pageDataBridge.fetchPageData.mock.calls.at(-1)?.[0] as { view: string }).view).toBe(
      "dashboard"
    );
  });

  it("commits the successor loader during layout before passive loading starts", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 1, 1, 100))
      .mockResolvedValue(dashboardSnapshot("committed-dashboard", 2));
    const move = deferred<ActivityItem>();
    apiBridge.apiRequest.mockImplementationOnce(() => move.promise);
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].kanban);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    const command = (
      findByType(tree, KanbanBoard).props as {
        onMove: (id: string, status: string) => Promise<void>;
      }
    ).onMove("activity-a", "DONE");
    await vi.waitFor(() => expect(apiBridge.apiRequest).toHaveBeenCalledOnce());

    clickButton(tree, messages["pt-BR"].dashboard);
    runtime.renderThroughLayout();
    const loadsAfterLayoutCommit = pageDataBridge.fetchPageData.mock.calls.length;
    move.resolve(activity("activity-a", "DONE"));
    await command;

    expect(pageDataBridge.fetchPageData).toHaveBeenCalledTimes(loadsAfterLayoutCommit + 1);
    expect((pageDataBridge.fetchPageData.mock.calls.at(-1)?.[0] as { view: string }).view).toBe(
      "dashboard"
    );

    runtime.flushPassiveEffects();
    await flushPromises();
    expect(pageDataBridge.fetchPageData).toHaveBeenCalledTimes(loadsAfterLayoutCommit + 2);
    expect((pageDataBridge.fetchPageData.mock.calls.at(-1)?.[0] as { view: string }).view).toBe(
      "dashboard"
    );
  });

  it("serialises same-card moves, suppresses stale errors and remains busy through reload", async () => {
    const authoritativeReload = deferred<ReturnType<typeof activitySnapshot>>();
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 1, 1, 100))
      .mockImplementationOnce(() => authoritativeReload.promise);
    const firstMove = deferred<ActivityItem>();
    const secondMove = deferred<ActivityItem>();
    apiBridge.apiRequest
      .mockImplementationOnce(() => firstMove.promise)
      .mockImplementationOnce(() => secondMove.promise);
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].kanban);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    let board = findByType(tree, KanbanBoard);

    const firstCommand = (
      board.props as { onMove: (id: string, status: string) => Promise<void> }
    ).onMove("activity-a", "IN_PROGRESS");
    tree = runtime.render();
    board = findByType(tree, KanbanBoard);
    const secondCommand = (
      board.props as { onMove: (id: string, status: string) => Promise<void> }
    ).onMove("activity-a", "WAITING_CUSTOMER");
    runtime.render();
    await vi.waitFor(() => expect(apiBridge.apiRequest).toHaveBeenCalledTimes(1));

    firstMove.reject(new Error("stale first move failed"));
    await vi.waitFor(() => expect(apiBridge.apiRequest).toHaveBeenCalledTimes(2));
    await flushPromises();
    tree = runtime.render();
    expect(textOf(tree)).not.toContain("stale first move failed");
    expect(textOf(tree)).toContain(messages["pt-BR"].loading);

    secondMove.resolve(activity("activity-a", "WAITING_CUSTOMER"));
    await vi.waitFor(() => expect(pageDataBridge.fetchPageData).toHaveBeenCalledTimes(3));
    await flushPromises();
    tree = runtime.render();
    board = findByType(tree, KanbanBoard);
    expect((board.props as { activities: ActivityItem[] }).activities[0]?.status).toBe(
      "WAITING_CUSTOMER"
    );
    expect(textOf(tree)).toContain(messages["pt-BR"].loading);

    authoritativeReload.resolve(activitySnapshot([activity("activity-a", "DONE")], 1, 1, 100));
    await Promise.all([firstCommand, secondCommand]);
    await flushPromises();
    tree = runtime.render();
    board = findByType(tree, KanbanBoard);
    expect((board.props as { activities: ActivityItem[] }).activities[0]?.status).toBe("DONE");
    expect(
      elements(tree).some(
        (element) =>
          element.type === "p" &&
          (element.props as { className?: string }).className === "guard-note app-message"
      )
    ).toBe(false);
  });

  it("does not let an older successful move clear a newer unrelated move error", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(
        activitySnapshot([activity("activity-a"), activity("activity-b")], 2, 1, 100)
      )
      .mockResolvedValue(
        activitySnapshot([activity("activity-a", "DONE"), activity("activity-b")], 2, 1, 100)
      );
    const olderSuccess = deferred<ActivityItem>();
    const newerFailure = deferred<ActivityItem>();
    apiBridge.apiRequest
      .mockImplementationOnce(() => olderSuccess.promise)
      .mockImplementationOnce(() => newerFailure.promise);
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].kanban);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    let board = findByType(tree, KanbanBoard);

    const olderCommand = (
      board.props as { onMove: (id: string, status: string) => Promise<void> }
    ).onMove("activity-a", "DONE");
    tree = runtime.render();
    board = findByType(tree, KanbanBoard);
    const newerCommand = (
      board.props as { onMove: (id: string, status: string) => Promise<void> }
    ).onMove("activity-b", "IN_PROGRESS");
    await vi.waitFor(() => expect(apiBridge.apiRequest).toHaveBeenCalledTimes(2));

    newerFailure.reject(new Error("newer activity-b failure"));
    await newerCommand;
    await flushPromises();
    tree = runtime.render();
    expect(textOf(tree)).toContain("newer activity-b failure");

    olderSuccess.resolve(activity("activity-a", "DONE"));
    await olderCommand;
    await flushPromises();
    tree = runtime.render();
    expect(textOf(tree)).toContain("newer activity-b failure");
  });

  it("resets queued move tails and overlays before a successor session uses the same card", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 1, 1, 100))
      .mockResolvedValueOnce(dashboardSnapshot("successor-dashboard", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 1, 1, 100))
      .mockResolvedValue(activitySnapshot([activity("activity-a", "DONE")], 1, 1, 100));
    const inFlightMove = deferred<ActivityItem>();
    apiBridge.apiRequest
      .mockImplementationOnce(() => inFlightMove.promise)
      .mockResolvedValueOnce(activity("activity-a", "DONE"));
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].kanban);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    let board = findByType(tree, KanbanBoard);

    const firstCommand = (
      board.props as { onMove: (id: string, status: string) => Promise<void> }
    ).onMove("activity-a", "IN_PROGRESS");
    tree = runtime.render();
    board = findByType(tree, KanbanBoard);
    const queuedCommand = (
      board.props as { onMove: (id: string, status: string) => Promise<void> }
    ).onMove("activity-a", "DONE");
    await vi.waitFor(() => expect(apiBridge.apiRequest).toHaveBeenCalledOnce());

    clearApiSession();
    setApiSession(
      scopedSession(
        ["dashboard:read", "activities:read", "activities:write", "notifications:read"],
        "user-b",
        "company-b"
      )
    );
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    clickButton(tree, messages["pt-BR"].kanban);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    board = findByType(tree, KanbanBoard);
    expect((board.props as { activities: ActivityItem[] }).activities[0]?.status).toBe("PENDING");

    const successorCommand = (
      board.props as { onMove: (id: string, status: string) => Promise<void> }
    ).onMove("activity-a", "DONE");
    await vi.waitFor(() => expect(apiBridge.apiRequest).toHaveBeenCalledTimes(2));
    await successorCommand;

    inFlightMove.resolve(activity("activity-a", "IN_PROGRESS"));
    await Promise.all([firstCommand, queuedCommand]);
    await flushPromises();
    tree = runtime.render();

    expect(apiBridge.apiRequest).toHaveBeenCalledTimes(2);
    board = findByType(tree, KanbanBoard);
    expect((board.props as { activities: ActivityItem[] }).activities[0]?.status).toBe("DONE");
  });

  it("unmounts protected views and modal state when the session loses every permission", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 1));
    apiBridge.apiRequest.mockResolvedValueOnce(activity("activity-a"));
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    (findByType(tree, ActivityList).props as { onOpen: (item: ActivityItem) => void }).onOpen(
      activity("activity-a")
    );
    await flushPromises();
    tree = runtime.render();
    expect(elements(tree).some((element) => element.type === RecordModal)).toBe(true);

    setApiSession(scopedSession([]));
    tree = runtime.render();

    expect(elements(tree).some((element) => element.type === ActivityList)).toBe(false);
    expect(elements(tree).some((element) => element.type === MainDashboard)).toBe(false);
    expect(elements(tree).some((element) => element.type === RecordModal)).toBe(false);
    expect(textOf(tree)).toContain(messages["pt-BR"].noAuthorisedViews);
    expect(
      elements(tree).some(
        (element) =>
          element.type === IconToggle &&
          (element.props as { label?: string }).label === messages["pt-BR"].signOut
      )
    ).toBe(true);
  });

  it("moves to the first authorised view without retaining a revoked activity view", async () => {
    pageDataBridge.fetchPageData
      .mockReset()
      .mockResolvedValueOnce(dashboardSnapshot("operational", 1))
      .mockResolvedValueOnce(activitySnapshot([activity("activity-a")], 1))
      .mockResolvedValueOnce(dashboardSnapshot("restricted-dashboard", 1));
    let tree = await authenticate();
    clickButton(tree, messages["pt-BR"].activities);
    runtime.render();
    await flushPromises();
    tree = runtime.render();
    expect(elements(tree).some((element) => element.type === ActivityList)).toBe(true);

    setApiSession(scopedSession(["dashboard:read"]));
    runtime.render();
    await flushPromises();
    tree = runtime.render();

    expect(elements(tree).some((element) => element.type === ActivityList)).toBe(false);
    const dashboard = findByType(tree, MainDashboard);
    expect((dashboard.props as { onOpen?: unknown }).onOpen).toBeUndefined();
  });

  it("presents unread notifications as a non-interactive live status", async () => {
    pageDataBridge.fetchUnreadData.mockReset().mockResolvedValueOnce({ unread: 7 });
    await authenticate();
    await flushPromises();
    const tree = runtime.render();
    const indicator = elements(tree).find(
      (element) =>
        element.type === "span" &&
        (element.props as { className?: string }).className === "notification-indicator"
    );
    const props = indicator?.props as {
      "aria-label"?: string;
      role?: string;
      onClick?: unknown;
      tabIndex?: number;
      children?: unknown;
    };

    expect(props.role).toBe("status");
    expect(props["aria-label"]).toBe("7 não lidas");
    expect(props.onClick).toBeUndefined();
    expect(props.tabIndex).toBeUndefined();
    expect(textOf(props.children)).toContain("7");
  });

  it("normalises the legacy notification count and labels the singular result", async () => {
    pageDataBridge.fetchUnreadData.mockReset().mockResolvedValueOnce({ count: 1 });
    await authenticate();
    await flushPromises();
    const tree = runtime.render();
    const indicator = elements(tree).find(
      (element) =>
        element.type === "span" &&
        (element.props as { className?: string }).className === "notification-indicator"
    );

    expect((indicator?.props as { "aria-label"?: string })["aria-label"]).toBe("1 não lida");
    expect(textOf(indicator)).toContain("1");
  });

  it("suppresses a late RBAC failure after a successor tenant becomes active", async () => {
    pageDataBridge.fetchRbacData.mockReset().mockResolvedValue({
      roles: {
        items: [{ id: "role-a", name: "Role A", scope: "COMPANY", isSystem: false }],
        total: 1
      },
      permissions: { items: [], total: 0 }
    });
    const lateMutation = deferred<unknown>();
    apiBridge.apiRequest.mockImplementationOnce(() => lateMutation.promise);
    await authenticate(scopedSession(["rbac:read", "rbac:write"]));
    await flushPromises();
    let tree = runtime.render();
    const roleView = findByType(tree, RoleManagementView);
    expect((roleView.props as { canWrite: boolean; canDelete: boolean }).canWrite).toBe(true);
    expect((roleView.props as { canWrite: boolean; canDelete: boolean }).canDelete).toBe(false);

    (roleView.props as { onDuplicateRole: (roleId: string) => void }).onDuplicateRole("role-a");
    await vi.waitFor(() => expect(apiBridge.apiRequest).toHaveBeenCalledOnce());
    clearApiSession();
    setApiSession(scopedSession(["dashboard:read"], "user-b", "company-b"));
    runtime.render();
    lateMutation.reject(new Error("old tenant RBAC failure"));
    await flushPromises();
    tree = runtime.render();

    expect(textOf(tree)).not.toContain("old tenant RBAC failure");
    expect(elements(tree).some((element) => element.type === RoleManagementView)).toBe(false);
  });

  it("keeps loading owned by pending work and enables login immediately after session reset", async () => {
    const pageLoad = deferred<ReturnType<typeof dashboardSnapshot>>();
    const detail = deferred<ActivityItem>();
    pageDataBridge.fetchPageData.mockReset().mockImplementationOnce(() => pageLoad.promise);
    apiBridge.apiRequest.mockImplementationOnce(() => detail.promise);
    let tree = await authenticate();
    const dashboard = findByType(tree, MainDashboard);
    (dashboard.props as { onOpen: (item: ActivityItem) => void }).onOpen(activity("activity-a"));
    runtime.render();

    detail.resolve(activity("activity-a"));
    await flushPromises();
    tree = runtime.render();
    expect(
      elements(tree).some(
        (element) =>
          element.type === "p" &&
          (element.props as { className?: string }).className === "guard-note app-message" &&
          textOf(element).trim() === messages["pt-BR"].loading
      )
    ).toBe(true);

    clearApiSession();
    tree = runtime.render();
    const login = elements(tree).find(
      (element) =>
        element.type === "button" &&
        (element.props as { className?: string }).className === "primary-button"
    );
    expect((login?.props as { disabled?: boolean }).disabled).toBe(false);

    pageLoad.resolve(dashboardSnapshot("late-page", 99));
    await flushPromises();
    tree = runtime.render();
    const lateLogin = elements(tree).find(
      (element) =>
        element.type === "button" &&
        (element.props as { className?: string }).className === "primary-button"
    );
    expect((lateLogin?.props as { disabled?: boolean }).disabled).toBe(false);
    expect(elements(tree).some((element) => element.type === RecordModal)).toBe(false);
  });
});
