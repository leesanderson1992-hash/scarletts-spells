"use client";

import { useEffect, useState } from "react";

export const INTERACTION_MOTION = { snapMs: 200, flipMs: 300, pulseMs: 400, snapDistancePx: 24 } as const;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
