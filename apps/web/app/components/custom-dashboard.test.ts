// en-GB: Exercises dashboard persistence ordering and draft protection through the real component.
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardConfiguration, LoginResponse, Texts } from "../lib/types";

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
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]): void => {
    void effect;
    void dependencies;
    throw new Error("Hook runtime is not installed");
  }
}));

vi.mock("react", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useState: (initial: unknown) => hookBridge.useState(initial),
    useRef: (initial: unknown) => hookBridge.useRef(initial),
    useMemo: (factory: () => unknown, dependencies: readonly unknown[]) =>
      hookBridge.useMemo(factory, dependencies),
    useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) =>
      hookBridge.useEffect(effect, dependencies)
  };
});

import { clearApiSession, setApiSession } from "../lib/api";
import { CustomizableDashboard, type DashboardWidgetDefinition } from "./custom-dashboard";

type StateSlot = { kind: "state"; value: unknown };
type RefSlot = { kind: "ref"; value: { current: unknown } };
type MemoSlot = { kind: "memo"; value: unknown; dependencies: readonly unknown[] };
type EffectSlot = {
  kind: "effect";
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
  private pendingEffects: Array<() => void> = [];

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

  useEffect(effect: () => void | (() => void), dependencies: readonly unknown[]) {
    const index = this.cursor++;
    const current = this.slots[index] as EffectSlot | undefined;
    if (current && dependenciesMatch(current.dependencies, dependencies)) return;
    this.pendingEffects.push(() => {
      current?.cleanup?.();
      const cleanup = effect();
      this.slots[index] = {
        kind: "effect",
        dependencies,
        ...(typeof cleanup === "function" ? { cleanup } : {})
      };
    });
  }

  render(props: Parameters<typeof CustomizableDashboard>[0]) {
    this.cursor = 0;
    this.pendingEffects = [];
    const tree = CustomizableDashboard(props);
    const effects = this.pendingEffects;
    this.pendingEffects = [];
    effects.forEach((effect) => effect());
    return tree;
  }

  cleanup() {
    this.slots.forEach((slot) => {
      if (slot.kind === "effect") slot.cleanup?.();
    });
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function findButton(node: unknown, label: string): ReactElement {
  if (Array.isArray(node)) {
    for (const child of node) {
      try {
        return findButton(child, label);
      } catch {
        // Continue through sibling elements until the labelled button is found.
      }
    }
    throw new Error(`Button not found: ${label}`);
  }
  if (!node || typeof node !== "object" || !("props" in node)) {
    throw new Error(`Button not found: ${label}`);
  }
  const element = node as ReactElement;
  const props = element.props as { children?: unknown; "aria-label"?: string };
  if (element.type === "button" && props["aria-label"] === label) return element;
  return findButton(props.children, label);
}

function click(tree: ReactElement, label: string) {
  const button = findButton(tree, label);
  (button.props as { onClick: () => void }).onClick();
}

function session(companyId: string): LoginResponse {
  return {
    accessToken: `token-${companyId}`,
    user: { id: `user-${companyId}`, email: `${companyId}@example.com`, companyId }
  };
}

const texts = {
  addWidget: "Add widget",
  hiddenWidgets: "Hidden widgets",
  dashboardSaved: "Layout saved",
  dashboardSaveFailed: "Save failed",
  customizeDashboard: "Customise dashboard",
  restoreDefault: "Restore default",
  cancel: "Cancel",
  save: "Save",
  pin: "Pin",
  unpin: "Unpin",
  decreaseWidth: "Decrease width",
  increaseWidth: "Increase width",
  decreaseHeight: "Decrease height",
  increaseHeight: "Increase height",
  duplicate: "Duplicate",
  hide: "Hide",
  delete: "Delete"
} as Texts;

const definitions: DashboardWidgetDefinition[] = [
  {
    key: "summary-total",
    title: "Total",
    widgetType: "SUMMARY_CARD",
    defaultWidth: 2,
    defaultHeight: 2,
    render: () => null
  }
];

function configuration(patch: Partial<DashboardConfiguration["widgets"][number]> = {}) {
  return {
    dashboardType: "MAIN" as const,
    gridColumns: 12,
    gridGap: 16,
    widgets: [
      {
        key: "summary-total",
        widgetType: "SUMMARY_CARD" as const,
        title: "Total",
        gridColumn: 1,
        gridRow: 1,
        gridWidth: 2,
        gridHeight: 2,
        isVisible: true,
        isPinned: false,
        order: 0,
        ...patch
      }
    ]
  };
}

describe("CustomizableDashboard persistence integration", () => {
  let runtime: HookRuntime;
  let listeners: Map<string, () => void>;

  beforeEach(() => {
    runtime = new HookRuntime();
    hookBridge.useState = runtime.useState.bind(runtime);
    hookBridge.useRef = runtime.useRef.bind(runtime);
    hookBridge.useMemo = runtime.useMemo.bind(runtime);
    hookBridge.useEffect = runtime.useEffect.bind(runtime);
    listeners = new Map();
    vi.stubGlobal("window", {
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
      removeEventListener: (name: string, listener: () => void) => {
        if (listeners.get(name) === listener) listeners.delete(name);
      }
    });
    setApiSession(session("company-a"));
  });

  afterEach(() => {
    runtime.cleanup();
    clearApiSession();
    vi.unstubAllGlobals();
  });

  it("preserves cumulative edits when an intermediate parent response rerenders", async () => {
    const first = deferred<DashboardConfiguration>();
    const second = deferred<DashboardConfiguration>();
    let parentConfig: DashboardConfiguration = configuration();
    const onSave = vi.fn((next: DashboardConfiguration) => {
      const callIndex = onSave.mock.calls.length - 1;
      const operation = callIndex === 0 ? first.promise : callIndex === 1 ? second.promise : next;
      return Promise.resolve(operation).then((saved) => {
        parentConfig = saved;
        return saved;
      });
    });
    const props = () => ({
      t: texts,
      config: parentConfig,
      definitions,
      onSave,
      onReset: vi.fn(async () => configuration())
    });

    runtime.render(props());
    listeners.get("shiftflow:customize-dashboard")?.();
    let tree = runtime.render(props());
    click(tree, texts.increaseWidth);
    tree = runtime.render(props());
    click(tree, texts.increaseHeight);

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    first.resolve(configuration({ gridWidth: 3 }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));

    runtime.render(props());
    tree = runtime.render(props());
    click(tree, texts.pin);
    second.resolve(configuration({ gridWidth: 3, gridHeight: 3 }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));

    expect(onSave.mock.calls[2][0].widgets[0]).toMatchObject({
      gridWidth: 3,
      gridHeight: 3,
      isPinned: true
    });
  });

  it("does not start a queued write after the authenticated tenant changes", async () => {
    const first = deferred<DashboardConfiguration>();
    const onSave = vi
      .fn<(next: DashboardConfiguration) => Promise<DashboardConfiguration>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async (next) => next);
    const props = {
      t: texts,
      config: configuration(),
      definitions,
      onSave,
      onReset: vi.fn(async () => configuration())
    };

    runtime.render(props);
    listeners.get("shiftflow:customize-dashboard")?.();
    let tree = runtime.render(props);
    click(tree, texts.increaseWidth);
    tree = runtime.render(props);
    click(tree, texts.increaseHeight);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    setApiSession(session("company-b"));
    first.resolve(configuration({ gridWidth: 3 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not apply a completed write response after the authenticated tenant changes", async () => {
    const first = deferred<DashboardConfiguration>();
    const onSave = vi
      .fn<(next: DashboardConfiguration) => Promise<DashboardConfiguration>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async (next) => next);
    const props = {
      t: texts,
      config: configuration(),
      definitions,
      onSave,
      onReset: vi.fn(async () => configuration())
    };

    runtime.render(props);
    listeners.get("shiftflow:customize-dashboard")?.();
    let tree = runtime.render(props);
    click(tree, texts.increaseWidth);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    setApiSession(session("company-b"));
    first.resolve(configuration({ gridWidth: 9, gridHeight: 7 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    tree = runtime.render(props);
    click(tree, texts.pin);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].widgets[0]).toMatchObject({
      gridWidth: 3,
      gridHeight: 2,
      isPinned: true
    });
  });
});
