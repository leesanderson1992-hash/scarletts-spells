import { formatCourseDate } from "@/lib/courses/queries";
import type { ReviewWritingIssueProjection } from "@/lib/writing-practice/types";
import type { ReviewWorkCandidateCaptureMicroSkillOption } from "@/lib/writing-engine/persistence/learning-items";

import {
  addManualWritingIssue,
  captureManualSampleSpellingCandidate,
  completeManualWritingSampleReview,
} from "./manual-sample-actions";

export type ReviewWritingIssueWithSourceSuggestionRow = ReviewWritingIssueProjection & {
  source_suggestion_id: string | null;
};

export function ManualSampleSpellingCandidateSection(props: {
  writingSampleId: string;
  redirectPath: string;
  options: ReviewWorkCandidateCaptureMicroSkillOption[];
}) {
  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <p className="brand-eyebrow">Parent-verified spelling</p>
      <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
        Confirm a spelling for lesson review
      </h2>
      <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
        Enter a misspelling that appears once in this sample, its correction,
        and the skill it demonstrates. This records your approval and checks
        dictionary, mapping, and route requirements before it can enter a lesson.
      </p>
      {props.options.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No active spelling micro-skills are available for this review.
        </p>
      ) : (
        <form action={captureManualSampleSpellingCandidate} className="mt-4 grid gap-3">
          <input type="hidden" name="writing_sample_id" value={props.writingSampleId} />
          <input type="hidden" name="redirect_path" value={props.redirectPath} />
          <label className="grid gap-1 text-sm text-[color:var(--ink)]">
            <span className="font-medium">Child&apos;s spelling</span>
            <input required name="observed_text" type="text" autoComplete="off"
              className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm text-[color:var(--ink)]">
            <span className="font-medium">Correct spelling</span>
            <input required name="correct_text" type="text" autoComplete="off"
              className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm text-[color:var(--ink)]">
            <span className="font-medium">Spelling micro-skill</span>
            <select required name="micro_skill_key" defaultValue=""
              className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2">
              <option value="" disabled>Choose a skill</option>
              {props.options.map((option) => (
                <option key={option.microSkillKey} value={option.microSkillKey}>
                  {option.displayName}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="brand-secondary-btn justify-center">
            Confirm correction and check lesson route
          </button>
        </form>
      )}
    </section>
  );
}

export function ManualSampleSpellingStatusSection(props: {
  rows: Array<{
    id: string;
    misspelling: string;
    correction: string;
    microSkillKey: string;
    candidateState: string | null;
    blockers: unknown;
    learningItemId: string | null;
  }>;
}) {
  if (props.rows.length === 0) return null;
  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <h2 className="text-lg font-semibold text-[color:var(--ink)]">Reviewed spelling routes</h2>
      <div className="mt-3 grid gap-3">
        {props.rows.map((row) => {
          const blockerCodes = Array.isArray(row.blockers)
            ? row.blockers.map((blocker) => {
                if (!blocker || typeof blocker !== "object") return null;
                const code = (blocker as { code?: unknown }).code;
                return typeof code === "string" ? code.replaceAll("_", " ") : null;
              }).filter((code): code is string => code !== null)
            : [];
          return (
            <div key={row.id} className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm">
              <p className="font-medium text-[color:var(--ink)]">
                {row.misspelling} → {row.correction}
              </p>
              <p className="mt-1 text-[color:var(--mid)]">{row.microSkillKey}</p>
              <p className="mt-1 text-[color:var(--mid)]">
                {row.learningItemId && row.candidateState === "activated"
                  ? "Ready for this child's lesson selection"
                  : row.candidateState === "pending_mapping"
                    ? "Awaiting reviewed misspelling mapping"
                    : row.candidateState === "pending_content"
                      ? "Awaiting approved teaching content"
                      : row.candidateState === "error_retryable"
                        ? "Readiness check needs retry"
                        : "Readiness check queued"}
              </p>
              {blockerCodes.length > 0 ? (
                <p className="mt-1 text-amber-800">Missing: {blockerCodes.join(", ")}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

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
