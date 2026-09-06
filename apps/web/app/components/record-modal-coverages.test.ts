// en-GB: Exercises real coverage panel reads, civil-time submission and stale-context admission without a browser runtime.
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginResponse, ShiftCoverageItem } from "../lib/types";

const bridge = vi.hoisted(() => ({
  useState: (initial: unknown): unknown => {
    void initial;
    throw new Error("Missing hook runtime");
  },
  useRef: (initial: unknown): unknown => {
    void initial;
    throw new Error("Missing hook runtime");
  },
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]): void => {
    void effect;
    void dependencies;
    throw new Error("Missing hook runtime");
  },
  request: vi.fn()
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useState: (initial: unknown) => bridge.useState(initial),
  useRef: (initial: unknown) => bridge.useRef(initial),
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) =>
    bridge.useEffect(effect, dependencies)
}));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiRequest: (...args: unknown[]) => bridge.request(...args)
}));

import { captureApiSessionEpoch, clearApiSession, setApiSession } from "../lib/api";
import { messages } from "../lib/i18n";
import { ReferenceSelectInput } from "./controls";
import { ShiftCoverages, type CoverageMutationRunner } from "./record-modal-coverages";

type Slot =
  | { kind: "state"; value: unknown }
  | { kind: "ref"; value: { current: unknown } }
  | { kind: "effect"; dependencies: readonly unknown[]; cleanup?: () => void };
