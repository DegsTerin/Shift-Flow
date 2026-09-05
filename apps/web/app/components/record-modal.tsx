// en-GB: Renders the record modal interface so its behaviour and accessible structure stay reusable.
"use client";

import { X } from "lucide-react";
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
  shiftCommandsForStatus,
  type ShiftLifecycleCommand
} from "../lib/utils";
import { ActivityDetail } from "./record-modal-activity-detail";
import { GenericDetail } from "./record-modal-generic-detail";
import type { ModalMutationOutcome, TaskBoardMutationRunner } from "./record-modal-task-board";
import { CreateForm } from "./record-modal-create-form";

export { GenericDetail, TeamDetail } from "./record-modal-generic-detail";

export function RecordModal({
  state,
  t,
  token,
  locale,
  companyTimezone,
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
  companyTimezone?: string;
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
  // en-GB: Retained callbacks belong to this modal's original security context, not their invocation context.
  const originEpoch = useRef(captureApiSessionEpoch()).current;
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
    if (operation.current || !mounted.current || !isApiSessionEpochCurrent(originEpoch)) return;
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
    const epoch = originEpoch;
    if (!mounted.current || epoch === null || !isApiSessionEpochCurrent(epoch)) return "STALE";
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
      if (mounted.current && isApiSessionEpochCurrent(epoch)) setBusy(false);
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
          body: JSON.stringify(activityPayload(form, activity, companyTimezone)),
          signal
        });
      }
      if (recordId) {
        return apiRequest(recordEndpoint(state.entity, recordId), token, {
          method: "PATCH",
          body: JSON.stringify(
            recordPayload(state.entity, form, clients, teams, state.record, companyTimezone)
          ),
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

  async function transitionShift(command: ShiftLifecycleCommand) {
    const shift = state.record as ShiftRef | undefined;
    if (
      state.mode !== "detail" ||
      state.entity !== "shifts" ||
      editing ||
      !recordId ||
      !shiftCommandsForStatus(shift?.status).includes(command)
    )
      return;
    await runMutation(capabilities.canWrite, (signal) =>
      apiRequest<ShiftRef>(`/api/shifts/${recordId}/${command}`, token, {
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
            companyTimezone={companyTimezone}
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
            companyTimezone={companyTimezone}
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
            onShiftTransition={transitionShift}
          />
        ) : null}
      </section>
    </div>
  );
}

function modalTitle(entity: View, t: Texts) {
  return t[entity === "team-dashboard" ? "teamDashboard" : entity];
}
