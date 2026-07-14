"use client";

import { useState } from "react";
import { useReducedMotion } from "./motion";

export function TransformationAnimation(props: { source: string; removed: string; remaining: string; suffix: string; result: string; description: string }) {
  const [progress, setProgress] = useState(0); const reduced = useReducedMotion(); const complete = progress >= 70;
  return <div className="grid gap-4 rounded-3xl border border-[var(--border)] bg-white p-5"><div className="flex min-h-24 items-center justify-center gap-3 text-2xl font-black"><span className={complete ? "opacity-30" : ""}>{props.source}</span><span aria-hidden="true">→</span><span>{complete ? `${props.remaining}${props.suffix}` : props.remaining}</span>{!reduced && progress > 25 && progress < 75 ? <span className="-translate-y-5 text-slate-400 opacity-50">{props.removed}</span> : null}</div><input type="range" min="0" max="100" value={progress} onChange={(event) => setProgress(Number(event.target.value))} aria-label="Replay transformation" /><p className="text-sm text-[color:var(--mid)]">{props.description}{complete ? ` Final word: ${props.result}.` : ""}</p></div>;
}
