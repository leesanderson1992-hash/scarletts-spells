import type { ReactNode } from "react";

export function ActivityFrame(props: {
  children: ReactNode;
  header?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 ${props.className ?? ""}`}>
      <div className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-white/92 shadow-[var(--shadow-soft)]">
        {props.header ? <div className="border-b border-[var(--border)] bg-[#fff8fc] px-5 py-5">{props.header}</div> : null}
        <div className="px-5 py-5 sm:px-6">{props.children}</div>
        {props.actions ? <div className="border-t border-[var(--border)] bg-[#fff8fc] px-5 py-4">{props.actions}</div> : null}
      </div>
    </section>
  );
}

export function ActivityHeader(props: {
  title: string;
  instruction: string;
  modeLabel?: string;
  progressLabel?: string;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {props.modeLabel ? <p className="brand-eyebrow">{props.modeLabel}</p> : null}
        <h1 className="brand-lesson-title mt-1 text-2xl font-semibold sm:text-3xl">{props.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--mid)]">{props.instruction}</p>
      </div>
      {props.progressLabel ? (
        <p className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--scarlett)]">
          {props.progressLabel}
        </p>
      ) : null}
    </header>
  );
}

export function InstructionPanel(props: {
  instruction: string;
  teachingCue?: string;
  watchForCue?: string;
}) {
  return (
    <aside className="rounded-2xl border border-[var(--border)] bg-[#fff8fc] p-4">
      <p className="text-sm font-semibold text-[color:var(--text)]">{props.instruction}</p>
      {props.teachingCue ? <p className="mt-2 text-sm text-[color:var(--mid)]">{props.teachingCue}</p> : null}
      {props.watchForCue ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-semibold">Watch for: </span>
          {props.watchForCue}
        </p>
      ) : null}
    </aside>
  );
}

export type FeedbackPanelTone = "neutral" | "success" | "try_again" | "hint" | "complete";

const FEEDBACK_STYLES: Record<FeedbackPanelTone, string> = {
  neutral: "border-[var(--border)] bg-white text-[color:var(--text)]",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  try_again: "border-amber-200 bg-amber-50 text-amber-900",
  hint: "border-sky-200 bg-sky-50 text-sky-900",
  complete: "border-[var(--gold)] bg-[#fff8e6] text-[#7a4d00]",
};

const FEEDBACK_LABELS: Record<FeedbackPanelTone, string> = {
  neutral: "Note",
  success: "Ready",
  try_again: "Try again",
  hint: "Hint",
  complete: "Complete",
};

export function FeedbackPanel(props: {
  tone: FeedbackPanelTone;
  message: string;
  detail?: string;
}) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${FEEDBACK_STYLES[props.tone]}`} role="status">
      <p className="text-sm font-semibold">{FEEDBACK_LABELS[props.tone]}</p>
      <p className="mt-1 text-sm">{props.message}</p>
      {props.detail ? <p className="mt-1 text-xs opacity-85">{props.detail}</p> : null}
    </div>
  );
}

export function SafeFallbackCard(props: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <p className="text-sm font-semibold text-[color:var(--text)]">{props.title}</p>
      <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">{props.message}</p>
    </div>
  );
}
