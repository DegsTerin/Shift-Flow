// en-GB: Exercises the real page orchestration across request, pagination and session boundaries.
import type { ReactElement } from "react";
import type * as PageDataModule from "./lib/page-data";
import type * as ApiModule from "./lib/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActivityItem,
  DashboardConfiguration,
  LoginResponse,
  NotificationItem
} from "./lib/types";

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
import { PageWorkspace } from "./components/page-workspace";
import { CustomizableDashboard } from "./components/custom-dashboard";
import { ActivityList, ManagementTable } from "./components/lists";
import { FilterBar, IconToggle, ReferenceSelectInput, Select } from "./components/controls";
import { NotificationCentre } from "./components/notification-centre";
import { RecordModal } from "./components/record-modal";
import { RoleManagementView } from "./components/role-management-view";
import { KanbanBoard, MainDashboard, ReportsView, TeamDashboard } from "./components/views";
import { captureApiSessionEpoch, clearApiSession, setApiSession } from "./lib/api";
import { messages } from "./lib/i18n";
import { defaultDashboardLayouts } from "./lib/page-config";

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
    const tree = renderPage();
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
    const tree = renderPage();
    this.pendingLayoutEffects = [];
    this.pendingPassiveEffects = [];
    return tree;
  }

  renderComponent(component: () => ReactElement) {
    this.cursor = 0;
    this.pendingLayoutEffects = [];
    this.pendingPassiveEffects = [];
    const tree = component();
    this.pendingLayoutEffects.forEach((effect) => effect());
    this.pendingLayoutEffects = [];
    this.flushPassiveEffects();
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

let latestRawPage: ReactElement | null = null;

function renderPage() {
  const tree = Page();
  latestRawPage = tree;
  return tree.type === PageWorkspace
    ? PageWorkspace(tree.props as Parameters<typeof PageWorkspace>[0])
    : tree;
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

  const dashboardResources: PageDataModule.DashboardResource[] = [
    "summary",
    "charts",
    "operationalActivities",
    "configuration",
    "teamDirectory"
  ];
  const mainProps = (tree: ReactElement) =>
    findByType(tree, MainDashboard).props as Parameters<typeof MainDashboard>[0];
  const workspaceProps = () => latestRawPage!.props as Parameters<typeof PageWorkspace>[0];
  async function flushDashboard() {
    for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
  }
  async function liveDashboardRequests() {
    const actual = await vi.importActual<typeof PageDataModule>("./lib/page-data");
    const pending: Array<{
      path: string;
      resource: PageDataModule.DashboardResource;
      operation: ReturnType<typeof deferred<unknown>>;
      signal?: AbortSignal | null;
    }> = [];
    const request: PageDataModule.PageRequester = <T>(
      path: string,
      token?: string,
      init?: RequestInit
    ) => {
      void token;
      const resource = path.startsWith("/api/teams?")
        ? "teamDirectory"
        : path.includes("/configuration/")
          ? "configuration"
          : path.includes("/operational-list")
            ? "operationalActivities"
            : path.includes("/summary")
              ? "summary"
              : "charts";
      const operation = deferred<unknown>();
      pending.push({ path, resource, operation, signal: init?.signal });
      return operation.promise as Promise<T>;
    };
    pageDataBridge.fetchPageData
      .mockReset()
      .mockImplementation((options: Parameters<typeof actual.fetchPageData>[0]) =>
        actual.fetchPageData({ ...options, request })
      );
    const latest = (resource: PageDataModule.DashboardResource) => {
      const entry = [...pending].reverse().find((item) => item.resource === resource);
      if (!entry) throw new Error(`No pending ${resource} request`);
      return entry;
    };
    const values: PageDataModule.DashboardDataMap = {
      summary: dashboardSnapshot("live", 7).dashboard.summary,
      charts,
      operationalActivities: [activity("live")],
      configuration: {
        ...defaultDashboardLayouts.MAIN,
        isDefault: false,
        widgets: defaultDashboardLayouts.MAIN.widgets.filter(
          (widget) => widget.key === "summary-total"
        )
      },
      teamDirectory: {
        items: [{ id: "team-live", name: "Live team" }],
        total: 1,
        page: 1,
        pageSize: 12
      }
    };
    const resolve = (
      resource: PageDataModule.DashboardResource,
      value: unknown = values[resource]
    ) => latest(resource).operation.resolve(value);
    const resolveAll = () =>
      dashboardResources.forEach((resource) => {
        if (pending.some((entry) => entry.resource === resource)) resolve(resource);
      });
    return { pending, latest, values, resolve, resolveAll };
  }

  it.each(dashboardResources)(
    "publishes real page settlements while %s hangs and then fails",
    async (failed) => {
      const requests = await liveDashboardRequests();
      await authenticate(scopedSession(["dashboard:read", "dashboard:write", "teams:read"]));
      dashboardResources
        .filter((resource) => resource !== failed)
        .forEach((resource) => requests.resolve(resource));
      await flushDashboard();
      let properties = mainProps(runtime.render());
      expect(properties.availability?.[failed]).toBe("loading");
      dashboardResources
        .filter((resource) => resource !== failed)
        .forEach((resource) => expect(properties.availability?.[resource]).toBe("ready"));
      requests.latest(failed).operation.reject(new Error(`${failed} unavailable`));
      await flushDashboard();
      properties = mainProps(runtime.render());
      expect(properties.availability?.[failed]).toBe("error");
      expect(properties.summary.total).toBe(failed === "summary" ? 0 : 7);
      expect(properties.activities).toEqual(
        failed === "operationalActivities" ? [] : [activity("live")]
      );
      expect(properties.canConfigure).toBe(failed !== "configuration");
      if (failed === "teamDirectory") expect(properties.pagination).toBeUndefined();
    }
  );

  it.each(["dashboard", "team-dashboard"] as const)(
    "keeps the real %s workspace available while only its pending widget is busy",
    async (view) => {
      const requests = await liveDashboardRequests();
      const initial = await authenticate(scopedSession(["dashboard:read", "teams:read"]));
      if (view === "team-dashboard") {
        clickButton(initial, messages["pt-BR"].teamDashboard);
        runtime.render();
      }
      const kind = view === "dashboard" ? "MAIN" : "TEAM";
      const pendingKey = view === "dashboard" ? "chart-status" : "team-productivity";
      const readyKey = view === "dashboard" ? "summary-total" : "team-summary";
      if (view === "dashboard") requests.resolve("summary");
      requests.resolve("operationalActivities");
      requests.resolve("teamDirectory");
      requests.resolve("configuration", {
        ...defaultDashboardLayouts[kind],
        isDefault: false,
        widgets: defaultDashboardLayouts[kind].widgets.filter(
          (widget) => widget.key === pendingKey || widget.key === readyKey
        )
      });
      // en-GB: The real charts request remains unsettled while sibling lanes publish their data.
      await flushDashboard();
      const tree = runtime.render();
      expect(workspaceProps().loading).toBe(true);
      expect(workspaceProps().dashboardAvailability).toMatchObject({
        charts: "loading",
        configuration: "ready",
        operationalActivities: "ready",
        teamDirectory: "ready"
      });
      const main = findByType(tree, "main");
      expect((main.props as { "aria-busy"?: boolean })["aria-busy"]).toBeUndefined();
      const dashboard =
        view === "dashboard"
          ? MainDashboard(mainProps(tree))
          : TeamDashboard(
              findByType(tree, TeamDashboard).props as Parameters<typeof TeamDashboard>[0]
            );
      const properties = findByType(dashboard, CustomizableDashboard).props as Parameters<
        typeof CustomizableDashboard
      >[0];
      const pendingDefinition = properties.definitions.find(
        (definition) => definition.key === pendingKey
      )!;
      const pendingWidget = properties.config.widgets.find((widget) => widget.key === pendingKey)!;
      const pending = pendingDefinition.render(pendingWidget) as ReactElement;
      expect((findByType(pending, "article").props as { "aria-busy"?: boolean })["aria-busy"]).toBe(
        true
      );
      const pendingStatus = findByType(pending, "p");
      expect(pendingStatus.props).toMatchObject({ role: "status", "aria-live": "polite" });
      expect(textOf(pendingStatus)).toBe(messages["pt-BR"].dashboardDependencyLoading);

      const readyDefinition = properties.definitions.find(
        (definition) => definition.key === readyKey
      )!;
      const readyWidget = properties.config.widgets.find((widget) => widget.key === readyKey)!;
      const ready = readyDefinition.render(readyWidget) as ReactElement;
      const readyTree =
        typeof ready.type === "function"
          ? (ready.type as (props: unknown) => ReactElement)(ready.props)
          : ready;
      expect(textOf(readyTree)).toContain(view === "dashboard" ? "7" : "Live team");
      expect(
        elements(readyTree).some(
          (element) => (element.props as { "aria-busy"?: boolean })["aria-busy"] === true
        )
      ).toBe(false);
    }
  );

  it("preserves the real management workspace busy state until its request settles", async () => {
    const pending = deferred<{ items: never[]; total: number; page: number; pageSize: number }>();
    pageDataBridge.fetchManagementData.mockReturnValueOnce(pending.promise);
    const initial = await authenticate(scopedSession(["dashboard:read", "users:read"]));
    clickButton(initial, messages["pt-BR"].users);
    runtime.render();
    const loading = findByType(runtime.render(), "main");
    expect((loading.props as { "aria-busy"?: boolean })["aria-busy"]).toBe(true);

    pending.resolve({ items: [], total: 0, page: 1, pageSize: 12 });
    await flushPromises();
    const ready = findByType(runtime.render(), "main");
    expect((ready.props as { "aria-busy"?: boolean })["aria-busy"]).toBe(false);
  });

  it("hides the previous data context before effects and rejects late filter, search and session responses", async () => {
    const requests = await liveDashboardRequests();
    await authenticate(scopedSession(["dashboard:read", "teams:read"]));
    requests.resolve("summary");
    await flushDashboard();
    runtime.render();
    const previousCharts = requests.latest("charts");
    workspaceProps().changeFilters({ ...workspaceProps().filters, status: "DONE" });
    let properties = mainProps(runtime.renderWithoutEffects());
    expect(properties.availability?.summary).toBe("loading");
    expect(properties.summary.total).toBe(0);
    previousCharts.operation.resolve({
      ...charts,
      byStatus: [{ status: "PENDING", _count: { _all: 99 } }]
    });
    await flushDashboard();
    expect(mainProps(runtime.renderWithoutEffects()).charts.byStatus).toEqual([]);
    runtime.render();
    requests.resolveAll();
    await flushDashboard();
    runtime.render();
    workspaceProps().setSearch("new search");
    properties = mainProps(runtime.renderWithoutEffects());
    expect(properties.availability?.summary).toBe("loading");
    expect(properties.summary.total).toBe(0);
    runtime.render();
    clock.advanceBy(300);
    runtime.render();
    const oldSummary = requests.latest("summary");
    setApiSession(scopedSession(["dashboard:read", "teams:read"], "other", "company-b"));
    oldSummary.operation.resolve({ ...requests.values.summary, total: 99 });
    await flushDashboard();
    properties = mainProps(runtime.renderWithoutEffects());
    expect(properties.summary.total).toBe(0);
    expect(properties.availability?.summary).not.toBe("ready");
  });

  it("renders inverted filters as unavailable without carrying forward a prior valid sample", async () => {
    const requests = await liveDashboardRequests();
    await authenticate(scopedSession(["dashboard:read", "teams:read"]));
    requests.resolveAll();
    await flushDashboard();
    runtime.render();
    const callCount = requests.pending.length;
    workspaceProps().changeFilters({
      ...workspaceProps().filters,
      from: "2026-09-05",
      to: "2026-09-04"
    });
    const properties = mainProps(runtime.renderWithoutEffects());
    expect(properties.availability?.summary).toBe("error");
    expect(properties.summary.total).toBe(0);
    expect(properties.activities).toEqual([]);
    runtime.render();
    expect(requests.pending).toHaveLength(callCount);
  });

  it("revokes captured save/reset callbacks and pending results until a fresh configuration recovers", async () => {
    const requests = await liveDashboardRequests();
    await authenticate(scopedSession(["dashboard:read", "dashboard:write", "teams:read"]));
    requests.resolveAll();
    await flushDashboard();
    let tree = runtime.render();
    const initialKey = findByType(tree, MainDashboard).key;
    const old = mainProps(tree);
    const pendingSave = deferred<DashboardConfiguration>();
    apiBridge.apiRequest.mockReset().mockReturnValueOnce(pendingSave.promise);
    const save = old.onSaveLayout({ ...requests.values.configuration, gridGap: 20 });
    const refresh = workspaceProps().refreshCurrent();
    requests.latest("configuration").operation.reject(new Error("configuration unavailable"));
    dashboardResources
      .filter((resource) => resource !== "configuration")
      .forEach((resource) => requests.resolve(resource));
    await refresh;
    tree = runtime.render();
    expect(mainProps(tree).canConfigure).toBe(false);
    expect(mainProps(tree).availability?.configuration).toBe("error");
    expect(findByType(tree, MainDashboard).key).not.toBe(initialKey);
    await old.onSaveLayout(requests.values.configuration);
    await old.onResetLayout();
    expect(apiBridge.apiRequest).toHaveBeenCalledOnce();
    pendingSave.resolve({ ...requests.values.configuration, gridGap: 99 });
    await save;
    expect(mainProps(runtime.render()).layout.gridGap).not.toBe(99);
    const recover = workspaceProps().refreshCurrent();
    requests.resolveAll();
    await recover;
    expect(mainProps(runtime.render()).canConfigure).toBe(true);
    await old.onSaveLayout(requests.values.configuration);
    expect(apiBridge.apiRequest).toHaveBeenCalledOnce();
  });

  it("preserves a real customisation draft and cumulative queue through successful revalidation", async () => {
    const requests = await liveDashboardRequests();
    await authenticate(scopedSession(["dashboard:read", "dashboard:write", "teams:read"]));
    requests.resolveAll();
    await flushDashboard();
    let tree = runtime.render();
    const originalKey = findByType(tree, MainDashboard).key;
    let properties = mainProps(tree);
    const childRuntime = new HookRuntime();
    const install = (target: HookRuntime) => {
      hookBridge.useState = target.useState.bind(target);
      hookBridge.useRef = target.useRef.bind(target);
      hookBridge.useMemo = target.useMemo.bind(target);
      hookBridge.useCallback = target.useCallback.bind(target);
      hookBridge.useEffect = target.useEffect.bind(target);
      hookBridge.useLayoutEffect = target.useLayoutEffect.bind(target);
    };
    const renderChild = () => {
      const child = findByType(MainDashboard(properties), CustomizableDashboard);
      install(childRuntime);
      try {
        return childRuntime.renderComponent(() =>
          CustomizableDashboard(child.props as Parameters<typeof CustomizableDashboard>[0])
        );
      } finally {
        install(runtime);
      }
    };
    const clickControl = (child: ReactElement, label: string) => {
      const button = elements(child).find(
        (element) =>
          element.type === "button" &&
          (element.props as { "aria-label"?: string })["aria-label"] === label
      );
      if (!button) throw new Error(`Missing widget control: ${label}`);
      (button.props as { onClick: () => void }).onClick();
    };
    const first = deferred<DashboardConfiguration>();
    const second = deferred<DashboardConfiguration>();
    apiBridge.apiRequest
      .mockReset()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    try {
      renderChild();
      const registration = [...vi.mocked(window.addEventListener).mock.calls]
        .reverse()
        .find(([name]) => name === "shiftflow:customize-dashboard");
      const listener = registration?.[1];
      if (typeof listener !== "function") throw new Error("Missing customisation listener");
      listener(new Event("shiftflow:customize-dashboard"));
      clickControl(renderChild(), messages["pt-BR"].increaseWidth);
      await flushDashboard();
      expect(apiBridge.apiRequest).toHaveBeenCalledOnce();
      clickControl(renderChild(), messages["pt-BR"].increaseHeight);

      const refresh = workspaceProps().refreshCurrent();
      requests.resolveAll();
      await refresh;
      tree = runtime.render();
      properties = mainProps(tree);
      expect(findByType(tree, MainDashboard).key).toBe(originalKey);
      expect(properties.canConfigure).toBe(true);
      const child = renderChild();
      expect(
        elements(child).some(
          (element) =>
            (element.props as { "aria-label"?: string })["aria-label"] ===
            messages["pt-BR"].exitCustomization
        )
      ).toBe(true);
      expect(apiBridge.apiRequest).toHaveBeenCalledOnce();
      const firstBody = JSON.parse(
        String(apiBridge.apiRequest.mock.calls[0]?.[2]?.body)
      ) as DashboardConfiguration;
      first.resolve(firstBody);
      await flushDashboard();
      expect(apiBridge.apiRequest).toHaveBeenCalledTimes(2);
      const secondBody = JSON.parse(
        String(apiBridge.apiRequest.mock.calls[1]?.[2]?.body)
      ) as DashboardConfiguration;
      expect(secondBody.widgets[0]).toMatchObject({ gridWidth: 3, gridHeight: 3 });
      second.resolve(secondBody);
      await flushDashboard();
      expect(mainProps(runtime.render()).layout.widgets[0]).toMatchObject({
        gridWidth: 3,
        gridHeight: 3
      });
    } finally {
      childRuntime.cleanup();
      install(runtime);
    }
  });

  it("confines real directory pagination failure and correction to its own presentation", async () => {
    const requests = await liveDashboardRequests();
    await authenticate(scopedSession(["dashboard:read", "teams:read"]));
    requests.resolve("summary", { ...requests.values.summary, total: 0 });
    requests.resolve("charts");
    requests.resolve("operationalActivities", []);
    requests.resolve("configuration");
    requests.resolve("teamDirectory", { items: [], total: 40, page: 2, pageSize: 12 });
    await flushDashboard();
    let properties = mainProps(runtime.render());
    expect(properties.availability).toMatchObject({
      summary: "ready",
      teamDirectory: "error",
      operationalActivities: "ready"
    });
    expect(properties.summary.total).toBe(0);
    expect(properties.activities).toEqual([]);
    expect(properties.pagination).toBeUndefined();
    workspaceProps().changeTeamDirectoryPage(9);
    runtime.render();
    requests.resolve("summary");
    requests.resolve("charts");
    requests.resolve("operationalActivities");
    requests.resolve("configuration");
    requests.resolve("teamDirectory", { items: [], total: 13, page: 9, pageSize: 12 });
    await flushDashboard();
    expect(requests.latest("teamDirectory").path).toContain("page=2&");
    requests.resolve("teamDirectory", {
      items: [{ id: "team-13", name: "Final team" }],
      total: 13,
      page: 2,
      pageSize: 12
    });
    await flushDashboard();
    properties = mainProps(runtime.render());
    expect(properties.availability?.teamDirectory).toBe("ready");
    expect(properties.summary.total).toBe(7);
    expect(properties.pagination?.page).toBe(2);
    expect(properties.teams[0]?.id).toBe("team-13");
  });

  it("uses real skipped settlements for the TEAM summary and an unauthorised directory", async () => {
    const requests = await liveDashboardRequests();
    await authenticate(scopedSession(["dashboard:read"]));
    requests.resolve("summary");
    requests.resolve("charts");
    requests.resolve("operationalActivities");
    requests.resolve("configuration");
    await flushDashboard();
    const tree = runtime.render();
    clickButton(tree, messages["pt-BR"].teamDashboard);
    runtime.render();
    requests.resolve("charts");
    requests.resolve("operationalActivities", []);
    requests.resolve("configuration", { ...requests.values.configuration, dashboardType: "TEAM" });
    await flushDashboard();
    const properties = findByType(runtime.render(), TeamDashboard).props as Parameters<
      typeof TeamDashboard
    >[0];
    expect(properties.availability).toMatchObject({
      summary: "skipped",
      teamDirectory: "skipped",
      charts: "ready",
      configuration: "ready",
      operationalActivities: "ready"
    });
    expect(properties.pagination).toBeUndefined();
    expect(properties.teams).toEqual([]);
  });

  async function authenticate(nextSession = session()) {
    runtime.render();
    setApiSession(nextSession);
    await flushPromises();
    runtime.render();
    await flushPromises();
    return runtime.render();
  }

  it("opens directly with a demo session when no refresh session exists", async () => {
    const demoSession: LoginResponse = {
      ...session(),
      authenticationMode: "demo",
      user: { ...session().user, email: "demo@shiftflow.local" }
    };
    apiBridge.restoreApiSession.mockReset().mockRejectedValueOnce(new Error("No session"));
    apiBridge.apiRequest.mockResolvedValueOnce(demoSession);

    runtime.render();
    await flushPromises();
    const tree = runtime.render();

    expect(apiBridge.apiRequest).toHaveBeenCalledWith("/api/auth/demo", undefined, {
      method: "POST",
      body: JSON.stringify({})
    });
    expect(textOf(tree)).not.toContain(messages["pt-BR"].loginTitle);
    expect(elements(tree).some((element) => element.type === MainDashboard)).toBe(true);
    expect(
      elements(tree).some(
        (element) =>
          element.type === IconToggle &&
          (element.props as { label?: string }).label === messages["pt-BR"].signOut
      )
    ).toBe(false);
  });

  beforeEach(() => {
    clearApiSession();
    latestRawPage = null;
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
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => (key === "shiftflow.locale" ? "pt-BR" : null)),
      setItem: vi.fn()
    });
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
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function companySession(companyId = "company-a"): LoginResponse {
    const companies = [
      { id: "company-a", name: "London operations", timezone: "Europe/London" },
      { id: "company-b", name: "Brazil operations", timezone: "America/Sao_Paulo" }
    ];
    return {
      ...session(),
      authenticationMode: "required",
      accessToken: `${companyId}-access`,
      user: {
        ...session().user,
        companyId,
        company: companies.find((company) => company.id === companyId)!,
        companies
      }
    };
  }

  function installCompanyBrowser() {
    Object.assign(window, {
      location: { href: "http://localhost:3000/", hostname: "localhost", protocol: "http:" }
    });
    Object.assign(document, { cookie: "" });
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key))
    });
    vi.stubGlobal("fetch", vi.fn());
  }

  it.each(["pt-BR", "en-GB"] as const)(
    "renders coherent company, timezone and user context in %s including monitor mode",
    async (locale) => {
      await authenticate(companySession());
      workspaceProps().setLocale(locale);
      let tree = runtime.render();
      expect(textOf(tree)).toContain("London operations · Europe/London");
      expect(textOf(tree)).toContain("user-a@example.com");
      const selection = elements(tree).find(
        (element) =>
          element.type === "select" && (element.props as { name?: string }).name === "companyId"
      )!;
      const options = elements(selection).filter((element) => element.type === "option");
      expect(options.map((element) => (element.props as { value: string }).value)).toEqual([
        "",
        "company-b"
      ]);
      expect(textOf(selection).replace(/\s+/g, " ")).toContain(
        "Brazil operations · America/Sao_Paulo"
      );
      expect((findByType(tree, "form").props as { "aria-label": string })["aria-label"]).toBe(
        messages[locale].switchCompany
      );
      workspaceProps().toggleMonitorMode();
      tree = runtime.render();
      expect(textOf(tree)).toContain("London operations · Europe/London");
      expect(textOf(tree)).toContain("user-a@example.com");
    }
  );

  it.each(["demo", "portfolio", "legacy", "singleton", "missing", "mismatch", "timezone"])(
    "keeps %s company context fail-closed in the workspace",
    async (kind) => {
      const candidate = companySession();
      if (kind === "demo" || kind === "portfolio") candidate.authenticationMode = kind;
      if (kind === "legacy") delete candidate.authenticationMode;
      if (kind === "singleton") candidate.user.companies = [candidate.user.company!];
      if (kind === "missing") delete candidate.user.company;
      if (kind === "mismatch") candidate.user.companyId = "unexpected-company";
      if (kind === "timezone")
        candidate.user.company = { ...candidate.user.company!, timezone: "Invalid/Zone" };
      const tree = await authenticate(candidate);
      expect(elements(tree).some((element) => element.type === "form")).toBe(false);
      if (["missing", "mismatch", "timezone"].includes(kind)) {
        expect(textOf(tree)).toContain(messages["pt-BR"].companyContextUnavailable);
        expect(textOf(tree)).not.toContain("Europe/London");
      }
    }
  );

  it("submits the real company login, clears its password immediately, blocks duplicate/logout and resets the workspace", async () => {
    installCompanyBrowser();
    await authenticate(companySession());
    const previousKey = latestRawPage?.key;
    workspaceProps().setSearch("old company search");
    runtime.render();
    const previous = workspaceProps();
    const login = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(login.promise);
    const form = new FormData();
    form.set("companyId", "company-b");
    form.set("companyPassword", "test-only-password");
    form.set("email", "untrusted@example.com");
    vi.stubGlobal(
      "FormData",
      class {
        constructor() {
          return form;
        }
      }
    );
    const reset = vi.fn();
    const event = { preventDefault: vi.fn(), currentTarget: { reset } } as unknown as Parameters<
      typeof previous.switchCompany
    >[0];
    const switching = previous.switchCompany(event);
    expect(reset).toHaveBeenCalledOnce();
    await previous.switchCompany(event);
    await previous.logout();
    const busy = runtime.render();
    expect((findByType(busy, "fieldset").props as { disabled: boolean }).disabled).toBe(true);
    expect(
      elements(busy).find(
        (element) =>
          element.type === "button" &&
          (element.props as { "aria-label"?: string })["aria-label"] === messages["pt-BR"].signOut
      )?.props
    ).toMatchObject({ disabled: true });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.body).toBe(
      JSON.stringify({
        email: "user-a@example.com",
        password: "test-only-password",
        companyId: "company-b"
      })
    );
    expect([...new Headers(init?.headers).keys()]).toEqual(["content-type"]);
    expect(apiBridge.apiRequest).not.toHaveBeenCalled();
    const target = companySession("company-b");
    login.resolve({ ok: true, status: 200, json: async () => ({ data: target }) } as Response);
    await switching;
    const tree = runtime.render();
    expect(textOf(tree)).toContain("Brazil operations · America/Sao_Paulo");
    expect(latestRawPage?.key).not.toBe(previousKey);
    expect(workspaceProps().search).toBe("");
    expect(workspaceProps().companySwitchPending).toBe(false);
    expect(sessionStorage.setItem).toHaveBeenCalledWith("shiftflow.reauthentication-required", "1");
    expect(sessionStorage.setItem).toHaveBeenCalledOnce();
  });

  it("blocks a retained selector callback while a record modal preserves its edits", async () => {
    installCompanyBrowser();
    await authenticate(companySession());
    const previous = workspaceProps();
    const modal = {
      mode: "detail" as const,
      entity: "users" as const,
      record: { id: "shared-user", displayName: "Editing" }
    };
    previous.setModal(modal);
    const tree = runtime.render();
    const reset = vi.fn();
    await previous.switchCompany({
      preventDefault: vi.fn(),
      currentTarget: { reset }
    } as unknown as Parameters<typeof previous.switchCompany>[0]);
    expect((findByType(tree, "fieldset").props as { disabled: boolean }).disabled).toBe(true);
    expect(textOf(tree)).toContain(messages["pt-BR"].companySwitchModalBlocked);
    expect(workspaceProps().modal).toEqual(modal);
    expect(reset).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["rejected", "uncertain"])(
    "renders the real company authentication %s outcome",
    async (outcome) => {
      installCompanyBrowser();
      await authenticate(companySession());
      const previous = workspaceProps();
      const form = new FormData();
      form.set("companyId", "company-b");
      form.set("companyPassword", "test-only-password");
      vi.stubGlobal(
        "FormData",
        class {
          constructor() {
            return form;
          }
        }
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        outcome === "rejected"
          ? ({
              ok: false,
              status: 401,
              json: async () => ({ error: { message: "Invalid credentials" } })
            } as Response)
          : ({ ok: true, status: 200, json: async () => ({ data: {} }) } as Response)
      );
      await previous.switchCompany({
        preventDefault: vi.fn(),
        currentTarget: { reset: vi.fn() }
      } as unknown as Parameters<typeof previous.switchCompany>[0]);
      const tree = runtime.render();
      expect(textOf(tree)).toContain(
        outcome === "rejected"
          ? messages["pt-BR"].companySwitchRejected
          : messages["pt-BR"].companySwitchUncertain
      );
      expect(textOf(tree).includes("London operations")).toBe(outcome === "rejected");
    }
  );

  it.each(["pt-BR", "en-GB"] as const)(
    "reports rejected recovery without claiming a retained company in %s",
    async (locale) => {
      installCompanyBrowser();
      sessionStorage.setItem("shiftflow.reauthentication-required", "1");
      vi.mocked(localStorage.getItem).mockImplementation((key) =>
        key === "shiftflow.locale" ? locale : null
      );
      runtime.render();
      await flushPromises();
      const tree = runtime.render();
      const form = new FormData();
      form.set("email", "user-a@example.com");
      form.set("password", "rejected-test-password");
      vi.stubGlobal(
        "FormData",
        class {
          constructor() {
            return form;
          }
        }
      );
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Invalid credentials" } })
      } as Response);
      await (
        findByType(tree, "form").props as { onSubmit: (event: unknown) => Promise<void> }
      ).onSubmit({ preventDefault: vi.fn(), currentTarget: { reset: vi.fn() } });
      const result = textOf(runtime.render());
      expect(result).toContain(messages[locale].loginFailed);
      expect(result).not.toContain(messages[locale].companySwitchRejected);
      expect(sessionStorage.getItem("shiftflow.reauthentication-required")).toBe("1");
      expect(captureApiSessionEpoch()).toBeNull();
      expect(fetch).toHaveBeenCalledOnce();
    }
  );

  it("blocks automatic restoration and public bootstrap after a same-tab uncertain result", async () => {
    installCompanyBrowser();
    sessionStorage.setItem("shiftflow.reauthentication-required", "1");
    vi.stubEnv("NEXT_PUBLIC_PORTFOLIO_LOGIN", "true");
    runtime.render();
    await flushPromises();
    const tree = runtime.render();
    expect(apiBridge.restoreApiSession).not.toHaveBeenCalled();
    expect(apiBridge.apiRequest).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain(messages["pt-BR"].companySwitchUncertain);
    expect(
      elements(tree).find(
        (element) =>
          element.type === "input" && (element.props as { name?: string }).name === "email"
      )?.props
    ).toMatchObject({ readOnly: false });
    const form = new FormData();
    form.set("email", "user-a@example.com");
    form.set("password", "fresh-test-password");
    vi.stubGlobal(
      "FormData",
      class {
        constructor() {
          return form;
        }
      }
    );
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: companySession("company-b") })
    } as Response);
    const reset = vi.fn();
    await (
      findByType(tree, "form").props as { onSubmit: (event: unknown) => Promise<void> }
    ).onSubmit({ preventDefault: vi.fn(), currentTarget: { reset } });
    expect(reset).toHaveBeenCalledOnce();
    expect(textOf(runtime.render())).toContain("Brazil operations · America/Sao_Paulo");
    expect(sessionStorage.getItem("shiftflow.reauthentication-required")).toBeNull();
  });

  it.each([false, true])(
    "rejects four retained Page command entries after Company replacement with cleanup=%s",
    async (cleanup) => {
      const permissions = [
        "dashboard:read",
        "notifications:write",
        "activities:read",
        "activities:write",
        "rbac:read",
        "rbac:write"
      ];
      pageDataBridge.fetchPageData.mockResolvedValue(
        activitySnapshot([activity("activity-a")], 1, 1, 100)
      );
      const initial = await authenticate(scopedSession(permissions));
      clickButton(initial, messages["pt-BR"].kanban);
      runtime.render();
      await flushPromises();
      runtime.render();
      const previous = workspaceProps();
      setApiSession(scopedSession(permissions, "user-a", "company-b"));
      const epochB = captureApiSessionEpoch();
      runtime.renderWithoutEffects();
      if (cleanup) runtime.cleanup();
      const form = new FormData();
      form.set("name", "Obsolete role");
      vi.stubGlobal(
        "FormData",
        class {
          constructor() {
            return form;
          }
        }
      );
      const reset = vi.fn();
      await previous.markNotificationsRead();
      await previous.moveActivity("activity-a", "DONE");
      await previous.createRole({
        preventDefault: vi.fn(),
        currentTarget: { reset }
      } as unknown as Parameters<typeof previous.createRole>[0]);
      await previous.logout();
      expect(apiBridge.apiRequest).not.toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
      expect(captureApiSessionEpoch()).toBe(epochB);
      if (!cleanup) {
        runtime.render();
        expect(workspaceProps()).toMatchObject({
          actionLoading: false,
          notificationPendingId: null,
          dragged: null
        });
      }
    }
  );

  it("keeps current Page commands functional through same-epoch token rotation", async () => {
    installCompanyBrowser();
    const actual = await vi.importActual<typeof ApiModule>("./lib/api");
    const currentSession = scopedSession([
      "dashboard:read",
      "notifications:write",
      "activities:read",
      "activities:write",
      "rbac:read",
      "rbac:write"
    ]);
    pageDataBridge.fetchPageData.mockResolvedValue(
      activitySnapshot([activity("activity-a")], 1, 1, 100)
    );
    const initial = await authenticate(currentSession);
    clickButton(initial, messages["pt-BR"].kanban);
    runtime.render();
    await flushPromises();
    runtime.render();
    const current = workspaceProps();
    const epoch = captureApiSessionEpoch();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { ...currentSession, accessToken: "rotated-token" } })
    } as Response);
    await actual.restoreApiSession();
    expect(captureApiSessionEpoch()).toBe(epoch);
    apiBridge.apiRequest.mockResolvedValue(activity("activity-a", "DONE"));
    const form = new FormData();
    form.set("name", "Current role");
    vi.stubGlobal(
      "FormData",
      class {
        constructor() {
          return form;
        }
      }
    );
    await current.markNotificationsRead();
    await current.createRole({
      preventDefault: vi.fn(),
      currentTarget: { reset: vi.fn() }
    } as unknown as Parameters<typeof current.createRole>[0]);
    await current.moveActivity("activity-a", "DONE");
    await current.logout();
    expect(apiBridge.apiRequest.mock.calls.map(([path]) => path)).toEqual([
      "/api/notifications/mark-all-read",
      "/api/rbac/roles",
      "/api/activities/activity-a/move",
      "/api/auth/logout"
    ]);
    expect(captureApiSessionEpoch()).toBeNull();
  });

  it("keys the authenticated workspace to the active API session epoch", async () => {
    await authenticate(scopedSession(["dashboard:read"], "user-a"));
    const firstEpoch = captureApiSessionEpoch();
    const firstWorkspace = latestRawPage;

    expect(firstWorkspace?.type).toBe(PageWorkspace);
    expect(firstWorkspace?.key).toBe(String(firstEpoch));

    setApiSession(scopedSession(["dashboard:read"], "user-b"));
    await flushPromises();
    runtime.render();
    await flushPromises();
    runtime.render();
    const secondEpoch = captureApiSessionEpoch();
    const secondWorkspace = latestRawPage;

    expect(secondWorkspace?.type).toBe(PageWorkspace);
    expect(secondWorkspace?.key).toBe(String(secondEpoch));
    expect(secondWorkspace?.key).not.toBe(firstWorkspace?.key);
  });

  it("keeps workspace structure, shell classes and callback arguments at the presenter boundary", async () => {
    await authenticate(
      scopedSession([
        "dashboard:read",
        "dashboard:write",
        "rbac:read",
        "rbac:write",
        "activities:read",
        "activities:write"
      ])
    );
    if (!latestRawPage || latestRawPage.type !== PageWorkspace) {
      throw new Error("Authenticated workspace boundary was not rendered");
    }

    const baseProps = latestRawPage.props as Parameters<typeof PageWorkspace>[0];
    const selectView = vi.fn();
    const setSearch = vi.fn();
    const resetDashboardLayout = vi.fn().mockResolvedValue(layouts.MAIN);
    const openDetail = vi.fn().mockResolvedValue(undefined);
    const assignRolePermission = vi.fn().mockResolvedValue(undefined);
    const removeRolePermission = vi.fn().mockResolvedValue(undefined);
    const setModal = vi.fn();
    const reloadAfterModalMutation = vi.fn().mockResolvedValue(undefined);
    const dashboardTree = PageWorkspace({
      ...baseProps,
      authorisedView: "dashboard",
      can: () => true,
      canCreateRecord: () => true,
      drawerOpen: true,
      monitorMode: false,
      navCollapsed: true,
      openDetail,
      resetDashboardLayout,
      selectView,
      setSearch,
      view: "dashboard"
    });

    expect((dashboardTree.props as { className: string }).className).toBe(
      "app-shell nav-collapsed drawer-open"
    );
    const shellChildren = (
      (dashboardTree.props as { children: unknown[] }).children as Array<ReactElement | null>
    ).filter((child): child is ReactElement => child !== null);
    expect(shellChildren.map((child) => child.type)).toEqual(["a", "button", "aside", "main"]);

    const firstMenuItem = baseProps.availableMenu[0];
    if (!firstMenuItem) throw new Error("Expected at least one authorised menu item");
    (findButton(dashboardTree, baseProps.t.dashboard).props as { onClick: () => void }).onClick();
    expect(selectView).toHaveBeenCalledWith(firstMenuItem.id);

    const searchInput = elements(dashboardTree).find(
      (element) =>
        element.type === "input" &&
        (element.props as { "aria-label"?: string })["aria-label"] === baseProps.t.search
    );
    (searchInput?.props as { onChange: (event: { target: { value: string } }) => void }).onChange({
      target: { value: "x".repeat(250) }
    });
    expect(setSearch).toHaveBeenCalledWith("x".repeat(200));

    const mainDashboard = findByType(dashboardTree, MainDashboard);
    await (mainDashboard.props as { onResetLayout: () => Promise<unknown> }).onResetLayout();
    expect(resetDashboardLayout).toHaveBeenCalledWith("MAIN");
    const record = activity("boundary-record");
    (mainDashboard.props as { onOpen: (item: ActivityItem) => void }).onOpen(record);
    expect(openDetail).toHaveBeenCalledWith("activities", record);

    const roleTree = PageWorkspace({
      ...baseProps,
      assignRolePermission,
      authorisedView: "roles",
      can: () => true,
      rbacLoading: false,
      removeRolePermission,
      view: "roles"
    });
    const roleManagement = findByType(roleTree, RoleManagementView);
    (
      roleManagement.props as {
        onAssignPermission: (roleId: string, permissionId: string) => void;
        onRemovePermission: (roleId: string, permissionId: string) => void;
      }
    ).onAssignPermission("role-a", "permission-a");
    (
      roleManagement.props as {
        onRemovePermission: (roleId: string, permissionId: string) => void;
      }
    ).onRemovePermission("role-b", "permission-b");
    expect(assignRolePermission).toHaveBeenCalledWith("role-a", "permission-a");
    expect(removeRolePermission).toHaveBeenCalledWith("role-b", "permission-b");

    const modalTree = PageWorkspace({
      ...baseProps,
      authorisedView: "dashboard",
      modal: { entity: "activities", mode: "create" },
      reloadAfterModalMutation,
      setModal
    });
    const modal = findByType(modalTree, RecordModal);
    (modal.props as { onClose: () => void }).onClose();
    expect(setModal).toHaveBeenCalledWith(null);
    expect((modal.props as { onReload: unknown }).onReload).toBe(reloadAfterModalMutation);

    const monitorTree = PageWorkspace({
      ...baseProps,
      drawerOpen: true,
      modal: null,
      monitorMode: true,
      navCollapsed: true
    });
    expect((monitorTree.props as { className: string }).className).toBe("app-shell monitor-mode");
    const monitorChildren = (
      (monitorTree.props as { children: unknown[] }).children as Array<ReactElement | null>
    ).filter((child): child is ReactElement => child !== null);
    expect(monitorChildren.map((child) => child.type)).toEqual(["a", "main"]);
  });

  it("shows fixed portfolio fields and signs in without sending a credential", async () => {
    vi.stubEnv("NEXT_PUBLIC_PORTFOLIO_ACCESS", "true");
    vi.stubEnv("NEXT_PUBLIC_PORTFOLIO_EMAIL", "observador.executivo@shiftflow.local");
    apiBridge.restoreApiSession.mockRejectedValueOnce(new Error("No session"));

    runtime.render();
    await flushPromises();
    const tree = runtime.render();
    const inputElements = elements(tree).filter((element) => element.type === "input");
    const emailInput = inputElements.find(
      (element) => (element.props as { type?: string }).type === "email"
    );
    const passwordInput = inputElements.find(
      (element) => (element.props as { type?: string }).type === "password"
    );
    const loginForm = elements(tree).find((element) => element.type === "form");

    expect(apiBridge.apiRequest).not.toHaveBeenCalledWith(
      "/api/auth/demo",
      expect.anything(),
      expect.anything()
    );
    expect(emailInput?.props).toMatchObject({
      autoComplete: "off",
      readOnly: true,
      type: "email",
      value: "observador.executivo@shiftflow.local"
    });
    expect((emailInput?.props as { name?: string }).name).toBeUndefined();
    expect(passwordInput?.props).toMatchObject({
      autoComplete: "off",
      readOnly: true,
      type: "password",
      value: "portfolio-access"
    });
    expect((passwordInput?.props as { name?: string }).name).toBeUndefined();
    expect(loginForm?.props).toMatchObject({ autoComplete: "off" });
    expect(textOf(tree)).toContain(messages["pt-BR"].portfolioAccessHint);

    apiBridge.apiRequest.mockResolvedValueOnce({
      ...session(),
      authenticationMode: "portfolio",
      user: {
        ...session().user,
        email: "observador.executivo@shiftflow.local"
      }
    });
    await (
      loginForm?.props as {
        onSubmit: (event: { preventDefault: () => void; currentTarget: object }) => Promise<void>;
      }
    ).onSubmit({ preventDefault: vi.fn(), currentTarget: {} });

    expect(apiBridge.apiRequest).toHaveBeenCalledWith("/api/auth/portfolio", undefined, {
      method: "POST",
      body: JSON.stringify({})
    });
  });

  it("preserves editable credential login when portfolio access is disabled", async () => {
    runtime.render();
    await flushPromises();
    const tree = runtime.render();
    const inputElements = elements(tree).filter((element) => element.type === "input");
    const emailInput = inputElements.find(
      (element) => (element.props as { type?: string }).type === "email"
    );
    const passwordInput = inputElements.find(
      (element) => (element.props as { type?: string }).type === "password"
    );
    const loginForm = elements(tree).find((element) => element.type === "form");

    expect(emailInput?.props).toMatchObject({
      autoComplete: "username",
      name: "email",
      readOnly: false,
      type: "email"
    });
    expect(passwordInput?.props).toMatchObject({
      autoComplete: "current-password",
      name: "password",
      readOnly: false,
      type: "password"
    });
    vi.stubGlobal(
      "FormData",
      class {
        get(name: string) {
          return name === "email" ? "user@example.com" : "test-login-password";
        }
      }
    );
    apiBridge.apiRequest.mockResolvedValueOnce(session());

    await (
      loginForm?.props as {
        onSubmit: (event: { preventDefault: () => void; currentTarget: object }) => Promise<void>;
      }
    ).onSubmit({ preventDefault: vi.fn(), currentTarget: {} });

    expect(apiBridge.apiRequest).toHaveBeenCalledWith("/api/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({
        email: "user@example.com",
        password: "test-login-password"
      })
    });
  });

  it("marks the rendered application subtree with the active locale", async () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    let tree = runtime.render();
    expect((tree.props as { lang?: string }).lang).toBe("en-GB");
    expect(document.documentElement.lang).toBe("en-GB");
    expect(document.title).toBe(`${messages["en-GB"].loginTitle} | Shift-Flow`);

    tree = await authenticate();
    expect((tree.props as { lang?: string }).lang).toBe("en-GB");
    expect(document.documentElement.lang).toBe("en-GB");
    expect(document.title).toBe(`${messages["en-GB"].dashboard} | Shift-Flow`);
    expect(textOf(tree)).toContain("Shift-Flow");

    clickButton(tree, messages["en-GB"].activities);
    tree = runtime.render();
    expect(document.title).toBe(`${messages["en-GB"].activities} | Shift-Flow`);

    (findIconToggle(tree, "en-GB").props as { onClick: () => void }).onClick();
    tree = runtime.render();

    expect((tree.props as { lang?: string }).lang).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(document.title).toBe(`${messages["pt-BR"].activities} | Shift-Flow`);
    expect(findIconToggle(tree, messages["pt-BR"].signOut)).toBeDefined();
  });

  it("restores a saved pt-BR locale over the en-GB default", () => {
    runtime.render();
    const tree = runtime.render();

    expect((tree.props as { lang?: string }).lang).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
  });

  it("defaults a new session to the dark theme and keeps the theme toggle available", async () => {
    let tree = runtime.render();

    expect((tree.props as { "data-theme"?: string })["data-theme"]).toBe("dark");

    tree = await authenticate();
    const themeToggle = findIconToggle(tree, messages["pt-BR"].light);
    (themeToggle.props as { onClick: () => void }).onClick();
    tree = runtime.render();

    expect((tree.props as { "data-theme"?: string })["data-theme"]).toBe("light");
  });

  it("restores a saved light-theme preference over the dark default", () => {
    vi.mocked(localStorage.getItem).mockImplementation((key) =>
      key === "shiftflow.theme" ? "light" : null
    );

    runtime.render();
    const tree = runtime.render();

    expect((tree.props as { "data-theme"?: string })["data-theme"]).toBe("light");
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

  it("opens the notification centre and loads the recipient list from the real API contract", async () => {
    pageDataBridge.fetchUnreadData.mockReset().mockResolvedValueOnce({ unread: 7 });
    const notification: NotificationItem = {
      id: "notification-a",
      type: "SYSTEM",
      title: "Fixture ready",
      body: "Integration data is available.",
      readAt: null,
      createdAt: "2026-08-28T15:04:10.057Z"
    };
    apiBridge.apiRequest.mockResolvedValueOnce({
      items: [notification],
      total: 1,
      page: 1,
      pageSize: 20
    });
    await authenticate();
    await flushPromises();
    let tree = runtime.render();
    let centre = findByType(tree, NotificationCentre);
    let props = centre.props as {
      unread: number;
      open: boolean;
      items: NotificationItem[];
      onToggle: () => void;
    };

    expect(props).toMatchObject({ unread: 7, open: false, items: [] });
    props.onToggle();
    await flushPromises();
    tree = runtime.render();
    centre = findByType(tree, NotificationCentre);
    props = centre.props as typeof props;

    expect(apiBridge.apiRequest).toHaveBeenCalledWith(
      "/api/notifications?page=1&pageSize=20",
      "access-token",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(props).toMatchObject({ unread: 7, open: true, items: [notification] });
  });

  it("normalises the legacy notification count and labels the singular result", async () => {
    pageDataBridge.fetchUnreadData.mockReset().mockResolvedValueOnce({ count: 1 });
    await authenticate();
    await flushPromises();
    const tree = runtime.render();
    const centre = findByType(tree, NotificationCentre);

    expect((centre.props as { unread: number }).unread).toBe(1);
  });

  it("marks one notification as read and updates the visible unread count", async () => {
    pageDataBridge.fetchUnreadData.mockReset().mockResolvedValueOnce({ unread: 1 });
    const notification: NotificationItem = {
      id: "notification-a",
      type: "SYSTEM",
      title: "Fixture ready",
      readAt: null,
      createdAt: "2026-08-28T15:04:10.057Z"
    };
    apiBridge.apiRequest
      .mockResolvedValueOnce({ items: [notification], total: 1, page: 1, pageSize: 20 })
      .mockResolvedValueOnce({ count: 1 });
    let tree = await authenticate(
      scopedSession(["dashboard:read", "notifications:read", "notifications:write"])
    );
    await flushPromises();
    let centre = findByType(tree, NotificationCentre);
    (centre.props as { onToggle: () => void }).onToggle();
    await flushPromises();
    tree = runtime.render();
    centre = findByType(tree, NotificationCentre);
    (centre.props as { onMarkRead: (id: string) => void }).onMarkRead("notification-a");
    await flushPromises();
    tree = runtime.render();
    centre = findByType(tree, NotificationCentre);
    const props = centre.props as { unread: number; items: NotificationItem[] };

    expect(apiBridge.apiRequest).toHaveBeenLastCalledWith(
      "/api/notifications/notification-a/read",
      "user-a-access-token",
      { method: "POST", body: JSON.stringify({}) }
    );
    expect(props.unread).toBe(0);
    expect(props.items[0]?.readAt).toEqual(expect.any(String));
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
