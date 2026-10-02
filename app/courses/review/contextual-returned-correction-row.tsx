"use client";

import { useState } from "react";

import type { ReviewWorkCandidateCaptureMicroSkillOption } from "@/lib/writing-engine/persistence/learning-items";
import type { UnifiedSpellingReviewItem } from "@/lib/writing-engine/persistence/unified-spelling-review-items";
import { governedContextFamily } from "@/lib/writing-engine/whole-writing/context-advisory-family";
import { getWritingIssueFinalClassificationLabel } from "@/lib/writing-practice/types";
import type { ReturnedContextExcerpt } from "@/lib/writing-engine/whole-writing/returned-context-excerpts";
import { finaliseContextualLearningOutcome, saveWritingIssueReasonDraft } from "./actions";

const SKILL_BY_FAMILY = {
  THERE_THEIR_THEYRE: "D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE",
  TO_TOO_TWO: "D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO",
  YOUR_YOURE: "D4_HOM_CONTRACTION_POSSESSIVE_YOUR_YOURE",
  ITS_ITS: "D4_HOM_CONTRACTION_POSSESSIVE_ITS_ITS",
} as const;

const LEARNING_OUTCOMES = new Set(["concept_gap", "fragile_knowledge", "transfer_failure"]);

export function ContextualReturnedCorrectionRow({ row, options, submissionId, redirectPath, colSpan, originalContextExcerpt }: {
  row: UnifiedSpellingReviewItem;
  options: ReviewWorkCandidateCaptureMicroSkillOption[];
  submissionId: string;
  redirectPath: string;
  colSpan: number;
  originalContextExcerpt: ReturnedContextExcerpt | null;
}) {
  const [outcome, setOutcome] = useState(row.draftFinalClassification ?? row.correctionOutcome ?? "");
  const contextFamily = governedContextFamily(row.observedText);
  const governedSkill = contextFamily ? SKILL_BY_FAMILY[contextFamily] : null;
  const allowedOptions = options.filter((item) => item.microSkillKey === governedSkill);
  const initialOption = allowedOptions[0];
  const [familyKey, setFamilyKey] = useState(initialOption?.skillFamilyKey ?? "");
  const [clusterKey, setClusterKey] = useState(initialOption?.skillClusterKey ?? "");
  const [skillKey, setSkillKey] = useState(initialOption?.microSkillKey ?? "");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const families = [...new Map(allowedOptions.map((item) => [item.skillFamilyKey, item.skillFamilyDisplayName])).entries()];
  const clusters = [...new Map(allowedOptions.filter((item) => item.skillFamilyKey === familyKey)
    .map((item) => [item.skillClusterKey ?? "", item.skillClusterDisplayName ?? "Function words"])).entries()];
  const skills = allowedOptions.filter((item) => item.skillFamilyKey === familyKey && (item.skillClusterKey ?? "") === clusterKey);
  const editable = row.state === "child_responded" && !row.correctionOutcome && Boolean(row.sourceIds.originalWritingIssueId);
  const learning = LEARNING_OUTCOMES.has(outcome);
  const governedLearning = learning && Boolean(governedSkill);
  const reasonSaved = row.draftFinalClassification === outcome && Boolean(outcome);
  const formId = `context-outcome-${row.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const detailsId = `${formId}-details`;

  return <>
    <tr className="border-t border-[var(--border)] align-middle bg-sky-50/40">
      <td className="max-w-[11rem] px-3 py-2 align-top text-sm font-semibold text-[color:var(--ink)]">
        <span className="block truncate" title={row.observedText}>{row.observedText}</span>
        <button type="button" aria-expanded={detailsOpen} aria-controls={detailsId}
          onClick={() => setDetailsOpen((current) => !current)}
          className="mt-1 block text-left text-[11px] font-medium text-[color:var(--mid)] hover:text-[color:var(--ink)]">
          {detailsOpen ? "Hide details" : "Details"}
        </button>
      </td>
      <td className="max-w-[9rem] px-3 py-2 align-top text-sm text-[color:var(--ink)]">
        <span className="block truncate" title={row.expectedCorrection ?? "Unknown"}>{row.expectedCorrection ?? "Unknown"}</span>
      </td>
      <td className="max-w-[9rem] px-3 py-2 align-top text-sm text-[color:var(--ink)]">
        <span className="block truncate" title={row.latestChildAttempt ?? ""}>{row.latestChildAttempt ?? ""}</span>
      </td>
      <td className="px-2 py-2 align-top text-center">
        <span title="Context correction" aria-label="Context correction"
          className="inline-flex min-w-6 items-center justify-center rounded border border-sky-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-sky-900">C</span>
      </td>
      <td className="px-3 py-2 align-top text-sm font-medium text-[color:var(--ink)]">
        {row.correctionOutcome ? "Done" : reasonSaved ? "Reason saved" : "Tried"}
      </td>
      <td className="min-w-44 px-3 py-2 align-top">
        {editable ? <form action={saveWritingIssueReasonDraft} className="grid gap-1">
          <input type="hidden" name="writing_issue_id" value={row.sourceIds.originalWritingIssueId ?? ""} />
          <input type="hidden" name="submission_id" value={submissionId} />
          <input type="hidden" name="redirect_path" value={redirectPath} />
          <select name="final_classification" required value={outcome}
            onChange={(event) => {
              setOutcome(event.target.value);
              event.currentTarget.form?.requestSubmit();
            }} aria-label={`Outcome for ${row.observedText}`}
            className="h-8 w-full rounded border border-[var(--border)] bg-white px-2 text-xs text-[color:var(--ink)]">
            <option value="" disabled>Choose outcome</option>
            <option value="concept_gap">Concept gap</option>
            <option value="fragile_knowledge">Fragile knowledge</option>
            <option value="transfer_failure">Transfer failure</option>
            <option value="checking_only">Checking only</option>
            <option value="not_an_issue">Not an issue</option>
          </select>
          {reasonSaved ? <p className="text-[11px] leading-4 text-[color:var(--mid)]">Draft saved. Confirm when ready.</p> : null}
          <button className="sr-only">Save reason</button>
        </form> : <p className="text-sm font-medium text-[color:var(--ink)]">
          {row.correctionOutcome ? getWritingIssueFinalClassificationLabel(row.correctionOutcome) : "No outcome recorded."}
        </p>}
      </td>
      <td className="min-w-52 px-3 py-2 align-top">
        {editable && governedLearning ? <div className="grid gap-1">
          <select value={familyKey} onChange={(event) => {
            setFamilyKey(event.target.value); setClusterKey(""); setSkillKey("");
          }} aria-label={`Learning route family for ${row.observedText}`}
          className="w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-xs">
            <option value="">Choose learning route</option>
            {families.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
          <select value={clusterKey} onChange={(event) => { setClusterKey(event.target.value); setSkillKey(""); }}
            disabled={!familyKey || clusters.length === 0}
            aria-label={`Learning route cluster for ${row.observedText}`}
            className="w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-xs disabled:text-[color:var(--mid)]">
            <option value="">Choose cluster</option>
            {clusters.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
          <select form={formId} name="micro_skill_key" required value={skillKey}
            onChange={(event) => setSkillKey(event.target.value)} disabled={!familyKey || !clusterKey}
            aria-label={`Learning route skill for ${row.observedText}`}
            className="w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-xs disabled:text-[color:var(--mid)]">
            <option value="">Choose skill</option>
            {skills.map((item) => <option key={item.microSkillKey} value={item.microSkillKey}>{item.displayName}</option>)}
          </select>
          {allowedOptions.length === 0 ? <p className="text-xs text-amber-900">The governed skill is not active and assignable yet.</p> : null}
        </div> : !governedSkill ? <p className="text-xs leading-5 text-[color:var(--mid)]">
          No matching skill · sent to Admin
        </p> : !outcome ? <p className="text-xs leading-5 text-[color:var(--mid)]">Choose a reason to see the learning route.</p>
          : row.correctionOutcome && row.microSkillKey && row.microSkillKey !== "unknown"
          ? <p className="text-xs leading-5 text-[color:var(--mid)]">{allowedOptions[0]?.displayName ?? row.microSkillKey}</p>
          : <p className="text-xs leading-5 text-[color:var(--mid)]">No learning route needed for this outcome.</p>}
      </td>
      <td className="overflow-visible px-3 py-2">
        {editable ? <form id={formId} action={finaliseContextualLearningOutcome}>
          <input type="hidden" name="submission_id" value={submissionId} />
          <input type="hidden" name="writing_issue_id" value={row.sourceIds.originalWritingIssueId ?? ""} />
          <input type="hidden" name="final_classification" value={outcome} />
          {!governedLearning ? <input type="hidden" name="micro_skill_key" value="" /> : null}
          <button type="submit" disabled={!reasonSaved || (governedLearning && !skillKey)}
            aria-label={`Confirm the outcome for ${row.observedText}`}
            title="Confirm this outcome"
            className="h-7 w-7 rounded border border-sky-200 bg-sky-50 text-sm font-semibold text-sky-800 disabled:opacity-40">✓</button>
        </form> : row.correctionOutcome ? <span className="text-xs text-[color:var(--mid)]">Confirmed</span> : null}
      </td>
    </tr>
    {detailsOpen ? <tr className="border-t border-[var(--border)] bg-[rgba(255,247,220,0.18)]">
      <td id={detailsId} colSpan={colSpan} className="px-3 py-2 text-xs leading-5 text-[color:var(--mid)]">
        <div className="grid gap-1 whitespace-pre-wrap break-words">
          <p>Original context: {originalContextExcerpt ? <>
            {originalContextExcerpt.before}<mark className="rounded bg-sky-200 px-0.5 font-semibold text-[color:var(--ink)]">
              {originalContextExcerpt.focus}
            </mark>{originalContextExcerpt.after}
          </> : "Unavailable for this correction."}</p>
          {row.childReflection ? <p>Reflection: {row.childReflection}</p> : null}
          {row.parentNote ? <p>Reviewer note: {row.parentNote}</p> : null}
          <p>The child retry is repair evidence. A learning need requires the reviewer’s confirmation of the original context.</p>
          {row.correctionOutcome && LEARNING_OUTCOMES.has(row.correctionOutcome) && governedSkill &&
            row.microSkillKey && row.microSkillKey !== "unknown" ? <div>
              <p>Use this only if the Golden Nugget write failed after the parent outcome was saved.</p>
              <form action={finaliseContextualLearningOutcome}>
                <input type="hidden" name="submission_id" value={submissionId} />
                <input type="hidden" name="writing_issue_id" value={row.sourceIds.originalWritingIssueId ?? ""} />
                <input type="hidden" name="final_classification" value={row.correctionOutcome} />
                <input type="hidden" name="micro_skill_key" value={row.microSkillKey} />
                <button className="rounded border px-3 py-1">Retry Golden Nugget link</button>
              </form>
            </div> : null}
        </div>
      </td>
    </tr> : null}
  </>;
}
