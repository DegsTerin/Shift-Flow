// en-GB: Exercises paginated reference selection without replacing the persisted current value.
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginResponse } from "../lib/types";

const hookBridge = vi.hoisted(() => ({
  useState: (initial: unknown): unknown => initial,
  useRef: (initial: unknown): unknown => ({ current: initial }),
  useMemo: (factory: () => unknown, dependencies: readonly unknown[]): unknown => {
    void dependencies;
    return factory();
  },
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]): void => {
    void effect;
    void dependencies;
  }
}));
const apiBridge = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useState: (initial: unknown) => hookBridge.useState(initial),
    useRef: (initial: unknown) => hookBridge.useRef(initial),
    useMemo: (factory: () => unknown, dependencies: readonly unknown[]) => {
      return hookBridge.useMemo(factory, dependencies);
    },
    useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => {
      return hookBridge.useEffect(effect, dependencies);
    }
  };
});

vi.mock("../lib/api", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiBridge.apiRequest(...args)
  };
});

import { clearApiSession, setApiSession } from "../lib/api";
import { messages } from "../lib/i18n";
import { ReferenceSelectInput } from "./controls";

type StateSlot = { kind: "state"; value: unknown };
type RefSlot = { kind: "ref"; value: { current: unknown } };
type MemoSlot = { kind: "memo"; value: unknown; dependencies: readonly unknown[] };
type EffectSlot = { kind: "effect"; dependencies: readonly unknown[]; cleanup?: () => void };
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
          typeof next === "function" ? (next as (current: unknown) => unknown)(slot.value) : next;
      }
    ];
  }

  useRef(initial: unknown) {
    const index = this.cursor++;
    if (!this.slots[index]) this.slots[index] = { kind: "ref", value: { current: initial } };
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

  render(props: Parameters<typeof ReferenceSelectInput>[0]) {
    this.cursor = 0;
    this.pendingEffects = [];
    const tree = ReferenceSelectInput(props);
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

function elements(node: unknown): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement;
  return [element, ...elements((element.props as { children?: unknown }).children)];
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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

const session: LoginResponse = {
  accessToken: "access-token",
  user: { id: "user-a", email: "user@example.com", companyId: "company-a" }
};

describe("ReferenceSelectInput", () => {
  let runtime: HookRuntime;

  beforeEach(() => {
    runtime = new HookRuntime();
    hookBridge.useState = runtime.useState.bind(runtime);
    hookBridge.useRef = runtime.useRef.bind(runtime);
    hookBridge.useMemo = runtime.useMemo.bind(runtime);
    hookBridge.useEffect = runtime.useEffect.bind(runtime);
    apiBridge.apiRequest.mockReset().mockImplementation(async (path: string) => {
      const page = new URL(path, "https://shiftflow.local").searchParams.get("page");
      return page === "2"
        ? { items: [{ id: "user-26", displayName: "User 26" }], total: 26, page: 2, pageSize: 25 }
        : { items: [{ id: "user-1", displayName: "User 1" }], total: 26, page: 1, pageSize: 25 };
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout
    });
    setApiSession(session);
  });

  afterEach(() => {
    runtime.cleanup();
    clearApiSession();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps compact search and paging tools hidden when the complete option set fits one page", async () => {
    apiBridge.apiRequest.mockResolvedValueOnce({
      items: [{ id: "user-1", displayName: "User 1" }],
      total: 1,
      page: 1,
      pageSize: 25
    });
    const props = {
      t: messages["en-GB"],
      label: "Analyst",
      value: "",
      resource: "users" as const,
      initialItems: [{ id: "user-1", displayName: "User 1" }],
      token: session.accessToken,
      loadEnabled: true,
      compactTools: true
    };

    runtime.render(props);
    await flushPromises();
    const tree = runtime.render(props);
    expect(
      elements(tree).some(
        (element) =>
          element.type === "div" &&
          (element.props as { className?: string }).className === "reference-select-tools"
      )
    ).toBe(false);
  });

  it("reaches and selects a record from the second server page while retaining the old value", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const props = {
      t: messages["en-GB"],
      label: "Analyst",
      name: "assigneeId",
      value: "current-user",
      selectedLabel: "Current user",
      resource: "users" as const,
      initialItems: [{ id: "user-1", displayName: "User 1" }],
      token: session.accessToken,
      loadEnabled: true,
      compactTools: true,
      placeholder: "Unassigned"
    };
    runtime.render(props);
    await flushPromises();
    let tree = runtime.render(props);
    expect(
      elements(tree).some(
        (element) =>
          element.type === "div" &&
          (element.props as { className?: string }).className === "reference-select-tools"
      )
    ).toBe(true);
    const accessiblePage = elements(tree).find(
      (element) =>
        element.type === "span" && (element.props as { className?: string }).className === "sr-only"
    );
    expect(((accessiblePage?.props as { children: unknown[] }).children ?? []).join("")).toBe(
      "Analyst: Page 1 of 2"
    );
    let options = elements(tree).filter((element) => element.type === "option");
    expect(options.map((option) => (option.props as { value?: string }).value)).toContain(
      "current-user"
    );
    const next = elements(tree).find(
      (element) =>
        element.type === "button" &&
        (element.props as { "aria-label"?: string })["aria-label"] === "Next: Analyst"
    );
    if (!next) throw new Error("Reference next-page control was not found");

    (next.props as { onClick: () => void }).onClick();
    runtime.render(props);
    await flushPromises();
    tree = runtime.render(props);
    options = elements(tree).filter((element) => element.type === "option");
    expect(options.map((option) => (option.props as { value?: string }).value)).toEqual(
      expect.arrayContaining(["current-user", "user-26"])
    );

    await vi.advanceTimersByTimeAsync(301);
    runtime.render(props);
    await flushPromises();
    tree = runtime.render(props);
    expect(apiBridge.apiRequest).toHaveBeenCalledTimes(2);
    expect(apiBridge.apiRequest.mock.calls[1]?.[0]).toContain("page=2");
    expect(
      elements(tree).some(
        (element) =>
          element.type === "option" && (element.props as { value?: string }).value === "user-26"
      )
    ).toBe(true);

    const select = elements(tree).find((element) => element.type === "select");
    if (!select) throw new Error("Reference select was not found");
    (select.props as { onChange: (event: { target: { value: string } }) => void }).onChange({
      target: { value: "user-26" }
    });
    tree = runtime.render(props);
    expect(
      (elements(tree).find((element) => element.type === "select")?.props as { value: string })
        .value
    ).toBe("user-26");
  });

  it("retains the label of a newly selected option after paging away from it", async () => {
    const props = {
      t: messages["en-GB"],
      label: "Analyst",
      value: "current-user",
      selectedLabel: "Current user",
      resource: "users" as const,
      initialItems: [{ id: "user-1", displayName: "User 1" }],
      token: session.accessToken,
      loadEnabled: true,
      placeholder: "Unassigned"
    };
    runtime.render(props);
    await flushPromises();
    let tree = runtime.render(props);
    const select = elements(tree).find((element) => element.type === "select");
    if (!select) throw new Error("Reference select was not found");
    (select.props as { onChange: (event: { target: { value: string } }) => void }).onChange({
      target: { value: "user-1" }
    });
    tree = runtime.render(props);
    const next = elements(tree).find(
      (element) =>
        element.type === "button" &&
        (element.props as { "aria-label"?: string })["aria-label"] === "Next: Analyst"
    );
    if (!next) throw new Error("Reference next-page control was not found");

    (next.props as { onClick: () => void }).onClick();
    runtime.render(props);
    await flushPromises();
    tree = runtime.render(props);
    const selectedOption = elements(tree).find(
      (element) =>
        element.type === "option" && (element.props as { value?: string }).value === "user-1"
    );

    expect((selectedOption?.props as { children?: unknown }).children).toBe("User 1");
  });

  it("keeps the confirmed page factual and retries the same requested page after failure", async () => {
    apiBridge.apiRequest
      .mockResolvedValueOnce({
        items: [{ id: "user-1", displayName: "User 1" }],
        total: 26,
        page: 1,
        pageSize: 25
      })
      .mockRejectedValueOnce(new Error("page two unavailable"))
      .mockResolvedValueOnce({
        items: [{ id: "user-26", displayName: "User 26" }],
        total: 26,
        page: 2,
        pageSize: 25
      });
    const props = {
      t: messages["en-GB"],
      label: "Analyst",
      value: "",
      resource: "users" as const,
      initialItems: [] as Array<{ id: string; displayName: string }>,
      token: session.accessToken,
      loadEnabled: true,
      placeholder: "Unassigned"
    };

    runtime.render(props);
    await flushPromises();
    let tree = runtime.render(props);
    let next = elements(tree).find(
      (element) =>
        element.type === "button" &&
        (element.props as { "aria-label"?: string })["aria-label"] === "Next: Analyst"
    );
    if (!next) throw new Error("Reference next-page control was not found");
    (next.props as { onClick: () => void }).onClick();
    runtime.render(props);
    await flushPromises();

    tree = runtime.render(props);
    expect(
      (
        elements(tree).find(
          (element) =>
            element.type === "span" &&
            (element.props as { "aria-hidden"?: string })["aria-hidden"] === "true"
        )?.props as { children?: unknown } | undefined
      )?.children
    ).toEqual([1, "/", 2]);
    expect(
      elements(tree)
        .filter((element) => element.type === "option")
        .map((option) => (option.props as { value?: string }).value)
    ).toContain("user-1");
    next = elements(tree).find(
      (element) =>
        element.type === "button" &&
        (element.props as { "aria-label"?: string })["aria-label"] === "Next: Analyst"
    );
    if (!next) throw new Error("Reference retry control was not found");
    (next.props as { onClick: () => void }).onClick();
    runtime.render(props);
    await flushPromises();
    tree = runtime.render(props);

    expect(apiBridge.apiRequest.mock.calls[1]?.[0]).toContain("page=2");
    expect(apiBridge.apiRequest.mock.calls[2]?.[0]).toContain("page=2");
    expect(
      elements(tree)
        .filter((element) => element.type === "option")
        .map((option) => (option.props as { value?: string }).value)
    ).toContain("user-26");
  });

  it("removes prior-tenant options before the successor request settles or fails", async () => {
    const oldRequest = deferred<{
      items: Array<{ id: string; displayName: string }>;
      total: number;
      page: number;
      pageSize: number;
    }>();
    apiBridge.apiRequest
      .mockReturnValueOnce(oldRequest.promise)
      .mockRejectedValueOnce(new Error("successor unavailable"));
    const propsA = {
      t: messages["en-GB"],
      label: "Analyst",
      value: "user-a",
      selectedLabel: "Tenant A user",
      resource: "users" as const,
      initialItems: [{ id: "user-a", displayName: "Tenant A user" }],
      token: session.accessToken,
      loadEnabled: true,
      placeholder: "Unassigned"
    };

    runtime.render(propsA);
    const sessionB: LoginResponse = {
      accessToken: "access-b",
      user: { id: "user-b", email: "b@example.com", companyId: "company-b" }
    };
    setApiSession(sessionB);
    const propsB = {
      ...propsA,
      value: "",
      selectedLabel: undefined,
      initialItems: [{ id: "user-b", displayName: "Tenant B user" }],
      token: sessionB.accessToken
    };
    let tree = runtime.render(propsB);

    expect(
      elements(tree)
        .filter((element) => element.type === "option")
        .map((option) => (option.props as { value?: string }).value)
    ).not.toContain("user-a");
    oldRequest.resolve({
      items: [{ id: "user-a", displayName: "Late tenant A user" }],
      total: 1,
      page: 1,
      pageSize: 25
    });
    await flushPromises();
    runtime.render(propsB);
    await flushPromises();
    tree = runtime.render(propsB);

    const values = elements(tree)
      .filter((element) => element.type === "option")
      .map((option) => (option.props as { value?: string }).value);
    expect(values).not.toContain("user-a");
    expect(values).toContain("user-b");
  });
});
