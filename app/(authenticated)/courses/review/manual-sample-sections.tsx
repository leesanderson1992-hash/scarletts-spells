import { formatCourseDate } from "@/lib/courses/queries";
import type { ReviewWritingIssueProjection } from "@/lib/writing-practice/types";

import {
  addManualWritingIssue,
  completeManualWritingSampleReview,
} from "./manual-sample-actions";

export type ReviewWritingIssueWithSourceSuggestionRow = ReviewWritingIssueProjection & {
  source_suggestion_id: string | null;
};

export function ManualSampleParentAuthoredIssuesSection(props: {
  rows: ReviewWritingIssueWithSourceSuggestionRow[];
}) {
  if (props.rows.length === 0) {
    return null;
  }

  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="brand-eyebrow">Parent-authored manual issues</p>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
            Saved parent review input
          </h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
            These manual-sample rows were saved by the parent during review. They
            stay separate from Suggested Issues engine output and shared
            verification records.
          </p>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
          {props.rows.length} saved
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {props.rows.map((row) => (
          <div
            key={row.id}
            className="rounded-2xl border border-[var(--border)] bg-white px-4 py-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                Parent authored
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[rgba(255,247,220,0.35)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                Durable issue
              </span>
            </div>
            <p className="mt-3 text-sm font-medium text-[color:var(--ink)]">
              {row.observed_text?.trim() || "Manual writing issue"}
              {row.approved_replacement?.trim()
                ? ` -> ${row.approved_replacement.trim()}`
                : ""}
            </p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
              Saved as parent-authored manual review input using the durable issue
              path. This row does not represent engine-suggested candidate truth.
            </p>
            {row.parent_review_note?.trim() ? (
              <p className="mt-2 rounded-2xl bg-[rgba(255,247,220,0.35)] px-3 py-2 text-sm leading-6 text-[color:var(--ink)]">
                {row.parent_review_note.trim()}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ManualSampleParentIssueSection(props: {
  writingSampleId: string;
  redirectPath: string;
  isCompleted: boolean;
  completedAt: string | null;
}) {
  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <div>
        <p className="brand-eyebrow">Parent-authored issue</p>
        <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
          Save a missed issue from this manual sample
        </h2>
        <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
          Use this bounded save flow when you spot a real issue that is missing
          from the shared outputs below. It saves parent-authored durable issue
          truth without presenting the result as engine analysis.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
        Manual writing samples stay live in Review Work until you explicitly mark
        them complete. Completion archives this sample without implying mastery,
        evidence, assignment, reward, or analytics truth.
      </div>

      <form
        action={addManualWritingIssue}
        className="mt-4 grid gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-4"
      >
        <input type="hidden" name="writing_sample_id" value={props.writingSampleId} />
        <input type="hidden" name="redirect_path" value={props.redirectPath} />

        <label className="grid gap-1 text-sm text-[color:var(--ink)]">
          <span className="font-medium">Issue you spotted</span>
          <input
            name="observed_text"
            type="text"
            className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
            placeholder="eg writed"
          />
        </label>

        <label className="grid gap-1 text-sm text-[color:var(--ink)]">
          <span className="font-medium">Approved correction</span>
          <input
            name="approved_replacement"
            type="text"
            className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
            placeholder="eg wrote"
          />
        </label>

        <label className="grid gap-1 text-sm text-[color:var(--ink)]">
          <span className="font-medium">Parent note</span>
          <textarea
            name="issue_note"
            rows={3}
            className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
            placeholder="Explain why this should be carried into targeted writing practice."
          />
        </label>

        <div>
          <button className="brand-secondary-btn justify-center" type="submit">
            Save parent-authored issue
          </button>
        </div>
      </form>

      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[color:var(--ink)]">
              Explicit completion
            </p>
            <p className="mt-1 text-sm leading-6 text-[color:var(--mid)]">
              Mark this manual writing sample complete once you are satisfied with
              the review. This is a bounded parent completion action, not engine
              silence.
            </p>
          </div>
          {props.isCompleted ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Completed
            </span>
          ) : (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              Waiting for completion
            </span>
          )}
        </div>

        {props.isCompleted ? (
          <p className="mt-3 text-sm leading-6 text-[color:var(--mid)]">
            Completed {props.completedAt ? formatCourseDate(props.completedAt.slice(0, 10)) : "in Review Work"}.
          </p>
        ) : (
          <form action={completeManualWritingSampleReview} className="mt-4 grid gap-3">
            <input type="hidden" name="writing_sample_id" value={props.writingSampleId} />
            <input type="hidden" name="redirect_path" value={props.redirectPath} />
            <div>
              <button className="brand-primary-btn justify-center" type="submit">
                Mark sample complete
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
