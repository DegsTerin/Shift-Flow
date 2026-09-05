// en-GB: Implements application rules so invariants remain centralised outside the transport layer.
import type { ApiRequest } from "../http/request-types.js";
import { toBoundedSearch, toPagination, toSkipTake } from "../http/pagination.js";
import { AppError, badRequest, notFound } from "../errors/app-error.js";
import type { BaseRepository } from "../repositories/base.repository.js";
import type { PrismaTransactionClient } from "../lib/prisma.js";
import { writeAudit } from "./audit-writer.js";
import { activeCompanyId } from "./scope.service.js";

type BaseServiceOptions = {
  hasCompanyScope?: boolean;
  deletedAtFilter?: boolean;
  userStamps?: boolean;
  auditWrites?: boolean;
  orderBy?: Record<string, string> | Array<Record<string, string>>;
  searchFields?: string[];
};

function normaliseOrderBy(
  orderBy: Record<string, string> | Array<Record<string, string>>
): Array<Record<string, string>> {
  const terms = (Array.isArray(orderBy) ? orderBy : [orderBy]).map((term) => ({ ...term }));
  if (!terms.some((term) => Object.prototype.hasOwnProperty.call(term, "id"))) {
    terms.push({ id: "asc" });
  }
  return terms;
}

export class BaseService {
  private readonly options: Required<BaseServiceOptions>;

  constructor(
    protected readonly repository: BaseRepository,
    private readonly entityType: string,
    options: BaseServiceOptions = {}
  ) {
    this.options = {
      hasCompanyScope: options.hasCompanyScope ?? true,
      deletedAtFilter: options.deletedAtFilter ?? true,
      userStamps: options.userStamps ?? false,
      auditWrites: options.auditWrites ?? true,
      orderBy: normaliseOrderBy(options.orderBy ?? { updatedAt: "desc" }),
      searchFields: options.searchFields ?? []
    };
  }

  protected companyId(req: ApiRequest) {
    return req.tenant?.companyId ? activeCompanyId(req) : req.auth?.companyId;
  }

  protected requireCompanyId(req: ApiRequest) {
    const companyId = this.companyId(req);
    if (this.options.hasCompanyScope && !companyId) {
      throw badRequest("Company context is required");
    }
    return companyId;
  }

  async list(req: ApiRequest, filters: Record<string, unknown> = {}) {
    const pagination = toPagination(req.query);
    const companyId = this.requireCompanyId(req);
    const search = toBoundedSearch(req.query);
    const where = {
      ...filters,
      ...(this.options.hasCompanyScope && companyId ? { companyId } : {}),
      ...(this.options.deletedAtFilter ? { deletedAt: null } : {}),
      ...(search && this.options.searchFields.length
        ? {
            OR: this.options.searchFields.map((field) => ({
              [field]: { contains: search, mode: "insensitive" }
            }))
          }
        : {})
    };

    const [items, total] = await Promise.all([
      this.repository.list({
        where,
        ...toSkipTake(pagination),
        orderBy: this.options.orderBy
      }),
      this.repository.count(where)
    ]);

    return { items, total, ...pagination };
  }

  async get(req: ApiRequest, id: string) {
    const item = await this.repository.findById(
      id,
      this.options.hasCompanyScope ? this.requireCompanyId(req) : undefined,
      undefined,
      this.options.deletedAtFilter
    );
    if (!item) {
      throw notFound(`${this.entityType} not found`);
    }
    return item;
  }

  async create(req: ApiRequest, data: Record<string, unknown>) {
    const companyId = this.requireCompanyId(req);
    const createData = {
      ...data,
      ...(this.options.hasCompanyScope && companyId ? { companyId } : {}),
      ...(this.options.userStamps ? { createdById: req.auth?.id, updatedById: req.auth?.id } : {})
    };
    if (!this.options.auditWrites) {
      return this.repository.create(createData);
    }

    return this.withAuditTransaction(async (repository, transaction) => {
      const created = await repository.create(createData);
      await writeAudit(
        req,
        {
          entityType: this.entityType,
          entityId: String((created as { id?: string }).id ?? "unknown"),
          action: "CREATE",
          after: created,
          companyId
        },
        transaction
      );
      return created;
    });
  }

  async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    const updateData = {
      ...data,
      ...(this.options.userStamps ? { updatedById: req.auth?.id } : {})
    };
    if (!this.options.auditWrites) {
      await this.get(req, id);
      return this.repository.update(
        id,
        updateData,
        this.options.hasCompanyScope ? this.requireCompanyId(req) : undefined
      );
    }

    const companyId = this.requireCompanyId(req);
    const scopedCompanyId = this.options.hasCompanyScope ? companyId : undefined;
    return this.withAuditTransaction(async (repository, transaction) => {
      const before = await this.requireExisting(repository, id, scopedCompanyId);
      const updated = await repository.update(id, updateData, scopedCompanyId);
      await writeAudit(
        req,
        {
          entityType: this.entityType,
          entityId: id,
          action: "UPDATE",
          before,
          after: updated,
          companyId
        },
        transaction
      );
      return updated;
    });
  }

  async remove(req: ApiRequest, id: string) {
    const actorUserId = this.options.userStamps ? req.auth?.id : undefined;
    if (!this.options.auditWrites) {
      await this.get(req, id);
      return this.repository.softDelete(
        id,
        actorUserId,
        this.options.hasCompanyScope ? this.requireCompanyId(req) : undefined
      );
    }

    const companyId = this.requireCompanyId(req);
    const scopedCompanyId = this.options.hasCompanyScope ? companyId : undefined;
    return this.withAuditTransaction(async (repository, transaction) => {
      const before = await this.requireExisting(repository, id, scopedCompanyId);
      const removed = await repository.softDelete(id, actorUserId, scopedCompanyId);
      await writeAudit(
        req,
        {
          entityType: this.entityType,
          entityId: id,
          action: "SOFT_DELETE",
          before,
          after: removed,
          companyId
        },
        transaction
      );
      return removed;
    });
  }

  private async requireExisting(repository: BaseRepository, id: string, companyId?: string) {
    const item = await repository.findById(id, companyId, undefined, this.options.deletedAtFilter);
    if (!item) {
      throw notFound(`${this.entityType} not found`);
    }
    return item;
  }

  private async withAuditTransaction<T>(
    operation: (repository: BaseRepository, transaction: PrismaTransactionClient) => Promise<T>
  ) {
    if (typeof this.repository.withTransaction !== "function") {
      throw new AppError(
        "Audited writes require transactional repository support",
        500,
        "AUDIT_TRANSACTION_UNAVAILABLE"
      );
    }
    return this.repository.withTransaction(operation);
  }
}
