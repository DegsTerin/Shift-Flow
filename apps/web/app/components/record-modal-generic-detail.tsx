// en-GB: Renders generic record details separately from modal mutation ownership.
"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  ClientRef,
  RecordModalCapabilities,
  ReferenceAccess,
  RoleRef,
  ShiftRef,
  TeamMemberRole,
  TeamRef,
  Texts,
  UserRef,
  View
} from "../lib/types";
import {
  shiftCommandsForStatus,
  shiftStatuses,
  userRoleId,
  userRoleOptions,
  type ShiftLifecycleCommand
} from "../lib/utils";
import { isNamedTimezone, zonedDateInputValue } from "../lib/zoned-datetime";
import { applyNewPasswordByteValidity, maximumNewPasswordUtf8Bytes } from "../lib/password-input";
import { ReferenceSelectInput, SelectInput } from "./controls";

export function GenericDetail({
  entity,
  record,
  t,
  users,
  roles,
  token,
  referenceAccess = {
    clients: false,
    users: false,
    teams: false,
    shifts: false,
    roles: false
  },
  editing,
  busy,
  capabilities,
  setEditing,
  onSubmit,
  onRemove,
  onAddTeamMember,
  onRemoveTeamMember,
  onShiftTransition
}: {
  entity: View;
  record: unknown;
  t: Texts;
  users: UserRef[];
  roles: RoleRef[];
  token?: string;
  referenceAccess?: ReferenceAccess;
  editing: boolean;
  busy: boolean;
  capabilities: RecordModalCapabilities;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
  onAddTeamMember: (teamId: string, userId: string, role: TeamMemberRole) => Promise<void>;
  onRemoveTeamMember: (teamId: string, userId: string) => Promise<void>;
  onShiftTransition?: (command: ShiftLifecycleCommand) => Promise<void>;
}) {
  if (entity === "users")
    return (
      <UserDetail
        user={record as UserRef & { preferredLocale?: string; preferredTheme?: string }}
        t={t}
        roles={roles}
        token={token}
        canLoadRoles={referenceAccess.roles}
        editing={editing}
        busy={busy}
        canWrite={capabilities.canWrite}
        canDelete={capabilities.canDelete}
        setEditing={setEditing}
        onSubmit={onSubmit}
        onRemove={onRemove}
      />
    );
  if (entity === "clients")
    return (
      <ClientDetail
        client={record as ClientRef}
        t={t}
        editing={editing}
        busy={busy}
        canWrite={capabilities.canWrite}
        canDelete={capabilities.canDelete}
        setEditing={setEditing}
        onSubmit={onSubmit}
        onRemove={onRemove}
      />
    );
  if (entity === "teams")
    return (
      <TeamDetail
        team={record as TeamRef & { description?: string }}
        t={t}
        users={users}
        token={token}
        canLoadUsers={referenceAccess.users}
        editing={editing}
        busy={busy}
        canWrite={capabilities.canWrite}
        canDelete={capabilities.canDelete}
        canAddMembers={capabilities.canAddMembers}
        canRemoveMembers={capabilities.canRemoveMembers}
        setEditing={setEditing}
        onSubmit={onSubmit}
        onRemove={onRemove}
        onAddMember={onAddTeamMember}
        onRemoveMember={onRemoveTeamMember}
      />
    );
  if (entity === "shifts")
    return (
      <ShiftDetail
        shift={record as ShiftRef & { timezone?: string }}
        onTransition={onShiftTransition}
        t={t}
        editing={editing}
        busy={busy}
        canWrite={capabilities.canWrite}
        canDelete={capabilities.canDelete}
        setEditing={setEditing}
        onSubmit={onSubmit}
        onRemove={onRemove}
      />
    );
  return <pre className="json-detail">{JSON.stringify(record, null, 2)}</pre>;
}

