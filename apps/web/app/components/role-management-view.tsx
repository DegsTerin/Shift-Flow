// en-GB: Renders the role management view interface so its behaviour and accessible structure stay reusable.
"use client";

import { Copy, ShieldCheck } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { PermissionRef, RoleRef, Texts } from "../lib/types";
import { TableFooter, type TablePagination } from "./lists";

function permissionLabel(permission: PermissionRef) {
  return `${permission.resource ?? "-"}:${permission.action ?? "-"}`;
}

export function canDuplicateRole(role: RoleRef | undefined, busy: boolean, canWrite = true) {
  return canWrite && !busy && canManageProductRole(role);
}

export const productCreatableRoleScopes = ["COMPANY"] as const;

export function canManageProductRole(role: RoleRef | undefined) {
  return Boolean(role?.id) && role?.isSystem !== true && role?.scope === "COMPANY";
}

export function RoleManagementView({
  t,
  roles,
  permissions,
  busy,
  canWrite,
  canDelete,
  pagination,
  onCreateRole,
  onUpdateRole,
  onAssignPermission,
  onRemovePermission,
  onDuplicateRole,
  onDeleteRole
}: {
  t: Texts;
  roles: RoleRef[];
  permissions: PermissionRef[];
  busy: boolean;
  canWrite: boolean;
  canDelete: boolean;
  pagination?: TablePagination;
  onCreateRole: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateRole: (roleId: string, event: FormEvent<HTMLFormElement>) => void;
  onAssignPermission: (roleId: string, permissionId: string) => void;
  onRemovePermission: (roleId: string, permissionId: string) => void;
  onDuplicateRole: (roleId: string) => void;
  onDeleteRole: (roleId: string) => void;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? "");
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0];
  const effectiveRoleId = selectedRole?.id ?? "";
  const assignedPermissionIds = useMemo(
    () =>
      new Set(
        selectedRole?.permissions
          ?.map((item) => item.permissionId ?? item.permission?.id)
          .filter(Boolean) ?? []
      ),
    [selectedRole]
  );
  const availablePermissions = permissions.filter(
    (permission) => permission.id && !assignedPermissionIds.has(permission.id)
  );
  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, NonNullable<RoleRef["permissions"]>>();
    (selectedRole?.permissions ?? []).forEach((item) => {
      const resource = item.permission?.resource ?? t.other;
      groups.set(resource, [...(groups.get(resource) ?? []), item]);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [selectedRole, t.other]);
  const [selectedPermissionId, setSelectedPermissionId] = useState(
    availablePermissions[0]?.id ?? ""
  );
  const effectivePermissionId = availablePermissions.some(
    (permission) => permission.id === selectedPermissionId
  )
    ? selectedPermissionId
    : (availablePermissions[0]?.id ?? "");

  return (
    <section className="panel full-width role-management" aria-labelledby="roles-heading">
      <div className="panel-header">
        <h2 id="roles-heading">{t.rolesManagement}</h2>
        <ShieldCheck aria-hidden="true" size={18} />
      </div>
      <div className="role-admin-shell">
        <aside className="role-sidebar">
          <form className="role-create-form" onSubmit={onCreateRole}>
            <h3>{t.newRole}</h3>
            <label>
              {t.name}
              <input name="name" disabled={busy || !canWrite} required />
            </label>
            <label>
              {t.scope}
              <input name="scope" type="hidden" value="COMPANY" />
              <select aria-describedby="create-role-scope-note" value="COMPANY" disabled>
                {productCreatableRoleScopes.map((scope) => (
                  <option key={scope} value={scope}>
                    {t.company}
                  </option>
                ))}
              </select>
              <small id="create-role-scope-note">{t.roleScopeCreateNote}</small>
            </label>
            <label>
              {t.description}
              <textarea name="description" disabled={busy || !canWrite} />
            </label>
            <label>
              {t.colour}
              <input
                name="color"
                type="color"
                defaultValue="#0f766e"
                disabled={busy || !canWrite}
              />
            </label>
            <button className="primary-button" disabled={busy || !canWrite} type="submit">
              {t.save}
            </button>
          </form>
          <ul className="role-selector-list" aria-label={t.availableRoles}>
            {roles.map((role, index) => {
              const detailsId = `role-${role.id ?? index}-details`;
              return (
                <li key={role.id ?? role.name ?? index}>
                  <article
                    className={
                      role.id === effectiveRoleId
                        ? "role-selector-item selected"
                        : "role-selector-item"
                    }
                  >
                    <button
                      aria-pressed={role.id === effectiveRoleId}
                      aria-describedby={detailsId}
                      className="role-selector-button"
                      type="button"
                      onClick={() => setSelectedRoleId(role.id ?? "")}
                    >
                      <span
                        aria-hidden="true"
                        className="role-colour"
                        style={{ backgroundColor: role.color ?? "#0f766e" }}
                      />
                      <strong>{role.name ?? "-"}</strong>
                    </button>
                    <ol className="role-profile-details" id={detailsId}>
                      <li>
                        <span className="sr-only">{t.state}: </span>
                        {role.isActive === false ? t.inactive : t.active}
                      </li>
                      <li>
                        <span className="sr-only">{t.scope}: </span>
                        {role.scope ?? "COMPANY"}
                      </li>
                    </ol>
                  </article>
                </li>
              );
            })}
          </ul>
          {pagination ? (
            <TableFooter
              t={t}
              page={Math.max(0, pagination.page - 1)}
              totalPages={Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}
              totalRows={pagination.total}
              onPage={(page) => pagination.onPage(page + 1)}
            />
          ) : null}
        </aside>
        <section className="role-main" aria-live="polite">
          {selectedRole ? (
            <>
              <form
                className="role-edit-form"
                key={selectedRole.id}
                onSubmit={(event) => onUpdateRole(effectiveRoleId, event)}
              >
                <div className="section-heading">
                  <h3>{t.roleDetails}</h3>
                  <span>
                    {assignedPermissionIds.size} {t.permissionsCount} -{" "}
                    {selectedRole._count?.assignments ?? 0} {t.usersCount}
                    {selectedRole.isSystem ? ` - ${t.systemRole}` : ""}
                  </span>
                </div>
                <div className="role-edit-fields">
                  <label>
                    {t.name}
                    <input
                      name="name"
                      defaultValue={selectedRole.name ?? ""}
                      disabled={!canWrite || !canManageProductRole(selectedRole)}
                      required
                    />
                  </label>
                  <label>
                    {t.scope}
                    <select
                      aria-describedby="edit-role-scope-note"
                      name="scope"
                      defaultValue={selectedRole.scope ?? "COMPANY"}
                      disabled
                    >
                      <option value="COMPANY">{t.company}</option>
                      <option value="TEAM">{t.filterTeam}</option>
                      <option value="CLIENT">{t.filterClient}</option>
                    </select>
                    <small id="edit-role-scope-note">{t.roleScopeReadOnlyNote}</small>
                  </label>
                  <label>
                    {t.description}
                    <textarea
                      name="description"
                      defaultValue={selectedRole.description ?? ""}
                      disabled={!canWrite || !canManageProductRole(selectedRole)}
                    />
                  </label>
                  <label>
                    {t.colour}
                    <input
                      name="color"
                      type="color"
                      defaultValue={selectedRole.color ?? "#0f766e"}
                      disabled={!canWrite || !canManageProductRole(selectedRole)}
                    />
                  </label>
                  <label className="toggle-label">
                    <input
                      name="isActive"
                      type="checkbox"
                      defaultChecked={selectedRole.isActive !== false}
                      disabled={!canWrite || !canManageProductRole(selectedRole)}
                    />
                    {t.active}
                  </label>
                  <button
                    className="primary-button"
                    disabled={busy || !canWrite || !canManageProductRole(selectedRole)}
                    type="submit"
                  >
                    {t.save}
                  </button>
                  <button
                    className="compact-button"
                    disabled={!canDuplicateRole(selectedRole, busy, canWrite)}
                    type="button"
                    onClick={() => onDuplicateRole(effectiveRoleId)}
                  >
                    <Copy size={16} />
                    {t.duplicate}
                  </button>
                  <button
                    className="danger-button"
                    disabled={
                      busy ||
                      !canDelete ||
                      !effectiveRoleId ||
                      !canManageProductRole(selectedRole) ||
                      Boolean(selectedRole._count?.assignments)
                    }
                    type="button"
                    onClick={() => onDeleteRole(effectiveRoleId)}
                  >
                    {t.delete}
                  </button>
                </div>
              </form>
              <section className="role-permission-panel">
                <div className="section-heading">
                  <h3>{t.permissionsLabel}</h3>
                </div>
                <div className="role-permission-controls">
                  <select
                    aria-label={t.permissionsLabel}
                    value={effectivePermissionId}
                    disabled={
                      busy ||
                      !canWrite ||
                      !canManageProductRole(selectedRole) ||
                      !availablePermissions.length
                    }
                    onChange={(event) => setSelectedPermissionId(event.target.value)}
                  >
                    {availablePermissions.length ? null : (
                      <option value="">{t.noPermissionsAvailable}</option>
                    )}
                    {availablePermissions.map((permission) => (
                      <option key={permission.id} value={permission.id}>
                        {permissionLabel(permission)}
                      </option>
                    ))}
                  </select>
                  <button
                    className="primary-button"
                    disabled={
                      busy ||
                      !canWrite ||
                      !canManageProductRole(selectedRole) ||
                      !effectivePermissionId
                    }
                    type="button"
                    onClick={() => onAssignPermission(effectiveRoleId, effectivePermissionId)}
                  >
                    {t.add}
                  </button>
                </div>
                <div className="permission-table">
                  <div className="permission-table-head">
                    <span>{t.resource}</span>
                    <span>{t.action}</span>
                    <span>{t.description}</span>
                    <span />
                  </div>
                  {groupedPermissions.length ? (
                    groupedPermissions.map(([resource, items]) => (
                      <section className="permission-group" key={resource}>
                        <h4>{resource}</h4>
                        {items.map((item) => {
                          const permissionId = item.permissionId ?? item.permission?.id ?? "";
                          return (
                            <div className="permission-table-row" key={item.id ?? permissionId}>
                              <strong>{item.permission?.resource ?? "-"}</strong>
                              <span>{item.permission?.action ?? "-"}</span>
                              <small>{item.permission?.description ?? "-"}</small>
                              <button
                                className="danger-button"
                                disabled={
                                  busy ||
                                  !canWrite ||
                                  !canManageProductRole(selectedRole) ||
                                  !permissionId
                                }
                                type="button"
                                onClick={() => onRemovePermission(effectiveRoleId, permissionId)}
                              >
                                {selectedRole.isSystem ? t.locked : t.remove}
                              </button>
                            </div>
                          );
                        })}
                      </section>
                    ))
                  ) : (
                    <p className="empty-state">{t.noLinkedPermissions}</p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <p className="empty-state">{t.noRolesFound}</p>
          )}
        </section>
      </div>
    </section>
  );
}
