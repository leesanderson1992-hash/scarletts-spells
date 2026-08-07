"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  generateTodayAdleAction,
  type TodayAdleActionState,
} from "./todays-adle-actions";

export type TodayAdleChildRow = {
  childId: string;
  childName: string;
  initialState: TodayAdleActionState;
};

function TodayAdleRow({ row }: { row: TodayAdleChildRow }) {
  const [state, formAction, isPending] = useActionState(
    generateTodayAdleAction,
    row.initialState,
  );

  return (
    <li className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-[color:var(--ink)]">{row.childName}</p>
        {isPending ? (
          <p className="mt-1 text-sm text-[color:var(--mid)]" aria-live="polite">
            Preparing today&apos;s lesson…
          </p>
        ) : state.state === "ready" ? (
          <p className="mt-1 text-sm text-[color:var(--mid)]">Lesson ready</p>
        ) : state.state === "completed" ? (
          <p className="mt-1 text-sm text-[color:var(--mid)]">Completed today</p>
        ) : state.state === "no_eligible" ? (
          <p className="mt-1 text-sm text-[color:var(--mid)]">No lesson ready today</p>
        ) : state.state === "failed" || state.state === "rejected" ? (
          <p className="mt-1 text-sm text-rose-700" role="alert">
            We couldn&apos;t prepare today&apos;s lesson. Try again.
          </p>
        ) : (
          <p className="mt-1 text-sm text-[color:var(--mid)]">No lesson generated yet</p>
        )}
      </div>

      {state.state === "ready" ? (
        <Link href={state.href} className="brand-primary-btn shrink-0 text-center">
          Open lesson
        </Link>
      ) : state.state === "completed" ? (
        <Link href={state.href} className="brand-secondary-btn shrink-0 text-center">
          View lesson
        </Link>
      ) : state.state === "no_eligible" ? null : (
        <form action={formAction}>
          <input type="hidden" name="childId" value={row.childId} />
          <button
            type="submit"
            disabled={isPending}
            className="brand-primary-btn shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Generating…" : "Generate today’s lesson"}
          </button>
        </form>
      )}
    </li>
  );
}

export function TodaysAdleSection({ rows }: { rows: TodayAdleChildRow[] }) {
  return (
    <section className="brand-card overflow-hidden rounded-3xl">
      <div className="px-5 py-4">
        <p className="brand-eyebrow">Today&apos;s ADLE</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
          Today&apos;s spelling lessons
        </h2>
      </div>
      <ul className="border-t border-[var(--border)]">
        {rows.map((row) => <TodayAdleRow key={row.childId} row={row} />)}
      </ul>
    </section>
  );
}
