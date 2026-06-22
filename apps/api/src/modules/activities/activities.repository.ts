import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getDelegate } from "../../shared/lib/prisma.js";

type HistoryDelegate = {
  create(args: unknown): Promise<unknown>;
};

export class ActivitiesRepository extends BaseRepository {
  constructor() {
    super("activity");
  }

  async addHistory(data: Record<string, unknown>) {
    return (await getDelegate<HistoryDelegate>("activityHistory")).create({ data });
  }
}
