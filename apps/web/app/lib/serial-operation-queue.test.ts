// en-GB: Verifies that queued writes preserve intent order and recover after a rejected operation.
import { describe, expect, it, vi } from "vitest";
import { createSerialOperationQueue } from "./serial-operation-queue";

describe("createSerialOperationQueue", () => {
  it("does not start a newer operation before the preceding operation settles", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const calls: string[] = [];
    const enqueue = createSerialOperationQueue();

    const first = enqueue(async () => {
      calls.push("first:start");
      await firstGate;
      calls.push("first:end");
      return "first";
    });
    const second = enqueue(async () => {
      calls.push("second:start");
      return "second";
    });

    await vi.waitFor(() => expect(calls).toEqual(["first:start"]));
    releaseFirst?.();

    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(calls).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("continues with the next operation after a rejection", async () => {
    const enqueue = createSerialOperationQueue();

    const failed = enqueue(async () => {
      throw new Error("save failed");
    });
    const recovered = enqueue(async () => "latest");

    await expect(failed).rejects.toThrow("save failed");
    await expect(recovered).resolves.toBe("latest");
  });

  it("skips a queued operation when its captured context is no longer current", async () => {
    let releaseFirst: (() => void) | undefined;
    let current = true;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondOperation = vi.fn(async () => "stale");
    const enqueue = createSerialOperationQueue();
    const first = enqueue(async () => firstGate);
    const second = enqueue(secondOperation, () => current);

    current = false;
    releaseFirst?.();

    await first;
    await expect(second).resolves.toBeUndefined();
    expect(secondOperation).not.toHaveBeenCalled();
  });
});
