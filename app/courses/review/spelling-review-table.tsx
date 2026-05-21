"use client";

import { useMemo, useState } from "react";

import type { ReviewWorkCandidateCaptureMicroSkillOption } from "@/lib/writing-engine/persistence/learning-items";

import {
  captureSubmissionSpellingCandidateMapping,
  promoteParentLocalCandidateMapping,
  recordReviewWorkVerificationAction,
  revertParentLocalCandidateMapping,
} from "./actions";

type CandidateMappingStatus = "pending_parent_promotion" | "parent_local_promoted";

export type SpellingReviewTablePendingMapping = {
  id: string;
  microSkillKey: string;
  candidateStatus: CandidateMappingStatus;
};

export type SpellingReviewTableRow = {
  id: string;
  wrongWord: string;
  correctWord: string | null;
  misspellingInstanceId: string;
  taskSubmissionId: string | null;
  writingSampleId: string | null;
  suggestedMicroSkillKey: string | null;
  allowsAccepted: boolean;
  recordedDecision: string | null;
  canCaptureCandidateMapping: boolean;
  pendingCandidateMapping: SpellingReviewTablePendingMapping | null;
};

type SpellingReviewTableProps = {
  rows: SpellingReviewTableRow[];
  options: ReviewWorkCandidateCaptureMicroSkillOption[];
  submissionId?: string;
  redirectPath: string;
  pendingCandidateMappingLabel: string;
  promotedCandidateMappingLabel: string;
  pendingMappingStatusCopy: string;
  pendingMappingAccessibilityCopy: string;
  promotedMappingStatusCopy: string;
  promoteCandidateMappingActionLabel: string;
  revertCandidateMappingActionLabel: string;
};

type FamilyOption = {
  key: string;
  label: string;
};

type ClusterOption = {
  key: string;
  label: string;
};

