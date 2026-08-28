// en-GB: Exercises task-board authority and stale request settlement through the real component.
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityTaskBoard, LoginResponse } from "../lib/types";

const hookBridge = vi.hoisted(() => ({
  useState: (initial: unknown): unknown => {
    void initial;
    throw new Error("Hook runtime is not installed");
  },
  useRef: (initial: unknown): unknown => {
    void initial;
    throw new Error("Hook runtime is not installed");
  },
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]): void => {
    void effect;
    void dependencies;
    throw new Error("Hook runtime is not installed");
  }
}));

const apiBridge = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useState: (initial: unknown) => hookBridge.useState(initial),
    useRef: (initial: unknown) => hookBridge.useRef(initial),
    useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) =>
      hookBridge.useEffect(effect, dependencies)
  };
});

vi.mock("../lib/api", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiBridge.apiRequest(...args)
  };
});

import {
  captureApiSessionEpoch,
  clearApiSession,
  isApiSessionEpochCurrent,
  setApiSession
} from "../lib/api";
import { messages } from "../lib/i18n";
import { InternalTaskBoard, InternalTaskCard } from "./record-modal-task-board";

type StateSlot = { kind: "state"; value: unknown };
type RefSlot = { kind: "ref"; value: { current: unknown } };
type EffectSlot = {
  kind: "effect";
  dependencies: readonly unknown[];
  cleanup?: () => void;
};
type HookSlot = StateSlot | RefSlot | EffectSlot;

function dependenciesMatch(left: readonly unknown[], right: readonly unknown[]) {
  return (
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  );
}

class HookRuntime {
  private cursor = 0;
  private readonly slots: HookSlot[] = [];
  private pendingEffects: Array<() => void> = [];
  private active = true;
  updatesAfterCleanup = 0;
  globalReconciliations = 0;
  private mutationPending = false;

