"use client";

import { useState } from "react";

import type { ReviewWorkCandidateCaptureMicroSkillOption } from "@/lib/writing-engine/persistence/learning-items";
import type { UnifiedSpellingReviewItem } from "@/lib/writing-engine/persistence/unified-spelling-review-items";
import { governedContextFamily } from "@/lib/writing-engine/whole-writing/context-advisory-family";
import { finaliseContextualLearningOutcome } from "./actions";

const SKILL_BY_FAMILY = {
  THERE_THEIR_THEYRE: "D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE",
  TO_TOO_TWO: "D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO",
  YOUR_YOURE: "D4_HOM_CONTRACTION_POSSESSIVE_YOUR_YOURE",
  ITS_ITS: "D4_HOM_CONTRACTION_POSSESSIVE_ITS_ITS",
} as const;

const LEARNING_OUTCOMES = new Set(["concept_gap", "fragile_knowledge", "transfer_failure"]);

export function ContextualReturnedCorrectionRow({ row, options, submissionId, colSpan }: {
  row: UnifiedSpellingReviewItem;
  options: ReviewWorkCandidateCaptureMicroSkillOption[];
  submissionId: string;
  colSpan: number;
}) {
  const [outcome, setOutcome] = useState(row.draftFinalClassification ?? "");
  const [familyKey, setFamilyKey] = useState("");
  const [clusterKey, setClusterKey] = useState("");
  const [skillKey, setSkillKey] = useState("");
  const contextFamily = governedContextFamily(row.observedText);
  const governedSkill = contextFamily ? SKILL_BY_FAMILY[contextFamily] : null;
  const allowedOptions = options.filter((item) => item.microSkillKey === governedSkill);
  const families = [...new Map(allowedOptions.map((item) => [item.skillFamilyKey, item.skillFamilyDisplayName])).entries()];
  const clusters = [...new Map(allowedOptions.filter((item) => item.skillFamilyKey === familyKey)
    .map((item) => [item.skillClusterKey ?? "", item.skillClusterDisplayName ?? "Function words"])).entries()];
  const skills = allowedOptions.filter((item) => item.skillFamilyKey === familyKey && (item.skillClusterKey ?? "") === clusterKey);
  const editable = row.state === "child_responded" && !row.correctionOutcome && Boolean(row.sourceIds.originalWritingIssueId);
  const learning = LEARNING_OUTCOMES.has(outcome);

  return <tr className="border-t border-[var(--border)] bg-sky-50/50">
    <td colSpan={colSpan} className="px-3 py-3">
      <div className="grid gap-2 text-sm">
        <p className="font-semibold text-[color:var(--ink)]">Contextual retry: {row.observedText} → {row.expectedCorrection ?? "unknown"}</p>
        <p>Child tried: {row.latestChildAttempt ?? "No attempt recorded"}</p>
        {row.correctionOutcome ? <p>Parent outcome: {row.correctionOutcome.replaceAll("_", " ")}. The retry remains repair-only; ADLE lesson availability depends on governed curriculum readiness.</p> : null}
        {row.correctionOutcome && LEARNING_OUTCOMES.has(row.correctionOutcome) && row.microSkillKey ? (
          <details className="text-xs">
            <summary className="cursor-pointer">Learning record details</summary>
            <p>Use this only if the Golden Nugget write failed after the parent outcome was saved.</p>
            <form action={finaliseContextualLearningOutcome}>
              <input type="hidden" name="submission_id" value={submissionId} />
              <input type="hidden" name="writing_issue_id" value={row.sourceIds.originalWritingIssueId ?? ""} />
              <input type="hidden" name="final_classification" value={row.correctionOutcome} />
              <input type="hidden" name="micro_skill_key" value={row.microSkillKey} />
              <button className="rounded border px-3 py-1">Retry Golden Nugget link</button>
            </form>
          </details>
        ) : null}
        {editable ? <form action={finaliseContextualLearningOutcome} className="grid gap-2 md:grid-cols-4">
          <input type="hidden" name="submission_id" value={submissionId} />
          <input type="hidden" name="writing_issue_id" value={row.sourceIds.originalWritingIssueId ?? ""} />
          <label className="grid gap-1">Parent outcome
            <select name="final_classification" required value={outcome} onChange={(event) => {
              setOutcome(event.target.value); setFamilyKey(""); setClusterKey(""); setSkillKey("");
            }} className="rounded border px-2 py-1">
              <option value="">Choose outcome</option>
              <option value="concept_gap">Concept gap</option>
              <option value="fragile_knowledge">Fragile knowledge</option>
              <option value="transfer_failure">Transfer failure</option>
              <option value="checking_only">Checking only</option>
              <option value="not_an_issue">Not an issue</option>
            </select>
          </label>
          {learning ? <>
            <label className="grid gap-1">Family
              <select required value={familyKey} onChange={(event) => {
                setFamilyKey(event.target.value); setClusterKey(""); setSkillKey("");
              }} className="rounded border px-2 py-1">
                <option value="">Choose family</option>
                {families.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
            </label>
            <label className="grid gap-1">Cluster
              <select required value={clusterKey} onChange={(event) => {
                setClusterKey(event.target.value); setSkillKey("");
              }} className="rounded border px-2 py-1">
                <option value="">Choose cluster</option>
                {clusters.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
            </label>
            <label className="grid gap-1">Microskill
              <select name="micro_skill_key" required value={skillKey} onChange={(event) => setSkillKey(event.target.value)} className="rounded border px-2 py-1">
                <option value="">Choose microskill</option>
                {skills.map((item) => <option key={item.microSkillKey} value={item.microSkillKey}>{item.displayName}</option>)}
              </select>
            </label>
          </> : <input type="hidden" name="micro_skill_key" value="" />}
          <button className="w-fit rounded border border-sky-300 bg-white px-3 py-1 font-semibold text-sky-900">Confirm parent outcome</button>
          {learning && allowedOptions.length === 0 ? <p className="text-amber-900">The governed microskill is not active and assignable. This learning outcome cannot be finalised yet.</p> : null}
        </form> : null}
      </div>
    </td>
  </tr>;
}
