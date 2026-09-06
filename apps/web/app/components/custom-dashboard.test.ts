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
import { messages } from "../lib/i18n";
import {
  CustomizableDashboard,
  displayWidgetTitle,
  type DashboardWidgetDefinition
} from "./custom-dashboard";

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
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, reject, resolve };
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
  if (
    element.type === "button" &&
    (props["aria-label"] === label || textOf(element).includes(label))
  ) {
    return element;
  }
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

const texts = messages["en-GB"] as Texts;

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

const twoDefinitions: DashboardWidgetDefinition[] = [
  ...definitions,
  {
    key: "summary-pending",
    title: "Pending",
    widgetType: "SUMMARY_CARD",
    defaultWidth: 2,
    defaultHeight: 2,
    render: () => null
  }
];

const metricTitleCases = [
  {
    key: "chart-shift",
    label: "byShift",
    aliases: [
      "Incidentes por turno",
      "Incidents by shift",
      "Atividades por turno",
      "Activities by shift"
    ]
  },
  {
    key: "chart-status",
    label: "byStatus",
    aliases: [
      "Evolucao mensal",
      "Evolução mensal",
      "Monthly evolution",
      "Monthly trend",
      "Atividades por status",
      "Activities by status"
    ]
  },
  {
    key: "team-productivity",
    label: "byTeam",
    aliases: [
      "Produtividade por analista",
      "Productivity by analyst",
      "Analyst productivity",
      "Atividades por equipe",
      "Activities by team"
    ]
  },
  {
    key: "team-risk",
    label: "byPriority",
    aliases: ["SLA em risco", "SLA at risk", "Atividades por prioridade", "Activities by priority"]
  }
] as const;

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