function FormActions({
  t,
  editing,
  busy,
  canWrite,
  canDelete,
  setEditing,
  onRemove
}: {
  t: Texts;
  editing: boolean;
  busy: boolean;
  canWrite: boolean;
  canDelete: boolean;
  setEditing: (value: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div className="modal-actions span-2">
      {canWrite ? (
        <button
          className="compact-button"
          disabled={busy}
          type="button"
          onClick={() => setEditing(!editing)}
        >
          <Save size={16} />
          {editing ? t.close : t.edit}
        </button>
      ) : null}
      {editing && canWrite ? (
        <button className="primary-button" disabled={busy} type="submit">
          <Save size={16} />
          {t.save}
        </button>
      ) : null}
      {canDelete ? (
        <button className="danger-button" disabled={busy} type="button" onClick={onRemove}>
          <Trash2 size={16} />
          {t.delete}
        </button>
      ) : null}
    </div>
  );
}

function UserDetail({
  user,
  t,
  roles,
  token,
  canLoadRoles,
  editing,
  busy,
  canWrite,
  canDelete,
  setEditing,
  onSubmit,
  onRemove
}: {
  user: UserRef & { preferredLocale?: string; preferredTheme?: string };
  t: Texts;
  roles: RoleRef[];
  token?: string;
  canLoadRoles: boolean;
  editing: boolean;
  busy: boolean;
  canWrite: boolean;
  canDelete: boolean;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
}) {
  const currentRoleId = userRoleId(user);
  return (
    <form className="modal-grid" onSubmit={onSubmit}>
      <label>
        {t.name}
        <input
          name="displayName"
          defaultValue={user.displayName ?? ""}
          disabled={!editing}
          required
        />
      </label>
      <label>
        {t.email}
        <input
          name="email"
          type="email"
          defaultValue={user.email ?? ""}
          disabled={!editing}
          required
        />
      </label>
      <label>
        {t.jobTitle}
        <input name="jobTitle" defaultValue={user.jobTitle ?? ""} disabled={!editing} />
      </label>
      <label>
        {t.filterStatus}
        <SelectInput
          name="status"
          value={user.status ?? "ACTIVE"}
          disabled={!editing}
          options={[
            ["INVITED", "INVITED"],
            ["ACTIVE", "ACTIVE"],
            ["INACTIVE", "INACTIVE"],
            ["LOCKED", "LOCKED"]
          ]}
        />
      </label>
      <div className="reference-field">
        <span>{t.role}</span>
        <ReferenceSelectInput
          t={t}
          label={t.role}
          name="roleId"
          value={currentRoleId}
          selectedLabel={userRoleOptions(user, roles, t).find(([id]) => id === currentRoleId)?.[1]}
          disabled={!editing}
          initialItems={roles}
          resource="roles"
          token={token}
          loadEnabled={canLoadRoles}
          placeholder={currentRoleId ? undefined : t.noCompanyRole}
        />
      </div>
      <label>
        {t.language}
        <SelectInput
          name="preferredLocale"
          value={user.preferredLocale ?? "PT_BR"}
          disabled={!editing}
          options={[
            ["PT_BR", "PT_BR"],
            ["EN_GB", "EN_GB"]
          ]}
        />
      </label>
      <label>
        {t.theme}
        <SelectInput
          name="preferredTheme"
          value={user.preferredTheme ?? "SYSTEM"}
          disabled={!editing}
          options={[
            ["SYSTEM", "SYSTEM"],
            ["LIGHT", "LIGHT"],
            ["DARK", "DARK"]
          ]}
        />
      </label>
      <label className="span-2">
        {t.newPassword}
        <input
          name="password"
          type="password"
          disabled={!editing}
          placeholder={t.newPasswordHint}
          maxLength={maximumNewPasswordUtf8Bytes}
          onInput={(event) =>
            applyNewPasswordByteValidity(event.currentTarget, t.passwordUtf8Limit)
          }
        />
      </label>
      <FormActions
        t={t}
        editing={editing}
        busy={busy}
        canWrite={canWrite}
        canDelete={canDelete}
        setEditing={setEditing}
        onRemove={onRemove}
      />
    </form>
  );
}

function ClientDetail({
  client,
  t,
  editing,
  busy,
  canWrite,
  canDelete,
  setEditing,
  onSubmit,
  onRemove
}: {
  client: ClientRef;
  t: Texts;
  editing: boolean;
  busy: boolean;
  canWrite: boolean;
  canDelete: boolean;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
}) {
  return (
    <form className="modal-grid" onSubmit={onSubmit}>
      <label>
        {t.name}
        <input name="name" defaultValue={client.name ?? ""} disabled={!editing} required />
      </label>
      <label>
        {t.code}
        <input name="code" defaultValue={client.code ?? ""} disabled={!editing} />
      </label>
      <label>
        {t.filterStatus}
        <SelectInput
          name="status"
          value={client.status ?? "ACTIVE"}
          disabled={!editing}
          options={[
            ["ACTIVE", "ACTIVE"],
            ["INACTIVE", "INACTIVE"]
          ]}
        />
      </label>
      <FormActions
        t={t}
        editing={editing}
        busy={busy}
        canWrite={canWrite}
        canDelete={canDelete}
        setEditing={setEditing}
        onRemove={onRemove}
      />
    </form>
  );
}

export function TeamDetail({
  team,
  t,
  users,
  token,
  canLoadUsers,
  editing,
  busy,
  canWrite,
  canDelete,
  canAddMembers,
  canRemoveMembers,
  setEditing,
  onSubmit,
  onRemove,
  onAddMember,
  onRemoveMember
}: {
  team: TeamRef & { description?: string };
  t: Texts;
  users: UserRef[];
  token?: string;
  canLoadUsers: boolean;
  editing: boolean;
  busy: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canAddMembers: boolean;
  canRemoveMembers: boolean;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
  onAddMember: (teamId: string, userId: string, role: TeamMemberRole) => Promise<void>;
  onRemoveMember: (teamId: string, userId: string) => Promise<void>;
}) {
  const members = team.members ?? [];
  const memberUserIds = new Set(
    members.map((member) => member.userId).filter((id): id is string => Boolean(id))
  );
  const availableUsers = users.filter((user) => user.id && !memberUserIds.has(user.id));
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<TeamMemberRole>("MEMBER");
  const effectiveSelectedUserId = memberUserIds.has(selectedUserId) ? "" : selectedUserId;

  return (
    <div className="modal-stack">
      <form className="modal-grid" onSubmit={onSubmit}>
        <label>
          {t.name}
          <input name="name" defaultValue={team.name ?? ""} disabled={!editing} required />
        </label>
        <label>
          {t.colour}
          <input name="color" defaultValue={team.color ?? "#0f766e"} disabled={!editing} />
        </label>
        <label>
          SLA
          <input
            name="defaultSlaMinutes"
            type="number"
            defaultValue={team.defaultSlaMinutes ?? 240}
            disabled={!editing}
          />
        </label>
        <label className="span-2">
          {t.description}
          <textarea name="description" defaultValue={team.description ?? ""} disabled={!editing} />
        </label>
        <FormActions
          t={t}
          editing={editing}
          busy={busy}
          canWrite={canWrite}
          canDelete={canDelete}
          setEditing={setEditing}
          onRemove={onRemove}
        />
      </form>
      <section className="team-members-panel">
        <div className="panel-header">
          <h3>{t.members}</h3>
          <span>{members.length}</span>
        </div>
        {canRemoveMembers && !canAddMembers ? (
          <p className="guard-note">{t.memberReferenceAccessRequired}</p>
        ) : null}
        {canAddMembers ? (
          <div className="team-member-controls">
            <div className="reference-field">
              <span>{t.user}</span>
              <ReferenceSelectInput
                t={t}
                label={t.user}
                resource="users"
                initialItems={availableUsers}
                excludedIds={[...memberUserIds]}
                token={token}
                loadEnabled={canLoadUsers}
                placeholder={t.selectUser}
                value={effectiveSelectedUserId}
                disabled={busy || !team.id}
                onValueChange={setSelectedUserId}
              />
            </div>
            <label>
              {t.teamRole}
              <select
                value={selectedRole}
                disabled={busy || !team.id}
                onChange={(event) => setSelectedRole(event.target.value as TeamMemberRole)}
              >
                <option value="MEMBER">{t.member}</option>
                <option value="LEADER">{t.leader}</option>
              </select>
            </label>
            <button
              className="primary-button"
              disabled={busy || !team.id || !effectiveSelectedUserId}
              type="button"
              onClick={() => void onAddMember(team.id ?? "", effectiveSelectedUserId, selectedRole)}
            >
              <Plus size={16} />
              {t.add}
            </button>
          </div>
        ) : null}
        <div className="team-member-list">
          {members.length ? (
            members.map((member) => (
              <div key={member.id ?? member.userId}>
                <span>
                  <strong>{member.user?.displayName ?? member.user?.email ?? member.userId}</strong>
                  <small>{member.role === "LEADER" ? t.leader : t.member}</small>
                </span>
                {canRemoveMembers ? (
                  <button
                    className="danger-button"
                    disabled={busy || !team.id || !member.userId}
                    type="button"
                    onClick={() => void onRemoveMember(team.id ?? "", member.userId ?? "")}
                  >
                    <Trash2 size={16} />
                    {t.remove}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <p className="empty-state">{t.noMembersAssigned}</p>
          )}
        </div>
      </section>
    </div>
  );
}

function ShiftDetail({
  shift,
  t,
  editing,
  busy,
  canWrite,
  canDelete,
  setEditing,
  onSubmit,
  onRemove,
  onTransition
}: {
  shift: ShiftRef & { timezone?: string };
  t: Texts;
  editing: boolean;
  busy: boolean;
  canWrite: boolean;
  canDelete: boolean;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
  onTransition?: (command: ShiftLifecycleCommand) => Promise<void>;
}) {
  const commandLabels = {
    open: t.openShift,
    close: t.closeShift,
    reopen: t.reopenShift,
    cancel: t.cancelShift
  };
  return (
    <form className="modal-grid" onSubmit={onSubmit}>
      <label>
        {t.name}
        <input name="name" defaultValue={shift.name ?? ""} disabled={!editing} required />
      </label>
      <label>
        {t.start}
        <input
          name="startsAt"
          type="datetime-local"
          defaultValue={zonedDateInputValue(shift.startsAt, shift.timezone)}
          step={60}
          disabled={!editing || !isNamedTimezone(shift.timezone)}
          required
        />
      </label>
      <label>
        {t.end}
        <input
          name="endsAt"
          type="datetime-local"
          defaultValue={zonedDateInputValue(shift.endsAt, shift.timezone)}
          step={60}
          disabled={!editing || !isNamedTimezone(shift.timezone)}
          required
        />
      </label>
      <label>
        {t.timeZone}
        <input name="timezone" defaultValue={shift.timezone ?? ""} disabled={!editing} required />
      </label>
      <p className="guard-note span-2">
        {isNamedTimezone(shift.timezone) ? t.shiftTimeZoneHint : t.timeZoneUnavailable}
      </p>
      <label>
        {t.filterStatus}
        <SelectInput
          name="status"
          value={shift.status ?? "OPEN"}
          disabled
          options={shiftStatuses.map((item) => [item, item])}
        />
      </label>
      <FormActions
        t={t}
        editing={editing}
        busy={busy}
        canWrite={canWrite}
        canDelete={canDelete}
        setEditing={setEditing}
        onRemove={onRemove}
      />
      {canWrite && shiftCommandsForStatus(shift.status).length > 0 ? (
        <div className="modal-actions span-2">
          {shiftCommandsForStatus(shift.status).map((command) => (
            <button
              key={command}
              className={command === "cancel" ? "danger-button" : "compact-button"}
              type="button"
              disabled={busy || editing || !onTransition}
              onClick={() => {
                if (!busy && !editing) void onTransition?.(command);
              }}
            >
              {commandLabels[command]}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
