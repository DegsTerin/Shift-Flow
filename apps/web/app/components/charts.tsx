"use client";

import { BarChart3 } from "lucide-react";

export function ChartPanel({ title, values }: { title: string; values: number[] }) {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  return (
    <article className="panel">
      <div className="panel-header"><h2>{title}</h2><BarChart3 size={18} /></div>
      <div className="bar-chart">{safeValues.map((value, index) => <span key={`${title}-${index}`} style={{ height: `${Math.max(18, (value / max) * 100)}%` }}><b>{value}</b></span>)}</div>
    </article>
  );
}
