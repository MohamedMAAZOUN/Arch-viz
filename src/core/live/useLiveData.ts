// ============================================================================
// useLiveData — poll an element's data sources and surface a compact snapshot
// ============================================================================
// One source of truth for "what's the live state of this element right now",
// consumed by both the node component (status dot / chip) and the inspector.
// Polls each configured source on an interval with exponential backoff on
// failure; keeps the last-known value and marks it stale rather than crashing.
//
// Sources whose transport isn't configured (grafana/jira with no proxy) never
// poll — they resolve immediately to "offline".
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import { liveDataClient } from "@/core/live/LiveDataClient";
import { nextDelay } from "@/core/live/backoff";
import { useViewStore } from "@/core/state/viewStore";

import type { LiveDataClient } from "@/core/live/LiveDataClient";
import type { LiveStatus, LiveValue } from "@/core/live/types";
import type { Element } from "@/core/schema/schema";

const BASE_INTERVAL_MS = 20_000;
const MAX_INTERVAL_MS = 5 * 60_000;

export type LiveState = "idle" | "disabled" | "loading" | "ok" | "stale" | "error";

export interface LiveChip {
  binding: "metric" | "badge" | "label";
  text: string;
}

export interface LiveSnapshot {
  state: LiveState;
  /** Overall status from the first `status` binding, if any. */
  status: LiveStatus | null;
  /** Display chips from metric/badge/label bindings. */
  chips: readonly LiveChip[];
  error: string | null;
}

const IDLE: LiveSnapshot = { state: "idle", status: null, chips: [], error: null };
const DISABLED: LiveSnapshot = { state: "disabled", status: null, chips: [], error: null };

/**
 * Poll the element's data sources. `client` is injectable for tests; defaults
 * to the shared singleton.
 */
export function useLiveData(
  element: Element,
  client: LiveDataClient = liveDataClient,
): LiveSnapshot {
  // Live polling is opt-in per project (reset on every load) — see viewStore.
  const liveEnabled = useViewStore((s) => s.liveDataEnabled);
  const sources = element.dataSources ?? [];
  const configured = useMemo(
    () => sources.filter((s) => client.isConfigured(s)),
    // Re-filter only when the set of sources changes (by identity / length).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [element.id, sources.length],
  );

  const [snapshot, setSnapshot] = useState<LiveSnapshot>(() =>
    configured.length === 0 ? IDLE : !liveEnabled ? DISABLED : { ...IDLE, state: "loading" },
  );

  const failuresRef = useRef(0);

  useEffect(() => {
    // No pollable (http) sources → nothing to do (grafana/jira are link buttons).
    if (configured.length === 0) {
      setSnapshot(IDLE);
      return;
    }
    // Awaiting the user's opt-in: don't fetch anything from this document.
    if (!liveEnabled) {
      setSnapshot(DISABLED);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      const results = await Promise.all(configured.map((s) => client.fetchBinding(s)));
      if (cancelled) return;

      const values: LiveValue[] = [];
      let anyError = false;
      for (const r of results) {
        if (r.ok) values.push(r.value);
        else anyError = true;
      }

      setSnapshot((prev) => combineLive(values, anyError, prev));
      failuresRef.current = values.length === 0 ? failuresRef.current + 1 : 0;

      timer = window.setTimeout(
        () => void tick(),
        nextDelay(failuresRef.current, BASE_INTERVAL_MS, MAX_INTERVAL_MS),
      );
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id, configured.length, client, liveEnabled]);

  return snapshot;
}

/**
 * Fold the latest fetch into a snapshot. Pure and exported for testing: keeps
 * prior values when a refresh fails (→ "stale"), reports "error" only when we
 * have nothing to show.
 */
export function combineLive(
  values: readonly LiveValue[],
  anyError: boolean,
  prev: LiveSnapshot,
): LiveSnapshot {
  if (values.length === 0) {
    // Nothing new this round. Degrade gracefully: keep what we had, mark stale.
    if (prev.status !== null || prev.chips.length > 0) {
      return { ...prev, state: "stale", error: "Live refresh failed." };
    }
    return { state: "error", status: null, chips: [], error: "Live data unavailable." };
  }

  let status: LiveStatus | null = null;
  const chips: LiveChip[] = [];
  for (const v of values) {
    switch (v.binding) {
      case "status":
        status ??= v.status;
        break;
      case "metric":
        chips.push({
          binding: "metric",
          text: v.unit !== undefined ? `${String(v.value)} ${v.unit}` : String(v.value),
        });
        break;
      case "badge":
        chips.push({ binding: "badge", text: v.text });
        break;
      case "label":
        chips.push({ binding: "label", text: v.text });
        break;
    }
  }

  return {
    state: anyError ? "stale" : "ok",
    status,
    chips,
    error: anyError ? "Some sources failed." : null,
  };
}
