"use client";

import { useState } from "react";

import { curateSpellingCanonicalRecommendation } from "./actions";

type AdminRecommendationRowProps = {
  childId: string;
  correctWord: string;
  createdAt: string;
  currentStatus: string;
  microSkillDisplayName: string | null;
  microSkillKey: string;
  originalCorrectWord: string | null;
  originalWrongWord: string | null;
  parentUserId: string;
  recommendationId: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByAdminEmail: string | null;
  sourceLabel: string;
  sourceRowType: string;
  targetRecommendationId: string | null;
  wrongWord: string;
};

const TARGET_DECISIONS = new Set(["duplicate", "merged", "superseded"]);

function formatLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not reviewed";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

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

function DetailsIcon() {
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

export function AdminRecommendationRow({
  childId,
  correctWord,
  createdAt,
  currentStatus,
  microSkillDisplayName,
  microSkillKey,
  originalCorrectWord,
  originalWrongWord,
  parentUserId,
  recommendationId,
  reviewNote,
  reviewedAt,
  reviewedByAdminEmail,
  sourceLabel,
  sourceRowType,
  targetRecommendationId,
  wrongWord,
}: AdminRecommendationRowProps) {
  const [decision, setDecision] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const formId = `canonical-recommendation-${recommendationId}`;
  const needsTarget = TARGET_DECISIONS.has(decision);
  const isOpen =
    currentStatus === "recommended" || currentStatus === "pending_admin_review";

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
        <td className="border-t border-[var(--border)] px-3 py-3 text-xs text-[color:var(--mid)]">
          <span className="block font-semibold text-[color:var(--ink)]">
            {microSkillDisplayName ?? microSkillKey}
          </span>
          <span className="block truncate" title={microSkillKey}>
            {microSkillKey}
          </span>
        </td>
        <td className="border-t border-[var(--border)] px-3 py-3 text-xs font-medium text-[color:var(--mid)]">
          {formatLabel(currentStatus)}
        </td>
        <td className="border-t border-[var(--border)] px-3 py-3 text-xs text-[color:var(--mid)]">
          <span className="block">{formatLabel(sourceRowType)}</span>
          <span className="block">{sourceLabel}</span>
        </td>
        <td className="border-t border-[var(--border)] px-3 py-3">
          {isOpen ? (
            <form
              id={formId}
              action={curateSpellingCanonicalRecommendation}
              className="flex flex-col gap-1"
            >
              <input
                type="hidden"
                name="recommendation_id"
                value={recommendationId}
              />
              <label className="sr-only" htmlFor={`${formId}-decision`}>
                Decision for {wrongWord}
              </label>
              <select
                id={`${formId}-decision`}
                name="decision"
                value={decision}
                onChange={(event) => setDecision(event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm text-[color:var(--ink)]"
                required
              >
                <option value="" disabled>
                  Choose decision
                </option>
                <option value="accepted">Accept</option>
                <option value="rejected">Reject</option>
                <option value="duplicate">Mark duplicate</option>
                <option value="merged">Mark merged</option>
                <option value="superseded">Mark superseded</option>
              </select>
              <p className="text-[11px] leading-4 text-[color:var(--mid)]">
                Accept records admin curation evidence only; resolver adoption
                remains future.
              </p>
            </form>
          ) : (
            <span className="text-xs text-[color:var(--mid)]">
              Already reviewed
            </span>
          )}
        </td>
        <td className="border-t border-[var(--border)] px-3 py-3">
          <div className="flex items-center gap-2">
            <button
              type="submit"
              form={formId}
              title="Submit recommendation decision"
              aria-label={`Submit recommendation decision for ${wrongWord}`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-base font-semibold text-emerald-800 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isOpen}
            >
              <CheckIcon />
            </button>
            <button
              type="button"
              title="Edit recommendation details"
              aria-label={`Edit recommendation details for ${wrongWord}`}
              aria-expanded={detailsOpen}
              aria-controls={`${formId}-details`}
              onClick={() => setDetailsOpen((isOpen) => !isOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-base font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)] focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2"
            >
              <DetailsIcon />
            </button>
          </div>
        </td>
      </tr>
      <tr>
        <td
          colSpan={7}
          className="border-t border-[var(--border)] bg-[rgba(255,247,220,0.16)] px-3 py-2"
        >
          <details
            id={`${formId}-details`}
            className="text-xs leading-5 text-[color:var(--mid)]"
            open={detailsOpen}
            onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer font-medium text-[color:var(--ink)]">
              Recommendation details
            </summary>
            <div className="mt-2 grid gap-3 md:grid-cols-4">
              <div>
                <p className="font-semibold text-[color:var(--ink)]">Original pair</p>
                <span>
                  {originalWrongWord ?? "unknown"} -&gt;{" "}
                  {originalCorrectWord ?? "unknown"}
                </span>
              </div>
              <div>
                <p className="font-semibold text-[color:var(--ink)]">Parent</p>
                <span>{parentUserId}</span>
              </div>
              <div>
                <p className="font-semibold text-[color:var(--ink)]">Child</p>
                <span>{childId}</span>
              </div>
              <div>
                <p className="font-semibold text-[color:var(--ink)]">Created</p>
                <span>{formatDateTime(createdAt)}</span>
              </div>
              <div>
                <p className="font-semibold text-[color:var(--ink)]">Reviewed</p>
                <span>{formatDateTime(reviewedAt)}</span>
              </div>
              <div>
                <p className="font-semibold text-[color:var(--ink)]">Reviewer</p>
                <span>{reviewedByAdminEmail ?? "None"}</span>
              </div>
              <div>
                <p className="font-semibold text-[color:var(--ink)]">Target</p>
                <span>{targetRecommendationId ?? "None"}</span>
              </div>
              <div>
                <p className="font-semibold text-[color:var(--ink)]">Review note</p>
                <span>{reviewNote ?? "None"}</span>
              </div>
              {isOpen ? (
                <>
                  <div className="md:col-span-2">
                    <label
                      className="font-semibold text-[color:var(--ink)]"
                      htmlFor={`${formId}-target`}
                    >
                      Target recommendation id
                    </label>
                    <input
                      id={`${formId}-target`}
                      form={formId}
                      name="target_recommendation_id"
                      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm text-[color:var(--ink)]"
                      disabled={!needsTarget}
                      placeholder={
                        needsTarget
                          ? "Required for duplicate, merged, or superseded"
                          : "Not needed for accept/reject"
                      }
                      type="text"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label
                      className="font-semibold text-[color:var(--ink)]"
                      htmlFor={`${formId}-note`}
                    >
                      Admin review note
                    </label>
                    <input
                      id={`${formId}-note`}
                      form={formId}
                      name="review_note"
                      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm text-[color:var(--ink)]"
                      maxLength={600}
                      placeholder="Optional internal note"
                      type="text"
                    />
                  </div>
                </>
              ) : null}
            </div>
          </details>
        </td>
      </tr>
    </>
  );
}
