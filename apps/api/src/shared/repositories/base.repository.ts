// en-GB: Encapsulates application persistence so data access remains consistent and testable.
import { getDelegate } from "../lib/prisma.js";
import { notFound } from "../errors/app-error.js";

type Delegate = {
  findMany(args?: unknown): Promise<unknown[]>;
  findFirst(args: unknown): Promise<unknown | null>;
  count(args?: unknown): Promise<number>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  groupBy?(args: unknown): Promise<unknown[]>;
};

function isRecordNotFoundError(cause: unknown) {
  return Boolean(
    cause && typeof cause === "object" && (cause as { code?: unknown }).code === "P2025"
  );
}

export type ListArgs = {
  where?: Record<string, unknown>;
  skip?: number;
  take?: number;
  orderBy?: Record<string, string> | Array<Record<string, string>>;
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
    includeDeletedFilter = true
  ) {
    return (await this.delegate()).findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
        ...(includeDeletedFilter ? { deletedAt: null } : {})
      },
      include
    });
  }

  async create(data: Record<string, unknown>) {
    return (await this.delegate()).create({ data });
  }

  async update(id: string, data: Record<string, unknown>, companyId?: string) {
    const delegate = await this.delegate();
    try {
      return await delegate.update({
        where: {
          id,
          ...(companyId ? { companyId, deletedAt: null } : {})
        },
        data
      });
    } catch (cause) {
      if (companyId && isRecordNotFoundError(cause)) {
        throw notFound("Resource not found");
      }
      throw cause;
    }
  }

  async softDelete(id: string, actorUserId?: string, companyId?: string) {
    return this.update(
      id,
      { deletedAt: new Date(), ...(actorUserId ? { deletedById: actorUserId } : {}) },
      companyId
    );
  }

  async groupBy(args: unknown) {
    const delegate = await this.delegate();
    return delegate.groupBy ? delegate.groupBy(args) : [];
  }
}
