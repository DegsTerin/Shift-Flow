// en-GB: Verifies stale browser reads are cancelled and cannot commit after a successor starts.
import { describe, expect, it } from "vitest";
import { createLatestRequestCoordinator, isAbortError } from "./latest-request";

describe("createLatestRequestCoordinator", () => {
  it("invalidates and aborts the previous request when a successor begins", () => {
    const coordinator = createLatestRequestCoordinator();
    const first = coordinator.begin();
    const second = coordinator.begin();

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("invalidates the active request when the coordinator is cancelled", () => {
    const coordinator = createLatestRequestCoordinator();
    const request = coordinator.begin();

    coordinator.cancel();

    expect(request.signal.aborted).toBe(true);
    expect(request.isCurrent()).toBe(false);
  });
});

describe("isAbortError", () => {
  it("recognises only browser abort errors", () => {
    expect(isAbortError(new DOMException("Cancelled", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("Cancelled"))).toBe(false);
  });
});
