"use client";

import { useState } from "react";

import type { ReviewWorkCandidateCaptureMicroSkillOption } from "@/lib/writing-engine/persistence/learning-items";
import type { UnifiedSpellingReviewItem } from "@/lib/writing-engine/persistence/unified-spelling-review-items";
import {
  getWritingIssueFinalClassificationLabel,
  WRITING_ISSUE_FINAL_CLASSIFICATIONS,
} from "@/lib/writing-practice/types";

import {
  captureSpellingCatalogReviewCase,
  captureSubmissionSpellingCandidateMapping,
  finaliseWritingIssueClassification,
  promoteParentLocalCandidateMapping,
  recordReviewWorkVerificationAction,
  revertParentLocalCandidateMapping,
} from "./actions";

type UnifiedSpellingReviewTableProps = {
  rows: UnifiedSpellingReviewItem[];
  options: ReviewWorkCandidateCaptureMicroSkillOption[];
  submissionId: string;
  redirectPath: string;
};

function isMeaningfulSkill(value: string | null) {
  return Boolean(value && value.trim().length > 0 && value.toLowerCase() !== "unknown");
}

function sourceMarker(row: UnifiedSpellingReviewItem) {
  if (row.source === "returned_correction" && row.provenance.parentAuthored) {
    return {
      label: "P·R",
      title: "Parent-added returned correction",
    };
  }

  if (row.source === "returned_correction") {
    return { label: "R", title: "Returned correction" };
  }

  if (row.source === "parent_added_missed_word") {
    return { label: "P", title: "Parent-added missed word" };
  }

  return { label: "E", title: "Engine suggestion" };
}

function statusLabel(row: UnifiedSpellingReviewItem) {
  if (row.categorisationStatus === "sent_to_admin" || row.state === "sent_to_admin") {
    return "Admin";
  }

  if (
    row.categorisationStatus === "parent_local_pending" ||
    row.categorisationStatus === "parent_local_promoted" ||
    row.state === "locally_promoted"
  ) {
    return "Local";
  }

  if (row.categorisationStatus === "unsupported_returned_correction_route") {
    return "Blocked";
  }

  if (row.state === "child_responded") {
    return "Tried";
  }

  if (row.state === "not_an_issue") {
    return "Done";
  }

  if (row.correctionOutcome === "checking_only") {
    return "Fixed";
  }

  if (
    row.correctionOutcome === "fragile_knowledge" ||
    row.correctionOutcome === "concept_gap" ||
    row.correctionOutcome === "transfer_failure"
  ) {
    return "Issue";
  }

  if (row.state === "resolved") {
    return "Done";
  }

  if (row.state === "categorisation_needed") {
    return "Blocked";
  }

  return "New";
}

function routeText(row: UnifiedSpellingReviewItem) {
  switch (row.categorisationStatus) {
    case "categorised":
      return "Skill route is categorised.";
    case "categorisation_needed":
      return "Choose a skill, send to admin, or mark as not an issue.";
    case "sent_to_admin":
      return "Sent to admin/catalog review.";
    case "parent_local_pending":
      return "Parent-local skill route captured; promotion is still pending.";
    case "parent_local_promoted":
      return "Parent-local skill route is promoted for this child.";
    case "unsupported_returned_correction_route":
      return "Returned-correction categorisation is deferred until a safe route record exists.";
    case "not_applicable":
      return "No skill route is needed for this row.";
  }
}

function findOption(
  options: ReviewWorkCandidateCaptureMicroSkillOption[],
  microSkillKey: string | null,
) {
  if (!microSkillKey) {
    return null;
  }

  return options.find((option) => option.microSkillKey === microSkillKey) ?? null;
}

