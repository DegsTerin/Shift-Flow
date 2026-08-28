// en-GB: Coordinates optimistic activity moves so stale outcomes cannot overwrite newer intent.
import type { ActivityItem } from "./types";

export type ActivityMove = {
  id: string;
  version: number;
  previousStatus: string | undefined;
  targetStatus: string;
};

export function createActivityMoveCoordinator() {
  let nextVersion = 0;
  const versions = new Map<string, number>();
  const pending = new Map<string, ActivityMove>();
  const tails = new Map<string, Promise<void>>();

  const isCurrent = (move: ActivityMove) => versions.get(move.id) === move.version;

  return {
    begin(activity: ActivityItem, targetStatus: string): ActivityMove {
      const move = {
        id: activity.id,
        version: ++nextVersion,
        previousStatus: activity.status,
        targetStatus
      };
      versions.set(move.id, move.version);
      pending.set(move.id, move);
      return move;
    },
    isCurrent,
    optimistic(items: ActivityItem[], move: ActivityMove) {
      if (!isCurrent(move)) return items;
      return items.map((item) =>
        item.id === move.id ? { ...item, status: move.targetStatus } : item
      );
    },
    enqueue<T>(move: ActivityMove, operation: () => Promise<T>) {
      const previous = tails.get(move.id) ?? Promise.resolve();
      const result = previous.then(operation);
      const tail = result.then(
        () => undefined,
        () => undefined
      );
      tails.set(move.id, tail);
      return result.finally(() => {
        if (tails.get(move.id) === tail) tails.delete(move.id);
      });
    },
    complete(move: ActivityMove) {
      if (pending.get(move.id)?.version === move.version) pending.delete(move.id);
    },
    applySuccess(items: ActivityItem[], move: ActivityMove, saved: ActivityItem) {
      if (!isCurrent(move)) return items;
      return items.map((item) => (item.id === move.id ? { ...item, ...saved } : item));
    },
    overlay(items: ActivityItem[]) {
      return items.map((item) => {
        const move = pending.get(item.id);
        if (!move || versions.get(item.id) !== move.version) return item;
        return { ...item, status: move.targetStatus };
      });
    },
    reset() {
      versions.clear();
      pending.clear();
      tails.clear();
    }
  };
}
