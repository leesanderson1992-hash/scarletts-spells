"use client";

import { useMemo, useState } from "react";

import { resolveSpellingCatalogReviewCase } from "./actions";

type CatalogReviewDecisionRow = {
  id: string;
  decision_type: string;
  decision_note: string | null;
  linked_micro_skill_key: string | null;
  created_at: string;
};

type MicroSkillOptionRow = {
  micro_skill_key: string;
  display_name: string;
  skill_family_key: string;
  skill_cluster_key: string | null;
};

type SkillFamilyRow = {
  skill_family_key: string;
  display_name: string;
};

type SkillClusterRow = {
  skill_family_key: string;
  skill_cluster_key: string;
  display_name: string;
};

type AdminCaseDecisionRowProps = {
  canResolveCases: boolean;
  caseId: string;
  correctWord: string;
  currentStatus: string;
  decisions: CatalogReviewDecisionRow[];
  defaultMicroSkillKey: string | null;
  evidenceCount: number;
  familyOptions: SkillFamilyRow[];
  clusterOptions: SkillClusterRow[];
  microSkillOptions: MicroSkillOptionRow[];
  microSkillOptionsUnavailable: boolean;
  originalCorrectWord: string | null;
  originalWrongWord: string | null;
  parentNote: string | null;
  representativeContext: string | null;
  sourceLabel: string;
  wrongWord: string;
};

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function formatLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function DetailsText({
  children,
  fallback,
}: {
  children: string | null;
  fallback: string;
}) {
  return children ? (
    <span className="text-[color:var(--ink)]">{children}</span>
  ) : (
    <span className="text-[color:var(--mid)]">{fallback}</span>
  );
}

