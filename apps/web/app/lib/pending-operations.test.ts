// en-GB: Verifies pending operation state remains accurate across overlap and reset boundaries.
import { describe, expect, it, vi } from "vitest";
import { createPendingOperationTracker } from "./pending-operations";

describe("pending operation tracking", () => {
  it("remains busy until every concurrent current operation finishes", () => {
    const onChange = vi.fn();
    const tracker = createPendingOperationTracker(onChange);
    const finishA = tracker.begin();
    const finishB = tracker.begin();

    finishA();
    expect(onChange.mock.calls.map(([pending]) => pending)).toEqual([1, 2, 1]);
    finishB();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe(0);
  });

  it("ignores late completion from before a reset", () => {
    const onChange = vi.fn();
    const tracker = createPendingOperationTracker(onChange);
    const finishOld = tracker.begin();
    tracker.reset();
    const finishCurrent = tracker.begin();

    finishOld();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe(1);
    finishCurrent();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe(0);
  });
});
