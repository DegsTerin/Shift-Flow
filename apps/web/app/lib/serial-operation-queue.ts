// en-GB: Serialises ordered client writes so an older request cannot persist after a newer intent.
export function createSerialOperationQueue() {
  let tail = Promise.resolve();

  return function enqueue<T>(operation: () => Promise<T>, isCurrent = () => true) {
    const run = () => (isCurrent() ? operation() : Promise.resolve(undefined));
    const result = tail.then(run, run);
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}
