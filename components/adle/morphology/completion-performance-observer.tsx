"use client";

import { useEffect } from "react";

export function WordLabCompletionPerformanceObserver(props: { traceId: string }) {
  useEffect(() => {
    try {
      const key = `adle:word-lab:completion:${props.traceId}`;
      const startedAt = Number(sessionStorage.getItem(key));
      if (Number.isFinite(startedAt) && startedAt > 0) {
        console.info(JSON.stringify({
          event: "adle_word_lab_browser_timing",
          traceId: props.traceId,
          stage: "completed_route",
          durationMs: Date.now() - startedAt,
        }));
        sessionStorage.removeItem(key);
      }
    } catch {
      // Timing is observational only; unavailable storage must not affect UX.
    }
  }, [props.traceId]);
  return null;
}