class HookRuntime {
  private cursor = 0;
  private slots: Slot[] = [];
  private effects: Array<() => void> = [];
  private active = true;
  updatesAfterCleanup = 0;
  useState(initial: unknown) {
    const index = this.cursor++;
    if (!this.slots[index])
      this.slots[index] = {
        kind: "state",
        value: typeof initial === "function" ? (initial as () => unknown)() : initial
      };
    const slot = this.slots[index] as Extract<Slot, { kind: "state" }>;
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
    return (this.slots[index] as Extract<Slot, { kind: "ref" }>).value;
  }
  useEffect(effect: () => void | (() => void), dependencies: readonly unknown[]) {
    const index = this.cursor++;
    const previous = this.slots[index] as Extract<Slot, { kind: "effect" }> | undefined;
    if (
      previous &&
      previous.dependencies.length === dependencies.length &&
      dependencies.every((value, position) => Object.is(value, previous.dependencies[position]))
    )
      return;
    this.effects.push(() => {
      previous?.cleanup?.();
      const cleanup = effect();
      this.slots[index] = {
        kind: "effect",
        dependencies,
        ...(typeof cleanup === "function" ? { cleanup } : {})
      };
    });
  }
  render(
    props: Parameters<typeof ShiftCoverages>[0],
    beforeEffects?: (tree: ReactElement) => void
  ) {
    this.cursor = 0;
    this.effects = [];
    const tree = ShiftCoverages(props);
    beforeEffects?.(tree);
    this.effects.forEach((effect) => effect());
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
function button(tree: ReactElement, label: string) {
  const found = elements(tree).find(
    (element) => element.type === "button" && textOf(element) === label
  );
  if (!found) throw new Error(`Button not found: ${label}`);
  return found.props as { disabled: boolean; onClick: () => void };
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
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
const session: LoginResponse = {
  accessToken: "access-a",
  user: {
    id: "actor-a",
    email: "actor@example.com",
    companyId: "company-a",
    permissions: ["shifts:read", "shifts:write", "users:read"]
  }
};
const row: ShiftCoverageItem = {
  id: "coverage-a",
  shiftId: "shift-a",
  userId: "user-a",
  replacementForUserId: "user-b",
  type: "SUBSTITUTE",
  startsAt: "2026-09-04T08:00:00.123Z",
  endsAt: "2026-09-04T16:00:00.000Z",
  note: "Persisted note",
  user: { id: "user-a", displayName: "Historical analyst", status: "INACTIVE" },
  replacementForUser: { id: "user-b", displayName: "Replaced analyst" }
};
const NativeFormData = FormData;
function submitted(tree: ReactElement, fields: Record<string, string> = {}) {
  const data = new NativeFormData();
  Object.entries({
    userId: "user-a",
    startsAt: "2026-09-04T09:00:00.123",
    endsAt: "2026-09-04T17:00",
    type: "REGULAR",
    ...fields
  }).forEach(([key, value]) => data.set(key, value));
  vi.stubGlobal(
    "FormData",
    class {
      constructor() {
        return data;
      }
    }
  );
  const reset = vi.fn();
  const form = elements(tree).find((element) => element.type === "form");
  if (!form) throw new Error("Coverage form missing");
  const submit = (form.props as { onSubmit: (event: unknown) => Promise<void> }).onSubmit;
  return { reset, run: () => submit({ preventDefault: vi.fn(), currentTarget: { reset } }) };
}

describe("ShiftCoverages", () => {
  let runtime: HookRuntime;
  let props: Parameters<typeof ShiftCoverages>[0];
  beforeEach(() => {
    runtime = new HookRuntime();
    bridge.useState = runtime.useState.bind(runtime);
    bridge.useRef = runtime.useRef.bind(runtime);
    bridge.useEffect = runtime.useEffect.bind(runtime);
    bridge.request.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
    setApiSession(session);
    const runner: CoverageMutationRunner = async (authorised, operation, hooks) => {
      if (!authorised) return "IGNORED";
      try {
        await operation(new AbortController().signal);
        const epoch = captureApiSessionEpoch();
        if (epoch === null) return "STALE";
        hooks.onCurrentSuccess(epoch);
        await hooks.reconcileLocal(epoch);
        return "SUCCEEDED";
      } catch {
        return "FAILED";
      }
    };
    props = {
      shiftId: "shift-a",
      timezone: "Europe/London",
      t: messages["en-GB"],
      locale: "en-GB",
      token: session.accessToken,
      users: [],
      canWrite: true,
      canLoadUsers: true,
      editing: false,
      busy: false,
      runCoverageMutation: vi.fn(runner)
    };
  });
  afterEach(() => {
    runtime.cleanup();
    clearApiSession();
    vi.unstubAllGlobals();
  });

  it.each(["en-GB", "pt-BR"] as const)(
    "renders truthful loading, empty and error/retry states in %s",
    async (locale) => {
      props = { ...props, locale, t: messages[locale] };
      const read = deferred<unknown>();
      bridge.request.mockReturnValueOnce(read.promise);
      let tree = runtime.render(props);
      expect(textOf(tree)).toContain(props.t.loading);
      expect(textOf(tree)).not.toContain(props.t.coverageEmpty);
      expect(
        elements(tree).some(
          (element) => (element.props as { "aria-busy"?: boolean })["aria-busy"] === true
        )
      ).toBe(true);
      read.reject(new Error("Service unavailable"));
      await flush();
      tree = runtime.render(props);
      expect(textOf(tree)).toContain(props.t.coverageLoadFailed);
      expect(textOf(tree)).not.toContain(props.t.coverageEmpty);
      button(tree, props.t.refresh).onClick();
      await flush();
      tree = runtime.render(props);
      expect(textOf(tree)).toContain(props.t.coverageEmpty);
      expect(textOf(tree).replace(/\s+/g, " ")).toContain(`0 ${props.t.records}`);
      expect(bridge.request).toHaveBeenCalledTimes(2);
    }
  );

  it("consults historical public references without users catalogue permission", async () => {
    props = { ...props, canLoadUsers: false };
    bridge.request.mockResolvedValueOnce({ items: [row], total: 1, page: 1, pageSize: 25 });
    runtime.render(props);
    await flush();
    const tree = runtime.render(props);
    expect(textOf(tree)).toContain("Historical analyst");
    expect(textOf(tree)).toContain("Replaced analyst");
    expect(textOf(tree)).toContain("09:00");
    expect(textOf(tree)).toContain("Europe/London");
    expect(textOf(tree)).toContain(props.t.coverageReferenceRequired);
    expect(elements(tree).filter((element) => element.type === ReferenceSelectInput)).toHaveLength(
      0
    );
    expect(bridge.request).toHaveBeenCalledOnce();
    expect(bridge.request).toHaveBeenCalledWith(
      "/api/shifts/shift-a/coverages?page=1&pageSize=25",
      "access-a",
      { signal: expect.any(AbortSignal) }
    );
  });

  it("uses bounded real pages, preserves out-of-range totals and suppresses obsolete responses", async () => {
    bridge.request.mockResolvedValueOnce({ items: [row], total: 26, page: 1, pageSize: 25 });
    runtime.render(props);
    await flush();
    const second = deferred<unknown>();
    bridge.request.mockReturnValueOnce(second.promise);
    button(runtime.render(props), props.t.next).onClick();
    let tree = runtime.render(props);
    expect(textOf(tree)).not.toContain("Historical analyst");
    expect(bridge.request).toHaveBeenLastCalledWith(
      "/api/shifts/shift-a/coverages?page=2&pageSize=25",
      "access-a",
      { signal: expect.any(AbortSignal) }
    );
    button(tree, props.t.previous).onClick();
    runtime.render(props);
    await flush();
    second.resolve({
      items: [{ ...row, note: "Obsolete page" }],
      total: 26,
      page: 2,
      pageSize: 25
    });
    await flush();
    tree = runtime.render(props);
    expect(textOf(tree)).not.toContain("Obsolete page");
    bridge.request.mockResolvedValueOnce({ items: [row], total: 26, page: 1, pageSize: 25 });
    button(tree, props.t.refresh).onClick();
    await flush();
    button(runtime.render(props), props.t.next).onClick();
    bridge.request.mockResolvedValueOnce({ items: [], total: 1, page: 2, pageSize: 25 });
    runtime.render(props);
    await flush();
    tree = runtime.render(props);
    expect(textOf(tree).replace(/\s+/g, " ")).toContain("Page 2");
    expect(textOf(tree).replace(/\s+/g, " ")).toContain("1 records");
    expect(textOf(tree)).toContain(props.t.coverageEmpty);
    expect(button(tree, props.t.next).disabled).toBe(true);
    expect(button(tree, props.t.previous).disabled).toBe(false);
  });

  it.each(["before-effects", "after-request"])(
    "rejects retained page-one Refresh %s without cancelling the page-two read",
    async (phase) => {
      bridge.request.mockResolvedValueOnce({ items: [row], total: 26, page: 1, pageSize: 25 });
      runtime.render(props);
      await flush();
      const firstPage = runtime.render(props);
      const retainedRefresh = button(firstPage, props.t.refresh).onClick;
      const second = deferred<unknown>();
      bridge.request.mockReturnValueOnce(second.promise);
      button(firstPage, props.t.next).onClick();
      runtime.render(props, () => {
        if (phase !== "before-effects") return;
        retainedRefresh();
        expect(bridge.request).toHaveBeenCalledOnce();
      });
      expect(bridge.request).toHaveBeenCalledTimes(2);
      const signal = (bridge.request.mock.calls[1][2] as { signal: AbortSignal }).signal;
      expect(signal.aborted).toBe(false);
      if (phase === "after-request") retainedRefresh();
      expect(bridge.request).toHaveBeenCalledTimes(2);
      expect(signal.aborted).toBe(false);
      expect(bridge.request).toHaveBeenLastCalledWith(
        "/api/shifts/shift-a/coverages?page=2&pageSize=25",
        "access-a",
        { signal }
      );
      second.resolve({
        items: [{ ...row, note: "Page two coverage" }],
        total: 26,
        page: 2,
        pageSize: 25
      });
      await flush();
      const tree = runtime.render(props);
      expect(textOf(tree).replace(/\s+/g, " ")).toContain("Page 2");
      expect(textOf(tree)).toContain("Page two coverage");
      expect(textOf(tree)).not.toContain(props.t.loading);
      expect(signal.aborted).toBe(false);
    }
  );

  it("reports pagination mismatch as unavailable rather than an empty page", async () => {
    bridge.request.mockResolvedValueOnce({ items: [], total: 0, page: 2, pageSize: 25 });
    runtime.render(props);
    await flush();
    const tree = runtime.render(props);
    expect(textOf(tree)).toContain(props.t.coverageLoadFailed);
    expect(textOf(tree)).not.toContain(props.t.coverageEmpty);
  });

  it.each(["REGULAR", "ON_CALL", "VACATION", "SUBSTITUTE", "ABSENCE"])(
    "posts %s with explicit millisecond instants and reloads the real page",
    async (type) => {
      runtime.render(props);
      await flush();
      const tree = runtime.render(props);
      const fields = elements(tree).filter((element) => element.type === ReferenceSelectInput);
      expect(fields).toHaveLength(2);
      expect(fields[0].props).toMatchObject({
        resource: "users",
        name: "userId",
        loadEnabled: true,
        required: true
      });
      expect(fields[1].props).toMatchObject({
        resource: "users",
        name: "replacementForUserId",
        loadEnabled: true
      });
      const action = submitted(tree, { type, replacementForUserId: "user-a", note: "A note" });
      bridge.request.mockResolvedValueOnce({ id: "created-but-not-yet-listed" });
      const reload = deferred<unknown>();
      bridge.request.mockReturnValueOnce(reload.promise);
      const saving = action.run();
      await flush();
      expect(bridge.request).toHaveBeenNthCalledWith(
        2,
        "/api/shifts/shift-a/coverages",
        "access-a",
        {
          method: "POST",
          body: JSON.stringify({
            userId: "user-a",
            type,
            startsAt: "2026-09-04T08:00:00.123Z",
            endsAt: "2026-09-04T16:00:00.000Z",
            replacementForUserId: "user-a",
            note: "A note"
          }),
          signal: expect.any(AbortSignal)
        }
      );
      expect(bridge.request).toHaveBeenNthCalledWith(
        3,
        "/api/shifts/shift-a/coverages?page=1&pageSize=25",
        "access-a",
        { signal: expect.any(AbortSignal) }
      );
      expect(textOf(runtime.render(props))).not.toContain("created-but-not-yet-listed");
      reload.resolve({ items: [row], total: 1, page: 1, pageSize: 25 });
      await saving;
      expect(action.reset).toHaveBeenCalledOnce();
      expect(textOf(runtime.render(props))).toContain("Persisted note");
    }
  );

  it.each(["2026-03-29T01:30", "2026-10-25T01:30", "2026-02-30T09:00", "2026-09-04T17:00"])(
    "rejects gap, fold, impossible or inverted start %s without dispatch",
    async (startsAt) => {
      runtime.render(props);
      await flush();
      await submitted(runtime.render(props), { startsAt }).run();
      expect(props.runCoverageMutation).not.toHaveBeenCalled();
      expect(bridge.request).toHaveBeenCalledOnce();
      expect(textOf(runtime.render(props))).toContain(props.t.coverageInvalidPeriod);
    }
  );

  it.each([undefined, "Invalid/Zone"])(
    "does not invent a zone when the parent has %s",
    async (timezone) => {
      props = { ...props, timezone };
      runtime.render(props);
      await flush();
      const tree = runtime.render(props);
      expect(textOf(tree)).toContain(props.t.coverageZoneUnavailable);
      expect(
        elements(tree)
          .filter((element) => element.type === "input")
          .every((element) => (element.props as { disabled: boolean }).disabled)
      ).toBe(true);
      await submitted(tree).run();
      expect(props.runCoverageMutation).not.toHaveBeenCalled();
    }
  );

  it.each(["canWrite", "canLoadUsers", "editing", "busy"] as const)(
    "blocks a retained form after the live %s admission changes",
    async (field) => {
      runtime.render(props);
      await flush();
      const action = submitted(runtime.render(props));
      props = { ...props, [field]: field === "editing" || field === "busy" };
      runtime.render(props);
      await action.run();
      expect(props.runCoverageMutation).not.toHaveBeenCalled();
      expect(action.reset).not.toHaveBeenCalled();
    }
  );

  it("excludes duplicate submits and preserves input after a failed POST", async () => {
    runtime.render(props);
    await flush();
    const action = submitted(runtime.render(props));
    const saving = deferred<unknown>();
    bridge.request.mockReturnValueOnce(saving.promise);
    const first = action.run();
    await action.run();
    expect(props.runCoverageMutation).toHaveBeenCalledOnce();
    saving.reject(new Error("Conflict"));
    await first;
    expect(action.reset).not.toHaveBeenCalled();
    expect(bridge.request).toHaveBeenCalledTimes(2);
  });

  it.each(["record", "timezone"])(
    "hides old rows before effects and rejects old callbacks after %s replacement",
    async (change) => {
      bridge.request.mockResolvedValueOnce({ items: [row], total: 1, page: 1, pageSize: 25 });
      runtime.render(props);
      await flush();
      const old = runtime.render(props);
      const action = submitted(old);
      props =
        change === "record"
          ? { ...props, shiftId: "shift-b" }
          : { ...props, timezone: "America/Sao_Paulo" };
      runtime.render(props, (tree) => expect(textOf(tree)).not.toContain("Historical analyst"));
      await action.run();
      button(old, props.t.refresh).onClick();
      expect(props.runCoverageMutation).not.toHaveBeenCalled();
      expect(bridge.request).toHaveBeenCalledTimes(2);
    }
  );

  it.each(["session", "unmount"])(
    "suppresses late reads and retained submissions after %s",
    async (change) => {
      const read = deferred<unknown>();
      bridge.request.mockReturnValueOnce(read.promise);
      const action = submitted(runtime.render(props));
      if (change === "unmount") runtime.cleanup();
      else setApiSession({ ...session, user: { ...session.user, companyId: "company-b" } });
      read.resolve({ items: [row], total: 1, page: 1, pageSize: 25 });
      await flush();
      await action.run();
      expect(props.runCoverageMutation).not.toHaveBeenCalled();
      expect(bridge.request).toHaveBeenCalledOnce();
      expect(runtime.updatesAfterCleanup).toBe(0);
      if (change === "session")
        expect(textOf(runtime.render(props))).not.toContain("Historical analyst");
    }
  );

  it.each(["record", "session", "unmount"])(
    "does not reset a replaced form or reload its old page after pending POST and %s",
    async (change) => {
      runtime.render(props);
      await flush();
      const action = submitted(runtime.render(props));
      const response = deferred<unknown>();
      bridge.request.mockReturnValueOnce(response.promise);
      const saving = action.run();
      if (change === "unmount") runtime.cleanup();
      else if (change === "session")
        setApiSession({ ...session, user: { ...session.user, companyId: "company-b" } });
      else runtime.render({ ...props, shiftId: "shift-b" });
      response.resolve({ id: "late-coverage" });
      await saving;
      expect(action.reset).not.toHaveBeenCalled();
      expect(
        bridge.request.mock.calls.filter(
          ([path]) => path === "/api/shifts/shift-a/coverages?page=1&pageSize=25"
        )
      ).toHaveLength(1);
      expect(runtime.updatesAfterCleanup).toBe(0);
    }
  );
});