function formatCatalogKeyFallbackLabel(value: string | null) {
  if (!value) {
    return "Unclustered";
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildFamilies(options: ReviewWorkCandidateCaptureMicroSkillOption[]) {
  const familiesByKey = new Map<string, FamilyOption>();

  options.forEach((option) => {
    if (!option.skillFamilyKey) {
      return;
    }

    familiesByKey.set(option.skillFamilyKey, {
      key: option.skillFamilyKey,
      label:
        option.skillFamilyDisplayName ||
        formatCatalogKeyFallbackLabel(option.skillFamilyKey),
    });
  });

  return Array.from(familiesByKey.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

function buildClusters(
  options: ReviewWorkCandidateCaptureMicroSkillOption[],
  familyKey: string,
) {
  const clustersByKey = new Map<string, ClusterOption>();

  options
    .filter((option) => option.skillFamilyKey === familyKey)
    .forEach((option) => {
      const key = option.skillClusterKey ?? "";

      clustersByKey.set(key, {
        key,
        label:
          option.skillClusterDisplayName ||
          formatCatalogKeyFallbackLabel(option.skillClusterKey),
      });
    });

  return Array.from(clustersByKey.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

function findOptionByMicroSkillKey(
  options: ReviewWorkCandidateCaptureMicroSkillOption[],
  microSkillKey: string | null,
) {
  if (!microSkillKey) {
    return null;
  }

  return options.find((option) => option.microSkillKey === microSkillKey) ?? null;
}

function SpellingReviewTableRowView({
  row,
  options,
  families,
  submissionId,
  redirectPath,
  pendingCandidateMappingLabel,
  promotedCandidateMappingLabel,
  pendingMappingStatusCopy,
  pendingMappingAccessibilityCopy,
  promotedMappingStatusCopy,
  promoteCandidateMappingActionLabel,
  revertCandidateMappingActionLabel,
}: {
  row: SpellingReviewTableRow;
  options: ReviewWorkCandidateCaptureMicroSkillOption[];
  families: FamilyOption[];
  submissionId?: string;
  redirectPath: string;
  pendingCandidateMappingLabel: string;
  promotedCandidateMappingLabel: string;
  pendingMappingStatusCopy: string;
  pendingMappingAccessibilityCopy: string;
  promotedMappingStatusCopy: string;
  promoteCandidateMappingActionLabel: string;
  revertCandidateMappingActionLabel: string;
}) {
  const suggestedOption = findOptionByMicroSkillKey(
    options,
    row.suggestedMicroSkillKey,
  );
  const pendingMappingOption = findOptionByMicroSkillKey(
    options,
    row.pendingCandidateMapping?.microSkillKey ?? null,
  );
  const firstFamily = suggestedOption?.skillFamilyKey ?? families[0]?.key ?? "";
  const [familyKey, setFamilyKey] = useState(firstFamily);
  const clusters = useMemo(
    () => buildClusters(options, familyKey),
    [familyKey, options],
  );
  const firstCluster =
    suggestedOption?.skillFamilyKey === familyKey
      ? suggestedOption.skillClusterKey ?? ""
      : clusters[0]?.key ?? "";
  const [clusterKey, setClusterKey] = useState(firstCluster);
  const filteredMicroSkills = useMemo(
    () =>
      options
        .filter(
          (option) =>
            option.skillFamilyKey === familyKey &&
            (option.skillClusterKey ?? "") === clusterKey,
        )
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    [clusterKey, familyKey, options],
  );
  const initialMicroSkillKey =
    suggestedOption &&
    suggestedOption.skillFamilyKey === familyKey &&
    (suggestedOption.skillClusterKey ?? "") === clusterKey
      ? suggestedOption.microSkillKey
      : "";
  const [microSkillKey, setMicroSkillKey] = useState(initialMicroSkillKey);
  const isSelectedSuggested =
    Boolean(row.suggestedMicroSkillKey) &&
    microSkillKey === row.suggestedMicroSkillKey;
  const verificationDecision =
    row.allowsAccepted && isSelectedSuggested ? "accepted" : "overridden";
  const shouldSubmitOverride =
    row.allowsAccepted && microSkillKey.length > 0 && !isSelectedSuggested;
  const canApprove =
    microSkillKey.length > 0 &&
    !row.recordedDecision &&
    !row.pendingCandidateMapping &&
    (row.allowsAccepted || row.canCaptureCandidateMapping);

  function handleFamilyChange(nextFamilyKey: string) {
    const nextClusters = buildClusters(options, nextFamilyKey);
    setFamilyKey(nextFamilyKey);
    setClusterKey(nextClusters[0]?.key ?? "");
    setMicroSkillKey("");
  }

  function handleClusterChange(nextClusterKey: string) {
    setClusterKey(nextClusterKey);
    setMicroSkillKey("");
  }

  return (
    <tr className="align-top">
      <td className="border-t border-[var(--border)] px-3 py-3 text-sm font-medium text-[color:var(--ink)]">
        {row.wrongWord}
      </td>
      <td className="border-t border-[var(--border)] px-3 py-3 text-sm text-[color:var(--ink)]">
        {row.correctWord ?? "Not provided"}
      </td>
      <td className="border-t border-[var(--border)] px-3 py-3">
        <select
          value={familyKey}
          onChange={(event) => handleFamilyChange(event.target.value)}
          aria-label={`Skill Family for ${row.wrongWord}`}
          className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm text-[color:var(--ink)]"
          disabled={Boolean(row.recordedDecision || row.pendingCandidateMapping)}
        >
          {families.map((family) => (
            <option key={family.key} value={family.key}>
              {family.label}
            </option>
          ))}
        </select>
      </td>
      <td className="border-t border-[var(--border)] px-3 py-3">
        <select
          value={clusterKey}
          onChange={(event) => handleClusterChange(event.target.value)}
          aria-label={`Skill Cluster for ${row.wrongWord}`}
          className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm text-[color:var(--ink)]"
          disabled={Boolean(row.recordedDecision || row.pendingCandidateMapping)}
        >
          {clusters.map((cluster) => (
            <option key={cluster.key || "unclustered"} value={cluster.key}>
              {cluster.label}
            </option>
          ))}
        </select>
      </td>
      <td className="border-t border-[var(--border)] px-3 py-3">
        <select
          value={microSkillKey}
          onChange={(event) => setMicroSkillKey(event.target.value)}
          aria-label={`Micro-skill for ${row.wrongWord}`}
          className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm text-[color:var(--ink)]"
          disabled={Boolean(row.recordedDecision || row.pendingCandidateMapping)}
        >
          <option value="">Choose micro-skill</option>
          {filteredMicroSkills.map((option) => (
            <option key={option.microSkillKey} value={option.microSkillKey}>
              {option.displayName}
            </option>
          ))}
        </select>
        {row.pendingCandidateMapping ? (
          <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
            {row.pendingCandidateMapping.candidateStatus === "parent_local_promoted"
              ? promotedCandidateMappingLabel
              : pendingCandidateMappingLabel}
            : {pendingMappingOption?.displayName ?? row.pendingCandidateMapping.microSkillKey}
          </p>
        ) : null}
        {row.pendingCandidateMapping ? (
          <p
            aria-label={pendingMappingAccessibilityCopy}
            className="mt-1 text-xs leading-5 text-emerald-800"
          >
            {row.pendingCandidateMapping.candidateStatus === "parent_local_promoted"
              ? promotedMappingStatusCopy
              : pendingMappingStatusCopy}
          </p>
        ) : null}
        {row.recordedDecision ? (
          <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-800">
            Recorded: {row.recordedDecision.replaceAll("_", " ")}
          </p>
        ) : null}
      </td>
      <td className="border-t border-[var(--border)] px-3 py-3">
        <div className="flex flex-wrap gap-2">
          {!row.recordedDecision && !row.pendingCandidateMapping ? (
            <>
              <form action={recordReviewWorkVerificationAction}>
                <input type="hidden" name="redirect_path" value={redirectPath} />
                <input
                  type="hidden"
                  name="misspelling_instance_id"
                  value={row.misspellingInstanceId}
                />
                <input
                  type="hidden"
                  name="task_submission_id"
                  value={row.taskSubmissionId ?? ""}
                />
                <input
                  type="hidden"
                  name="writing_sample_id"
                  value={row.writingSampleId ?? ""}
                />
                <button
                  type="submit"
                  name="decision"
                  value="false_positive"
                  title="This was not actually wrong."
                  aria-label="This was not actually wrong."
                  className="h-9 w-9 rounded-full border border-[var(--border)] bg-white text-sm font-semibold text-[color:var(--ink)]"
                >
                  X
                </button>
              </form>
              <form action={recordReviewWorkVerificationAction}>
                <input type="hidden" name="redirect_path" value={redirectPath} />
                <input
                  type="hidden"
                  name="misspelling_instance_id"
                  value={row.misspellingInstanceId}
                />
                <input
                  type="hidden"
                  name="task_submission_id"
                  value={row.taskSubmissionId ?? ""}
                />
                <input
                  type="hidden"
                  name="writing_sample_id"
                  value={row.writingSampleId ?? ""}
                />
                <button
                  type="submit"
                  name="decision"
                  value="not_a_learning_issue"
                  title="This is not something to practise."
                  aria-label="This is not something to practise."
                  className="h-9 w-9 rounded-full border border-[var(--border)] bg-white text-sm font-semibold text-[color:var(--ink)]"
                >
                  !
                </button>
              </form>
              {row.allowsAccepted ? (
                <form action={recordReviewWorkVerificationAction}>
                  <input type="hidden" name="redirect_path" value={redirectPath} />
                  <input
                    type="hidden"
                    name="misspelling_instance_id"
                    value={row.misspellingInstanceId}
                  />
                  <input
                    type="hidden"
                    name="task_submission_id"
                    value={row.taskSubmissionId ?? ""}
                  />
                  <input
                    type="hidden"
                    name="writing_sample_id"
                    value={row.writingSampleId ?? ""}
                  />
                  <input type="hidden" name="decision" value={verificationDecision} />
                  <input
                    type="hidden"
                    name="verified_micro_skill_key"
                    value={shouldSubmitOverride ? microSkillKey : ""}
                  />
                  <button
                    type="submit"
                    disabled={!canApprove}
                    title="Approve this correction and skill."
                    aria-label="Approve this correction and skill."
                    className="h-9 w-9 rounded-full border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ✓
                  </button>
                </form>
              ) : (
                <form action={captureSubmissionSpellingCandidateMapping}>
                  <input type="hidden" name="submission_id" value={submissionId ?? ""} />
                  <input type="hidden" name="redirect_path" value={redirectPath} />
                  <input
                    type="hidden"
                    name="misspelling_instance_id"
                    value={row.misspellingInstanceId}
                  />
                  <input type="hidden" name="micro_skill_key" value={microSkillKey} />
                  <button
                    type="submit"
                    disabled={!canApprove}
                    title="Approve this correction and skill."
                    aria-label="Approve this correction and skill."
                    className="h-9 w-9 rounded-full border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ✓
                  </button>
                </form>
              )}
            </>
          ) : null}
          {row.pendingCandidateMapping && submissionId ? (
            row.pendingCandidateMapping.candidateStatus === "parent_local_promoted" ? (
              <form action={revertParentLocalCandidateMapping}>
                <input
                  type="hidden"
                  name="candidate_mapping_id"
                  value={row.pendingCandidateMapping.id}
                />
                <input type="hidden" name="submission_id" value={submissionId} />
                <input type="hidden" name="redirect_path" value={redirectPath} />
                <button type="submit" className="brand-secondary-btn">
                  {revertCandidateMappingActionLabel}
                </button>
              </form>
            ) : (
              <form action={promoteParentLocalCandidateMapping}>
                <input
                  type="hidden"
                  name="candidate_mapping_id"
                  value={row.pendingCandidateMapping.id}
                />
                <input type="hidden" name="submission_id" value={submissionId} />
                <input type="hidden" name="redirect_path" value={redirectPath} />
                <button type="submit" className="brand-secondary-btn">
                  {promoteCandidateMappingActionLabel}
                </button>
              </form>
            )
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function SpellingReviewTable({
  rows,
  options,
  submissionId,
  redirectPath,
  pendingCandidateMappingLabel,
  promotedCandidateMappingLabel,
  pendingMappingStatusCopy,
  pendingMappingAccessibilityCopy,
  promotedMappingStatusCopy,
  promoteCandidateMappingActionLabel,
  revertCandidateMappingActionLabel,
}: SpellingReviewTableProps) {
  const families = useMemo(() => buildFamilies(options), [options]);

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[rgba(255,247,220,0.18)] px-4 py-4 text-sm leading-6 text-[color:var(--mid)]">
        No suggested spelling issues are visible here yet.
      </div>
    );
  }

  if (options.length === 0 || families.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
        Candidate capture is blocked until assignable spelling micro-skills are
        available.
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
      <table className="min-w-[920px] w-full border-collapse">
        <thead>
          <tr className="bg-[rgba(255,247,220,0.45)] text-left text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--mid)]">
            <th className="px-3 py-3">Wrong Word</th>
            <th className="px-3 py-3">Correct Word</th>
            <th className="px-3 py-3">Skill Family</th>
            <th className="px-3 py-3">Skill Cluster</th>
            <th className="px-3 py-3">Micro-skill</th>
            <th className="px-3 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SpellingReviewTableRowView
              key={row.id}
              row={row}
              options={options}
              families={families}
              submissionId={submissionId}
              redirectPath={redirectPath}
              pendingCandidateMappingLabel={pendingCandidateMappingLabel}
              promotedCandidateMappingLabel={promotedCandidateMappingLabel}
              pendingMappingStatusCopy={pendingMappingStatusCopy}
              pendingMappingAccessibilityCopy={pendingMappingAccessibilityCopy}
              promotedMappingStatusCopy={promotedMappingStatusCopy}
              promoteCandidateMappingActionLabel={
                promoteCandidateMappingActionLabel
              }
              revertCandidateMappingActionLabel={
                revertCandidateMappingActionLabel
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
