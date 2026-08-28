// en-GB: Renders the custom dashboard interface so its behaviour and accessible structure stay reusable.
"use client";

import {
  Copy,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { captureApiSessionEpoch, isApiSessionEpochCurrent } from "../lib/api";
import { createSerialOperationQueue } from "../lib/serial-operation-queue";
import type { DashboardConfiguration, DashboardWidget, Texts } from "../lib/types";

export function canSynchroniseDashboardConfig(editing: boolean, saving: boolean) {
  return !editing && !saving;
}

export type DashboardWidgetDefinition = {
  key: string;
  title: string;
  widgetType: DashboardWidget["widgetType"];
  defaultWidth: number;
  defaultHeight: number;
  render: (widget: DashboardWidget) => ReactNode;
};

const canonicalWidgetTitles: Readonly<Record<string, readonly string[]>> = {
  "summary-total": ["Atividades totais", "Total activities"],
  "summary-pending": ["Pendentes", "Pending"],
  "summary-running": ["Em andamento", "In progress"],
  "summary-done": ["Finalizadas", "Completed"],
  "summary-critical": ["Criticas", "Críticas", "Critical"],
  "summary-risk": ["SLA em risco", "SLA at risk"],
  "summary-overdue": ["Atividades atrasadas", "Atrasadas", "Overdue activities", "Overdue"],
  "summary-average-resolution": ["Tempo medio", "Tempo médio", "Average time"],
  "kanban-summary": ["Kanban resumido", "Kanban summary"],
  "operational-alerts": ["Alertas operacionais", "Operational alerts"],
  "team-summary": ["Equipes", "Teams"],
  "chart-team": ["Atividades por equipe", "Activities by team"],
  "chart-client": ["Atividades por cliente", "Activities by client"],
  "chart-priority": ["Atividades por prioridade", "Activities by priority"],
  "chart-shift": ["Incidentes por turno", "Incidents by shift"],
  "chart-status": ["Evolucao mensal", "Evolução mensal", "Monthly evolution"],
  "status-legend": ["Legenda de status", "Status legend"],
  "activity-list": ["Ultimas atividades", "Últimas atividades", "Latest activities"],
  "team-productivity": ["Produtividade por analista", "Productivity by analyst"],
  "team-risk": ["SLA em risco", "SLA at risk"],
  "team-activity-list": ["Ultimas atividades", "Últimas atividades", "Latest activities"]
};

function ordered(widgets: DashboardWidget[]) {
  return [...widgets].sort((a, b) => a.order - b.order);
}

function resequence(widgets: DashboardWidget[]) {
  return ordered(widgets).map((widget, index) => ({
    ...widget,
    order: index,
    gridRow: Math.floor(index / 2) + 1,
    gridColumn: index % 2 === 0 ? 1 : 7
  }));
}

function makeWidget(definition: DashboardWidgetDefinition, order: number): DashboardWidget {
  return {
    key: `${definition.key}-${Date.now()}-${order}`,
    widgetType: definition.widgetType,
    title: definition.title,
    gridColumn: order % 2 === 0 ? 1 : 7,
    gridRow: Math.floor(order / 2) + 1,
    gridWidth: definition.defaultWidth,
    gridHeight: definition.defaultHeight,
    isVisible: true,
    isPinned: false,
    order,
    refreshIntervalMs: 60000,
    settings: { sourceKey: definition.key }
  };
}

function definitionKey(widget: DashboardWidget) {
  return String(widget.settings?.sourceKey ?? widget.key).replace(/-\d{13}-\d+$/, "");
}

const localisedCopyTitle = "LOCALISED_COPY";

export function displayWidgetTitle(
  widget: DashboardWidget,
  definition: DashboardWidgetDefinition,
  copySuffix?: string
) {
  const canonicalTitles = canonicalWidgetTitles[definitionKey(widget)] ?? [];
  const title = canonicalTitles.includes(widget.title) ? definition.title : widget.title;
  return widget.settings?.titlePresentation === localisedCopyTitle && copySuffix
    ? `${title} ${copySuffix}`
    : title;
}

export function CustomizableDashboard({
  t,
  config,
  definitions,
  canConfigure = true,
  onSave,
  onReset
}: {
  t: Texts;
  config: DashboardConfiguration;
  definitions: DashboardWidgetDefinition[];
  canConfigure?: boolean;
  onSave: (config: DashboardConfiguration) => Promise<DashboardConfiguration | void>;
  onReset: () => Promise<DashboardConfiguration | void>;
}) {
  const currentEpoch = captureApiSessionEpoch();
  const [draft, setDraft] = useState(config);
  const [snapshot, setSnapshot] = useState(config);
  const [editing, setEditing] = useState(false);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveRequestId = useRef(0);
  const lastConfirmedRef = useRef(config);
  const intentRef = useRef(config);
  const persistencePendingRef = useRef(false);
  const resetPendingRef = useRef(false);
  const mounted = useRef(true);
  const canConfigureRef = useRef(canConfigure);
  const observedEpoch = useRef(currentEpoch);
  const crossedSessionBoundary = observedEpoch.current !== currentEpoch;
  const effectiveCanConfigure = canConfigure && !crossedSessionBoundary;
  if (crossedSessionBoundary) canConfigureRef.current = false;
  const enqueuePersistence = useRef(createSerialOperationQueue()).current;
  const definitionMap = useMemo(
    () => new Map(definitions.map((definition) => [definition.key, definition])),
    [definitions]
  );

  useEffect(() => {
    if (!canSynchroniseDashboardConfig(editing, saving)) return;
    lastConfirmedRef.current = config;
    intentRef.current = config;
    setDraft(config);
    setSnapshot(config);
  }, [config, editing, saving]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (observedEpoch.current === currentEpoch) return;
    observedEpoch.current = currentEpoch;
    saveRequestId.current += 1;
    persistencePendingRef.current = false;
    resetPendingRef.current = false;
    canConfigureRef.current = canConfigure;
    lastConfirmedRef.current = config;
    intentRef.current = config;
    setDraft(config);
    setSnapshot(config);
    setEditing(false);
    setSaving(false);
    setSaveError(null);
  }, [canConfigure, config, currentEpoch]);

  useEffect(() => {
    canConfigureRef.current = canConfigure;
    if (canConfigure) return;
    saveRequestId.current += 1;
    persistencePendingRef.current = false;
    resetPendingRef.current = false;
    setEditing(false);
    setSaving(false);
    setSaveError(null);
    lastConfirmedRef.current = config;
    intentRef.current = config;
    setDraft(config);
    setSnapshot(config);
  }, [canConfigure, config]);

  useEffect(() => {
    function openCustomization() {
      if (!canConfigureRef.current) return;
      setSnapshot(intentRef.current);
      setEditing(true);
    }

    window.addEventListener("shiftflow:customize-dashboard", openCustomization);
    return () => window.removeEventListener("shiftflow:customize-dashboard", openCustomization);
  }, []);

  async function persist(next: DashboardConfiguration) {
    if (!canConfigureRef.current) return false;
    persistencePendingRef.current = true;
    const requestId = saveRequestId.current + 1;
    const sessionEpoch = captureApiSessionEpoch();
    const isCurrent = () =>
      mounted.current && canConfigureRef.current && isApiSessionEpochCurrent(sessionEpoch);
    saveRequestId.current = requestId;
    intentRef.current = next;
    setDraft(next);
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await enqueuePersistence(() => onSave(next), isCurrent);
      if (!isCurrent()) return false;
      const confirmed = saved ?? next;
      lastConfirmedRef.current = confirmed;
      if (requestId !== saveRequestId.current) return false;
      intentRef.current = confirmed;
      setDraft(confirmed);
      setSaveError(null);
      return true;
    } catch (cause) {
      if (!isCurrent() || requestId !== saveRequestId.current) return false;
      const confirmed = lastConfirmedRef.current;
      intentRef.current = confirmed;
      setDraft(confirmed);
      setSaveError(cause instanceof Error ? cause.message : t.dashboardSaveFailed);
      return false;
    } finally {
      if (mounted.current && requestId === saveRequestId.current) {
        persistencePendingRef.current = false;
        setSaving(false);
      }
    }
  }

  function mutate(updater: (widgets: DashboardWidget[]) => DashboardWidget[]) {
    if (!canConfigureRef.current || resetPendingRef.current) return;
    const current = intentRef.current;
    const next = { ...current, isDefault: false, widgets: updater(current.widgets) };
    intentRef.current = next;
    void persist(next);
  }

  const visibleWidgets = ordered(draft.widgets).filter((widget) => widget.isVisible);
  const hiddenWidgets = ordered(draft.widgets).filter((widget) => !widget.isVisible);
  const addableDefinitions = definitions.filter(
    (definition) => !draft.widgets.some((widget) => definitionKey(widget) === definition.key)
  );

  function reorderWidget(sourceKey: string, targetKey: string) {
    if (sourceKey === targetKey) return;
    mutate((widgets) => {
      const source = widgets.find((widget) => widget.key === sourceKey);
      const target = widgets.find((widget) => widget.key === targetKey);
      if (!source || !target || source.isPinned || target.isPinned) return widgets;
      const sourceOrder = source.order;
      const targetOrder = target.order;
      return resequence(
        widgets.map((widget) => {
          if (widget.key === source.key) return { ...widget, order: targetOrder };
          if (widget.key === target.key) return { ...widget, order: sourceOrder };
          return widget;
        })
      );
    });
  }

  function moveWidget(targetKey: string) {
    if (!draggedKey) return;
    reorderWidget(draggedKey, targetKey);
    setDraggedKey(null);
  }

  function updateWidget(key: string, patch: Partial<DashboardWidget>) {
    mutate((widgets) =>
      widgets.map((widget) => (widget.key === key ? { ...widget, ...patch } : widget))
    );
  }

  function resizeWidget(key: string, axis: "width" | "height", delta: number) {
    mutate((widgets) =>
      widgets.map((widget) => {
        if (widget.key !== key) return widget;
        if (axis === "width") {
          return { ...widget, gridWidth: Math.min(12, Math.max(2, widget.gridWidth + delta)) };
        }
        return { ...widget, gridHeight: Math.min(8, Math.max(1, widget.gridHeight + delta)) };
      })
    );
  }

  function duplicateWidget(widget: DashboardWidget) {
    mutate((widgets) =>
      resequence([
        ...widgets,
        {
          ...widget,
          id: undefined,
          key: `${definitionKey(widget)}-${Date.now()}-${widgets.length}`,
          settings: {
            ...widget.settings,
            sourceKey: definitionKey(widget),
            titlePresentation: localisedCopyTitle
          },
          isPinned: false,
          order: widgets.length
        }
      ])
    );
  }

  function addWidget(definition: DashboardWidgetDefinition) {
    mutate((widgets) => resequence([...widgets, makeWidget(definition, widgets.length)]));
  }

  async function reset() {
    if (!canConfigureRef.current || persistencePendingRef.current) return;
    persistencePendingRef.current = true;
    resetPendingRef.current = true;
    const requestId = saveRequestId.current + 1;
    const sessionEpoch = captureApiSessionEpoch();
    const isCurrent = () =>
      mounted.current && canConfigureRef.current && isApiSessionEpochCurrent(sessionEpoch);
    saveRequestId.current = requestId;
    setSaving(true);
    try {
      const resetConfig = await enqueuePersistence(onReset, isCurrent);
      if (!isCurrent() || requestId !== saveRequestId.current) return;
      if (resetConfig) {
        lastConfirmedRef.current = resetConfig;
        intentRef.current = resetConfig;
        setDraft(resetConfig);
        setSnapshot(resetConfig);
      }
      setSaveError(null);
    } catch (cause) {
      if (!isCurrent() || requestId !== saveRequestId.current) return;
      setSaveError(cause instanceof Error ? cause.message : t.dashboardSaveFailed);
    } finally {
      if (mounted.current && requestId === saveRequestId.current) {
        persistencePendingRef.current = false;
        resetPendingRef.current = false;
        setSaving(false);
      }
    }
  }

  async function cancel() {
    if (!canConfigureRef.current || persistencePendingRef.current) return;
    if (await persist(snapshot)) setEditing(false);
  }

  function exitCustomization() {
    if (persistencePendingRef.current) return;
    setEditing(false);
  }

  const editable = editing && effectiveCanConfigure;

  return (
    <section
      aria-busy={saving || undefined}
      className={editable ? "custom-dashboard editing" : "custom-dashboard"}
    >
      {editable ? (
        <div className="dashboard-toolbar">
          <div className="dashboard-toolbar-title">
            <LayoutGrid size={18} />
            <span>{saving ? t.dashboardSaving : t.customizeDashboard}</span>
          </div>
          <div className="dashboard-toolbar-actions">
            <button className="compact-button" disabled={saving} onClick={reset} type="button">
              <RotateCcw size={16} />
              {t.restoreDefault}
            </button>
            <button
              className="compact-button"
              disabled={saving}
              onClick={() => void cancel()}
              type="button"
            >
              <X size={16} />
              {t.cancel}
            </button>
            <button
              aria-label={t.exitCustomization}
              className="primary-button"
              disabled={saving}
              onClick={exitCustomization}
              type="button"
            >
              <Save size={16} />
              {t.exitCustomization}
            </button>
          </div>
        </div>
      ) : null}
      {saving ? (
        <p aria-live="polite" className="dashboard-save-status" role="status">
          {t.dashboardSaving}
        </p>
      ) : null}
      {saveError ? (
        <p className="dashboard-save-error" role="alert">
          {saveError}
        </p>
      ) : null}
      {editable ? (
        <div className="widget-palette">
          {addableDefinitions.length ? (
            <div className="widget-palette-row">
              <span>{t.addWidget}</span>
              {addableDefinitions.map((definition) => (
                <button
                  className="compact-button"
                  key={definition.key}
                  onClick={() => addWidget(definition)}
                  type="button"
                >
                  <Plus size={16} />
                  {definition.title}
                </button>
              ))}
            </div>
          ) : null}
          {hiddenWidgets.length ? (
            <div className="widget-palette-row">
              <span>{t.hiddenWidgets}</span>
              {hiddenWidgets.map((widget) => {
                const definition = definitionMap.get(definitionKey(widget));
                return (
                  <button
                    className="compact-button"
                    key={widget.key}
                    onClick={() => updateWidget(widget.key, { isVisible: true })}
                    type="button"
                  >
                    <Eye size={16} />
                    {definition
                      ? displayWidgetTitle(widget, definition, t.copySuffix)
                      : widget.title}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="custom-dashboard-grid">
        {visibleWidgets.map((widget) => {
          const definition = definitionMap.get(definitionKey(widget));
          if (!definition) return null;
          const widgetIndex = visibleWidgets.findIndex((item) => item.key === widget.key);
          const earlierWidget = visibleWidgets[widgetIndex - 1];
          const laterWidget = visibleWidgets[widgetIndex + 1];
          const presentedTitle = displayWidgetTitle(widget, definition, t.copySuffix);
          return (
            <article
              className={widget.isPinned ? "dashboard-widget pinned" : "dashboard-widget"}
              draggable={editable && !widget.isPinned}
              key={widget.key}
              onDragOver={(event) => editable && event.preventDefault()}
              onDragStart={() => setDraggedKey(widget.key)}
              onDrop={() => moveWidget(widget.key)}
              style={{
                gridColumn: `span ${Math.min(12, widget.gridWidth)}`,
                minHeight: `${Math.max(1, widget.gridHeight) * 88}px`
              }}
            >
              {editable ? (
                <div className="widget-edit-bar">
                  <span>
                    <GripVertical size={16} />
                    {presentedTitle}
                  </span>
                  <div className="widget-edit-actions">
                    <button
                      aria-label={`${t.moveWidgetEarlier}: ${presentedTitle}`}
                      className="icon-button"
                      disabled={widget.isPinned || !earlierWidget || earlierWidget.isPinned}
                      onClick={() => earlierWidget && reorderWidget(widget.key, earlierWidget.key)}
                      title={t.moveWidgetEarlier}
                      type="button"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      aria-label={`${t.moveWidgetLater}: ${presentedTitle}`}
                      className="icon-button"
                      disabled={widget.isPinned || !laterWidget || laterWidget.isPinned}
                      onClick={() => laterWidget && reorderWidget(widget.key, laterWidget.key)}
                      title={t.moveWidgetLater}
                      type="button"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      aria-label={widget.isPinned ? t.unpin : t.pin}
                      className="icon-button"
                      onClick={() => updateWidget(widget.key, { isPinned: !widget.isPinned })}
                      title={widget.isPinned ? t.unpin : t.pin}
                      type="button"
                    >
                      {widget.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                    </button>
                    <button
                      aria-label={t.decreaseWidth}
                      className="icon-button"
                      onClick={() => resizeWidget(widget.key, "width", -1)}
                      title={t.decreaseWidth}
                      type="button"
                    >
                      <Minimize2 size={16} />
                    </button>
                    <button
                      aria-label={t.increaseWidth}
                      className="icon-button"
                      onClick={() => resizeWidget(widget.key, "width", 1)}
                      title={t.increaseWidth}
                      type="button"
                    >
                      <Maximize2 size={16} />
                    </button>
                    <button
                      aria-label={t.decreaseHeight}
                      className="icon-button"
                      onClick={() => resizeWidget(widget.key, "height", -1)}
                      title={t.decreaseHeight}
                      type="button"
                    >
                      <Minimize2 size={16} />
                    </button>
                    <button
                      aria-label={t.increaseHeight}
                      className="icon-button"
                      onClick={() => resizeWidget(widget.key, "height", 1)}
                      title={t.increaseHeight}
                      type="button"
                    >
                      <Maximize2 size={16} />
                    </button>
                    <button
                      aria-label={t.duplicate}
                      className="icon-button"
                      onClick={() => duplicateWidget(widget)}
                      title={t.duplicate}
                      type="button"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      aria-label={t.hide}
                      className="icon-button"
                      onClick={() => updateWidget(widget.key, { isVisible: false })}
                      title={t.hide}
                      type="button"
                    >
                      <EyeOff size={16} />
                    </button>
                    <button
                      aria-label={t.delete}
                      className="icon-button"
                      onClick={() =>
                        mutate((widgets) =>
                          resequence(widgets.filter((item) => item.key !== widget.key))
                        )
                      }
                      title={t.delete}
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="dashboard-widget-body">{definition.render(widget)}</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
