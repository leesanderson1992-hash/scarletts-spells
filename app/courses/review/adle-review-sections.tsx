import type { ReviewWorkCandidateCaptureMicroSkillOption } from "@/lib/writing-engine/persistence/learning-items";
import type { UnifiedSpellingReviewItem } from "@/lib/writing-engine/persistence/unified-spelling-review-items";
import { readAttributedOccurrence } from "@/lib/adle/review-work/additional-spelling";
import type { AdleReviewWorkDetail } from "@/lib/adle/review-work/read-model";

import { submitAdleReviewWorkInspection } from "./actions";
import {
  AdleWritingIssuePicker,
  type AdleWritingHighlight,
} from "./adle-writing-issue-picker";
import { UnifiedSpellingReviewTable } from "./unified-spelling-review-table";

function HiddenContext(props: {
  detail: AdleReviewWorkDetail;
  redirectPath: string;
}) {
  return (
    <>
      <input type="hidden" name="source_id" value={props.detail.sourceId} />
      <input type="hidden" name="child_id" value={props.detail.childId} />
      <input type="hidden" name="redirect_path" value={props.redirectPath} />
    </>
  );
}

function buildWritingHighlights(
  detail: AdleReviewWorkDetail,
): AdleWritingHighlight[] {
  return detail.targets.flatMap((target) => {
    const occurrence = readAttributedOccurrence({
      attributionProvenance: target.attributionProvenance,
      canonicalSpelling: target.canonicalSpelling,
      encounterId: target.encounterId,
      originalOutcomeSource: target.originalOutcomeSource,
    });
    if (
      target.originalOutcomeSource !== "writing" ||
      occurrence.positionStart === null ||
      occurrence.positionEnd === null
    ) {
      return [];
    }
    const tone =
      target.originalOutcome === "success"
        ? ("success" as const)
        : target.repairState === "completed_correct"
          ? ("repaired" as const)
          : ("not_secured" as const);
    const result =
      tone === "success"
        ? "originally correct"
        : tone === "repaired"
          ? "repaired after the original miss"
          : "not secured after repair";
    return [
      {
        start: occurrence.positionStart,
        end: occurrence.positionEnd,
        tone,
        label: `${target.canonicalSpelling}: ${result}`,
      },
    ];
  });
}

