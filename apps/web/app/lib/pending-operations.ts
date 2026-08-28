// en-GB: Tracks concurrent UI operations with idempotent completion across session resets.
export function createPendingOperationTracker(onChange: (pending: number) => void) {
  let nextId = 0;
  const pendingIds = new Set<number>();

  return {
    begin() {
      const id = ++nextId;
      pendingIds.add(id);
      onChange(pendingIds.size);
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        if (!pendingIds.delete(id)) return;
        onChange(pendingIds.size);
      };
    },
    reset() {
      pendingIds.clear();
      onChange(0);
    }
  };
}
