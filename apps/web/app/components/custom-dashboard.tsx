// en-GB: Renders the custom dashboard interface so its behaviour and accessible structure stay reusable.
"use client";

import {
  Copy,
  Eye,
  EyeOff,
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

export function CustomizableDashboard({
  t,
  config,
  definitions,
  onSave,
  onReset
}: {
  t: Texts;
  config: DashboardConfiguration;
  definitions: DashboardWidgetDefinition[];
  onSave: (config: DashboardConfiguration) => Promise<DashboardConfiguration | void>;
  onReset: () => Promise<DashboardConfiguration | void>;
}) {
  const [draft, setDraft] = useState(config);
  const [snapshot, setSnapshot] = useState(config);
  const [editing, setEditing] = useState(false);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveRequestId = useRef(0);
  const mounted = useRef(true);
  const enqueuePersistence = useRef(createSerialOperationQueue()).current;
  const definitionMap = useMemo(
    () => new Map(definitions.map((definition) => [definition.key, definition])),
    [definitions]
  );

  useEffect(() => {
    if (!canSynchroniseDashboardConfig(editing, saving)) return;
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
    function openCustomization() {
      setSnapshot(draft);
      setEditing(true);
    }

    window.addEventListener("shiftflow:customize-dashboard", openCustomization);
    return () => window.removeEventListener("shiftflow:customize-dashboard", openCustomization);
  }, [draft]);

  async function persist(next: DashboardConfiguration, rollback = draft) {
    const requestId = saveRequestId.current + 1;
    const sessionEpoch = captureApiSessionEpoch();
    const isCurrent = () => mounted.current && isApiSessionEpochCurrent(sessionEpoch);
    saveRequestId.current = requestId;
    setDraft(next);
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await enqueuePersistence(() => onSave(next), isCurrent);
      if (!isCurrent() || requestId !== saveRequestId.current) return;
      if (saved) {
        setDraft(saved);
        setSnapshot(saved);
      }
    } catch (cause) {
      if (!isCurrent() || requestId !== saveRequestId.current) return;
      setDraft(rollback);
      setSaveError(cause instanceof Error ? cause.message : t.dashboardSaveFailed);
    } finally {
      if (mounted.current && requestId === saveRequestId.current) {
        setSaving(false);
      }
    }
  }

  function mutate(updater: (widgets: DashboardWidget[]) => DashboardWidget[]) {
    const next = { ...draft, isDefault: false, widgets: updater(draft.widgets) };
    void persist(next);
  }

  const visibleWidgets = ordered(draft.widgets).filter((widget) => widget.isVisible);
  const hiddenWidgets = ordered(draft.widgets).filter((widget) => !widget.isVisible);
  const addableDefinitions = definitions.filter(
    (definition) => !draft.widgets.some((widget) => definitionKey(widget) === definition.key)
  );

  function moveWidget(targetKey: string) {
    if (!draggedKey || draggedKey === targetKey) return;
    mutate((widgets) => {
      const source = widgets.find((widget) => widget.key === draggedKey);
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
          title: `${widget.title} copia`,
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
    const requestId = saveRequestId.current + 1;
    const sessionEpoch = captureApiSessionEpoch();
    const isCurrent = () => mounted.current && isApiSessionEpochCurrent(sessionEpoch);
    saveRequestId.current = requestId;
    setSaving(true);
    try {
      const resetConfig = await enqueuePersistence(onReset, isCurrent);
      if (!isCurrent() || requestId !== saveRequestId.current) return;
      if (resetConfig) {
        setDraft(resetConfig);
        setSnapshot(resetConfig);
      }
      setSaveError(null);
    } catch (cause) {
      if (!isCurrent() || requestId !== saveRequestId.current) return;
      setSaveError(cause instanceof Error ? cause.message : t.dashboardSaveFailed);
    } finally {
      if (mounted.current && requestId === saveRequestId.current) {
        setSaving(false);
      }
    }
  }

  function cancel() {
    setEditing(false);
    void persist(snapshot, snapshot);
  }

  return (
    <section className={editing ? "custom-dashboard editing" : "custom-dashboard"}>
      {editing ? (
        <div className="dashboard-toolbar">
          <div className="dashboard-toolbar-title">
            <LayoutGrid size={18} />
            <span>{saving ? t.dashboardSaved : t.customizeDashboard}</span>
          </div>
          {saveError ? (
            <p className="dashboard-save-error" role="alert">
              {saveError}
            </p>
          ) : null}
          <div className="dashboard-toolbar-actions">
            <button className="compact-button" onClick={reset} type="button">
              <RotateCcw size={16} />
              {t.restoreDefault}
            </button>
            <button className="compact-button" onClick={cancel} type="button">
              <X size={16} />
              {t.cancel}
            </button>
            <button className="primary-button" onClick={() => setEditing(false)} type="button">
              <Save size={16} />
              {t.save}
            </button>
          </div>
        </div>
      ) : null}
      {editing ? (
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
              {hiddenWidgets.map((widget) => (
                <button
                  className="compact-button"
                  key={widget.key}
                  onClick={() => updateWidget(widget.key, { isVisible: true })}
                  type="button"
                >
                  <Eye size={16} />
                  {widget.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="custom-dashboard-grid">
        {visibleWidgets.map((widget) => {
          const definition = definitionMap.get(definitionKey(widget));
          if (!definition) return null;
          return (
            <article
              className={widget.isPinned ? "dashboard-widget pinned" : "dashboard-widget"}
              draggable={editing && !widget.isPinned}
              key={widget.key}
              onDragOver={(event) => editing && event.preventDefault()}
              onDragStart={() => setDraggedKey(widget.key)}
              onDrop={() => moveWidget(widget.key)}
              style={{
                gridColumn: `span ${Math.min(12, widget.gridWidth)}`,
                minHeight: `${Math.max(1, widget.gridHeight) * 88}px`
              }}
            >
              {editing ? (
                <div className="widget-edit-bar">
                  <span>
                    <GripVertical size={16} />
                    {widget.title}
                  </span>
                  <div className="widget-edit-actions">
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
