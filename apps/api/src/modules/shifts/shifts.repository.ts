// en-GB: Encapsulates shifts persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getDelegate } from "../../shared/lib/prisma.js";

type CoverageDelegate = {
  create(args: unknown): Promise<unknown>;
};

export class ShiftsRepository extends BaseRepository {
  constructor() {
    super("shift");
  }

  async addCoverage(data: Record<string, unknown>) {
    return (await getDelegate<CoverageDelegate>("shiftCoverage")).create({ data });
  }
}