  private readonly runTaskBoardMutation: Parameters<
    typeof InternalTaskBoard
  >[0]["runTaskBoardMutation"] = async (authorised, request, hooks) => {
    if (!authorised || this.mutationPending) return "IGNORED";
    const epoch = captureApiSessionEpoch();
    if (epoch === null) return "STALE";
    this.mutationPending = true;
    try {
      await request(new AbortController().signal);
      if (!isApiSessionEpochCurrent(epoch)) return "STALE";
      this.globalReconciliations += 1;
      await hooks?.onCurrentSuccess?.(epoch);
      await hooks?.reconcileLocal?.(epoch);
      return "SUCCEEDED";
    } catch {
      if (!isApiSessionEpochCurrent(epoch)) return "STALE";
      this.globalReconciliations += 1;
      await hooks?.reconcileLocal?.(epoch);
      return "FAILED";
    } finally {
      this.mutationPending = false;
    }
  };

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
        if (!this.active) {
          this.updatesAfterCleanup += 1;
          return;
        }
        slot.value =
          typeof next === "function" ? (next as (previous: unknown) => unknown)(slot.value) : next;
      }
    ];
  }

  useRef(initial: unknown) {
    const index = this.cursor++;
    if (!this.slots[index]) this.slots[index] = { kind: "ref", value: { current: initial } };
    return (this.slots[index] as RefSlot).value;
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

  render(overrides: Partial<Parameters<typeof InternalTaskBoard>[0]> = {}) {
    this.active = true;
    this.cursor = 0;
    this.pendingEffects = [];
    const tree = InternalTaskBoard({
      activityId: "activity-a",
      t: messages["en-GB"],
      token: session.accessToken,
      users: [],
      attachments: [],
      locale: "en-GB",
      busy: false,
      canWrite: false,
      canDelete: false,
      runTaskBoardMutation: this.runTaskBoardMutation,
      ...overrides
    });
    const effects = this.pendingEffects;
    this.pendingEffects = [];
    effects.forEach((effect) => effect());
    return tree;
  }

  cleanup() {
    this.slots.forEach((slot) => {
      if (slot.kind === "effect") slot.cleanup?.();
    });
    this.active = false;
  }
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

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function board(name: string): ActivityTaskBoard {
  return {
    columns: [
      {
        id: `column-${name}`,
        name,
        position: 0,
        tasks: [
          {
            id: `task-${name}`,
            columnId: `column-${name}`,
            title: `Task ${name}`,
            position: 0
          }
        ]
      }
    ]
  };
}

function movableBoard(): ActivityTaskBoard {
  return {
    columns: [
      {
        id: "column-source",
        name: "Source",
        position: 0,
        tasks: [{ id: "task-movable", columnId: "column-source", title: "Movable", position: 0 }]
      },
      { id: "column-target", name: "Target", position: 1, tasks: [] }
    ]
  };
}

function orderedBoard(): ActivityTaskBoard {
  return {
    columns: [
      {
        id: "column-ordered",
        name: "Ordered",
        position: 0,
        tasks: [
          { id: "task-a", columnId: "column-ordered", title: "A", position: 0 },
          {
            id: "task-b",
            columnId: "column-ordered",
            title: "B",
            position: 1,
            priority: "CRITICAL"
          },
          { id: "task-c", columnId: "column-ordered", title: "C", position: 2 }
        ]
      }
    ]
  };
}

const session: LoginResponse = {
  accessToken: "access-token",
  user: {
    id: "user-a",
    email: "user-a@example.com",
    companyId: "company-a",
    permissions: ["activities:read", "activities:delete"]
  }
};

describe("InternalTaskBoard request lifecycle", () => {
  let runtime: HookRuntime;

  beforeEach(() => {
    runtime = new HookRuntime();
    hookBridge.useState = runtime.useState.bind(runtime);
    hookBridge.useRef = runtime.useRef.bind(runtime);
    hookBridge.useEffect = runtime.useEffect.bind(runtime);
    apiBridge.apiRequest.mockReset();
    setApiSession(session);
  });

  afterEach(() => {
    runtime.cleanup();
    clearApiSession();
  });

  it("loads the board for a read-only activity capability", async () => {
    apiBridge.apiRequest.mockResolvedValueOnce(board("Read only"));

    runtime.render();
    await flushPromises();
    const tree = runtime.render();

    expect(apiBridge.apiRequest).toHaveBeenCalledOnce();
    expect(apiBridge.apiRequest.mock.calls[0]?.[0]).toBe("/api/activities/activity-a/task-board");
    expect(apiBridge.apiRequest.mock.calls[0]?.[2]).toMatchObject({
      signal: expect.any(AbortSignal)
    });
    expect(textOf(tree)).toContain("Read only");
  });

  it("disables impossible boundary column moves and emits no reorder command", async () => {
    apiBridge.apiRequest.mockResolvedValueOnce(movableBoard());
    runtime.render({ canWrite: true });
    await flushPromises();
    const tree = runtime.render({ canWrite: true });
    const buttons = elements(tree).filter((element) => element.type === "button");
    const firstLeft = buttons.find(
      (element) =>
        (element.props as { "aria-label"?: string })["aria-label"] === "Move left: Source"
    );
    const firstRight = buttons.find(
      (element) =>
        (element.props as { "aria-label"?: string })["aria-label"] === "Move right: Source"
    );
    const lastLeft = buttons.find(
      (element) =>
        (element.props as { "aria-label"?: string })["aria-label"] === "Move left: Target"
    );
    const lastRight = buttons.find(
      (element) =>
        (element.props as { "aria-label"?: string })["aria-label"] === "Move right: Target"
    );
    if (!firstLeft || !firstRight || !lastLeft || !lastRight) {
      throw new Error("Column movement controls were not found");
    }

    expect((firstLeft.props as { disabled?: boolean }).disabled).toBe(true);
    expect((firstRight.props as { disabled?: boolean }).disabled).toBe(false);
    expect((lastLeft.props as { disabled?: boolean }).disabled).toBe(false);
    expect((lastRight.props as { disabled?: boolean }).disabled).toBe(true);
    (firstLeft.props as { onClick: () => void }).onClick();
    (lastRight.props as { onClick: () => void }).onClick();
    await flushPromises();
    expect(apiBridge.apiRequest).toHaveBeenCalledOnce();
  });

  it("permits delete independently, serialises commands and reloads once", async () => {
    apiBridge.apiRequest
      .mockResolvedValueOnce(board("Deletable"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ columns: [] });
    runtime.render({ canDelete: true });
    await flushPromises();
    const tree = runtime.render({ canDelete: true });
    const taskCard = elements(tree).find((element) => element.type === InternalTaskCard);
    if (!taskCard) throw new Error("Internal task card was not found");
    const renderedCard = InternalTaskCard(taskCard.props as Parameters<typeof InternalTaskCard>[0]);
    const deleteButton = elements(renderedCard).find(
      (element) =>
        element.type === "button" &&
        (element.props as { "aria-label"?: string })["aria-label"] === "Delete: Task Deletable"
    );
    if (!deleteButton) throw new Error("Real task delete button was not found");
    const onDelete = (deleteButton.props as { onClick: () => void }).onClick;

    onDelete();
    onDelete();
    await flushPromises();

    expect(apiBridge.apiRequest).toHaveBeenCalledTimes(3);
    expect(apiBridge.apiRequest.mock.calls[1]?.[0]).toBe(
      "/api/activities/activity-a/task-board/tasks/task-Deletable"
    );
    expect(apiBridge.apiRequest.mock.calls[1]?.[2]).toMatchObject({
      method: "DELETE",
      signal: expect.any(AbortSignal)
    });
    expect(apiBridge.apiRequest.mock.calls[2]?.[0]).toBe("/api/activities/activity-a/task-board");
  });

  it("names and activates the real edit and archive task controls independently", async () => {
    apiBridge.apiRequest
      .mockResolvedValueOnce(board("Operable"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(board("Archived"));
    runtime.render({ canWrite: true });
    await flushPromises();
    const tree = runtime.render({ canWrite: true });
    const taskCard = elements(tree).find((element) => element.type === InternalTaskCard);
    if (!taskCard) throw new Error("Internal task card was not found");
    const renderedCard = InternalTaskCard(taskCard.props as Parameters<typeof InternalTaskCard>[0]);
    const buttons = elements(renderedCard).filter((element) => element.type === "button");
    const editButton = buttons.find(
      (element) =>
        (element.props as { "aria-label"?: string })["aria-label"] === "Edit: Task Operable"
    );
    const archiveButton = buttons.find(
      (element) =>
        (element.props as { "aria-label"?: string })["aria-label"] === "Archive: Task Operable"
    );
    if (!editButton || !archiveButton) throw new Error("Task edit/archive controls were not found");

    (editButton.props as { onClick: () => void }).onClick();
    (archiveButton.props as { onClick: () => void }).onClick();
    await flushPromises();

    expect(apiBridge.apiRequest.mock.calls[1]?.[0]).toBe(
      "/api/activities/activity-a/task-board/tasks/task-Operable/archive"
    );
  });

  it("moves a task without persisting an actor-locale automatic note", async () => {
    apiBridge.apiRequest
      .mockResolvedValueOnce(movableBoard())
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(movableBoard());
    runtime.render({ canWrite: true });
    await flushPromises();
    let tree = runtime.render({ canWrite: true });
    const taskCard = elements(tree).find((element) => element.type === InternalTaskCard);
    if (!taskCard) throw new Error("Internal task card was not found");

    (taskCard.props as { onDragStart: () => void }).onDragStart();
    tree = runtime.render({ canWrite: true });
    const columns = elements(tree).filter(
      (element) =>
        element.type === "section" &&
        (element.props as { className?: string }).className === "internal-kanban-column"
    );
    const target = columns[1];
    if (!target) throw new Error("Target task column was not found");
    (target.props as { onDrop: (event: never) => void }).onDrop({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as never);
    await flushPromises();

    expect(apiBridge.apiRequest.mock.calls[1]?.[0]).toBe(
      "/api/activities/activity-a/task-board/tasks/task-movable/move"
    );
    expect(apiBridge.apiRequest.mock.calls[1]?.[2]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ columnId: "column-target", position: 0 })
    });
  });

  it("moves a task through a named button and emits nothing beyond the boundary", async () => {
    apiBridge.apiRequest
      .mockResolvedValueOnce(orderedBoard())
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(orderedBoard());
    runtime.render({ canWrite: true });
    await flushPromises();
    const tree = runtime.render({ canWrite: true });
    const cards = elements(tree).filter((element) => element.type === InternalTaskCard);
    const firstCard = cards.find(
      (element) => (element.props as { task: { id: string } }).task.id === "task-a"
    );
    const middleCard = cards.find(
      (element) => (element.props as { task: { id: string } }).task.id === "task-b"
    );
    if (!firstCard || !middleCard) throw new Error("Ordered task cards were not found");

    (firstCard.props as { onMoveBefore: () => void }).onMoveBefore();
    await flushPromises();
    expect(apiBridge.apiRequest).toHaveBeenCalledOnce();

    const renderedMiddleCard = InternalTaskCard(
      middleCard.props as Parameters<typeof InternalTaskCard>[0]
    );
    const moveBefore = elements(renderedMiddleCard).find(
      (element) =>
        element.type === "button" &&
        (element.props as { "aria-label"?: string })["aria-label"] === "Move before: B"
    );
    if (!moveBefore) throw new Error("Named move-before control was not found");
    expect(textOf(renderedMiddleCard)).toContain("Critical");
    (moveBefore.props as { onClick: () => void }).onClick();
    await flushPromises();

    expect(apiBridge.apiRequest).toHaveBeenCalledTimes(3);
    expect(apiBridge.apiRequest.mock.calls[1]?.[0]).toBe(
      "/api/activities/activity-a/task-board/tasks/task-b/move"
    );
    expect(apiBridge.apiRequest.mock.calls[1]?.[2]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ columnId: "column-ordered", position: 0 })
    });
  });

  it("keeps the successor activity board when an older load settles last", async () => {
    const first = deferred<ActivityTaskBoard>();
    const second = deferred<ActivityTaskBoard>();
    apiBridge.apiRequest
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    runtime.render({ activityId: "activity-a" });
    const firstSignal = (apiBridge.apiRequest.mock.calls[0]?.[2] as { signal?: AbortSignal })
      .signal;
    runtime.render({ activityId: "activity-b" });
    second.resolve(board("Successor"));
    await flushPromises();
    let tree = runtime.render({ activityId: "activity-b" });
    expect(textOf(tree)).toContain("Successor");

    first.resolve(board("Obsolete"));
    await flushPromises();
    tree = runtime.render({ activityId: "activity-b" });

    expect(firstSignal?.aborted).toBe(true);
    expect(textOf(tree)).toContain("Successor");
    expect(textOf(tree)).not.toContain("Obsolete");
  });

  it("reconciles a pending mutation after unmount without updating local state", async () => {
    const pendingDelete = deferred<unknown>();
    apiBridge.apiRequest
      .mockResolvedValueOnce(board("Pending"))
      .mockImplementationOnce(() => pendingDelete.promise);
    runtime.render({ canDelete: true });
    await flushPromises();
    const tree = runtime.render({ canDelete: true });
    const taskCard = elements(tree).find(
      (element) => typeof element.type === "function" && element.type.name === "InternalTaskCard"
    );
    if (!taskCard) throw new Error("Internal task card was not found");

    (taskCard.props as { onDelete: () => void }).onDelete();
    const signal = (apiBridge.apiRequest.mock.calls[1]?.[2] as { signal?: AbortSignal }).signal;
    runtime.cleanup();
    pendingDelete.resolve(undefined);
    await flushPromises();

    expect(signal?.aborted).toBe(false);
    expect(apiBridge.apiRequest).toHaveBeenCalledTimes(2);
    expect(runtime.globalReconciliations).toBe(1);
    expect(runtime.updatesAfterCleanup).toBe(0);
  });

  it("suppresses a load response after the API session identity changes", async () => {
    const pending = deferred<ActivityTaskBoard>();
    apiBridge.apiRequest.mockReturnValueOnce(pending.promise);
    runtime.render();
    setApiSession({
      ...session,
      accessToken: "other-access-token",
      user: { ...session.user, id: "user-b", companyId: "company-b" }
    });
    pending.resolve(board("Other tenant"));
    await flushPromises();
    const tree = runtime.render();

    expect(textOf(tree)).not.toContain("Other tenant");
  });

  it("does not reconcile a task mutation into a successor session", async () => {
    const pendingDelete = deferred<unknown>();
    apiBridge.apiRequest
      .mockResolvedValueOnce(board("Pending"))
      .mockImplementationOnce(() => pendingDelete.promise);
    runtime.render({ canDelete: true });
    await flushPromises();
    const tree = runtime.render({ canDelete: true });
    const taskCard = elements(tree).find((element) => element.type === InternalTaskCard);
    if (!taskCard) throw new Error("Internal task card was not found");

    (taskCard.props as { onDelete: () => void }).onDelete();
    setApiSession({
      ...session,
      accessToken: "other-access-token",
      user: { ...session.user, id: "user-b", companyId: "company-b" }
    });
    runtime.cleanup();
    pendingDelete.resolve(undefined);
    await flushPromises();

    expect(runtime.globalReconciliations).toBe(0);
    expect(apiBridge.apiRequest).toHaveBeenCalledTimes(2);
    expect(runtime.updatesAfterCleanup).toBe(0);
  });
});
