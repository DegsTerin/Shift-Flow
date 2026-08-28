// en-GB: Renders the record modal task board interface so its behaviour and accessible structure stay reusable.
import { Archive, ChevronLeft, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { apiRequest, captureApiSessionEpoch, isApiSessionEpochCurrent } from "../lib/api";
import { taskHistoryText, taskHistoryTypeLabel } from "../lib/history-labels";
import { createLatestRequestCoordinator, isAbortError } from "../lib/latest-request";
import type {
  ActivityTaskBoard,
  ActivityTaskItem,
  AttachmentItem,
  Locale,
  Texts,
  UserRef
} from "../lib/types";
import { formatDateTime, priorities, priorityLabel, userOptionLabel } from "../lib/utils";
import { ReferenceSelectInput } from "./controls";

export type ModalMutationOutcome = "SUCCEEDED" | "FAILED" | "STALE" | "IGNORED";

export type TaskBoardMutationRunner = (
  authorised: boolean,
  request: (signal: AbortSignal) => Promise<unknown>,
  hooks?: {
    onCurrentSuccess?: (originEpoch: number) => void | Promise<void>;
    reconcileLocal?: (originEpoch: number) => void | Promise<void>;
  }
) => Promise<ModalMutationOutcome>;

export function InternalTaskBoard({
  activityId,
  t,
  token,
  users,
  attachments,
  locale,
  busy,
  canWrite,
  canDelete,
  canLoadUsers = false,
  runTaskBoardMutation
}: {
  activityId: string;
  t: Texts;
  token?: string;
  users: UserRef[];
  attachments: AttachmentItem[];
  locale: Locale;
  busy: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canLoadUsers?: boolean;
  runTaskBoardMutation: TaskBoardMutationRunner;
}) {
  const [board, setBoard] = useState<ActivityTaskBoard>({ columns: [] });
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  const lifecycle = useRef(0);
  const loadCoordinator = useRef(createLatestRequestCoordinator()).current;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      lifecycle.current += 1;
      loadCoordinator.cancel();
    };
  }, [loadCoordinator]);

  async function loadBoard(expectedEpoch?: number) {
    if (!token) return;
    const epoch = expectedEpoch ?? captureApiSessionEpoch();
    if (epoch === null) return;
    if (!isApiSessionEpochCurrent(epoch)) return;
    const request = loadCoordinator.begin();
    const currentLifecycle = lifecycle.current;
    const isCurrent = () =>
      mounted.current &&
      currentLifecycle === lifecycle.current &&
      request.isCurrent() &&
      isApiSessionEpochCurrent(epoch);
    try {
      const nextBoard = await apiRequest<ActivityTaskBoard>(
        `/api/activities/${activityId}/task-board`,
        token,
        { signal: request.signal }
      );
      if (!isCurrent()) return;
      setBoard(nextBoard);
      setMessage(null);
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      setMessage(cause instanceof Error ? cause.message : t.taskBoardLoadFailed);
    }
  }

  useEffect(() => {
    void loadBoard();
    return () => {
      lifecycle.current += 1;
      loadCoordinator.cancel();
    };
  }, [activityId, loadCoordinator, token]);

  async function runMutation(
    authorised: boolean,
    operation: (signal: AbortSignal) => Promise<unknown>,
    afterSuccess?: () => void
  ) {
    const currentLifecycle = lifecycle.current;
    const isCurrent = (originEpoch: number) =>
      mounted.current &&
      currentLifecycle === lifecycle.current &&
      isApiSessionEpochCurrent(originEpoch);
    setMessage(null);
    return runTaskBoardMutation(authorised, operation, {
      onCurrentSuccess: (originEpoch) => {
        if (isCurrent(originEpoch)) afterSuccess?.();
      },
      reconcileLocal: async (originEpoch) => {
        if (isCurrent(originEpoch)) {
          await loadBoard(originEpoch);
        }
      }
    });
  }

  async function createColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await runMutation(
      canWrite,
      (signal) =>
        apiRequest(`/api/activities/${activityId}/task-board/columns`, token ?? "", {
          method: "POST",
          body: JSON.stringify({
            name: String(form.get("name") ?? ""),
            color: String(form.get("color") || "#64748b")
          }),
          signal
        }),
      () => formElement.reset()
    );
  }

  async function createTask(event: FormEvent<HTMLFormElement>, columnId: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await runMutation(
      canWrite,
      (signal) =>
        apiRequest(`/api/activities/${activityId}/task-board/tasks`, token ?? "", {
          method: "POST",
          body: JSON.stringify({
            columnId,
            title: String(form.get("title") ?? ""),
            assigneeId: String(form.get("assigneeId") || "") || undefined,
            priority: String(form.get("priority") || "MEDIUM"),
            dueAt: taskDueAtPayload(String(form.get("dueAt") || ""), undefined, undefined),
            labels: String(form.get("labels") || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
            attachmentIds: form.getAll("attachmentIds").map(String).filter(Boolean)
          }),
          signal
        }),
      () => formElement.reset()
    );
  }

  async function moveTask(taskId: string, columnId: string, position: number) {
    await runMutation(canWrite, (signal) =>
      apiRequest(`/api/activities/${activityId}/task-board/tasks/${taskId}/move`, token ?? "", {
        method: "POST",
        body: JSON.stringify({ columnId, position }),
        signal
      })
    );
  }

  async function archiveTask(taskId: string) {
    await runMutation(canWrite, (signal) =>
      apiRequest(`/api/activities/${activityId}/task-board/tasks/${taskId}/archive`, token ?? "", {
        method: "POST",
        body: JSON.stringify({}),
        signal
      })
    );
  }

  async function restoreTask(taskId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runMutation(canWrite, (signal) =>
      apiRequest(`/api/activities/${activityId}/task-board/tasks/${taskId}/restore`, token ?? "", {
        method: "POST",
        body: JSON.stringify({ columnId: String(form.get("columnId") || "") || undefined }),
        signal
      })
    );
  }

  async function updateTask(task: ActivityTaskItem, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runMutation(canWrite, (signal) =>
      apiRequest(`/api/activities/${activityId}/task-board/tasks/${task.id}`, token ?? "", {
        method: "PATCH",
        body: JSON.stringify({
          columnId: String(form.get("columnId") || ""),
          title: String(form.get("title") ?? ""),
          description: String(form.get("description") || "") || null,
          assigneeId: String(form.get("assigneeId") || "") || null,
          priority: String(form.get("priority") || "MEDIUM"),
          dueAt: taskDueAtPayload(String(form.get("dueAt") || ""), task.dueAt, null),
          labels: String(form.get("labels") || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          attachmentIds: form.getAll("attachmentIds").map(String).filter(Boolean)
        }),
        signal
      })
    );
  }

  async function deleteTask(taskId: string) {
    await runMutation(canDelete, (signal) =>
      apiRequest(`/api/activities/${activityId}/task-board/tasks/${taskId}`, token ?? "", {
        method: "DELETE",
        signal
      })
    );
  }

  async function renameColumn(columnId: string, currentName: string, currentColor?: string | null) {
    if (!token || !canWrite || busy) return;
    const name = window.prompt(t.columnName, currentName);
    if (!name?.trim()) return;
    await runMutation(canWrite, (signal) =>
      apiRequest(`/api/activities/${activityId}/task-board/columns/${columnId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), color: currentColor ?? "#64748b" }),
        signal
      })
    );
  }

  async function deleteColumn(columnId: string) {
    await runMutation(canDelete, (signal) =>
      apiRequest(`/api/activities/${activityId}/task-board/columns/${columnId}`, token ?? "", {
        method: "DELETE",
        signal
      })
    );
  }

  async function reorderColumn(columnId: string, direction: -1 | 1) {
    const ids = board.columns.map((column) => column.id);
    const index = ids.indexOf(columnId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    const nextIds = [...ids];
    const [moved] = nextIds.splice(index, 1);
    nextIds.splice(nextIndex, 0, moved);
    await runMutation(canWrite, (signal) =>
      apiRequest(`/api/activities/${activityId}/task-board/columns/reorder`, token ?? "", {
        method: "POST",
        body: JSON.stringify({ columnIds: nextIds }),
        signal
      })
    );
  }

  const controlsBusy = busy;
  const canMutate = canWrite && !controlsBusy;

  return (
    <article className="panel span-2 internal-kanban">
      <div className="panel-header">
        <h2>{t.activityTaskBoard}</h2>
        {canWrite ? (
          <form className="inline-create-form" onSubmit={(event) => void createColumn(event)}>
            <input aria-label={t.columnName} name="name" placeholder={t.newColumn} required />
            <input aria-label={t.columnColour} name="color" type="color" defaultValue="#64748b" />
            <button
              aria-label={t.newColumn}
              className="compact-button"
              disabled={controlsBusy || !token}
              title={t.newColumn}
              type="submit"
            >
              <Plus size={16} />
            </button>
          </form>
        ) : null}
      </div>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      <div className="internal-kanban-board">
        {board.columns.map((column, columnIndex) => (
          <section
            className="internal-kanban-column"
            key={column.id}
            onDragOver={canMutate ? (event) => event.preventDefault() : undefined}
            onDrop={
              canMutate
                ? (event) =>
                    handleInternalTaskDrop(
                      event,
                      board,
                      draggedTaskId,
                      column.id,
                      column.tasks?.length ?? 0,
                      false,
                      () => setDraggedTaskId(null),
                      (plan) => void moveTask(plan.taskId, plan.columnId, plan.position)
                    )
                : undefined
            }
          >
            <div className="internal-column-header">
              <h3>
                <i style={{ backgroundColor: column.color ?? "#64748b" }} />
                {column.name}
              </h3>
              {canWrite || canDelete ? (
                <div>
                  {canWrite ? (
                    <>
                      <button
                        aria-label={`${t.moveLeft}: ${column.name}`}
                        className="icon-button"
                        disabled={controlsBusy || columnIndex === 0}
                        type="button"
                        title={t.moveLeft}
                        onClick={() => void reorderColumn(column.id, -1)}
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <button
                        aria-label={`${t.moveRight}: ${column.name}`}
                        className="icon-button"
                        disabled={controlsBusy || columnIndex === board.columns.length - 1}
                        type="button"
                        title={t.moveRight}
                        onClick={() => void reorderColumn(column.id, 1)}
                      >
                        <ChevronRight size={15} />
                      </button>
                      <button
                        className="compact-button"
                        disabled={controlsBusy}
                        type="button"
                        onClick={() => void renameColumn(column.id, column.name, column.color)}
                      >
                        {t.edit}
                      </button>
                    </>
                  ) : null}
                  {canDelete ? (
                    <button
                      aria-label={`${t.deleteColumn}: ${column.name}`}
                      className="icon-button"
                      disabled={controlsBusy}
                      type="button"
                      title={t.deleteColumn}
                      onClick={() => void deleteColumn(column.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {(column.tasks ?? []).map((task, index) => (
              <InternalTaskCard
                key={task.id}
                task={task}
                columns={board.columns}
                users={users}
                token={token}
                canLoadUsers={canLoadUsers}
                attachments={attachments}
                t={t}
                locale={locale}
                busy={controlsBusy}
                canWrite={canWrite}
                canDelete={canDelete}
                onArchive={() => void archiveTask(task.id)}
                onDelete={() => void deleteTask(task.id)}
                onUpdate={(event) => void updateTask(task, event)}
                onDragStart={() => setDraggedTaskId(task.id)}
                onDragEnd={() => setDraggedTaskId(null)}
                onDropBefore={(event) =>
                  handleInternalTaskDrop(
                    event,
                    board,
                    draggedTaskId,
                    column.id,
                    index,
                    true,
                    () => setDraggedTaskId(null),
                    (plan) => void moveTask(plan.taskId, plan.columnId, plan.position)
                  )
                }
                canMoveBefore={index > 0}
                canMoveAfter={index < (column.tasks?.length ?? 0) - 1}
                onMoveBefore={() => {
                  const plan = planInternalTaskStep(board, task.id, -1);
                  if (plan) void moveTask(plan.taskId, plan.columnId, plan.position);
                }}
                onMoveAfter={() => {
                  const plan = planInternalTaskStep(board, task.id, 1);
                  if (plan) void moveTask(plan.taskId, plan.columnId, plan.position);
                }}
              />
            ))}
            {canWrite ? (
              <form
                className="task-create-form"
                onSubmit={(event) => void createTask(event, column.id)}
              >
                <input name="columnId" type="hidden" value={column.id} readOnly />
                <input aria-label={t.title} name="title" placeholder={t.newTask} required />
                <ReferenceSelectInput
                  t={t}
                  label={t.responsible}
                  name="assigneeId"
                  value=""
                  initialItems={users}
                  resource="users"
                  token={token}
                  loadEnabled={canLoadUsers}
                  placeholder={t.unassigned}
                />
                <select aria-label={t.filterPriority} name="priority" defaultValue="MEDIUM">
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priorityLabel(priority, t)}
                    </option>
                  ))}
                </select>
                <input name="dueAt" type="datetime-local" aria-label={t.due} />
                <input aria-label={t.labels} name="labels" placeholder={t.labelsSeparatedByComma} />
                {attachments.length ? (
                  <div className="task-attachment-options">
                    {attachments.map((attachment) => (
                      <label key={attachment.id ?? attachment.fileName}>
                        <input name="attachmentIds" type="checkbox" value={attachment.id ?? ""} />
                        {attachment.fileName ?? "-"}
                      </label>
                    ))}
                  </div>
                ) : null}
                <button
                  aria-label={t.newTask}
                  className="compact-button"
                  disabled={controlsBusy || !token}
                  title={t.newTask}
                  type="submit"
                >
                  <Plus size={16} />
                </button>
              </form>
            ) : null}
          </section>
        ))}
      </div>
      {(board.archivedTasks ?? []).length ? (
        <section className="internal-history">
          <div className="panel-header">
            <h3>{t.archivedTasks}</h3>
            <span>{board.archivedTasks?.length ?? 0}</span>
          </div>
          <div className="timeline">
            {board.archivedTasks?.map((task) => (
              <div key={task.id}>
                <strong>{task.title}</strong>
                <span>
                  {board.columns.find((column) => column.id === task.columnId)?.name ?? t.column}
                </span>
                {canWrite || canDelete ? (
                  <form
                    className="internal-task-actions"
                    onSubmit={(event) => void restoreTask(task.id, event)}
                  >
                    {canWrite ? (
                      <>
                        <select
                          aria-label={`${t.restoreTaskColumn} ${task.title}`}
                          disabled={controlsBusy}
                          name="columnId"
                          defaultValue={
                            board.columns.some((column) => column.id === task.columnId)
                              ? task.columnId
                              : (board.columns[0]?.id ?? "")
                          }
                        >
                          {board.columns.map((column) => (
                            <option key={column.id} value={column.id}>
                              {column.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className="compact-button"
                          disabled={controlsBusy || !token || !board.columns.length}
                          type="submit"
                        >
                          {t.restore}
                        </button>
                      </>
                    ) : null}
                    {canDelete ? (
                      <button
                        aria-label={`${t.deleteArchivedTask}: ${task.title}`}
                        className="icon-button static"
                        disabled={controlsBusy || !token}
                        type="button"
                        title={t.deleteArchivedTask}
                        onClick={() => void deleteTask(task.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </form>
                ) : null}
              </div>
            ))}
            {board.archivedTasksTruncated ? <p>{t.archivedTasksLimit}</p> : null}
          </div>
        </section>
      ) : null}
      <section className="internal-history">
        <div className="panel-header">
          <h3>{t.internalKanbanHistory}</h3>
          <span>{board.history?.length ?? 0}</span>
        </div>
        <div className="timeline">
          {(board.history ?? []).length ? (
            board.history?.map((item) => (
              <div key={item.id}>
                <strong>{taskHistoryTypeLabel(item.type, t)}</strong>
                <span>
                  {formatDateTime(item.createdAt, locale)} - {item.actor?.displayName ?? "-"}
                </span>
                <small>{taskHistoryText(item, t)}</small>
              </div>
            ))
          ) : (
            <div>
              <strong>{t.noMovements}</strong>
              <span>{t.taskChangesHint}</span>
            </div>
          )}
        </div>
      </section>
    </article>
  );
}

export function InternalTaskCard({
  task,
  columns,
  users,
  token,
  canLoadUsers,
  attachments,
  t,
  locale,
  busy,
  canWrite,
  canDelete,
  onDragStart,
  onDragEnd,
  onDropBefore,
  canMoveBefore,
  canMoveAfter,
  onMoveBefore,
  onMoveAfter,
  onUpdate,
  onDelete,
  onArchive
}: {
  task: ActivityTaskItem;
  columns: { id: string; name: string }[];
  users: UserRef[];
  token?: string;
  canLoadUsers: boolean;
  attachments: AttachmentItem[];
  t: Texts;
  locale: Locale;
  busy: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: (event: DragEvent<HTMLDivElement>) => void;
  canMoveBefore: boolean;
  canMoveAfter: boolean;
  onMoveBefore: () => void;
  onMoveAfter: () => void;
  onUpdate: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!canWrite) setEditing(false);
  }, [canWrite]);
  const labels = (task.labels ?? []).join(", ");
  const attachmentIds = new Set(task.attachmentIds ?? []);
  return (
    <div
      className="internal-task-card"
      draggable={canWrite && !busy}
      onDragStart={canWrite && !busy ? onDragStart : undefined}
      onDragEnd={canWrite && !busy ? onDragEnd : undefined}
      onDragOver={canWrite && !busy ? (event) => event.preventDefault() : undefined}
      onDrop={canWrite && !busy ? onDropBefore : undefined}
    >
      {editing && canWrite ? (
        <form className="internal-task-edit-form" onSubmit={onUpdate}>
          <input aria-label={t.title} name="title" defaultValue={task.title} required />
          <select aria-label={t.column} name="columnId" defaultValue={task.columnId}>
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>
          <ReferenceSelectInput
            t={t}
            label={t.responsible}
            name="assigneeId"
            value={task.assigneeId ?? ""}
            selectedLabel={
              task.assignee ? userOptionLabel(task.assignee) : (task.assigneeId ?? undefined)
            }
            initialItems={users}
            resource="users"
            token={token}
            loadEnabled={canLoadUsers}
            placeholder={t.unassigned}
          />
          <select
            aria-label={t.filterPriority}
            name="priority"
            defaultValue={task.priority ?? "MEDIUM"}
          >
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabel(priority, t)}
              </option>
            ))}
          </select>
          <input
            name="dueAt"
            type="datetime-local"
            aria-label={t.due}
            defaultValue={toDateTimeLocalValue(task.dueAt)}
          />
          <textarea
            aria-label={t.description}
            name="description"
            defaultValue={task.description ?? ""}
          />
          <input aria-label={t.labels} name="labels" defaultValue={labels} placeholder={t.labels} />
          {attachments.length ? (
            <div className="task-attachment-options">
              {attachments.map((attachment) => (
                <label key={attachment.id ?? attachment.fileName}>
                  <input
                    name="attachmentIds"
                    type="checkbox"
                    value={attachment.id ?? ""}
                    defaultChecked={attachment.id ? attachmentIds.has(attachment.id) : false}
                  />
                  {attachment.fileName ?? "-"}
                </label>
              ))}
            </div>
          ) : null}
          <div className="internal-task-actions">
            <button className="primary-button" disabled={busy} type="submit">
              <Save size={15} />
              {t.save}
            </button>
            <button className="compact-button" type="button" onClick={() => setEditing(false)}>
              {t.close}
            </button>
          </div>
        </form>
      ) : (
        <>
          <strong>{task.title}</strong>
          <small>{task.assignee?.displayName ?? task.assignee?.email ?? "-"}</small>
          <small className={isTaskOverdue(task.dueAt) ? "task-overdue" : undefined}>
            {t.due}: {formatDateTime(task.dueAt, locale)}
          </small>
          {task.description ? <p>{task.description}</p> : null}
          <div>
            <span className={`priority ${(task.priority ?? "MEDIUM").toLowerCase()}`}>
              {priorityLabel(task.priority ?? "MEDIUM", t)}
            </span>
            {(task.labels ?? []).map((label) => (
              <span key={label}>{label}</span>
            ))}
            {(task.attachmentIds ?? []).map((attachmentId) => {
              const attachment = attachments.find((item) => item.id === attachmentId);
              return <span key={attachmentId}>{attachment?.fileName ?? t.attachment}</span>;
            })}
          </div>
          {canWrite || canDelete ? (
            <div className="internal-task-actions">
              {canWrite ? (
                <>
                  <button
                    aria-label={`${t.moveBefore}: ${task.title}`}
                    className="icon-button static"
                    disabled={busy || !canMoveBefore}
                    type="button"
                    title={t.moveBefore}
                    onClick={onMoveBefore}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    aria-label={`${t.moveAfter}: ${task.title}`}
                    className="icon-button static"
                    disabled={busy || !canMoveAfter}
                    type="button"
                    title={t.moveAfter}
                    onClick={onMoveAfter}
                  >
                    <ChevronRight size={15} />
                  </button>
                  <button
                    aria-label={`${t.edit}: ${task.title}`}
                    className="compact-button"
                    disabled={busy}
                    type="button"
                    onClick={() => setEditing(true)}
                  >
                    {t.edit}
                  </button>
                  <button
                    aria-label={`${t.archive}: ${task.title}`}
                    className="icon-button static"
                    disabled={busy}
                    type="button"
                    title={t.archive}
                    onClick={onArchive}
                  >
                    <Archive size={15} />
                  </button>
                </>
              ) : null}
              {canDelete ? (
                <button
                  aria-label={`${t.delete}: ${task.title}`}
                  className="icon-button static"
                  disabled={busy}
                  type="button"
                  title={t.delete}
                  onClick={onDelete}
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

type InternalTaskDropPlan = { taskId: string; columnId: string; position: number };

export function planInternalTaskDrop(
  board: ActivityTaskBoard,
  taskId: string | null,
  columnId: string,
  requestedPosition: number
): InternalTaskDropPlan | null {
  if (!taskId) return null;
  const sourceColumn = board.columns.find((column) =>
    (column.tasks ?? []).some((task) => task.id === taskId)
  );
  const targetColumn = board.columns.find((column) => column.id === columnId);
  if (!sourceColumn || !targetColumn) return null;
  const sourcePosition = (sourceColumn.tasks ?? []).findIndex((task) => task.id === taskId);
  const sameColumn = sourceColumn.id === columnId;
  const targetLength = Math.max(0, (targetColumn.tasks?.length ?? 0) - (sameColumn ? 1 : 0));
  const adjustedPosition =
    sameColumn && sourcePosition < requestedPosition ? requestedPosition - 1 : requestedPosition;
  const position = Math.max(0, Math.min(adjustedPosition, targetLength));
  if (sameColumn && position === sourcePosition) return null;
  return { taskId, columnId, position };
}

export function planInternalTaskStep(
  board: ActivityTaskBoard,
  taskId: string,
  direction: -1 | 1
): InternalTaskDropPlan | null {
  const sourceColumn = board.columns.find((column) =>
    (column.tasks ?? []).some((task) => task.id === taskId)
  );
  if (!sourceColumn) return null;
  const sourcePosition = (sourceColumn.tasks ?? []).findIndex((task) => task.id === taskId);
  const targetPosition = sourcePosition + direction;
  if (targetPosition < 0 || targetPosition >= (sourceColumn.tasks?.length ?? 0)) return null;
  return planInternalTaskDrop(
    board,
    taskId,
    sourceColumn.id,
    direction === -1 ? sourcePosition - 1 : sourcePosition + 2
  );
}

export function handleInternalTaskDrop(
  event: Pick<DragEvent<HTMLDivElement>, "preventDefault" | "stopPropagation">,
  board: ActivityTaskBoard,
  taskId: string | null,
  columnId: string,
  requestedPosition: number,
  stopPropagation: boolean,
  clearDrag: () => void,
  move: (plan: InternalTaskDropPlan) => void
) {
  event.preventDefault();
  if (stopPropagation) event.stopPropagation();
  const plan = planInternalTaskDrop(board, taskId, columnId, requestedPosition);
  clearDrag();
  if (plan) move(plan);
  return plan;
}

export function taskDueAtPayload(
  value: string,
  previousValue: string | null | undefined,
  emptyValue: null | undefined
) {
  if (!value) return emptyValue;
  if (previousValue && toDateTimeLocalValue(previousValue) === value) return previousValue;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function isTaskOverdue(value?: string | null) {
  return Boolean(value && new Date(value).getTime() < Date.now());
}
