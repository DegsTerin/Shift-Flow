// en-GB: Coordinates supersedable browser reads so stale responses cannot replace newer view state.
export type LatestRequest = {
  signal: AbortSignal;
  isCurrent: () => boolean;
};

export function createLatestRequestCoordinator() {
  let sequence = 0;
  let activeController: AbortController | undefined;

  return {
    begin(): LatestRequest {
      activeController?.abort();
      const requestSequence = ++sequence;
      const controller = new AbortController();
      activeController = controller;
      return {
        signal: controller.signal,
        isCurrent: () =>
          requestSequence === sequence &&
          activeController === controller &&
          !controller.signal.aborted
      };
    },
    cancel() {
      sequence += 1;
      activeController?.abort();
      activeController = undefined;
    }
  };
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
