import { getDelegate } from "../lib/prisma.js";

type Delegate = {
  findMany(args?: unknown): Promise<unknown[]>;
  findUnique(args: unknown): Promise<unknown | null>;
  findFirst(args: unknown): Promise<unknown | null>;
  count(args?: unknown): Promise<number>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  delete?(args: unknown): Promise<unknown>;
  groupBy?(args: unknown): Promise<unknown[]>;
};

export type ListArgs = {
  where?: Record<string, unknown>;
  skip?: number;
  take?: number;
  orderBy?: Record<string, string>;
  include?: Record<string, unknown>;
};

export class BaseRepository {
  constructor(private readonly delegateName: string) {}

  private async delegate() {
    return getDelegate<Delegate>(this.delegateName);
  }

  async list(args: ListArgs = {}) {
    return (await this.delegate()).findMany(args);
  }

  async count(where?: Record<string, unknown>) {
    return (await this.delegate()).count({ where });
  }

  async findById(
    id: string,
    companyId?: string,
    include?: Record<string, unknown>,
    includeDeletedFilter = true,
  ) {
    return (await this.delegate()).findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
        ...(includeDeletedFilter ? { deletedAt: null } : {}),
      },
      include,
    });
  }

  async create(data: Record<string, unknown>) {
    return (await this.delegate()).create({ data });
  }

  async update(id: string, data: Record<string, unknown>, companyId?: string) {
    void companyId;
    const where = { id };
    return (await this.delegate()).update({ where, data });
  }

  async softDelete(id: string, actorUserId?: string, companyId?: string) {
    return this.update(
      id,
      { deletedAt: new Date(), ...(actorUserId ? { deletedById: actorUserId } : {}) },
      companyId,
    );
  }

  async groupBy(args: unknown) {
    const delegate = await this.delegate();
    return delegate.groupBy ? delegate.groupBy(args) : [];
  }
}
