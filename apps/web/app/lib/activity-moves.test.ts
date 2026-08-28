// en-GB: Verifies optimistic activity moves preserve newer and unrelated confirmed state.
import { describe, expect, it, vi } from "vitest";
import type { ActivityItem } from "./types";
import { createActivityMoveCoordinator } from "./activity-moves";

function activity(id: string, status: string): ActivityItem {
  return { id, title: id, status };
}

describe("activity move coordination", () => {
  it("serialises commands for the same activity in user-intent order", async () => {
    const coordinator = createActivityMoveCoordinator();
    let releaseFirst: (() => void) | undefined;
    let releaseSecond: (() => void) | undefined;
    const firstReady = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondReady = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const order: string[] = [];
    const first = coordinator.begin(activity("a", "OPEN"), "IN_PROGRESS");
    const firstResult = coordinator.enqueue(first, async () => {
      order.push("first");
      await firstReady;
      return "first-result";
    });
    const second = coordinator.begin(activity("a", "IN_PROGRESS"), "DONE");
    const secondResult = coordinator.enqueue(second, async () => {
      order.push("second");
      await secondReady;
      return "second-result";
    });

    await vi.waitFor(() => expect(order).toEqual(["first"]));
    releaseFirst?.();
    await expect(firstResult).resolves.toBe("first-result");
    await vi.waitFor(() => expect(order).toEqual(["first", "second"]));
    releaseSecond?.();

    await expect(secondResult).resolves.toBe("second-result");
  });

  it("allows unrelated activity commands to progress independently", async () => {
    const coordinator = createActivityMoveCoordinator();
    const first = coordinator.begin(activity("a", "OPEN"), "DONE");
    const second = coordinator.begin(activity("b", "OPEN"), "DONE");
    const operationA = vi.fn(async () => "a");
    const operationB = vi.fn(async () => "b");

    await expect(
      Promise.all([coordinator.enqueue(first, operationA), coordinator.enqueue(second, operationB)])
    ).resolves.toEqual(["a", "b"]);
    expect(operationA).toHaveBeenCalledOnce();
    expect(operationB).toHaveBeenCalledOnce();
  });

  it("ignores a stale result after a newer move of the same activity", () => {
    const coordinator = createActivityMoveCoordinator();
    const original = activity("a", "OPEN");
    const first = coordinator.begin(original, "IN_PROGRESS");
    let items = coordinator.optimistic([original], first);
    const second = coordinator.begin(items[0], "DONE");
    items = coordinator.optimistic(items, second);
    items = coordinator.applySuccess(items, first, activity("a", "IN_PROGRESS"));

    expect(items[0]?.status).toBe("DONE");
  });

  it("overlays only while the current move is pending", () => {
    const coordinator = createActivityMoveCoordinator();
    const move = coordinator.begin(activity("a", "OPEN"), "DONE");

    expect(coordinator.overlay([activity("a", "OPEN")])[0]?.status).toBe("DONE");
    coordinator.complete(move);
    expect(coordinator.overlay([activity("a", "OPEN")])[0]?.status).toBe("OPEN");
  });
});
