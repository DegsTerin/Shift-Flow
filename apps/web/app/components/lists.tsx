// en-GB: Renders the lists interface so its behaviour and accessible structure stay reusable.
"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { ActivityItem, Locale, TeamRef, Texts } from "../lib/types";
import { formatDateTime, formatTime, idOf, slaLabel, statusLabel } from "../lib/utils";

const tablePageSize = 12;

function compareCells(a: string, b: string, direction: "asc" | "desc") {
  const result = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

function TableFooter({
  page,
  totalPages,
  totalRows,
  onPage
}: {
  page: number;
  totalPages: number;
  totalRows: number;
  onPage: (page: number) => void;
}) {
  if (totalRows <= tablePageSize) return null;

  return (
    <div className="table-footer">
      <span>
        Pagina {page + 1} de {totalPages} - {totalRows} registros
      </span>
      <div>
        <button
          className="compact-button"
          disabled={page === 0}
          onClick={() => onPage(Math.max(0, page - 1))}
          type="button"
        >
          Anterior
        </button>
        <button
          className="compact-button"
          disabled={page >= totalPages - 1}
          onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
          type="button"
        >
          Proxima
        </button>
      </div>
    </div>
  );
}

export function ActivityList({
  t,
  activities,
  locale = "pt-BR",
  compact = false,
  onNew,
  onOpen
}: {
  t: Texts;
  activities: ActivityItem[];
  locale?: Locale;
  compact?: boolean;
  onNew: () => void;
  onOpen: (item: ActivityItem) => void;
}) {
  const [sortIndex, setSortIndex] = useState(9);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const columns = [
    "ID",
    "Cliente",
    "Sistema",
    "Servico",
    "Equipe",
    "Analista",
    "Prioridade",
    "SLA",
    "Status",
    "Atualizado"
  ];
  const rows = useMemo(
    () =>
      activities.map((item) => ({
        item,
        cells: [
          item.id.slice(0, 8),
          item.client?.name ?? item.clientId ?? "-",
          item.systemName ?? "-",
          item.serviceName ?? "-",
          item.team?.name ?? item.teamId ?? "-",
          item.assignee?.displayName ?? "-",
          item.priority ?? "-",
          slaLabel(item.slaDueAt),
          statusLabel(item.status, t),
          formatDateTime(item.updatedAt, locale)
        ]
      })),
    [activities, locale, t]
  );
  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) =>
        compareCells(a.cells[sortIndex] ?? "", b.cells[sortIndex] ?? "", sortDirection)
      ),
    [rows, sortDirection, sortIndex]
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / tablePageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleRows = sortedRows.slice(
    currentPage * tablePageSize,
    currentPage * tablePageSize + tablePageSize
  );
  const sortBy = (index: number) => {
    setPage(0);
    if (sortIndex === index) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortIndex(index);
    setSortDirection("asc");
  };

  return (
    <section className={compact ? "panel full-width compact-table" : "panel full-width"}>
      <div className="panel-header">
        <h2>{compact ? t.operationalList : t.activities}</h2>
        <button className="compact-button" onClick={onNew} type="button">
          <Plus size={16} />
          {t.newRecord}
        </button>
      </div>
      <div className="table-wrap" tabIndex={0}>
        <table>
          <caption className="sr-only">{compact ? t.operationalList : t.activities}</caption>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={column}>
                  <button className="table-sort" onClick={() => sortBy(index)} type="button">
                    {column}
                    {sortIndex === index ? (
                      <span>{sortDirection === "asc" ? "A-Z" : "Z-A"}</span>
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ item, cells }) => (
              <tr key={item.id} onClick={() => onOpen(item)}>
                <td>{cells[0]}</td>
                <td>{cells[1]}</td>
                <td>{cells[2]}</td>
                <td>{cells[3]}</td>
                <td>{cells[4]}</td>
                <td>{cells[5]}</td>
                <td>
                  <span className={`priority ${(item.priority ?? "LOW").toLowerCase()}`}>
                    {cells[6]}
                  </span>
                </td>
                <td>{cells[7]}</td>
                <td>{cells[8]}</td>
                <td>{cells[9]}</td>
              </tr>
            ))}
            {!activities.length ? (
              <tr>
                <td className="table-empty-cell" colSpan={10}>
                  {t.noRows}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TableFooter
        page={currentPage}
        totalPages={totalPages}
        totalRows={sortedRows.length}
        onPage={setPage}
      />
    </section>
  );
}

