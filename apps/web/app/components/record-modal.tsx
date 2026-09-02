// en-GB: Renders the record modal interface so its behaviour and accessible structure stay reusable.
"use client";

import { Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  apiRequest,
  captureApiSessionEpoch,
  isApiSessionEpochCurrent,
  settleApiSessionOperation
} from "../lib/api";
import { isAbortError } from "../lib/latest-request";
import type {
  ActivityItem,
  ClientRef,
  CommentItem,
  Locale,
  ModalState,
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
  activityPayload,
  createRecord,
  recordEndpoint,
  recordPayload,
  shiftStatuses,
  userRoleId,
  userRoleOptions
} from "../lib/utils";
import { ReferenceSelectInput, SelectInput } from "./controls";
import { ActivityDetail } from "./record-modal-activity-detail";
import type { ModalMutationOutcome, TaskBoardMutationRunner } from "./record-modal-task-board";
import { CreateForm } from "./record-modal-create-form";

export function RecordModal({
  state,
  t,
  token,
  locale,
  clients,
  users,
  teams,
  shifts,
  roles,
  referenceAccess = {
    clients: false,
    users: false,
    teams: false,
    shifts: false,
    roles: false
  },
  capabilities,
  onClose,
  onReload
}: {
  state: NonNullable<ModalState>;
  t: Texts;
  token?: string;
  locale: Locale;
  clients: ClientRef[];
  users: UserRef[];
  teams: TeamRef[];
  shifts: ShiftRef[];
  roles: RoleRef[];
  referenceAccess?: ReferenceAccess;
  capabilities: RecordModalCapabilities;
  onClose: () => void;
  onReload: (originEpoch: number) => Promise<void>;
}) {
  const isActivity = state.entity === "activities" || state.entity === "kanban";
  const activity = isActivity && state.record ? (state.record as ActivityItem) : null;
  const recordId =
    typeof state.record === "object" && state.record && "id" in state.record
      ? String((state.record as { id?: string }).id ?? "")
      : "";
  const [editing, setEditing] = useState(state.mode === "create");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  const modalRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<{ focus?: () => void; isConnected?: boolean } | null>(null);
  const operation = useRef<{
    controller: AbortController;
    epoch: number;
    reconciliation?: Promise<void>;
  } | null>(null);

  type MutationOptions = {
    closeOnSuccess?: boolean;
    reconcileOnFailure?: boolean;
    failureMessage?: string;
    onCurrentSuccess?: (originEpoch: number) => void | Promise<void>;
    reconcileLocal?: (originEpoch: number) => void | Promise<void>;
  };

  function reconcileOperation(currentOperation: NonNullable<typeof operation.current>) {
    if (!isApiSessionEpochCurrent(currentOperation.epoch)) return Promise.resolve();
    if (!currentOperation.reconciliation) {
      currentOperation.reconciliation = Promise.resolve().then(() =>
        onReload(currentOperation.epoch)
      );
    }
    return currentOperation.reconciliation;
  }

  useEffect(() => {
    mounted.current = true;
    previousFocusRef.current = document.activeElement as typeof previousFocusRef.current;
    document.body.classList.add("modal-open");
    closeButtonRef.current?.focus();
    return () => {
      mounted.current = false;
      document.body.classList.remove("modal-open");
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected !== false) previousFocus?.focus?.();
    };
  }, []);

  function closeModal() {
    if (operation.current) return;
    onClose();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !operation.current) {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ) ?? []
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  async function runMutation(
    authorised: boolean,
    request: (signal: AbortSignal) => Promise<unknown>,
    options: MutationOptions = {}
  ): Promise<ModalMutationOutcome> {
    if (!authorised || !token || operation.current) return "IGNORED";
    const epoch = captureApiSessionEpoch();
    if (epoch === null) return "STALE";
    const controller = new AbortController();
    const currentOperation = { controller, epoch };
    operation.current = currentOperation;
    const isOperationCurrent = () =>
      operation.current === currentOperation && isApiSessionEpochCurrent(currentOperation.epoch);
    const canUpdateModal = () => mounted.current && isOperationCurrent();
    setBusy(true);
    setMessage(null);
    try {
      return await settleApiSessionOperation(epoch, request(controller.signal), {
        onSuccess: async () => {
          if (!isOperationCurrent()) return;
          await reconcileOperation(currentOperation);
          if (!canUpdateModal()) return;
          await options.onCurrentSuccess?.(currentOperation.epoch);
          await options.reconcileLocal?.(currentOperation.epoch);
          if (options.closeOnSuccess !== false) onClose();
        },
        onFailure: async (cause) => {
          if (!isOperationCurrent() || isAbortError(cause)) return;
          if (options.reconcileOnFailure) {
            try {
              await reconcileOperation(currentOperation);
              if (canUpdateModal()) {
                await options.reconcileLocal?.(currentOperation.epoch);
              }
            } catch {
              // The original mutation failure remains the owner-visible result.
            }
          }
          if (!canUpdateModal()) return;
          setMessage(
            cause instanceof Error ? cause.message : (options.failureMessage ?? t.requestFailed)
          );
        }
      });
    } catch (cause) {
      if (canUpdateModal() && !isAbortError(cause)) {
        setMessage(cause instanceof Error ? cause.message : t.requestFailed);
      }
      return "FAILED";
    } finally {
      if (operation.current === currentOperation) operation.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  const runTaskBoardMutation: TaskBoardMutationRunner = (authorised, request, hooks) =>
    runMutation(authorised, request, {
      closeOnSuccess: false,
      reconcileOnFailure: true,
      failureMessage: t.taskBoardUpdateFailed,
      onCurrentSuccess: hooks?.onCurrentSuccess,
      reconcileLocal: hooks?.reconcileLocal
    });

  useEffect(() => {
    if (!capabilities.canWrite) setEditing(false);
  }, [capabilities.canWrite]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runMutation(capabilities.canWrite, (signal) => {
      if (state.mode === "create") {
        return createRecord(state.entity, form, token ?? "", clients, teams, signal);
      }
      if (activity) {
        return apiRequest<ActivityItem>(`/api/activities/${activity.id}`, token, {
          method: "PATCH",
          body: JSON.stringify(activityPayload(form, activity)),
          signal
        });
      }
      if (recordId) {
        return apiRequest(recordEndpoint(state.entity, recordId), token, {
          method: "PATCH",
          body: JSON.stringify(recordPayload(state.entity, form, clients, teams)),
          signal
        });
      }
      return Promise.resolve(undefined);
    });
  }

  async function removeActivity() {
    if (!activity && !recordId) return;
    await runMutation(capabilities.canDelete, (signal) => {
      const endpoint = activity
        ? `/api/activities/${activity.id}`
        : recordEndpoint(state.entity, recordId);
      return apiRequest(endpoint, token, { method: "DELETE", signal });
    });
  }

  async function transitionActivity(action: "close" | "reopen") {
    if (!activity) return;
    await runMutation(capabilities.canWrite, (signal) =>
      apiRequest<ActivityItem>(`/api/activities/${activity.id}/${action}`, token, {
        method: "POST",
        body: JSON.stringify({}),
        signal
      })
    );
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activity) return;
    const form = new FormData(event.currentTarget);
    await runMutation(capabilities.canComment, (signal) =>
      apiRequest<CommentItem>("/api/comments", token, {
        method: "POST",
        body: JSON.stringify({ activityId: activity.id, body: String(form.get("body") ?? "") }),
        signal
      })
    );
  }

  async function addTeamMember(teamId: string, userId: string, role: TeamMemberRole) {
    if (!teamId || !userId) return;
    await runMutation(capabilities.canAddMembers, (signal) =>
      apiRequest(`/api/teams/${teamId}/members`, token, {
        method: "POST",
        body: JSON.stringify({ userId, role }),
        signal
      })
    );
  }

  async function removeTeamMember(teamId: string, userId: string) {
    if (!teamId || !userId) return;
    await runMutation(capabilities.canRemoveMembers, (signal) =>
      apiRequest(`/api/teams/${teamId}/members/${userId}`, token, { method: "DELETE", signal })
    );
  }

  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="record-modal-title"
        aria-modal="true"
        className="record-modal"
        onKeyDown={handleDialogKeyDown}
        ref={modalRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{state.mode === "create" ? t.newRecord : t.details}</p>
            <h2 id="record-modal-title">{modalTitle(state.entity, t)}</h2>
          </div>
          <button
            aria-label={t.close}
            className="icon-button"
            disabled={busy}
            onClick={closeModal}
            ref={closeButtonRef}
            title={t.close}
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        {message ? (
          <p className="form-error" role="alert">
            {message}
          </p>
        ) : null}
        {state.mode === "create" && capabilities.canWrite ? (
          <CreateForm
            entity={state.entity}
            t={t}
            clients={clients}
            users={users}
            teams={teams}
            shifts={shifts}
            roles={roles}
            token={token}
            referenceAccess={referenceAccess}
            busy={busy}
            onSubmit={submit}
          />
        ) : null}
        {state.mode === "detail" && activity ? (
          <ActivityDetail
            activity={activity}
            t={t}
            token={token}
            locale={locale}
            clients={clients}
            users={users}
            teams={teams}
            shifts={shifts}
            editing={editing}
            busy={busy}
            capabilities={capabilities}
            referenceAccess={referenceAccess}
            setEditing={setEditing}
            onSubmit={submit}
            onRemove={removeActivity}
            onComment={addComment}
            onCloseActivity={() => void transitionActivity("close")}
            onReopenActivity={() => void transitionActivity("reopen")}
            runTaskBoardMutation={runTaskBoardMutation}
          />
        ) : null}
        {state.mode === "detail" && !activity ? (
          <GenericDetail
            entity={state.entity}
            record={state.record}
            t={t}
            users={users}
            roles={roles}
            token={token}
            referenceAccess={referenceAccess}
            editing={editing}
            busy={busy}
            capabilities={capabilities}
            setEditing={setEditing}
            onSubmit={submit}
            onRemove={removeActivity}
            onAddTeamMember={addTeamMember}
            onRemoveTeamMember={removeTeamMember}
          />
        ) : null}
      </section>
    </div>
  );
}

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
  onRemoveTeamMember
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
  onRemove
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
}) {
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
          defaultValue={shift.startsAt ? shift.startsAt.slice(0, 16) : ""}
          disabled={!editing}
          required
        />
      </label>
      <label>
        {t.end}
        <input
          name="endsAt"
          type="datetime-local"
          defaultValue={shift.endsAt ? shift.endsAt.slice(0, 16) : ""}
          disabled={!editing}
          required
        />
      </label>
      <label>
        {t.timeZone}
        <input
          name="timezone"
          defaultValue={shift.timezone ?? "America/Sao_Paulo"}
          disabled={!editing}
        />
      </label>
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
    </form>
  );
}

function modalTitle(entity: View, t: Texts) {
  return t[entity === "team-dashboard" ? "teamDashboard" : entity];
}
