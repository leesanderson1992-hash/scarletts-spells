"use client";

import type { ContextAdvisoryReviewRow } from "@/lib/writing-engine/whole-writing/context-advisory-review";
import { promoteContextDiagnosticExample, recordContextAdvisoryParentDecision } from "./actions";

export function ContextAdvisoryTableRow({ row, submissionId, readOnly, colSpan }: {
  row: ContextAdvisoryReviewRow;
  submissionId: string;
  readOnly: boolean;
  colSpan: number;
}) {
  const machine = row.machineStatus === "INVALID" && row.machineAlternative
    ? `Context Resolver suggests: ${row.machineAlternative}`
    : row.machineStatus === "VALID" ? "Context Resolver: looks correct"
    : row.machineStatus === "UNCERTAIN" ? "Context Resolver: uncertain"
    : "Context Resolver: not assessed";
  const common = <>
    <input type="hidden" name="submission_id" value={submissionId} />
    <input type="hidden" name="occurrence_id" value={row.occurrenceId} />
    <input type="hidden" name="observation_id" value={row.observationId ?? ""} />
  </>;
  const canEdit = !readOnly && row.sourceStatus === "ready";
  return <tr className="border-t border-[var(--border)] bg-[rgba(240,248,255,0.45)]">
    <td colSpan={colSpan} className="px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--mid)]">Contextual word choice · {row.family.replaceAll("_", "/")}</p>
          <p className="mt-1 text-sm text-[color:var(--ink)]">{row.excerpt}</p>
          <p className="mt-1 text-xs text-[color:var(--mid)]">{machine}</p>
          <p className="mt-1 text-xs font-medium text-[color:var(--ink)]">
            Parent: {row.parentClassification ?? "Review needed"}
            {row.parentAlternative ? ` → ${row.parentAlternative}` : ""}
          </p>
          <details className="mt-1 text-xs text-[color:var(--mid)]">
            <summary className="cursor-pointer">View analyser details</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">{JSON.stringify({
              occurrenceId: row.occurrenceId, span: row.position, reason: row.machineReason,
              diagnostics: row.machineDetails,
            }, null, 2)}</pre>
          </details>
          {row.parentDecisionId ? <details className="mt-2 text-xs text-[color:var(--mid)]">
            <summary className="cursor-pointer">Send example to Admin</summary>
            <form action={promoteContextDiagnosticExample} className="mt-2 flex flex-wrap gap-2">
              <input type="hidden" name="submission_id" value={submissionId} />
              <input type="hidden" name="decision_id" value={row.parentDecisionId} />
              <select name="category" required defaultValue="" aria-label="Diagnostic reason"
                className="rounded border border-[var(--border)] bg-white px-2 py-1">
                <option value="" disabled>Choose reason</option>
                <option value="FALSE_VALID">False valid</option>
                <option value="WRONG_ALTERNATIVE">Wrong alternative</option>
                <option value="AVOIDABLE_UNCERTAIN">Avoidable uncertain</option>
                <option value="MISSED_CONSTRUCTION">Missed construction</option>
                <option value="PROTECTED_OR_AMBIGUOUS">Protected or ambiguous</option>
                <option value="OTHER">Other</option>
              </select>
              <input name="parent_note" maxLength={600} placeholder="Optional note" aria-label="Diagnostic note"
                className="rounded border border-[var(--border)] bg-white px-2 py-1" />
              <button className="rounded border border-[var(--border)] bg-white px-2 py-1">Send to Admin</button>
            </form>
            <p className="mt-1">Development evidence only; not qualification gold.</p>
          </details> : null}
        </div>
        {canEdit ? <div className="flex max-w-xl flex-wrap gap-2 text-xs">
          {row.machineStatus === "INVALID" && row.machineAlternative ?
            <form action={recordContextAdvisoryParentDecision} className="inline-flex">
              {common}<input type="hidden" name="classification" value="INVALID" />
              <input type="hidden" name="intended_member" value={row.machineAlternative} />
              <button className="rounded border border-[var(--border)] bg-white px-2 py-1">Accept suggestion</button>
            </form> : null}
          <form action={recordContextAdvisoryParentDecision} className="inline-flex">
            {common}<input type="hidden" name="classification" value="VALID" />
            <button className="rounded border border-[var(--border)] bg-white px-2 py-1">Mark correct</button>
          </form>
          <form action={recordContextAdvisoryParentDecision} className="inline-flex gap-1">
            {common}<input type="hidden" name="classification" value="INVALID" />
            <select name="intended_member" required defaultValue="" aria-label={`Correct contextual word for ${row.observed}`}
              className="rounded border border-[var(--border)] bg-white px-2 py-1">
              <option value="" disabled>Choose word</option>
              {row.members.filter((member) => member !== row.observed.toLowerCase().replaceAll("’", "'")).map((member) =>
                <option key={member} value={member}>{member}</option>) }
            </select>
            <button className="rounded border border-[var(--border)] bg-white px-2 py-1">Mark incorrect</button>
          </form>
          <form action={recordContextAdvisoryParentDecision} className="inline-flex">
            {common}<input type="hidden" name="classification" value="UNCERTAIN" />
            <input type="hidden" name="reason_code" value="GENUINELY_AMBIGUOUS" />
            <button className="rounded border border-[var(--border)] bg-white px-2 py-1">Genuinely ambiguous</button>
          </form>
          <form action={recordContextAdvisoryParentDecision} className="inline-flex">
            {common}<input type="hidden" name="classification" value="EXCLUDED" />
            <input type="hidden" name="reason_code" value="NOT_LEARNER_AUTHORED" />
            <button className="rounded border border-[var(--border)] bg-white px-2 py-1">Not learner writing</button>
          </form>
        </div> : null}
      </div>
    </td>
  </tr>;
}
