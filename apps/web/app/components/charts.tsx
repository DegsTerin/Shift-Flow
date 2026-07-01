"use client";

import { BarChart3 } from "lucide-react";

export function ChartPanel({
  title,
  values,
  colors = [],
  labels = []
}: {
  title: string;
  values: number[];
  colors?: Array<string | undefined>;
  labels?: string[];
}) {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  return (
    <article className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <BarChart3 size={18} />
      </div>
      <div className="bar-chart">
        {safeValues.map((value, index) => (
          <span
            key={`${title}-${index}`}
            style={{
              background: colors[index],
              height: `${Math.max(18, (value / max) * 100)}%`
            }}
          >
            <b>{value}</b>
          </span>
        ))}
      </div>
      {labels.length ? (
        <div className="chart-legend">
          {labels.map((label, index) => (
            <span key={`${title}-legend-${label}`}>
              <i style={{ backgroundColor: colors[index] }} />
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