export function ManagementTable<T>({
  title,
  rows,
  columns,
  cells,
  t,
  onNew,
  onOpen
}: {
  title: string;
  rows: T[];
  columns: string[];
  cells: (row: T) => string[];
  t: Texts;
  onNew: () => void;
  onOpen: (row: T) => void;
}) {
  const [sortIndex, setSortIndex] = useState(0);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const rowsWithCells = useMemo(
    () => rows.map((row) => ({ row, cells: cells(row) })),
    [cells, rows]
  );
  const sortedRows = useMemo(
    () =>
      [...rowsWithCells].sort((a, b) =>
        compareCells(a.cells[sortIndex] ?? "", b.cells[sortIndex] ?? "", sortDirection)
      ),
    [rowsWithCells, sortDirection, sortIndex]
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / tablePageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleRows = sortedRows.slice(
    currentPage * tablePageSize,
    currentPage * tablePageSize + tablePageSize
  );
  const sortBy = (index: number) => {
    setPage(0);
    if (sortIndex === index) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortIndex(index);
    setSortDirection("asc");
  };

  return (
    <section className="panel full-width">
      <div className="panel-header">
        <h2>{title}</h2>
        <button className="compact-button" onClick={onNew} type="button">
          <Plus size={16} />
          {t.newRecord}
        </button>
      </div>
      <div className="table-wrap" tabIndex={0}>
        <table>
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={column}>
                  <button className="table-sort" onClick={() => sortBy(index)} type="button">
                    {column}
                    {sortIndex === index ? (
                      <span>{sortDirection === "asc" ? "A-Z" : "Z-A"}</span>
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, cells: rowCells }, index) => (
              <tr key={`${idOf(row) || index}`} onClick={() => onOpen(row)}>
                {rowCells.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="table-empty-cell" colSpan={columns.length}>
                  {t.noRows}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TableFooter
        page={currentPage}
        totalPages={totalPages}
        totalRows={sortedRows.length}
        onPage={setPage}
      />
    </section>
  );
}

export function TeamsView({
  t,
  teams,
  onNew,
  onOpen
}: {
  t: Texts;
  teams: TeamRef[];
  onNew: () => void;
  onOpen: (team: TeamRef) => void;
}) {
  return (
    <section className="panel full-width">
      <div className="panel-header">
        <h2>{t.teams}</h2>
        <button className="compact-button" onClick={onNew} type="button">
          <Plus size={16} />
          {t.newRecord}
        </button>
      </div>
      <div className="team-grid">
        {teams.map((team) => (
          <article
            className="team-card"
            key={team.id ?? team.name}
            onClick={() => onOpen(team)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(team);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <span style={{ backgroundColor: team.color ?? "#0ea5e9" }} />
            <h3>{team.name ?? "-"}</h3>
            <p>{team.defaultSlaMinutes ? `${team.defaultSlaMinutes} min` : "-"}</p>
            <dl>
              <div>
                <dt>Membros</dt>
                <dd>{team.members?.length ?? 0}</dd>
              </div>
              <div>
                <dt>SLA</dt>
                <dd>{team.defaultSlaMinutes ?? "-"}</dd>
              </div>
            </dl>
          </article>
        ))}
        {!teams.length ? <p className="empty-state">Nenhuma equipe encontrada.</p> : null}
      </div>
    </section>
  );
}

export function shiftCells(locale: Locale) {
  return (shift: { name?: string; startsAt?: string; endsAt?: string; status?: string }) => [
    shift.name ?? "-",
    formatTime(shift.startsAt, locale),
    formatTime(shift.endsAt, locale),
    shift.status ?? "-"
  ];
}