function DecisionHistory({ decisions }: { decisions: CatalogReviewDecisionRow[] }) {
  if (decisions.length === 0) {
    return <span className="text-[color:var(--mid)]">No admin decisions yet</span>;
  }

  return (
    <ul className="space-y-1">
      {decisions.map((decision) => (
        <li key={decision.id}>
          <span className="font-medium">{formatLabel(decision.decision_type)}</span>{" "}
          <span className="text-[color:var(--mid)]">
            {formatDateTime(decision.created_at)}
          </span>
          {decision.linked_micro_skill_key ? (
            <span className="block text-[color:var(--mid)]">
              Linked skill: {decision.linked_micro_skill_key}
            </span>
          ) : null}
          {decision.decision_note ? (
            <span className="block text-[color:var(--mid)]">
              {decision.decision_note}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function AdminCaseDecisionRow({
  canResolveCases,
  caseId,
  correctWord,
  currentStatus,
  decisions,
  defaultMicroSkillKey,
  evidenceCount,
  familyOptions,
  clusterOptions,
  microSkillOptions,
  microSkillOptionsUnavailable,
  originalCorrectWord,
  originalWrongWord,
  parentNote,
  representativeContext,
  sourceLabel,
  wrongWord,
}: AdminCaseDecisionRowProps) {
  const defaultMicroSkill = useMemo(
    () =>
      microSkillOptions.find(
        (option) => option.micro_skill_key === defaultMicroSkillKey,
      ) ?? null,
    [defaultMicroSkillKey, microSkillOptions],
  );
  const [decisionType, setDecisionType] = useState("");
  const [familyKey, setFamilyKey] = useState(
    defaultMicroSkill?.skill_family_key ?? "",
  );
  const [clusterKey, setClusterKey] = useState(
    defaultMicroSkill?.skill_cluster_key ?? "",
  );
  const [microSkillKey, setMicroSkillKey] = useState(
    defaultMicroSkill?.micro_skill_key ?? "",
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const formId = `admin-decision-${caseId}`;
  const isLinkingSkill = decisionType === "linked_existing_skill";
  const filteredClusters = clusterOptions.filter(
    (cluster) => cluster.skill_family_key === familyKey,
  );
  const filteredMicroSkills = microSkillOptions.filter((option) => {
    if (!familyKey || option.skill_family_key !== familyKey) {
      return false;
    }

    return clusterKey ? option.skill_cluster_key === clusterKey : true;
  });

  function handleFamilyChange(nextFamilyKey: string) {
    const nextCluster =
      clusterOptions.find((cluster) => cluster.skill_family_key === nextFamilyKey)
        ?.skill_cluster_key ?? "";

    setFamilyKey(nextFamilyKey);
    setClusterKey(nextCluster);
    setMicroSkillKey("");
  }

  function handleClusterChange(nextClusterKey: string) {
    setClusterKey(nextClusterKey);
    setMicroSkillKey("");
  }

  return (
    <>
      <tr className="align-top">
        <th
          scope="row"
          className="border-t border-[var(--border)] px-3 py-3 text-sm font-medium text-[color:var(--ink)]"
        >
          <span className="block truncate" title={wrongWord}>
            {wrongWord}
          </span>
        </th>
        <td className="border-t border-[var(--border)] px-3 py-3 text-sm text-[color:var(--ink)]">
          <span className="block truncate" title={correctWord}>
            {correctWord}
          </span>
        </td>
        <td className="border-t border-[var(--border)] px-3 py-3 text-xs font-medium text-[color:var(--mid)]">
          No matching skill
        </td>
        <td className="border-t border-[var(--border)] px-3 py-3">
          {isLinkingSkill ? (
            <label className="sr-only" htmlFor={`${formId}-family`}>
              Skill Family for {wrongWord}
            </label>
          ) : null}
          {isLinkingSkill ? (
            <select
              id={`${formId}-family`}
              value={familyKey}
              onChange={(event) => handleFamilyChange(event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm text-[color:var(--ink)]"
              disabled={microSkillOptionsUnavailable}
            >
              <option value="">Choose family</option>
              {familyOptions.map((family) => (
                <option
                  key={family.skill_family_key}
                  value={family.skill_family_key}
                >
                  {family.display_name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-[color:var(--mid)]">Not needed</span>
          )}
        </td>
        <td className="border-t border-[var(--border)] px-3 py-3">
          {isLinkingSkill ? (
            <label className="sr-only" htmlFor={`${formId}-cluster`}>
              Skill Cluster for {wrongWord}
            </label>
          ) : null}
          {isLinkingSkill ? (
            <select
              id={`${formId}-cluster`}
              value={clusterKey}
              onChange={(event) => handleClusterChange(event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm text-[color:var(--ink)]"
              disabled={microSkillOptionsUnavailable || !familyKey}
            >
              <option value="">Choose cluster</option>
              {filteredClusters.map((cluster) => (
                <option
                  key={cluster.skill_cluster_key}
                  value={cluster.skill_cluster_key}
                >
                  {cluster.display_name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-[color:var(--mid)]">Not needed</span>
          )}
        </td>
        <td className="border-t border-[var(--border)] px-3 py-3">
          {isLinkingSkill ? (
            <label className="sr-only" htmlFor={`${formId}-micro-skill`}>
              Micro-skill for {wrongWord}
            </label>
          ) : null}
          {isLinkingSkill ? (
            <select
              id={`${formId}-micro-skill`}
              form={formId}
              name="micro_skill_key"
              value={microSkillKey}
              onChange={(event) => setMicroSkillKey(event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm text-[color:var(--ink)]"
              disabled={microSkillOptionsUnavailable}
              required
            >
              <option value="">Choose skill</option>
              {filteredMicroSkills.map((option) => (
                <option
                  key={option.micro_skill_key}
                  value={option.micro_skill_key}
                >
                  {option.display_name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-[color:var(--mid)]">Not needed</span>
          )}
        </td>
        <td className="border-t border-[var(--border)] px-3 py-3">
          {canResolveCases ? (
            <form
              id={formId}
              action={resolveSpellingCatalogReviewCase}
              className="flex flex-col gap-1"
            >
              <input type="hidden" name="case_id" value={caseId} />
              <label className="sr-only" htmlFor={`${formId}-decision`}>
                Decision for {wrongWord}
              </label>
              <select
                id={`${formId}-decision`}
                name="decision_type"
                value={decisionType}
                onChange={(event) => setDecisionType(event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm text-[color:var(--ink)]"
                required
              >
                <option value="" disabled>
                  Choose decision
                </option>
                <option value="linked_existing_skill">Link existing skill</option>
                <option value="new_skill_needed">New skill needed</option>
                <option value="word_level_only">Word-level only</option>
                <option value="not_a_learning_issue">Not a learning issue</option>
              </select>
            </form>
          ) : (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--mist)]/55 px-3 py-2 text-xs text-[color:var(--mid)]">
              Apply the Slice 4D.1 migration before submitting decisions.
            </div>
          )}
        </td>
        <td className="border-t border-[var(--border)] px-3 py-3">
          <div className="flex items-center gap-2">
            <button
              type="submit"
              form={formId}
              title="Submit selected decision"
              aria-label="Submit selected decision"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-base font-semibold text-emerald-800 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canResolveCases}
            >
              <CheckIcon />
            </button>
            <button
              type="button"
              title="Edit decision details"
              aria-label="Edit decision details"
              aria-expanded={detailsOpen}
              aria-controls={`${formId}-details`}
              onClick={() => setDetailsOpen((isOpen) => !isOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-base font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)] focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2"
            >
              <PencilIcon />
            </button>
          </div>
        </td>
      </tr>
      <tr>
        <td
          colSpan={8}
          className="border-t border-[var(--border)] bg-[rgba(255,247,220,0.16)] px-3 py-2"
        >
          <details
            id={`${formId}-details`}
            className="text-xs leading-5 text-[color:var(--mid)]"
            open={detailsOpen}
            onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer font-medium text-[color:var(--ink)]">
              Case details
            </summary>
            <div className="mt-2 grid gap-3 md:grid-cols-4">
              <div>
                <p className="font-semibold text-[color:var(--ink)]">Source</p>
                <span>{sourceLabel}</span>
              </div>
              <div>
                <p className="font-semibold text-[color:var(--ink)]">Evidence</p>
                <span>{evidenceCount} open cases for this spelling pair</span>
              </div>
              <div>
                <p className="font-semibold text-[color:var(--ink)]">Status</p>
                <span>{formatLabel(currentStatus)}</span>
              </div>
              <div>
                <p className="font-semibold text-[color:var(--ink)]">
                  Latest original pair
                </p>
                <span>
                  {originalWrongWord ?? "unknown"} -&gt;{" "}
                  {originalCorrectWord ?? "unknown"}
                </span>
              </div>
              <div className="md:col-span-2">
                <p className="font-semibold text-[color:var(--ink)]">Context</p>
                <DetailsText fallback="No context saved">
                  {representativeContext}
                </DetailsText>
              </div>
              <div className="md:col-span-2">
                <p className="font-semibold text-[color:var(--ink)]">Parent note</p>
                <DetailsText fallback="No parent note">{parentNote}</DetailsText>
              </div>
              <div className="md:col-span-2">
                <label
                  className="font-semibold text-[color:var(--ink)]"
                  htmlFor={`${formId}-note`}
                >
                  Decision note
                </label>
                <input
                  id={`${formId}-note`}
                  form={formId}
                  name="decision_note"
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm text-[color:var(--ink)]"
                  maxLength={500}
                  placeholder="Optional internal note"
                  type="text"
                />
              </div>
              <div className="md:col-span-2">
                <p className="font-semibold text-[color:var(--ink)]">
                  Decision history
                </p>
                <DecisionHistory decisions={decisions} />
              </div>
            </div>
          </details>
        </td>
      </tr>
    </>
  );
}
