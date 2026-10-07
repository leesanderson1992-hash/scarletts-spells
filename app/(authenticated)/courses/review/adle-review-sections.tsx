import type { ReviewWorkCandidateCaptureMicroSkillOption } from "@/lib/writing-engine/persistence/learning-items";
import type { UnifiedSpellingReviewItem } from "@/lib/writing-engine/persistence/unified-spelling-review-items";
import { readAttributedOccurrence } from "@/lib/adle/review-work/additional-spelling";
import type { AdleReviewWorkDetail } from "@/lib/adle/review-work/read-model";
import type { AdleContextReview } from "@/lib/adle/review-work/context-review";
import type { AdleParentContextChoice } from "@/lib/adle/review-work/parent-context";
import type { AdleAuthenticUseReview } from "@/lib/authentic-use/adle-review";
import { decideAdleReviewParentContextChoice, recordAdleReviewContextDecision } from "./actions/adle-review-work-actions";
import { ReviewGuidedSections } from "./review-guided-sections";
import { ReviewActionSubmitButton } from "./review-action-submit-button";

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

export function TargetWordDetails({ detail }: { detail: AdleReviewWorkDetail }) {
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
    <details className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-4">
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
  contextReview: AdleContextReview;
  parentContext: AdleParentContextChoice[];
  authenticUse: AdleAuthenticUseReview;
  rows: UnifiedSpellingReviewItem[];
  options: ReviewWorkCandidateCaptureMicroSkillOption[];
  redirectPath: string;
}) {
  const readOnly = props.detail.observationalStatus === "reviewed";
  const unresolvedRows = props.rows.filter((row) => !row.terminalStatus);
  const unresolvedContext = props.contextReview.findings.filter(f =>
    f.decision !== "confirmed" && f.decision !== "dismissed");

  return (
    <>
      <ReviewGuidedSections storageKey={`adle-review-${props.detail.reviewSessionId}`}
        initialSection="writing"
        sections={[
          { id: "writing", title: "Original writing & Add Word", summary: "Select a word in the submitted writing", content: (
            <AdleWritingIssuePicker submittedWritingText={props.detail.submittedWritingText}
              highlights={[...buildWritingHighlights(props.detail),
                ...props.contextReview.findings.map((f) => ({ start: f.startUtf16, end: f.endUtf16,
                  tone: "context" as const, label: `Context suggestion: ${f.observed} → ${f.intended}` }))]}
              sourceId={props.detail.sourceId} childId={props.detail.childId}
              redirectPath={props.redirectPath} readOnly={readOnly} />
          ) },
          { id: "context", title: "Context analysis", summary: "Context choices", count: props.contextReview.findings.length + props.parentContext.length, content: (
            <div className="grid gap-3">
              {props.contextReview.status === "pending" ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Context analysis is still running.</p> : null}
              {props.contextReview.status === "failed" ? <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-950">The scan could not finish ({props.contextReview.reason}). Continue with manual inspection.</p> : null}
              {props.contextReview.status === "unavailable" ? <p className="text-sm text-[var(--mid)]">{props.contextReview.reason ?? "This review has no AI context scan. You can inspect it manually."}</p> : null}
              {props.contextReview.findings.length + props.parentContext.length > 0 ?
                <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead><tr className="bg-[var(--mist)] text-[var(--ink)]">
                      { ["Origin", "Word", "Sentence context", "Intended word", "Status / decision"].map((label) =>
                        <th key={label} scope="col" className="border-b border-[var(--border)] p-3 font-semibold">{label}</th>) }
                    </tr></thead>
                    <tbody>
                      {props.contextReview.findings.map((finding) => <tr key={finding.id} className="border-b border-[var(--border)] align-top">
                        <td className="p-3">AI suggestion</td>
                        <td className="p-3 font-semibold">{finding.observed}</td>
                        <td className="p-3">{props.detail.submittedWritingText.slice(Math.max(0, finding.startUtf16 - 45),
                          Math.min(props.detail.submittedWritingText.length, finding.endUtf16 + 45))}</td>
                        <td className="p-3">{finding.intended}</td>
                        <td className="p-3">
                          {readOnly || finding.decision === "confirmed" || finding.decision === "dismissed" ? finding.decision :
                            <form action={recordAdleReviewContextDecision} className="grid gap-2">
                              <HiddenContext detail={props.detail} redirectPath={props.redirectPath} />
                              <input type="hidden" name="finding_id" value={finding.id} />
                              <label className="sr-only" htmlFor={`intended-${finding.id}`}>Intended word</label>
                              <input id={`intended-${finding.id}`} name="intended_word" defaultValue={finding.intended} maxLength={60}
                                className="rounded border border-[var(--border)] px-2 py-1" />
                              <div className="flex flex-wrap gap-2">
                                <button type="submit" name="context_action" value="confirm" className="brand-primary-btn">Confirm</button>
                                <button type="submit" name="context_action" value="dismiss" className="brand-secondary-btn">Dismiss</button>
                              </div>
                            </form>}
                        </td>
                      </tr>)}
                      {props.parentContext.map((choice) => <tr key={choice.id} className="border-b border-[var(--border)] align-top">
                        <td className="p-3">Parent added</td>
                        <td className="p-3 font-semibold">{choice.observed}</td>
                        <td className="p-3">{choice.sentence}</td>
                        <td className="p-3">{choice.intended}</td>
                        <td className="p-3">{readOnly || choice.decision !== "pending" ? choice.decision :
                          <form action={decideAdleReviewParentContextChoice} className="flex flex-wrap gap-2">
                            <HiddenContext detail={props.detail} redirectPath={props.redirectPath} />
                            <input type="hidden" name="choice_id" value={choice.id} />
                            <button type="submit" name="decision" value="confirmed" className="brand-primary-btn">Confirm</button>
                            <button type="submit" name="decision" value="dismissed" className="brand-secondary-btn">Dismiss</button>
                          </form>}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div> : <p className="text-sm text-[var(--mid)]">No context choices to review.</p>}
            </div>
          ) },
          { id: "words", title: "Added misspellings", summary: "Spelling decisions", count: props.rows.length, content: (
            <UnifiedSpellingReviewTable rows={props.rows} options={props.options}
              submissionId="" redirectPath={props.redirectPath} reviewWorkflowPhase="adle_observational"
              adleContext={{ sourceId: props.detail.sourceId, childId: props.detail.childId, readOnly }} />
          ) },
          { id: "authentic", title: "Authentic use from original writing", summary: props.authenticUse.eligibleForAwards ? "Confirmation needed" : "Review evidence", content: (
            <div className="grid gap-4">
              {props.authenticUse.enabled ? <div className="grid gap-2 text-sm text-[var(--ink)]">
                <p>{props.authenticUse.sourceMissing ? "The original source is unavailable; no automatic credit can be awarded." :
                  props.authenticUse.eligibleForAwards ? "These words can receive credit after you resolve errors and confirm the original writing." :
                  props.authenticUse.finalised ? "The original writing has already been reviewed." :
                  "This writing predates activation and has no historical credit grant."}</p>
                <p>Qualifying words: {props.authenticUse.preview?.candidates.map((candidate) => candidate.observedWord).join(", ") || "None"}.</p>
                <p>Excluded by spelling or context findings: {props.authenticUse.preview?.blocked.map((candidate) => candidate.wordKey).join(", ") || "None"}.</p>
              </div> : null}
              {readOnly ? <p className="font-medium text-[var(--success)]">Reviewed</p> : null}
            </div>
          ) },
        ]} />
      {!readOnly ? <section aria-label="Submit ADLE review" className="brand-card rounded-3xl p-4 md:p-5">
                <form action={submitAdleReviewWorkInspection} className="grid gap-3">
                  <HiddenContext detail={props.detail} redirectPath={props.redirectPath} />
                  {props.authenticUse.enabled && !props.authenticUse.sourceMissing ? <div className="grid gap-2 rounded-xl bg-[var(--mist)] p-3 text-sm">
                    <label className="flex gap-2"><input type="checkbox" name="authentic_use_review_confirmed" value="true" required />
                      <span>I checked the child’s original Review writing and recorded any spelling or context errors.</span></label>
                    {props.authenticUse.preview?.requiresManualReview ? <label className="flex gap-2"><input type="checkbox" name="authentic_use_manual_review" value="true" required />
                      <span>I manually reviewed the whole writing because automatic checks are incomplete.</span></label> : null}
                  </div> : null}
                  <ReviewActionSubmitButton className="brand-primary-btn w-fit disabled:opacity-50"
                    disabled={unresolvedRows.length > 0 || props.contextReview.status === "pending" ||
                      unresolvedContext.length > 0 || props.parentContext.some((choice) => choice.decision === "pending")}>
                    Submit review
                  </ReviewActionSubmitButton>
                  {unresolvedRows.length > 0 || unresolvedContext.length > 0 || props.parentContext.some((choice) => choice.decision === "pending") ?
                    <p className="text-sm text-[var(--mid)]">Finish the outstanding spelling and context decisions before submitting.</p> : null}
                </form>
      </section> : null}
    </>
  );
}