function UnifiedSpellingReviewTableRow({
  row,
  options,
  submissionId,
  redirectPath,
}: {
  row: UnifiedSpellingReviewItem;
  options: ReviewWorkCandidateCaptureMicroSkillOption[];
  submissionId: string;
  redirectPath: string;
}) {
  const marker = sourceMarker(row);
  const initialSkill =
    isMeaningfulSkill(row.verifiedMicroSkillKey)
      ? row.verifiedMicroSkillKey
      : isMeaningfulSkill(row.microSkillKey)
        ? row.microSkillKey
        : isMeaningfulSkill(row.suggestedMicroSkillKey)
          ? row.suggestedMicroSkillKey
          : "";
  const [microSkillKey, setMicroSkillKey] = useState(initialSkill ?? "");
  const sourceMisspellingId = row.sourceIds.misspellingInstanceId;
  const currentRouteIsOpen =
    row.source !== "returned_correction" &&
    Boolean(sourceMisspellingId) &&
    !row.sourceIds.parentVerificationId &&
    !row.sourceIds.catalogReviewCaseId &&
    !row.sourceIds.candidateMappingId &&
    row.state !== "not_an_issue" &&
    row.state !== "resolved" &&
    row.state !== "sent_to_admin" &&
    row.state !== "locally_promoted";
  const suggestedSkillIsUsable = isMeaningfulSkill(row.suggestedMicroSkillKey);
  const selectedSuggested =
    suggestedSkillIsUsable && microSkillKey === row.suggestedMicroSkillKey;
  const canConfirmSuggested = currentRouteIsOpen && selectedSuggested;
  const canSaveOverride =
    currentRouteIsOpen && microSkillKey.length > 0 && !selectedSuggested;
  const canSendToAdmin = currentRouteIsOpen && Boolean(submissionId);
  const canFinalClassify =
    row.source === "returned_correction" &&
    row.state === "child_responded" &&
    !row.correctionOutcome &&
    Boolean(row.sourceIds.originalWritingIssueId);
  const skillDisabled = row.source === "returned_correction" || !currentRouteIsOpen;
  const selectedSkillOption = findOption(options, initialSkill ?? null);

  return (
    <tr className="border-t border-[var(--border)] align-middle">
      <td className="max-w-[9rem] px-3 py-2 text-sm font-semibold text-[color:var(--ink)]">
        <span className="block truncate" title={row.observedText}>
          {row.observedText}
        </span>
      </td>
      <td className="max-w-[9rem] px-3 py-2 text-sm text-[color:var(--ink)]">
        <span className="block truncate" title={row.expectedCorrection ?? "Unknown"}>
          {row.expectedCorrection ?? "Unknown"}
        </span>
      </td>
      <td className="max-w-[9rem] px-3 py-2 text-sm text-[color:var(--ink)]">
        <span className="block truncate" title={row.latestChildAttempt ?? ""}>
          {row.latestChildAttempt ?? ""}
        </span>
      </td>
      <td className="px-2 py-2 text-center">
        <span
          title={marker.title}
          aria-label={marker.title}
          className="inline-flex min-w-6 items-center justify-center rounded border border-[var(--border)] bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[color:var(--ink)]"
        >
          {marker.label}
        </span>
      </td>
      <td className="px-3 py-2 text-sm font-medium text-[color:var(--ink)]">
        {statusLabel(row)}
      </td>
      <td className="min-w-44 px-3 py-2">
        <select
          value={microSkillKey}
          onChange={(event) => setMicroSkillKey(event.target.value)}
          disabled={skillDisabled || options.length === 0}
          title={
            row.source === "returned_correction"
              ? "Returned correction skill routing is displayed from existing bridge records only."
              : "Choose a spelling micro-skill."
          }
          aria-label={`Skill for ${row.observedText}`}
          className="w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-xs text-[color:var(--ink)] disabled:bg-[rgba(255,247,220,0.35)] disabled:text-[color:var(--mid)]"
        >
          <option value="">{row.source === "returned_correction" ? "Unknown" : "Choose..."}</option>
          {options.map((option) => (
            <option key={option.microSkillKey} value={option.microSkillKey}>
              {option.displayName}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          {canConfirmSuggested ? (
            <form action={recordReviewWorkVerificationAction}>
              <input type="hidden" name="redirect_path" value={redirectPath} />
              <input type="hidden" name="misspelling_instance_id" value={sourceMisspellingId ?? ""} />
              <input type="hidden" name="task_submission_id" value={submissionId} />
              <input type="hidden" name="writing_sample_id" value={row.sourceIds.writingSampleId ?? ""} />
              <button
                type="submit"
                name="decision"
                value="accepted"
                title="Confirm suggested skill"
                aria-label={`Confirm suggested skill for ${row.observedText}`}
                className="h-7 w-7 rounded border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800"
              >
                ✓
              </button>
            </form>
          ) : null}

          {canSaveOverride && suggestedSkillIsUsable ? (
            <form action={recordReviewWorkVerificationAction}>
              <input type="hidden" name="redirect_path" value={redirectPath} />
              <input type="hidden" name="misspelling_instance_id" value={sourceMisspellingId ?? ""} />
              <input type="hidden" name="task_submission_id" value={submissionId} />
              <input type="hidden" name="writing_sample_id" value={row.sourceIds.writingSampleId ?? ""} />
              <input type="hidden" name="decision" value="overridden" />
              <input type="hidden" name="verified_micro_skill_key" value={microSkillKey} />
              <button
                type="submit"
                title="Override suggested skill"
                aria-label={`Override suggested skill for ${row.observedText}`}
                className="h-7 w-7 rounded border border-sky-200 bg-sky-50 text-sm font-semibold text-sky-800"
              >
                !
              </button>
            </form>
          ) : null}

          {canSaveOverride && !suggestedSkillIsUsable ? (
            <form action={captureSubmissionSpellingCandidateMapping}>
              <input type="hidden" name="submission_id" value={submissionId} />
              <input type="hidden" name="redirect_path" value={redirectPath} />
              <input type="hidden" name="misspelling_instance_id" value={sourceMisspellingId ?? ""} />
              <input type="hidden" name="micro_skill_key" value={microSkillKey} />
              <button
                type="submit"
                title="Assign selected skill for parent-local review"
                aria-label={`Assign selected skill for ${row.observedText}`}
                className="h-7 w-7 rounded border border-sky-200 bg-sky-50 text-sm font-semibold text-sky-800"
              >
                !
              </button>
            </form>
          ) : null}

          {currentRouteIsOpen ? (
            <form action={recordReviewWorkVerificationAction}>
              <input type="hidden" name="redirect_path" value={redirectPath} />
              <input type="hidden" name="misspelling_instance_id" value={sourceMisspellingId ?? ""} />
              <input type="hidden" name="task_submission_id" value={submissionId} />
              <input type="hidden" name="writing_sample_id" value={row.sourceIds.writingSampleId ?? ""} />
              <button
                type="submit"
                name="decision"
                value="false_positive"
                title="Reject as not an issue"
                aria-label={`Reject ${row.observedText} as not an issue`}
                className="h-7 w-7 rounded border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-800"
              >
                ✕
              </button>
            </form>
          ) : null}

          {canSendToAdmin ? (
            <form action={captureSpellingCatalogReviewCase}>
              <input type="hidden" name="submission_id" value={submissionId} />
              <input type="hidden" name="redirect_path" value={redirectPath} />
              <input type="hidden" name="misspelling_instance_id" value={sourceMisspellingId ?? ""} />
              <button
                type="submit"
                title="No matching skill. Raise to admin."
                aria-label={`No matching skill for ${row.observedText}. Raise to admin.`}
                className="h-7 w-7 rounded border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-800"
              >
                ⚑
              </button>
            </form>
          ) : null}

          {canFinalClassify ? (
            <form action={finaliseWritingIssueClassification} className="flex items-center gap-1">
              <input type="hidden" name="writing_issue_id" value={row.sourceIds.originalWritingIssueId ?? ""} />
              <input type="hidden" name="redirect_path" value={redirectPath} />
              <select
                name="final_classification"
                required
                defaultValue=""
                aria-label={`Outcome for ${row.observedText}`}
                className="h-7 max-w-28 rounded border border-[var(--border)] bg-white px-1 text-xs text-[color:var(--ink)]"
              >
                <option value="" disabled>
                  Outcome
                </option>
                {WRITING_ISSUE_FINAL_CLASSIFICATIONS.map((classification) => (
                  <option key={classification} value={classification}>
                    {getWritingIssueFinalClassificationLabel(classification)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                title="Save correction outcome"
                aria-label={`Save correction outcome for ${row.observedText}`}
                className="h-7 w-7 rounded border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800"
              >
                ✓
              </button>
            </form>
          ) : null}

          {row.source !== "returned_correction" &&
          row.sourceIds.candidateMappingId &&
          row.categorisationStatus === "parent_local_pending" ? (
            <form action={promoteParentLocalCandidateMapping}>
              <input type="hidden" name="candidate_mapping_id" value={row.sourceIds.candidateMappingId} />
              <input type="hidden" name="submission_id" value={submissionId} />
              <input type="hidden" name="redirect_path" value={redirectPath} />
              <button
                type="submit"
                title="Promote parent-local skill route"
                aria-label={`Promote parent-local skill route for ${row.observedText}`}
                className="h-7 w-7 rounded border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-800"
              >
                ↑
              </button>
            </form>
          ) : null}

          {row.source !== "returned_correction" &&
          row.sourceIds.candidateMappingId &&
          row.categorisationStatus === "parent_local_promoted" ? (
            <form action={revertParentLocalCandidateMapping}>
              <input type="hidden" name="candidate_mapping_id" value={row.sourceIds.candidateMappingId} />
              <input type="hidden" name="submission_id" value={submissionId} />
              <input type="hidden" name="redirect_path" value={redirectPath} />
              <button
                type="submit"
                title="Revert parent-local skill route to pending"
                aria-label={`Revert parent-local skill route for ${row.observedText}`}
                className="h-7 w-7 rounded border border-[var(--border)] bg-white text-xs font-semibold text-[color:var(--ink)]"
              >
                ↩
              </button>
            </form>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2 text-sm text-[color:var(--mid)]">
        <details>
          <summary className="cursor-pointer text-xs font-medium text-[color:var(--ink)]">
            Details
          </summary>
          <div className="mt-2 grid gap-1 text-xs leading-5">
            <p>{routeText(row)}</p>
            {row.parentNote ? <p>Parent note: {row.parentNote}</p> : null}
            {row.childReflection ? <p>Reflection: {row.childReflection}</p> : null}
            {selectedSkillOption ? <p>Skill: {selectedSkillOption.displayName}</p> : null}
            {row.correctionOutcome ? (
              <p>Outcome: {getWritingIssueFinalClassificationLabel(row.correctionOutcome)}</p>
            ) : null}
            <p>Original issue: {row.sourceIds.originalWritingIssueId ?? "None"}</p>
          </div>
        </details>
      </td>
    </tr>
  );
}

export function UnifiedSpellingReviewTable({
  rows,
  options,
  submissionId,
  redirectPath,
}: UnifiedSpellingReviewTableProps) {
  if (rows.length === 0) {
    return (
      <section className="brand-card rounded-3xl p-4 md:p-5">
        <p className="brand-eyebrow">Spelling review</p>
        <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
          No spelling review items
        </h2>
      </section>
    );
  }

  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="brand-eyebrow">Spelling review</p>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
            Unified spelling table
          </h2>
        </div>
        <span className="rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[color:var(--ink)]">
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
        <table className="min-w-[980px] w-full border-collapse text-left">
          <thead>
            <tr className="bg-[rgba(255,247,220,0.45)] text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--mid)]">
              <th className="px-3 py-2">Word</th>
              <th className="px-3 py-2">Correction</th>
              <th className="px-3 py-2">Retry</th>
              <th className="px-2 py-2 text-center">Src</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Skill</th>
              <th className="px-3 py-2">Actions</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <UnifiedSpellingReviewTableRow
                key={row.id}
                row={row}
                options={options}
                submissionId={submissionId}
                redirectPath={redirectPath}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
