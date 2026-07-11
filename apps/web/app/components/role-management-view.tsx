"use client";

import { Copy, ShieldCheck } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { PermissionRef, RoleRef, Texts } from "../lib/types";

function permissionLabel(permission: PermissionRef) {
  return `${permission.resource ?? "-"}:${permission.action ?? "-"}`;
}

export function RoleManagementView({
  t,
  roles,
  permissions,
  busy,
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
      const resource = item.permission?.resource ?? "outros";
      groups.set(resource, [...(groups.get(resource) ?? []), item]);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [selectedRole]);
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
            <h3>Novo perfil</h3>
            <label>
              Nome
              <input name="name" required />
            </label>
            <label>
              Escopo
              <select name="scope" defaultValue="COMPANY">
                <option value="COMPANY">Empresa</option>
                <option value="TEAM">Equipe</option>
                <option value="CLIENT">Cliente</option>
              </select>
            </label>
            <label>
              Descricao
              <textarea name="description" />
            </label>
            <label>
              Cor
              <input name="color" type="color" defaultValue="#0f766e" />
            </label>
            <button className="primary-button" disabled={busy} type="submit">
              {t.save}
            </button>
          </form>
          <ul className="role-selector-list" aria-label="Perfis disponíveis">
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
                        <span className="sr-only">Estado: </span>
                        {role.isActive === false ? "Inativo" : "Ativo"}
                      </li>
                      <li>
                        <span className="sr-only">Escopo: </span>
                        {role.scope ?? "COMPANY"}
                      </li>
                    </ol>
                  </article>
                </li>
              );
            })}
          </ul>
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
                  <h3>Detalhes do perfil</h3>
                  <span>
                    {assignedPermissionIds.size} permissoes -{" "}
                    {selectedRole._count?.assignments ?? 0} usuarios
                    {selectedRole.isSystem ? " - perfil do sistema" : ""}
                  </span>
                </div>
                <div className="role-edit-fields">
                  <label>
                    Nome
                    <input
                      name="name"
                      defaultValue={selectedRole.name ?? ""}
                      disabled={selectedRole.isSystem}
                      required
                    />
                  </label>
                  <label>
                    Escopo
                    <select
                      name="scope"
                      defaultValue={selectedRole.scope ?? "COMPANY"}
                      disabled={selectedRole.isSystem}
                    >
                      <option value="COMPANY">Empresa</option>
                      <option value="TEAM">Equipe</option>
                      <option value="CLIENT">Cliente</option>
                    </select>
                  </label>
                  <label>
                    Descricao
                    <textarea
                      name="description"
                      defaultValue={selectedRole.description ?? ""}
                      disabled={selectedRole.isSystem}
                    />
                  </label>
                  <label>
                    Cor
                    <input
                      name="color"
                      type="color"
                      defaultValue={selectedRole.color ?? "#0f766e"}
                      disabled={selectedRole.isSystem}
                    />
                  </label>
                  <label className="toggle-label">
                    <input
                      name="isActive"
                      type="checkbox"
                      defaultChecked={selectedRole.isActive !== false}
                      disabled={selectedRole.isSystem}
                    />
                    Ativo
                  </label>
                  <button
                    className="primary-button"
                    disabled={busy || selectedRole.isSystem || !effectiveRoleId}
                    type="submit"
                  >
                    {t.save}
                  </button>
                  <button
                    className="compact-button"
                    disabled={busy || !effectiveRoleId}
                    type="button"
                    onClick={() => onDuplicateRole(effectiveRoleId)}
                  >
                    <Copy size={16} />
                    Duplicar
                  </button>
                  <button
                    className="danger-button"
                    disabled={
                      busy ||
                      !effectiveRoleId ||
                      selectedRole.isSystem ||
                      Boolean(selectedRole._count?.assignments)
                    }
                    type="button"
                    onClick={() => onDeleteRole(effectiveRoleId)}
                  >
                    Excluir
                  </button>
                </div>
              </form>
              <section className="role-permission-panel">
                <div className="section-heading">
                  <h3>Permissoes</h3>
                </div>
                <div className="role-permission-controls">
                  <select
                    value={effectivePermissionId}
                    disabled={
                      busy ||
                      selectedRole.isSystem ||
                      !effectiveRoleId ||
                      !availablePermissions.length
                    }
                    onChange={(event) => setSelectedPermissionId(event.target.value)}
                  >
                    {availablePermissions.length ? null : (
                      <option value="">Sem permissoes disponiveis</option>
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
                      busy || selectedRole.isSystem || !effectiveRoleId || !effectivePermissionId
                    }
                    type="button"
                    onClick={() => onAssignPermission(effectiveRoleId, effectivePermissionId)}
                  >
                    Adicionar
                  </button>
                </div>
                <div className="permission-table">
                  <div className="permission-table-head">
                    <span>Recurso</span>
                    <span>Acao</span>
                    <span>Descricao</span>
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
                                disabled={busy || selectedRole.isSystem || !permissionId}
                                type="button"
                                onClick={() => onRemovePermission(effectiveRoleId, permissionId)}
                              >
                                {selectedRole.isSystem ? "Bloqueada" : "Remover"}
                              </button>
                            </div>
                          );
                        })}
                      </section>
                    ))
                  ) : (
                    <p className="empty-state">Nenhuma permissao vinculada.</p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <p className="empty-state">Nenhum perfil encontrado.</p>
          )}
        </section>
      </div>
    </section>
  );
}
