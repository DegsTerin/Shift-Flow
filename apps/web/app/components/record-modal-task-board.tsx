// en-GB: Renders the record modal task board interface so its behaviour and accessible structure stay reusable.
import { Archive, ChevronLeft, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import type {
  ActivityTaskBoard,
  ActivityTaskItem,
  AttachmentItem,
  Locale,
  UserRef
} from "../lib/types";
import { formatDateTime, priorities, userOptionLabel } from "../lib/utils";

export function InternalTaskBoard({
  activityId,
  token,
  users,
  attachments,
  locale,
  busy
}: {
  activityId: string;
  token?: string;
  users: UserRef[];
  attachments: AttachmentItem[];
  locale: Locale;
  busy: boolean;
}) {
  const [board, setBoard] = useState<ActivityTaskBoard>({ columns: [] });
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadBoard() {
    if (!token) return;
    try {
      setBoard(
        await apiRequest<ActivityTaskBoard>(`/api/activities/${activityId}/task-board`, token)
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Falha ao carregar tarefas");
    }
  }

  useEffect(() => {
    void loadBoard();
  }, [activityId, token]);

  async function createColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await apiRequest(`/api/activities/${activityId}/task-board/columns`, token, {
      method: "POST",
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        color: String(form.get("color") || "#64748b")
      })
    });
    formElement.reset();
    await loadBoard();
  }

  async function createTask(event: FormEvent<HTMLFormElement>, columnId: string) {
    event.preventDefault();
    if (!token) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await apiRequest(`/api/activities/${activityId}/task-board/tasks`, token, {
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
      })
    });
    formElement.reset();
    await loadBoard();
  }

  async function moveTask(taskId: string, columnId: string, position: number) {
    if (!token) return;
    await apiRequest(`/api/activities/${activityId}/task-board/tasks/${taskId}/move`, token, {
      method: "POST",
      body: JSON.stringify({ columnId, position, note: "Movido no Kanban interno" })
    });
    await loadBoard();
  }

  async function archiveTask(taskId: string) {
    if (!token) return;
    await apiRequest(`/api/activities/${activityId}/task-board/tasks/${taskId}/archive`, token, {
      method: "POST",
      body: JSON.stringify({})
    });
    await loadBoard();
  }

  async function restoreTask(taskId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    await apiRequest(`/api/activities/${activityId}/task-board/tasks/${taskId}/restore`, token, {
      method: "POST",
      body: JSON.stringify({ columnId: String(form.get("columnId") || "") || undefined })
    });
    await loadBoard();
  }

  async function updateTask(task: ActivityTaskItem, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    await apiRequest(`/api/activities/${activityId}/task-board/tasks/${task.id}`, token, {
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
      })
    });
    await loadBoard();
  }

  async function deleteTask(taskId: string) {
    if (!token) return;
    await apiRequest(`/api/activities/${activityId}/task-board/tasks/${taskId}`, token, {
      method: "DELETE"
    });
    await loadBoard();
  }

  async function renameColumn(columnId: string, currentName: string, currentColor?: string | null) {
    if (!token) return;
    const name = window.prompt("Nome da coluna", currentName);
    if (!name?.trim()) return;
    await apiRequest(`/api/activities/${activityId}/task-board/columns/${columnId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim(), color: currentColor ?? "#64748b" })
    });
    await loadBoard();
  }

  async function deleteColumn(columnId: string) {
    if (!token) return;
    await apiRequest(`/api/activities/${activityId}/task-board/columns/${columnId}`, token, {
      method: "DELETE"
    });
    await loadBoard();
  }

  async function reorderColumn(columnId: string, direction: -1 | 1) {
    if (!token) return;
    const ids = board.columns.map((column) => column.id);
    const index = ids.indexOf(columnId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    const nextIds = [...ids];
    const [moved] = nextIds.splice(index, 1);
    nextIds.splice(nextIndex, 0, moved);
    setBoard(
      await apiRequest<ActivityTaskBoard>(
        `/api/activities/${activityId}/task-board/columns/reorder`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ columnIds: nextIds })
        }
      )
    );
  }

  return (
    <article className="panel span-2 internal-kanban">
      <div className="panel-header">
        <h2>Kanban da atividade</h2>
        <form className="inline-create-form" onSubmit={(event) => void createColumn(event)}>
          <input name="name" placeholder="Nova coluna" required />
          <input name="color" type="color" defaultValue="#64748b" />
          <button className="compact-button" disabled={busy || !token} type="submit">
            <Plus size={16} />
          </button>
        </form>
      </div>
      {message ? <p className="form-error">{message}</p> : null}
      <div className="internal-kanban-board">
        {board.columns.map((column) => (
          <section
            className="internal-kanban-column"
            key={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) =>
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
            }
          >
            <div className="internal-column-header">
              <h3>
                <i style={{ backgroundColor: column.color ?? "#64748b" }} />
                {column.name}
              </h3>
              <div>
                <button
                  className="icon-button"
                  type="button"
                  title="Mover para esquerda"
                  onClick={() => void reorderColumn(column.id, -1)}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="Mover para direita"
                  onClick={() => void reorderColumn(column.id, 1)}
                >
                  <ChevronRight size={15} />
                </button>
                <button
                  className="compact-button"
                  type="button"
                  onClick={() => void renameColumn(column.id, column.name, column.color)}
                >
                  Editar
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="Excluir coluna"
                  onClick={() => void deleteColumn(column.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {(column.tasks ?? []).map((task, index) => (
              <InternalTaskCard
                key={task.id}
                task={task}
                columns={board.columns}
                users={users}
                attachments={attachments}
                busy={busy}
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
              />
            ))}
            <form
              className="task-create-form"
              onSubmit={(event) => void createTask(event, column.id)}
            >
              <input name="columnId" type="hidden" value={column.id} readOnly />
              <input name="title" placeholder="Nova tarefa" required />
              <select name="assigneeId" defaultValue="">
                <option value="">Responsavel</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {userOptionLabel(user)}
                  </option>
                ))}
              </select>
              <select name="priority" defaultValue="MEDIUM">
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              <input name="dueAt" type="datetime-local" aria-label="Prazo" />
              <input name="labels" placeholder="Etiquetas separadas por virgula" />
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
              <button className="compact-button" disabled={busy || !token} type="submit">
                <Plus size={16} />
              </button>
            </form>
          </section>
        ))}
      </div>
      {(board.archivedTasks ?? []).length ? (
        <section className="internal-history">
          <div className="panel-header">
            <h3>Tarefas arquivadas</h3>
            <span>{board.archivedTasks?.length ?? 0}</span>
          </div>
          <div className="timeline">
            {board.archivedTasks?.map((task) => (
              <div key={task.id}>
                <strong>{task.title}</strong>
                <span>
                  {board.columns.find((column) => column.id === task.columnId)?.name ?? "Coluna"}
                </span>
                <form
                  className="internal-task-actions"
                  onSubmit={(event) => void restoreTask(task.id, event)}
                >
                  <select
                    aria-label={`Coluna para restaurar ${task.title}`}
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
                    disabled={busy || !token || !board.columns.length}
                    type="submit"
                  >
                    Restaurar
                  </button>
                  <button
                    className="icon-button static"
                    disabled={busy || !token}
                    type="button"
                    title="Excluir tarefa arquivada"
                    onClick={() => void deleteTask(task.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </form>
              </div>
            ))}
            {board.archivedTasksTruncated ? (
              <p>Exibindo as 100 tarefas arquivadas mais recentes.</p>
            ) : null}
          </div>
        </section>
      ) : null}
      <section className="internal-history">
        <div className="panel-header">
          <h3>Historico do Kanban interno</h3>
          <span>{board.history?.length ?? 0}</span>
        </div>
        <div className="timeline">
          {(board.history ?? []).length ? (
            board.history?.map((item) => (
              <div key={item.id}>
                <strong>{item.type}</strong>
                <span>
                  {formatDateTime(item.createdAt, locale)} - {item.actor?.displayName ?? "-"}
                </span>
                <small>{taskHistoryText(item)}</small>
              </div>
            ))
          ) : (
            <div>
              <strong>Sem movimentacoes</strong>
              <span>As alteracoes nas tarefas aparecem aqui.</span>
            </div>
          )}
        </div>
      </section>
    </article>
  );
}

function InternalTaskCard({
  task,
  columns,
  users,
  attachments,
  busy,
  onDragStart,
  onDragEnd,
  onDropBefore,
  onUpdate,
  onDelete,
  onArchive
}: {
  task: ActivityTaskItem;
  columns: { id: string; name: string }[];
  users: UserRef[];
  attachments: AttachmentItem[];
  busy: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: (event: DragEvent<HTMLDivElement>) => void;
  onUpdate: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const labels = (task.labels ?? []).join(", ");
  const attachmentIds = new Set(task.attachmentIds ?? []);
  return (
    <div
      className="internal-task-card"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDropBefore}
    >
      {editing ? (
        <form className="internal-task-edit-form" onSubmit={onUpdate}>
          <input name="title" defaultValue={task.title} required />
          <select name="columnId" defaultValue={task.columnId}>
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>
          <select name="assigneeId" defaultValue={task.assigneeId ?? ""}>
            <option value="">Responsavel</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {userOptionLabel(user)}
              </option>
            ))}
          </select>
          <select name="priority" defaultValue={task.priority ?? "MEDIUM"}>
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
          <input
            name="dueAt"
            type="datetime-local"
            aria-label="Prazo"
            defaultValue={toDateTimeLocalValue(task.dueAt)}
          />
          <textarea name="description" defaultValue={task.description ?? ""} />
          <input name="labels" defaultValue={labels} placeholder="Etiquetas" />
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
              Salvar
            </button>
            <button className="compact-button" type="button" onClick={() => setEditing(false)}>
              Fechar
            </button>
          </div>
        </form>
      ) : (
        <>
          <strong>{task.title}</strong>
          <small>{task.assignee?.displayName ?? task.assignee?.email ?? "-"}</small>
          <small className={isTaskOverdue(task.dueAt) ? "task-overdue" : undefined}>
            Prazo: {formatDateTime(task.dueAt, "pt-BR")}
          </small>
          {task.description ? <p>{task.description}</p> : null}
          <div>
            <span className={`priority ${(task.priority ?? "MEDIUM").toLowerCase()}`}>
              {task.priority ?? "MEDIUM"}
            </span>
            {(task.labels ?? []).map((label) => (
              <span key={label}>{label}</span>
            ))}
            {(task.attachmentIds ?? []).map((attachmentId) => {
              const attachment = attachments.find((item) => item.id === attachmentId);
              return <span key={attachmentId}>{attachment?.fileName ?? "Anexo"}</span>;
            })}
          </div>
          <div className="internal-task-actions">
            <button className="compact-button" type="button" onClick={() => setEditing(true)}>
              Editar
            </button>
            <button
              className="icon-button static"
              type="button"
              title="Arquivar"
              onClick={onArchive}
            >
              <Archive size={15} />
            </button>
            <button className="icon-button static" type="button" title="Excluir" onClick={onDelete}>
              <Trash2 size={15} />
            </button>
          </div>
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

function taskHistoryText(item: {
  note?: string | null;
  fromColumnId?: string | null;
  toColumnId?: string | null;
  fromPosition?: number | null;
  toPosition?: number | null;
}) {
  if (item.note) return item.note;
  const moved = [item.fromPosition, item.toPosition].filter((value) => value !== undefined);
  if (item.fromColumnId || item.toColumnId || moved.length) return "Movimentacao registrada.";
  return "Alteracao registrada.";
}
