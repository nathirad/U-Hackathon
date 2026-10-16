"use client";

import { useMemo } from "react";
import { asOfLabel } from "@/lib/freshness";

export type DataStatus = "LIVE" | "CACHED" | "DEMO" | "STALE" | "UNAVAILABLE" | "ERROR";

export interface DataBadgeProps {
  status?: DataStatus;
  mode?: "live" | "snapshot" | "sample" | string;
  source?: string;
  label?: string;
  stale?: boolean;
  asOf?: string | null;
  date?: string | null;
  error?: boolean;
  showTime?: boolean;
  className?: string;
  tooltip?: string;
}

export function resolveDataStatus(props: {
  status?: DataStatus;
  mode?: string;
  stale?: boolean;
  error?: boolean;
}): DataStatus {
  if (props.error) return "ERROR";
  if (props.status) return props.status;
  if (props.stale) return "STALE";
  const m = (props.mode ?? "").toLowerCase();
  if (m === "live") return "LIVE";
  if (m === "snapshot") return "CACHED";
  if (m === "sample") return "DEMO";
  if (!m) return "UNAVAILABLE";
  return "CACHED";
}

/**
 * Standardized data provenance badge.
 * Communicates explicit truth: LIVE, CACHED, DEMO, STALE, UNAVAILABLE, or ERROR.
 */
export function DataBadge({
  status: statusProp,
  mode,
  source,
  label,
  stale = false,
  asOf: asOfProp,
  date,
  error = false,
  showTime = true,
  className = "",
  tooltip,
}: DataBadgeProps) {
  const asOf = asOfProp ?? date;
  const status = useMemo(() => resolveDataStatus({ status: statusProp, mode, stale, error }), [statusProp, mode, stale, error]);

  const timeLabel = useMemo(() => {
    if (!showTime || !asOf || status === "DEMO" || status === "UNAVAILABLE" || status === "ERROR") return null;
    return asOfLabel(asOf, stale);
  }, [showTime, asOf, status, stale]);

  const defaultTitle = useMemo(() => {
    if (tooltip) return tooltip;
    switch (status) {
      case "LIVE":
        return `Live data directly from provider${asOf ? ` (${asOfLabel(asOf)})` : ""}`;
      case "CACHED":
        return `Real data from verified snapshot${asOf ? ` (${asOfLabel(asOf)})` : ""}`;
      case "DEMO":
        return "Illustrative demo fixture data for hackathon evaluation";
      case "STALE":
        return `Live source failed; serving last verified copy${asOf ? ` (${asOfLabel(asOf, true)})` : ""}`;
      case "UNAVAILABLE":
        return "Data currently unavailable or token not tracked";
      case "ERROR":
        return "Failed to load data from provider";
    }
  }, [status, tooltip, asOf, stale]);

  const statusClass = `data-badge-${status.toLowerCase()}`;

  return (
    <span className={`data-badge ${statusClass} ${className}`} title={defaultTitle} role="status">
      <span className="data-dot" aria-hidden="true" />
      {label && <span style={{ opacity: 0.75, fontWeight: 500, marginRight: 3 }}>{label}</span>}
      <span>{status}</span>
      {source && <span style={{ opacity: 0.85, fontWeight: 400, marginLeft: 2 }}>· {source}</span>}
      {timeLabel && <span style={{ opacity: 0.85, fontWeight: 400, marginLeft: 2 }}>· {timeLabel}</span>}
    </span>
  );
}