function TargetWordDetails({ detail }: { detail: AdleReviewWorkDetail }) {
  const targetGroups = [
    {
      label: "Successful",
      targets: detail.targets.filter(
        (target) => target.originalOutcome === "success",
      ),
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    },
    {
      label: "Repaired",
      targets: detail.targets.filter(
        (target) =>
          target.originalOutcome !== "success" &&
          target.repairState === "completed_correct",
      ),
      className: "border-amber-200 bg-amber-50 text-amber-900",
    },
    {
      label: "Missed",
      targets: detail.targets.filter(
        (target) =>
          target.originalOutcome !== "success" &&
          target.repairState !== "completed_correct",
      ),
      className: "border-rose-200 bg-rose-50 text-rose-800",
    },
  ];

  return (
    <details className="brand-card rounded-3xl p-4 md:p-5">
      <summary className="cursor-pointer font-semibold text-[color:var(--ink)]">
        View Target Word details
      </summary>
      <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
        Original retrieval remains immutable. Repair evidence is shown separately.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {targetGroups.map((group) => (
          <section
            key={group.label}
            className={`rounded-2xl border p-4 ${group.className}`}
          >
            <h3 className="font-semibold">
              {group.label} · {group.targets.length}
            </h3>
            <ul className="mt-2 grid gap-1 text-sm">
              {group.targets.map((target) => (
                <li key={target.encounterId}>{target.canonicalSpelling}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {detail.targets.map((target) => (
          <article
            key={target.encounterId}
            className="rounded-2xl border border-[var(--border)] bg-white p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-[color:var(--ink)]">
                {target.order}. {target.canonicalSpelling}
              </h3>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  target.originalOutcome === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                {target.originalOutcome === "success"
                  ? "Originally correct"
                  : "Needs strengthening"}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm">
              <div>
                <dt className="font-medium">Original attempt</dt>
                <dd className="text-[color:var(--mid)]">
                  {target.originalAttempt?.attemptText ??
                    (target.originalOutcomeSource === "audio_retrieval_check"
                      ? "Persisted audio outcome"
                      : "Persisted writing outcome")}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Repair</dt>
                <dd className="text-[color:var(--mid)]">
                  {target.repairState === "not_required"
                    ? "Not required"
                    : target.repairState === "completed_correct"
                      ? `Secured on retry ${target.repairAttempts.find((attempt) => attempt.isCorrect)?.attemptNumber ?? ""}`
                      : "Attempted, not yet secured"}
                </dd>
              </div>
              {target.memoryCue ? (
                <div>
                  <dt className="font-medium">
                    Memory Cue v{target.memoryCue.versionNumber}
                  </dt>
                  <dd className="text-[color:var(--mid)]">
                    {target.memoryCue.cueText}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="font-medium">Result of this Review</dt>
                <dd className="text-[color:var(--mid)]">
                  {target.outcomeTransition.eventType} · {target.outcomeTransition.frozenDueOn}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Current Review state</dt>
                <dd className="text-[color:var(--mid)]">
                  {target.currentSchedule.membershipStatus}
                  {target.currentSchedule.nextRetestDueOn
                    ? ` · next ${target.currentSchedule.nextRetestDueOn}`
                    : ""}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </details>
  );
}

export function AdleReviewSections(props: {
  detail: AdleReviewWorkDetail;
  rows: UnifiedSpellingReviewItem[];
  options: ReviewWorkCandidateCaptureMicroSkillOption[];
  redirectPath: string;
}) {
  const readOnly = props.detail.observationalStatus === "reviewed";
  const unresolvedRows = props.rows.filter((row) => !row.terminalStatus);

  return (
    <>
      <AdleWritingIssuePicker
        submittedWritingText={props.detail.submittedWritingText}
        highlights={buildWritingHighlights(props.detail)}
        sourceId={props.detail.sourceId}
        childId={props.detail.childId}
        redirectPath={props.redirectPath}
        readOnly={readOnly}
      />

      <TargetWordDetails detail={props.detail} />

      <UnifiedSpellingReviewTable
        rows={props.rows}
        options={props.options}
        submissionId=""
        redirectPath={props.redirectPath}
        reviewWorkflowPhase="adle_observational"
        adleContext={{
          sourceId: props.detail.sourceId,
          childId: props.detail.childId,
          readOnly,
        }}
      />

      <section className="brand-card rounded-3xl p-4 md:p-5">
        <p className="text-sm leading-6 text-[color:var(--mid)]">
          Submit records only that the parent has finished inspecting this completed Review. It does not affect learner completion, Target Word outcomes, schedules, lessons or rewards.
        </p>
        <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
          A confirmed additional spelling may enter the child learning queue when canonical intake and curriculum content are ready. Under the current governed rules, this observation does not create a Golden Nugget.
        </p>
        {readOnly ? (
          <span className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            Reviewed
          </span>
        ) : (
          <>
            <form action={submitAdleReviewWorkInspection} className="mt-3">
              <HiddenContext detail={props.detail} redirectPath={props.redirectPath} />
              <button
                type="submit"
                className="brand-primary-btn disabled:cursor-not-allowed disabled:opacity-60"
                disabled={unresolvedRows.length > 0}
              >
                Submit
              </button>
            </form>
            {unresolvedRows.length > 0 ? (
              <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[color:var(--mid)]">
                Finish or dismiss {unresolvedRows.length} added spelling
                {unresolvedRows.length === 1 ? "" : "s"} before submitting.
              </p>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
