"use client";

import { Plus } from "lucide-react";
import type { ActivityItem, Locale, TeamRef, Texts } from "../lib/types";
import { formatDateTime, formatTime, idOf, slaLabel, statusLabel } from "../lib/utils";

export function ActivityList({ t, activities, locale = "pt-BR", compact = false, onNew, onOpen }: { t: Texts; activities: ActivityItem[]; locale?: Locale; compact?: boolean; onNew: () => void; onOpen: (item: ActivityItem) => void }) {
  return (
    <section className={compact ? "panel full-width compact-table" : "panel full-width"}>
      <div className="panel-header"><h2>{compact ? t.operationalList : t.activities}</h2><button className="compact-button" onClick={onNew}><Plus size={16} />{t.newRecord}</button></div>
      <div className="table-wrap" tabIndex={0}>
        <table>
          <thead><tr>{["ID", "Cliente", "Sistema", "Servico", "Equipe", "Analista", "Prioridade", "SLA", "Status", "Atualizado"].map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {activities.map((item) => (
              <tr key={item.id} onClick={() => onOpen(item)}>
                <td>{item.id.slice(0, 8)}</td><td>{item.client?.name ?? item.clientId ?? "-"}</td><td>{item.systemName ?? "-"}</td><td>{item.serviceName ?? "-"}</td><td>{item.team?.name ?? item.teamId ?? "-"}</td><td>{item.assignee?.displayName ?? "-"}</td>
                <td><span className={`priority ${(item.priority ?? "LOW").toLowerCase()}`}>{item.priority ?? "-"}</span></td><td>{slaLabel(item.slaDueAt)}</td><td>{statusLabel(item.status, t)}</td><td>{formatDateTime(item.updatedAt, locale)}</td>
              </tr>
            ))}
            {!activities.length ? <tr><td colSpan={10}>{t.noRows}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ManagementTable<T>({ title, rows, columns, cells, t, onNew, onOpen }: { title: string; rows: T[]; columns: string[]; cells: (row: T) => string[]; t: Texts; onNew: () => void; onOpen: (row: T) => void }) {
  return (
    <section className="panel full-width">
      <div className="panel-header"><h2>{title}</h2><button className="compact-button" onClick={onNew}><Plus size={16} />{t.newRecord}</button></div>
      <div className="table-wrap" tabIndex={0}>
        <table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${idOf(row) || index}`} onClick={() => onOpen(row)}>{cells(row).map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}</tr>)}{!rows.length ? <tr><td colSpan={columns.length}>{t.noRows}</td></tr> : null}</tbody></table>
      </div>
    </section>
  );
}

export function TeamsView({ t, teams, onNew, onOpen }: { t: Texts; teams: TeamRef[]; onNew: () => void; onOpen: (team: TeamRef) => void }) {
  return (
    <section className="panel full-width">
      <div className="panel-header"><h2>{t.teams}</h2><button className="compact-button" onClick={onNew}><Plus size={16} />{t.newRecord}</button></div>
      <div className="team-grid">{teams.map((team) => <article className="team-card" key={team.id ?? team.name} onClick={() => onOpen(team)}><span style={{ backgroundColor: team.color ?? "#0ea5e9" }} /><h3>{team.name ?? "-"}</h3><p>{team.defaultSlaMinutes ? `${team.defaultSlaMinutes} min` : "-"}</p><dl><div><dt>Membros</dt><dd>{team.members?.length ?? 0}</dd></div><div><dt>SLA</dt><dd>{team.defaultSlaMinutes ?? "-"}</dd></div></dl></article>)}</div>
    </section>
  );
}

export function shiftCells(locale: Locale) {
  return (shift: { name?: string; startsAt?: string; endsAt?: string; status?: string }) => [shift.name ?? "-", formatTime(shift.startsAt, locale), formatTime(shift.endsAt, locale), shift.status ?? "-"];
}
