// en-GB: Implements application rules so invariants remain centralised outside the transport layer.
import type { ApiRequest } from "../http/request-types.js";
import { toPagination, toSkipTake } from "../http/pagination.js";
import { badRequest, notFound } from "../errors/app-error.js";
import type { BaseRepository } from "../repositories/base.repository.js";
import { writeAudit } from "./audit-writer.js";
import { activeCompanyId } from "./scope.service.js";

type BaseServiceOptions = {
  hasCompanyScope?: boolean;
  deletedAtFilter?: boolean;
  userStamps?: boolean;
  auditWrites?: boolean;
  orderBy?: Record<string, string>;
};

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
      orderBy: options.orderBy ?? { updatedAt: "desc" }
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
    const where = {
      ...filters,
      ...(this.options.hasCompanyScope && companyId ? { companyId } : {}),
      ...(this.options.deletedAtFilter ? { deletedAt: null } : {})
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
    const created = await this.repository.create({
      ...data,
      ...(this.options.hasCompanyScope && companyId ? { companyId } : {}),
      ...(this.options.userStamps ? { createdById: req.auth?.id, updatedById: req.auth?.id } : {})
    });
    if (this.options.auditWrites) {
      await writeAudit(req, {
        entityType: this.entityType,
        entityId: String((created as { id?: string }).id ?? "unknown"),
        action: "CREATE",
        after: created,
        companyId
      });
    }
    return created;
  }

  async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    await this.get(req, id);
    const updated = await this.repository.update(
      id,
      {
        ...data,
        ...(this.options.userStamps ? { updatedById: req.auth?.id } : {})
      },
      this.options.hasCompanyScope ? this.requireCompanyId(req) : undefined
    );
    if (this.options.auditWrites) {
      await writeAudit(req, {
        entityType: this.entityType,
        entityId: id,
        action: "UPDATE",
        after: updated,
        companyId: this.companyId(req)
      });
    }
    return updated;
  }

  async remove(req: ApiRequest, id: string) {
    await this.get(req, id);
    const removed = await this.repository.softDelete(
      id,
      this.options.userStamps ? req.auth?.id : undefined,
      this.options.hasCompanyScope ? this.requireCompanyId(req) : undefined
    );
    if (this.options.auditWrites) {
      await writeAudit(req, {
        entityType: this.entityType,
        entityId: id,
        action: "SOFT_DELETE",
        after: removed,
        companyId: this.companyId(req)
      });
    }
    return removed;
  }
}
