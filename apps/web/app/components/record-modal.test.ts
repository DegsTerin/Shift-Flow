// en-GB: Exercises modal mutation authority and stale settlement through the real component.
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginResponse, RecordModalCapabilities } from "../lib/types";

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

import { clearApiSession, setApiSession } from "../lib/api";
import { messages } from "../lib/i18n";
import { ActivityDetail } from "./record-modal-activity-detail";
import { CreateForm } from "./record-modal-create-form";
import { GenericDetail, RecordModal } from "./record-modal";

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

  render(props: Parameters<typeof RecordModal>[0], beforeEffects?: (tree: ReactElement) => void) {
    this.active = true;
    this.cursor = 0;
    this.pendingEffects = [];
    const tree = RecordModal(props);
    beforeEffects?.(tree);
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
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, reject, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const session: LoginResponse = {
  accessToken: "access-token",
  user: {
    id: "user-a",
    email: "user-a@example.com",
    companyId: "company-a",
    permissions: ["activities:read", "activities:write", "activities:delete"]
  }
};

const none: RecordModalCapabilities = {
  canWrite: false,
  canDelete: false,
  canComment: false,
  canAddMembers: false,
  canRemoveMembers: false
};

function modalProps(capabilities: RecordModalCapabilities) {
  return {
    state: {
      mode: "detail" as const,
      entity: "activities" as const,
      record: { id: "activity-a", title: "Activity A", status: "PENDING" }
    },
    t: messages["en-GB"],
    token: session.accessToken,
    locale: "en-GB" as const,
    clients: [],
    users: [],
    teams: [],
    shifts: [],
    roles: [],
    capabilities,
    onClose: vi.fn(),
    onReload: vi.fn(async (epoch: number) => {
      void epoch;
    })
  };
}

function teamModalProps(capabilities: RecordModalCapabilities) {
  return {
    ...modalProps(capabilities),
    state: {
      mode: "detail" as const,
      entity: "teams" as const,
      record: { id: "team-a", name: "Team A", members: [] }
    },
    users: [{ id: "user-b", displayName: "User B" }]
  };
}

describe("RecordModal mutation lifecycle", () => {
  let runtime: HookRuntime;

  beforeEach(() => {
    runtime = new HookRuntime();
    hookBridge.useState = runtime.useState.bind(runtime);
    hookBridge.useRef = runtime.useRef.bind(runtime);
    hookBridge.useEffect = runtime.useEffect.bind(runtime);
    apiBridge.apiRequest.mockReset();
    vi.stubGlobal("document", {
      activeElement: null,
      body: { classList: { add: vi.fn(), remove: vi.fn() } }
    });
    setApiSession(session);
  });

  it("wires UTF-8 byte validation into new-user password input", () => {
    const tree = CreateForm({
      entity: "users",
      t: messages["en-GB"],
      clients: [],
      users: [],
      teams: [],
      shifts: [],
      roles: [],
      busy: false,
      onSubmit: vi.fn()
    });
    const password = elements(tree).find(
      (element) =>
        element.type === "input" && (element.props as { name?: string }).name === "password"
    );
    const setCustomValidity = vi.fn();

    expect(password?.props).toMatchObject({ maxLength: 72, required: true });
    (
      password?.props as {
        onInput: (event: {
          currentTarget: { value: string; setCustomValidity: typeof setCustomValidity };
        }) => void;
      }
    ).onInput({ currentTarget: { value: `Aa1!${"é".repeat(35)}`, setCustomValidity } });
    expect(setCustomValidity).toHaveBeenCalledWith(messages["en-GB"].passwordUtf8Limit);
  });

  afterEach(() => {
    runtime.cleanup();
    clearApiSession();
    vi.unstubAllGlobals();
  });

  it("keeps defensive mutation callbacks inert for a read-only modal", async () => {
    const tree = runtime.render(modalProps(none));
    const detail = elements(tree).find((element) => element.type === ActivityDetail);
    if (!detail) throw new Error("Activity detail was not found");
    const callbacks = detail.props as {
      onCloseActivity: () => void;
      onReopenActivity: () => void;
      onRemove: () => void;
    };

    callbacks.onCloseActivity();
    callbacks.onReopenActivity();
    callbacks.onRemove();
    await flushPromises();

    expect(apiBridge.apiRequest).not.toHaveBeenCalled();
  });

  it("names the dialog, focuses its close control, traps focus and restores the trigger", () => {
    const trigger = { focus: vi.fn(), isConnected: true };
    const first = { focus: vi.fn() };
    const last = { focus: vi.fn() };
    (document as unknown as { activeElement: unknown }).activeElement = trigger;
    const props = modalProps(none);
    const tree = runtime.render(props, (committedTree) => {
      const committedElements = elements(committedTree);
      const dialog = committedElements.find(
        (element) =>
          element.type === "section" && (element.props as { role?: string }).role === "dialog"
      );
      const close = committedElements.find(
        (element) =>
          element.type === "button" &&
          (element.props as { "aria-label"?: string })["aria-label"] === messages["en-GB"].close
      );
      (
        dialog?.props as {
          ref?: { current: unknown };
        }
      ).ref!.current = { querySelectorAll: () => [first, last] };
      (close?.props as { ref?: { current: unknown } }).ref!.current = first;
    });
    const dialog = elements(tree).find(
      (element) =>
        element.type === "section" && (element.props as { role?: string }).role === "dialog"
    );
    const title = elements(tree).find(
      (element) => element.type === "h2" && (element.props as { id?: string }).id
    );
    if (!dialog || !title) throw new Error("Named dialog was not found");

    expect(dialog.props).toMatchObject({
      "aria-labelledby": (title.props as { id: string }).id,
      "aria-modal": "true",
      tabIndex: -1
    });
    expect(first.focus).toHaveBeenCalledOnce();

    (document as unknown as { activeElement: unknown }).activeElement = last;
    const tabEvent = { key: "Tab", shiftKey: false, preventDefault: vi.fn() };
    (dialog.props as { onKeyDown: (event: typeof tabEvent) => void }).onKeyDown(tabEvent);
    expect(tabEvent.preventDefault).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledTimes(2);

    (document as unknown as { activeElement: unknown }).activeElement = first;
    const reverseTabEvent = { key: "Tab", shiftKey: true, preventDefault: vi.fn() };
    (dialog.props as { onKeyDown: (event: typeof reverseTabEvent) => void }).onKeyDown(
      reverseTabEvent
    );
    expect(reverseTabEvent.preventDefault).toHaveBeenCalledOnce();
    expect(last.focus).toHaveBeenCalledOnce();

    const escapeEvent = { key: "Escape", shiftKey: false, preventDefault: vi.fn() };
    (dialog.props as { onKeyDown: (event: typeof escapeEvent) => void }).onKeyDown(escapeEvent);
    expect(props.onClose).toHaveBeenCalledOnce();
    runtime.cleanup();
    expect(trigger.focus).toHaveBeenCalledOnce();
  });

  it("keeps generic delete and membership callbacks inert without their capabilities", async () => {
    const tree = runtime.render(teamModalProps(none));
    const detail = elements(tree).find((element) => element.type === GenericDetail);
    if (!detail) throw new Error("Generic detail was not found");
    const callbacks = detail.props as {
      onAddTeamMember: (teamId: string, userId: string, role: "MEMBER") => Promise<void>;
      onRemoveTeamMember: (teamId: string, userId: string) => Promise<void>;
      onRemove: () => Promise<void>;
    };

    await callbacks.onAddTeamMember("team-a", "user-b", "MEMBER");
    await callbacks.onRemoveTeamMember("team-a", "user-b");
    await callbacks.onRemove();

    expect(apiBridge.apiRequest).not.toHaveBeenCalled();
  });

  it("permits team membership independently through the expected endpoint", async () => {
    apiBridge.apiRequest.mockResolvedValueOnce(undefined);
    const props = teamModalProps({ ...none, canAddMembers: true, canRemoveMembers: true });
    const tree = runtime.render(props);
    const detail = elements(tree).find((element) => element.type === GenericDetail);
    if (!detail) throw new Error("Generic detail was not found");

    await (
      detail.props as {
        onAddTeamMember: (teamId: string, userId: string, role: "LEADER") => Promise<void>;
      }
    ).onAddTeamMember("team-a", "user-b", "LEADER");

    expect(apiBridge.apiRequest).toHaveBeenCalledOnce();
    expect(apiBridge.apiRequest.mock.calls[0]?.[0]).toBe("/api/teams/team-a/members");
    expect(apiBridge.apiRequest.mock.calls[0]?.[2]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ userId: "user-b", role: "LEADER" })
    });
    expect(props.onReload).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("permits member removal independently through the expected endpoint", async () => {
    apiBridge.apiRequest.mockResolvedValueOnce(undefined);
    const props = teamModalProps({ ...none, canRemoveMembers: true });
    const tree = runtime.render(props);
    const detail = elements(tree).find((element) => element.type === GenericDetail);
    if (!detail) throw new Error("Generic detail was not found");

    await (
      detail.props as {
        onRemoveTeamMember: (teamId: string, userId: string) => Promise<void>;
      }
    ).onRemoveTeamMember("team-a", "user-b");

    expect(apiBridge.apiRequest).toHaveBeenCalledWith(
      "/api/teams/team-a/members/user-b",
      session.accessToken,
      expect.objectContaining({ method: "DELETE" })
    );
    expect(props.onReload).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("permits generic deletion independently through the resource endpoint", async () => {
    apiBridge.apiRequest.mockResolvedValueOnce(undefined);
    const props = teamModalProps({ ...none, canDelete: true });
    const tree = runtime.render(props);
    const detail = elements(tree).find((element) => element.type === GenericDetail);
    if (!detail) throw new Error("Generic detail was not found");

    await (detail.props as { onRemove: () => Promise<void> }).onRemove();

    expect(apiBridge.apiRequest).toHaveBeenCalledOnce();
    expect(apiBridge.apiRequest.mock.calls[0]?.[0]).toBe("/api/teams/team-a");
    expect(apiBridge.apiRequest.mock.calls[0]?.[2]).toMatchObject({ method: "DELETE" });
    expect(props.onReload).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("reconciles an in-flight mutation only after its settlement when the modal unmounts", async () => {
    const pending = deferred<{ id: string }>();
    apiBridge.apiRequest.mockReturnValueOnce(pending.promise);
    const props = modalProps({ ...none, canWrite: true });
    const tree = runtime.render(props);
    const detail = elements(tree).find((element) => element.type === ActivityDetail);
    if (!detail) throw new Error("Activity detail was not found");

    (detail.props as { onCloseActivity: () => void }).onCloseActivity();
    expect(apiBridge.apiRequest).toHaveBeenCalledWith(
      "/api/activities/activity-a/close",
      "access-token",
      expect.objectContaining({ method: "POST", body: JSON.stringify({}) })
    );
    const dialog = elements(tree).find(
      (element) =>
        element.type === "section" && (element.props as { role?: string }).role === "dialog"
    );
    const escapeEvent = { key: "Escape", shiftKey: false, preventDefault: vi.fn() };
    (dialog?.props as { onKeyDown?: (event: typeof escapeEvent) => void }).onKeyDown?.(escapeEvent);
    expect(escapeEvent.preventDefault).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    const signal = (apiBridge.apiRequest.mock.calls[0]?.[2] as { signal?: AbortSignal }).signal;
    const closeButton = elements(tree).find(
      (element) =>
        element.type === "button" &&
        (element.props as { "aria-label"?: string })["aria-label"] === messages["en-GB"].close
    );
    (closeButton?.props as { onClick?: () => void }).onClick?.();
    expect(props.onClose).not.toHaveBeenCalled();
    runtime.cleanup();
    await flushPromises();
    expect(props.onReload).not.toHaveBeenCalled();

    pending.resolve({ id: "activity-a" });
    await flushPromises();

    expect(signal?.aborted).toBe(false);
    expect(props.onReload).toHaveBeenCalledOnce();
    expect(props.onReload.mock.calls[0]?.[0]).toEqual(expect.any(Number));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(runtime.updatesAfterCleanup).toBe(0);
  });

  it("owns task-board settlement, blocks closing and reconciles once after unmount", async () => {
    const pending = deferred<unknown>();
    const props = modalProps({ ...none, canWrite: true });
    let tree = runtime.render(props);
    let detail = elements(tree).find((element) => element.type === ActivityDetail);
    if (!detail) throw new Error("Activity detail was not found");
    const runner = (
      detail.props as {
        runTaskBoardMutation: Parameters<typeof ActivityDetail>[0]["runTaskBoardMutation"];
      }
    ).runTaskBoardMutation;
    let signal: AbortSignal | undefined;
    const request = vi.fn((nextSignal: AbortSignal) => {
      signal = nextSignal;
      return pending.promise;
    });
    const onCurrentSuccess = vi.fn();
    const reconcileLocal = vi.fn();

    const settlement = runner(true, request, { onCurrentSuccess, reconcileLocal });
    tree = runtime.render(props);
    detail = elements(tree).find((element) => element.type === ActivityDetail);
    const closeButton = elements(tree).find(
      (element) =>
        element.type === "button" &&
        (element.props as { "aria-label"?: string })["aria-label"] === messages["en-GB"].close
    );
    const dialog = elements(tree).find(
      (element) =>
        element.type === "section" && (element.props as { role?: string }).role === "dialog"
    );
    const escapeEvent = { key: "Escape", shiftKey: false, preventDefault: vi.fn() };
    (dialog?.props as { onKeyDown?: (event: typeof escapeEvent) => void }).onKeyDown?.(escapeEvent);

    expect((detail?.props as { busy?: boolean }).busy).toBe(true);
    expect((closeButton?.props as { disabled?: boolean }).disabled).toBe(true);
    expect(escapeEvent.preventDefault).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    await expect(runner(true, request)).resolves.toBe("IGNORED");
    expect(request).toHaveBeenCalledOnce();

    runtime.cleanup();
    pending.resolve(undefined);
    await expect(settlement).resolves.toBe("SUCCEEDED");

    expect(signal?.aborted).toBe(false);
    expect(props.onReload).toHaveBeenCalledOnce();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(onCurrentSuccess).not.toHaveBeenCalled();
    expect(reconcileLocal).not.toHaveBeenCalled();
    expect(runtime.updatesAfterCleanup).toBe(0);
  });

  it("reconciles an ambiguous task-board failure after unmount", async () => {
    const pending = deferred<unknown>();
    const props = modalProps({ ...none, canDelete: true });
    const tree = runtime.render(props);
    const detail = elements(tree).find((element) => element.type === ActivityDetail);
    if (!detail) throw new Error("Activity detail was not found");
    const runner = (
      detail.props as {
        runTaskBoardMutation: Parameters<typeof ActivityDetail>[0]["runTaskBoardMutation"];
      }
    ).runTaskBoardMutation;

    const settlement = runner(true, () => pending.promise);
    runtime.cleanup();
    pending.reject(new Error("ambiguous response"));
    await expect(settlement).resolves.toBe("FAILED");

    expect(props.onReload).toHaveBeenCalledOnce();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(runtime.updatesAfterCleanup).toBe(0);
  });

  it("does not reconcile an abandoned mutation after the session identity changes", async () => {
    const pending = deferred<{ id: string }>();
    apiBridge.apiRequest.mockReturnValueOnce(pending.promise);
    const props = modalProps({ ...none, canWrite: true });
    const tree = runtime.render(props);
    const detail = elements(tree).find((element) => element.type === ActivityDetail);
    if (!detail) throw new Error("Activity detail was not found");

    (detail.props as { onCloseActivity: () => void }).onCloseActivity();
    const signal = (apiBridge.apiRequest.mock.calls[0]?.[2] as { signal?: AbortSignal }).signal;
    setApiSession({
      ...session,
      accessToken: "other-access-token",
      user: { ...session.user, id: "user-b", companyId: "company-b" }
    });
    runtime.cleanup();
    pending.resolve({ id: "activity-a" });
    await flushPromises();

    expect(signal?.aborted).toBe(false);
    expect(props.onReload).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(runtime.updatesAfterCleanup).toBe(0);
  });

  it("suppresses settlement when the session identity changes without unmounting", async () => {
    const pending = deferred<{ id: string }>();
    apiBridge.apiRequest.mockReturnValueOnce(pending.promise);
    const props = modalProps({ ...none, canWrite: true });
    const tree = runtime.render(props);
    const detail = elements(tree).find((element) => element.type === ActivityDetail);
    if (!detail) throw new Error("Activity detail was not found");

    (detail.props as { onCloseActivity: () => void }).onCloseActivity();
    setApiSession({
      ...session,
      accessToken: "other-access-token",
      user: { ...session.user, id: "user-b", companyId: "company-b" }
    });
    pending.resolve({ id: "activity-a" });
    await flushPromises();
    const settledTree = runtime.render(props);

    expect(props.onReload).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(textOf(settledTree)).not.toContain("Request failed");
  });

  it("releases a failed operation and permits a successful retry", async () => {
    apiBridge.apiRequest
      .mockRejectedValueOnce(new Error("First attempt failed"))
      .mockResolvedValueOnce({ id: "activity-a" });
    const props = modalProps({ ...none, canWrite: true });
    let tree = runtime.render(props);
    let detail = elements(tree).find((element) => element.type === ActivityDetail);
    if (!detail) throw new Error("Activity detail was not found");

    (detail.props as { onCloseActivity: () => void }).onCloseActivity();
    await flushPromises();
    tree = runtime.render(props);
    detail = elements(tree).find((element) => element.type === ActivityDetail);
    if (!detail) throw new Error("Activity detail was not found after failure");

    expect(textOf(tree)).toContain("First attempt failed");
    expect((detail.props as { busy: boolean }).busy).toBe(false);
    expect(props.onReload).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    (detail.props as { onCloseActivity: () => void }).onCloseActivity();
    await flushPromises();

    expect(apiBridge.apiRequest).toHaveBeenCalledTimes(2);
    expect(props.onReload).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
  });

  it("permits delete independently and reloads with the captured session epoch", async () => {
    apiBridge.apiRequest.mockResolvedValueOnce(undefined);
    const props = modalProps({ ...none, canDelete: true });
    const tree = runtime.render(props);
    const detail = elements(tree).find((element) => element.type === ActivityDetail);
    if (!detail) throw new Error("Activity detail was not found");

    await (detail.props as { onRemove: () => Promise<void> }).onRemove();

    expect(apiBridge.apiRequest).toHaveBeenCalledOnce();
    expect(apiBridge.apiRequest.mock.calls[0]?.[0]).toBe("/api/activities/activity-a");
    expect(apiBridge.apiRequest.mock.calls[0]?.[2]).toMatchObject({ method: "DELETE" });
    expect(props.onReload).toHaveBeenCalledOnce();
    expect(props.onReload.mock.calls[0]?.[0]).toEqual(expect.any(Number));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("submits explicit Activity clears through the real modal wiring", async () => {
    const form = new FormData();
    form.set("title", "Updated activity");
    form.set("description", "");
    form.set("shiftId", "");
    form.set("assigneeId", "");
    form.set("slaDueAt", "");
    function FormDataForTest() {
      return form;
    }
    vi.stubGlobal("FormData", FormDataForTest);
    apiBridge.apiRequest.mockResolvedValueOnce({ id: "activity-a" });
    const props = {
      ...modalProps({ ...none, canWrite: true }),
      state: {
        mode: "detail" as const,
        entity: "activities" as const,
        record: {
          id: "activity-a",
          title: "Original activity",
          description: "Previous description",
          clientId: "client-a",
          teamId: "team-a",
          shiftId: "shift-a",
          assigneeId: "user-a",
          status: "IN_PROGRESS",
          priority: "HIGH",
          slaDueAt: "2026-08-30T12:00:00.000Z"
        }
      }
    };
    const tree = runtime.render(props);
    const detail = elements(tree).find((element) => element.type === ActivityDetail);
    if (!detail) throw new Error("Activity detail was not found");

    await (
      detail.props as {
        onSubmit: (event: { preventDefault: () => void; currentTarget: unknown }) => Promise<void>;
      }
    ).onSubmit({ preventDefault: vi.fn(), currentTarget: {} });

    expect(apiBridge.apiRequest).toHaveBeenCalledWith(
      "/api/activities/activity-a",
      session.accessToken,
      expect.objectContaining({ method: "PATCH" })
    );
    const request = apiBridge.apiRequest.mock.calls[0]?.[2] as { body?: string };
    expect(JSON.parse(request.body ?? "{}")).toMatchObject({
      title: "Updated activity",
      description: "",
      clientId: "client-a",
      teamId: "team-a",
      shiftId: null,
      assigneeId: null,
      status: "IN_PROGRESS",
      priority: "HIGH",
      slaDueAt: null
    });
    expect(props.onReload).toHaveBeenCalledOnce();
  });

  it("keeps lifecycle status in the Shift create payload", async () => {
    const form = new FormData();
    form.set("name", "Night shift");
    form.set("startsAt", "2026-09-02T22:00");
    form.set("endsAt", "2026-09-03T06:00");
    form.set("timezone", "Europe/London");
    form.set("status", "PLANNED");
    function FormDataForTest() {
      return form;
    }
    vi.stubGlobal("FormData", FormDataForTest);
    apiBridge.apiRequest.mockResolvedValueOnce({ id: "shift-a" });
    const props = {
      ...modalProps({ ...none, canWrite: true }),
      state: { mode: "create" as const, entity: "shifts" as const }
    };
    const tree = runtime.render(props);
    const createForm = elements(tree).find((element) => element.type === CreateForm);
    if (!createForm) throw new Error("Shift create form was not found");

    await (
      createForm.props as {
        onSubmit: (event: { preventDefault: () => void; currentTarget: unknown }) => Promise<void>;
      }
    ).onSubmit({ preventDefault: vi.fn(), currentTarget: {} });

    expect(apiBridge.apiRequest).toHaveBeenCalledWith(
      "/api/shifts",
      session.accessToken,
      expect.objectContaining({ method: "POST" })
    );
    const request = apiBridge.apiRequest.mock.calls[0]?.[2] as { body?: string };
    expect(JSON.parse(request.body ?? "{}")).toEqual({
      name: "Night shift",
      startsAt: "2026-09-02T22:00",
      endsAt: "2026-09-03T06:00",
      timezone: "Europe/London",
      status: "PLANNED"
    });
  });

  it("omits lifecycle status from the Shift content PATCH payload", async () => {
    const form = new FormData();
    form.set("name", "Updated night shift");
    form.set("startsAt", "2026-09-02T21:00");
    form.set("endsAt", "2026-09-03T05:00");
    form.set("timezone", "Europe/London");
    form.set("status", "CLOSED");
    function FormDataForTest() {
      return form;
    }
    vi.stubGlobal("FormData", FormDataForTest);
    apiBridge.apiRequest.mockResolvedValueOnce({ id: "shift-a" });
    const props = {
      ...modalProps({ ...none, canWrite: true }),
      state: {
        mode: "detail" as const,
        entity: "shifts" as const,
        record: {
          id: "shift-a",
          name: "Night shift",
          startsAt: "2026-09-02T22:00:00.000Z",
          endsAt: "2026-09-03T06:00:00.000Z",
          timezone: "Europe/London",
          status: "OPEN"
        }
      }
    };
    const tree = runtime.render(props);
    const detail = elements(tree).find((element) => element.type === GenericDetail);
    if (!detail) throw new Error("Shift detail was not found");

    await (
      detail.props as {
        onSubmit: (event: { preventDefault: () => void; currentTarget: unknown }) => Promise<void>;
      }
    ).onSubmit({ preventDefault: vi.fn(), currentTarget: {} });

    expect(apiBridge.apiRequest).toHaveBeenCalledWith(
      "/api/shifts/shift-a",
      session.accessToken,
      expect.objectContaining({ method: "PATCH" })
    );
    const request = apiBridge.apiRequest.mock.calls[0]?.[2] as { body?: string };
    expect(JSON.parse(request.body ?? "{}")).toEqual({
      name: "Updated night shift",
      startsAt: "2026-09-02T21:00",
      endsAt: "2026-09-03T05:00",
      timezone: "Europe/London"
    });
  });
});
