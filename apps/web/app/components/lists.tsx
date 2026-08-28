// en-GB: Renders the lists interface so its behaviour and accessible structure stay reusable.
"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { ActivityItem, Locale, TeamRef, Texts } from "../lib/types";
import {
  formatDateTime,
  formatTime,
  idOf,
  priorityLabel,
  slaLabel,
  statusLabel
} from "../lib/utils";

export const tablePageSize = 12;

export type TablePagination = {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
};

function compareCells(a: string, b: string, direction: "asc" | "desc") {
  const result = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

export function TableFooter({
  t,
  page,
  totalPages,
  totalRows,
  onPage
}: {
  t: Texts;
  page: number;
  totalPages: number;
  totalRows: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="table-footer">
      <span>
        {t.page} {page + 1} {t.of} {totalPages} - {totalRows} {t.records}
      </span>
      <div>
        <button
          className="compact-button"
          disabled={page === 0}
          onClick={() => onPage(Math.max(0, page - 1))}
          type="button"
        >
          {t.previous}
        </button>
        <button
          className="compact-button"
          disabled={page >= totalPages - 1}
          onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
          type="button"
        >
          {t.next}
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
  pagination,
  onNew,
  newDisabledReason,
  onOpen
}: {
  t: Texts;
  activities: ActivityItem[];
  locale?: Locale;
  compact?: boolean;
  pagination?: TablePagination;
  onNew?: () => void;
  newDisabledReason?: string;
  onOpen?: (item: ActivityItem) => void;
}) {
  const [sortIndex, setSortIndex] = useState(9);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const columns = [
    "ID",
    t.filterClient,
    t.system,
    t.service,
    t.filterTeam,
    t.filterAnalyst,
    t.filterPriority,
    "SLA",
    t.filterStatus,
    t.updated
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
          priorityLabel(item.priority, t),
          slaLabel(item.slaDueAt, t),
          statusLabel(item.status, t),
          formatDateTime(item.updatedAt, locale)
        ]
      })),
    [activities, locale, t]
  );
  const sortedRows = useMemo(() => {
    if (pagination) return rows;
    return [...rows].sort((a, b) =>
      compareCells(a.cells[sortIndex] ?? "", b.cells[sortIndex] ?? "", sortDirection)
    );
  }, [pagination, rows, sortDirection, sortIndex]);
  const totalRows = pagination?.total ?? sortedRows.length;
  const effectivePageSize = pagination?.pageSize ?? tablePageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / effectivePageSize));
  const currentPage = pagination
    ? Math.max(0, pagination.page - 1)
    : Math.min(page, totalPages - 1);
  const visibleRows = pagination
    ? sortedRows
    : sortedRows.slice(
        currentPage * effectivePageSize,
        currentPage * effectivePageSize + effectivePageSize
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
        {onNew || newDisabledReason ? (
          <button
            className="compact-button"
            disabled={!onNew}
            onClick={onNew}
            title={newDisabledReason}
            type="button"
          >
            <Plus size={16} />
            {t.newRecord}
          </button>
        ) : null}
      </div>
      {newDisabledReason ? <p className="guard-note">{newDisabledReason}</p> : null}
      <div className="table-wrap" tabIndex={0}>
        <table>
          <caption className="sr-only">{compact ? t.operationalList : t.activities}</caption>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={column}>
                  {pagination ? (
                    <span className="table-sort">{column}</span>
                  ) : (
                    <button className="table-sort" onClick={() => sortBy(index)} type="button">
                      {column}
                      {sortIndex === index ? (
                        <span>{sortDirection === "asc" ? "A-Z" : "Z-A"}</span>
                      ) : null}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ item, cells }) => (
              <tr key={item.id}>
                <td>
                  {onOpen ? (
                    <button
                      aria-label={`${t.details}: ${cells[0]}`}
                      className="record-link"
                      onClick={() => onOpen(item)}
                      type="button"
                    >
                      {cells[0]}
                    </button>
                  ) : (
                    cells[0]
                  )}
                </td>
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
        t={t}
        page={currentPage}
        totalPages={totalPages}
        totalRows={totalRows}
        onPage={(nextPage) => (pagination ? pagination.onPage(nextPage + 1) : setPage(nextPage))}
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
  pagination,
  onNew,
  newDisabledReason,
  onOpen
}: {
  title: string;
  rows: T[];
  columns: string[];
  cells: (row: T) => string[];
  t: Texts;
  pagination?: TablePagination;
  onNew?: () => void;
  newDisabledReason?: string;
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
      pagination
        ? rowsWithCells
        : [...rowsWithCells].sort((a, b) =>
            compareCells(a.cells[sortIndex] ?? "", b.cells[sortIndex] ?? "", sortDirection)
          ),
    [pagination, rowsWithCells, sortDirection, sortIndex]
  );
  const totalRows = pagination?.total ?? sortedRows.length;
  const effectivePageSize = pagination?.pageSize ?? tablePageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / effectivePageSize));
  const currentPage = pagination
    ? Math.max(0, pagination.page - 1)
    : Math.min(page, totalPages - 1);
  const visibleRows = pagination
    ? sortedRows
    : sortedRows.slice(
        currentPage * effectivePageSize,
        currentPage * effectivePageSize + effectivePageSize
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
        {onNew || newDisabledReason ? (
          <button
            className="compact-button"
            disabled={!onNew}
            onClick={onNew}
            title={newDisabledReason}
            type="button"
          >
            <Plus size={16} />
            {t.newRecord}
          </button>
        ) : null}
      </div>
      {newDisabledReason ? <p className="guard-note">{newDisabledReason}</p> : null}
      <div className="table-wrap" tabIndex={0}>
        <table>
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={column}>
                  {pagination ? (
                    <span className="table-sort">{column}</span>
                  ) : (
                    <button className="table-sort" onClick={() => sortBy(index)} type="button">
                      {column}
                      {sortIndex === index ? (
                        <span>{sortDirection === "asc" ? "A-Z" : "Z-A"}</span>
                      ) : null}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, cells: rowCells }, index) => (
              <tr key={`${idOf(row) || index}`}>
                {rowCells.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>
                    {cellIndex === 0 ? (
                      <button
                        aria-label={`${t.details}: ${cell}`}
                        className="record-link"
                        onClick={() => onOpen(row)}
                        type="button"
                      >
                        {cell}
                      </button>
                    ) : (
                      cell
                    )}
                  </td>
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
        t={t}
        page={currentPage}
        totalPages={totalPages}
        totalRows={totalRows}
        onPage={(nextPage) => (pagination ? pagination.onPage(nextPage + 1) : setPage(nextPage))}
      />
    </section>
  );
}

export function TeamsView({
  t,
  teams,
  pagination,
  onNew,
  newDisabledReason,
  onOpen
}: {
  t: Texts;
  teams: TeamRef[];
  pagination?: TablePagination;
  onNew?: () => void;
  newDisabledReason?: string;
  onOpen: (team: TeamRef) => void;
}) {
  return (
    <section className="panel full-width">
      <div className="panel-header">
        <h2>{t.teams}</h2>
        {onNew || newDisabledReason ? (
          <button
            className="compact-button"
            disabled={!onNew}
            onClick={onNew}
            title={newDisabledReason}
            type="button"
          >
            <Plus size={16} />
            {t.newRecord}
          </button>
        ) : null}
      </div>
      {newDisabledReason ? <p className="guard-note">{newDisabledReason}</p> : null}
      <div className="team-grid">
        {teams.map((team) => (
          <article className="team-card" key={team.id ?? team.name}>
            <span style={{ backgroundColor: team.color ?? "#0ea5e9" }} />
            <h3>
              <button
                aria-label={`${t.details}: ${team.name ?? "-"}`}
                className="record-link"
                onClick={() => onOpen(team)}
                type="button"
              >
                {team.name ?? "-"}
              </button>
            </h3>
            <p>{team.defaultSlaMinutes ? `${team.defaultSlaMinutes} min` : "-"}</p>
            <dl>
              <div>
                <dt>{t.members}</dt>
                <dd>{team.members?.length ?? 0}</dd>
              </div>
              <div>
                <dt>SLA</dt>
                <dd>{team.defaultSlaMinutes ?? "-"}</dd>
              </div>
            </dl>
          </article>
        ))}
        {!teams.length ? <p className="empty-state">{t.noTeamsFound}</p> : null}
      </div>
      {pagination ? (
        <TableFooter
          t={t}
          page={Math.max(0, pagination.page - 1)}
          totalPages={Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}
          totalRows={pagination.total}
          onPage={(nextPage) => pagination.onPage(nextPage + 1)}
        />
      ) : null}
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
