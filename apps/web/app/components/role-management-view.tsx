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
  const [selectedPermissionId, setSelectedPermissionId] = useState(
    availablePermissions[0]?.id ?? ""
  );
  const effectivePermissionId = availablePermissions.some(
    (permission) => permission.id === selectedPermissionId
  )
    ? selectedPermissionId
    : (availablePermissions[0]?.id ?? "");

  return (
    <section className="panel full-width role-management">
      <div className="panel-header">
        <h2>{t.rolesManagement}</h2>
        <ShieldCheck size={18} />
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
          <div className="role-selector-list">
            {roles.map((role) => (
              <button
                className={role.id === effectiveRoleId ? "selected" : ""}
                key={role.id ?? role.name}
                type="button"
                onClick={() => setSelectedRoleId(role.id ?? "")}
              >
                <i style={{ backgroundColor: role.color ?? "#0f766e" }} />
                <strong>{role.name ?? "-"}</strong>
                <span>{role.isActive === false ? "Inativo" : (role.scope ?? "COMPANY")}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="role-main">
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
                  </span>
                </div>
                <div className="role-edit-fields">
                  <label>
                    Nome
                    <input name="name" defaultValue={selectedRole.name ?? ""} required />
                  </label>
                  <label>
                    Escopo
                    <select name="scope" defaultValue={selectedRole.scope ?? "COMPANY"}>
                      <option value="COMPANY">Empresa</option>
                      <option value="TEAM">Equipe</option>
                      <option value="CLIENT">Cliente</option>
                    </select>
                  </label>
                  <label>
                    Descricao
                    <textarea name="description" defaultValue={selectedRole.description ?? ""} />
                  </label>
                  <label>
                    Cor
                    <input
                      name="color"
                      type="color"
                      defaultValue={selectedRole.color ?? "#0f766e"}
                    />
                  </label>
                  <label className="toggle-label">
                    <input
                      name="isActive"
                      type="checkbox"
                      defaultChecked={selectedRole.isActive !== false}
                    />
                    Ativo
                  </label>
                  <button
                    className="primary-button"
                    disabled={busy || !effectiveRoleId}
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
                    disabled={busy || !effectiveRoleId || !availablePermissions.length}
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
                    disabled={busy || !effectiveRoleId || !effectivePermissionId}
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
                  {selectedRole.permissions?.length ? (
                    selectedRole.permissions.map((item) => {
                      const permissionId = item.permissionId ?? item.permission?.id ?? "";
                      return (
                        <div className="permission-table-row" key={item.id ?? permissionId}>
                          <strong>{item.permission?.resource ?? "-"}</strong>
                          <span>{item.permission?.action ?? "-"}</span>
                          <small>{item.permission?.description ?? "-"}</small>
                          <button
                            className="danger-button"
                            disabled={busy || !permissionId}
                            type="button"
                            onClick={() => onRemovePermission(effectiveRoleId, permissionId)}
                          >
                            Remover
                          </button>
                        </div>
                      );
                    })
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