function twoWidgetConfiguration(): DashboardConfiguration {
  const first = configuration().widgets[0];
  if (!first) throw new Error("Expected base widget");
  return {
    ...configuration(),
    widgets: [
      first,
      {
        ...first,
        key: "summary-pending",
        title: "Pendentes",
        order: 1,
        gridColumn: 7
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

  it("resets the draft before the successor tenant can persist a dashboard change", async () => {
    const first = deferred<DashboardConfiguration>();
    const onSave = vi
      .fn<(next: DashboardConfiguration) => Promise<DashboardConfiguration>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async (next) => next);
    const propsA = {
      t: texts,
      config: configuration(),
      definitions,
      onSave,
      onReset: vi.fn(async () => configuration())
    };

    runtime.render(propsA);
    listeners.get("shiftflow:customize-dashboard")?.();
    let tree = runtime.render(propsA);
    click(tree, texts.increaseWidth);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    setApiSession(session("company-b"));
    const propsB = {
      ...propsA,
      config: configuration({ gridWidth: 8, gridHeight: 6 })
    };
    runtime.render(propsB);
    first.resolve(configuration({ gridWidth: 9, gridHeight: 7 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    runtime.render(propsB);
    expect(onSave).toHaveBeenCalledTimes(1);
    listeners.get("shiftflow:customize-dashboard")?.();
    tree = runtime.render(propsB);
    click(tree, texts.pin);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].widgets[0]).toMatchObject({
      gridWidth: 8,
      gridHeight: 6,
      isPinned: true
    });
  });

  it("exits editing and discards queued writes when configuration authority is revoked", async () => {
    const first = deferred<DashboardConfiguration>();
    const onSave = vi
      .fn<(next: DashboardConfiguration) => Promise<DashboardConfiguration>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async (next) => next);
    const baseProps = {
      t: texts,
      config: configuration(),
      definitions,
      onSave,
      onReset: vi.fn(async () => configuration())
    };

    runtime.render({ ...baseProps, canConfigure: true });
    listeners.get("shiftflow:customize-dashboard")?.();
    let tree = runtime.render({ ...baseProps, canConfigure: true });
    click(tree, texts.increaseWidth);
    tree = runtime.render({ ...baseProps, canConfigure: true });
    click(tree, texts.increaseHeight);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    runtime.render({ ...baseProps, canConfigure: false });
    first.resolve(configuration({ gridWidth: 3 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    tree = runtime.render({ ...baseProps, canConfigure: false });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(() => findButton(tree, texts.increaseWidth)).toThrow();
    listeners.get("shiftflow:customize-dashboard")?.();
    tree = runtime.render({ ...baseProps, canConfigure: false });
    expect(() => findButton(tree, texts.increaseWidth)).toThrow();
  });

  it("rolls two rejected queued edits back to the last server-confirmed configuration", async () => {
    const first = deferred<DashboardConfiguration>();
    const second = deferred<DashboardConfiguration>();
    const onSave = vi
      .fn<(next: DashboardConfiguration) => Promise<DashboardConfiguration>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
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

    first.reject(new Error("first rejected"));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    second.reject(new Error("second rejected"));
    await vi.waitFor(() => {
      tree = runtime.render(props);
      expect(textOf(tree)).toContain("second rejected");
    });

    const widget = elements(tree).find(
      (element) =>
        element.type === "article" &&
        String((element.props as { className?: string }).className).includes("dashboard-widget")
    );
    expect((widget?.props as { style?: unknown }).style).toMatchObject({
      gridColumn: "span 2",
      minHeight: "176px"
    });
  });

  it("rolls a rejected newer edit back to an older normalised server success", async () => {
    const first = deferred<DashboardConfiguration>();
    const second = deferred<DashboardConfiguration>();
    const onSave = vi
      .fn<(next: DashboardConfiguration) => Promise<DashboardConfiguration>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
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

    first.resolve(configuration({ gridWidth: 5, gridHeight: 2 }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    second.reject(new Error("newer rejected"));
    await vi.waitFor(() => {
      tree = runtime.render(props);
      expect(textOf(tree)).toContain("newer rejected");
    });

    const widget = elements(tree).find(
      (element) =>
        element.type === "article" &&
        String((element.props as { className?: string }).className).includes("dashboard-widget")
    );
    expect((widget?.props as { style?: unknown }).style).toMatchObject({
      gridColumn: "span 5",
      minHeight: "176px"
    });
  });

  it("keeps the editor open and exposes a late persistence error", async () => {
    const operation = deferred<DashboardConfiguration>();
    const props = {
      t: texts,
      config: configuration(),
      definitions,
      onSave: vi.fn(() => operation.promise),
      onReset: vi.fn(async () => configuration())
    };

    runtime.render(props);
    listeners.get("shiftflow:customize-dashboard")?.();
    let tree = runtime.render(props);
    click(tree, texts.increaseWidth);
    tree = runtime.render(props);

    expect(
      (findButton(tree, texts.exitCustomization).props as { disabled?: boolean }).disabled
    ).toBe(true);
    operation.reject(new Error("save remained visible"));
    await vi.waitFor(() => {
      tree = runtime.render(props);
      expect(textOf(tree)).toContain("save remained visible");
    });
    expect(() => findButton(tree, texts.increaseWidth)).not.toThrow();
  });

  it("blocks reset, cancel and exit immediately after a persistence intent starts", async () => {
    const operation = deferred<DashboardConfiguration>();
    const onSave = vi.fn(() => operation.promise);
    const onReset = vi.fn(async () => configuration());
    const props = {
      t: texts,
      config: configuration(),
      definitions,
      onSave,
      onReset
    };

    runtime.render(props);
    listeners.get("shiftflow:customize-dashboard")?.();
    const staleTree = runtime.render(props);
    click(staleTree, texts.increaseWidth);
    click(staleTree, texts.restoreDefault);
    click(staleTree, texts.cancel);
    click(staleTree, texts.exitCustomization);

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onReset).not.toHaveBeenCalled();
    expect(() => findButton(runtime.render(props), texts.increaseWidth)).not.toThrow();

    operation.resolve(configuration({ gridWidth: 3 }));
    await vi.waitFor(() => {
      const tree = runtime.render(props);
      expect(
        (findButton(tree, texts.exitCustomization).props as { disabled?: boolean }).disabled
      ).toBe(false);
    });
  });

  it("treats reset as a barrier against widget mutations", async () => {
    const operation = deferred<DashboardConfiguration>();
    const onSave = vi.fn(async (next: DashboardConfiguration) => next);
    const onReset = vi.fn(() => operation.promise);
    const props = {
      t: texts,
      config: configuration(),
      definitions,
      onSave,
      onReset
    };

    runtime.render(props);
    listeners.get("shiftflow:customize-dashboard")?.();
    const staleTree = runtime.render(props);
    click(staleTree, texts.restoreDefault);
    click(staleTree, texts.increaseWidth);

    await vi.waitFor(() => expect(onReset).toHaveBeenCalledOnce());
    expect(onSave).not.toHaveBeenCalled();

    operation.resolve(configuration());
    await vi.waitFor(() => {
      const tree = runtime.render(props);
      expect(
        (findButton(tree, texts.exitCustomization).props as { disabled?: boolean }).disabled
      ).toBe(false);
    });
  });

  it("reorders widgets with the keyboard-equivalent controls", async () => {
    const onSave = vi.fn(async (next: DashboardConfiguration) => next);
    const props = {
      t: texts,
      config: twoWidgetConfiguration(),
      definitions: twoDefinitions,
      onSave,
      onReset: vi.fn(async () => twoWidgetConfiguration())
    };

    runtime.render(props);
    listeners.get("shiftflow:customize-dashboard")?.();
    const tree = runtime.render(props);
    click(tree, `${texts.moveWidgetLater}: Total`);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce());

    expect(onSave.mock.calls[0]?.[0].widgets.map((widget) => widget.key)).toEqual([
      "summary-pending",
      "summary-total"
    ]);
  });

  it("localises only recognised internal titles and preserves custom titles", () => {
    const definition = definitions[0];
    if (!definition) throw new Error("Expected widget definition");

    expect(
      displayWidgetTitle(configuration({ title: "Atividades totais" }).widgets[0]!, definition)
    ).toBe("Total");
    expect(
      displayWidgetTitle(configuration({ title: "Owner total" }).widgets[0]!, definition)
    ).toBe("Owner total");
  });

  it.each(metricTitleCases)(
    "relabels persisted $key defaults without changing custom titles",
    ({ key, label, aliases }) => {
      for (const locale of ["pt-BR", "en-GB"] as const) {
        const t = messages[locale];
        const definition: DashboardWidgetDefinition = {
          key,
          title: t[label],
          widgetType: "BAR_CHART",
          defaultWidth: 6,
          defaultHeight: 3,
          render: () => null
        };
        for (const title of aliases) {
          const widget = configuration({ key, title }).widgets[0]!;
          expect(displayWidgetTitle(widget, definition, t.copySuffix)).toBe(t[label]);
          expect(widget.title).toBe(title);
          expect(
            displayWidgetTitle(
              {
                ...widget,
                key: `${key}-1700000000000-1`,
                settings: { sourceKey: key, titlePresentation: "LOCALISED_COPY" }
              },
              definition,
              t.copySuffix
            )
          ).toBe(`${t[label]} ${t.copySuffix}`);
        }
        const custom = configuration({ key, title: "Owner's regional comparison" }).widgets[0]!;
        expect(displayWidgetTitle(custom, definition, t.copySuffix)).toBe(
          "Owner's regional comparison"
        );
        expect(
          displayWidgetTitle(
            { ...custom, settings: { sourceKey: key, titlePresentation: "LOCALISED_COPY" } },
            definition,
            t.copySuffix
          )
        ).toBe(`Owner's regional comparison ${t.copySuffix}`);
      }
    }
  );

  it.each(metricTitleCases)(
    "keeps persisted $key copies locale-neutral after relabelling",
    async ({ key, label, aliases }) => {
      const onSave = vi.fn(async (next: DashboardConfiguration) => next);
      const definition: DashboardWidgetDefinition = {
        key,
        title: texts[label],
        widgetType: "BAR_CHART",
        defaultWidth: 6,
        defaultHeight: 3,
        render: () => null
      };
      const props = {
        t: texts,
        config: configuration({ key, title: aliases[0], widgetType: "BAR_CHART" }),
        definitions: [definition],
        onSave,
        onReset: vi.fn(async () => configuration())
      };
      runtime.render(props);
      listeners.get("shiftflow:customize-dashboard")?.();
      click(runtime.render(props), texts.duplicate);
      await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce());

      const saved = onSave.mock.calls[0]?.[0];
      if (!saved) throw new Error("Expected persisted dashboard configuration");
      expect(saved.widgets.map((widget) => widget.title)).toEqual([aliases[0], aliases[0]]);
      expect(saved.widgets[0]?.key).toBe(key);
      const duplicate = saved.widgets[1];
      if (!duplicate) throw new Error("Expected duplicated metric widget");
      expect(duplicate.settings).toMatchObject({
        sourceKey: key,
        titlePresentation: "LOCALISED_COPY"
      });
      for (const locale of ["pt-BR", "en-GB"] as const) {
        const t = messages[locale];
        expect(
          displayWidgetTitle(duplicate, { ...definition, title: t[label] }, t.copySuffix)
        ).toBe(`${t[label]} ${t.copySuffix}`);
      }
    }
  );

  it("persists locale-neutral duplicate metadata and presents the active locale", async () => {
    const onSave = vi.fn(async (next: DashboardConfiguration) => next);
    const props = {
      t: texts,
      config: configuration({ title: "Atividades totais" }),
      definitions,
      onSave,
      onReset: vi.fn(async () => configuration())
    };

    runtime.render(props);
    listeners.get("shiftflow:customize-dashboard")?.();
    click(runtime.render(props), texts.duplicate);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce());

    const saved = onSave.mock.calls[0]?.[0];
    if (!saved) throw new Error("Expected persisted dashboard configuration");
    expect(saved.widgets.map((widget) => widget.title)).toEqual([
      "Atividades totais",
      "Atividades totais"
    ]);
    expect(saved.widgets[1]?.settings).toMatchObject({
      sourceKey: "summary-total",
      titlePresentation: "LOCALISED_COPY"
    });
    const duplicate = saved.widgets[1];
    const englishDefinition = definitions[0];
    if (!duplicate || !englishDefinition) throw new Error("Expected duplicated widget");
    expect(displayWidgetTitle(duplicate, englishDefinition, messages["en-GB"].copySuffix)).toBe(
      "Total copy"
    );
    expect(
      displayWidgetTitle(
        duplicate,
        { ...englishDefinition, title: messages["pt-BR"].total },
        messages["pt-BR"].copySuffix
      )
    ).toBe("Atividades totais cópia");
  });
});
