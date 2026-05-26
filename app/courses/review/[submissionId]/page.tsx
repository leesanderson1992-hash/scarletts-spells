import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { formatCourseDate, getActiveChildrenForUser } from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";
import {
  getReviewWorkCandidateCaptureMicroSkillProvider,
  getReviewWorkDerivedTemplateMetadataByMicroSkillKeys,
} from "@/lib/writing-engine/persistence/learning-items";
import {
  loadReturnedCorrectionReviewItemsForSubmission,
  type ReturnedCorrectionReviewItem,
} from "@/lib/writing-engine/persistence/returned-correction-review";
import {
  getWritingIssueFinalClassificationLabel,
  WRITING_ISSUE_FINAL_CLASSIFICATIONS,
} from "@/lib/writing-practice/types";
import type {
  ReviewWritingIssueProjection,
  ReviewWritingIssueSuggestionDetailProjection,
} from "@/lib/writing-practice/types";
import {
  ManualSampleParentAuthoredIssuesSection,
  ManualSampleParentIssueSection,
  type ReviewWritingIssueWithSourceSuggestionRow,
} from "../manual-sample-sections";
import { getManualReviewSampleStatus } from "../manual-sample-review-utils";
import { SuggestedIssuesPanel } from "../suggested-issues-panel";
import {
  buildCanonicalSuggestedMicroSkillKeysByMisspellingId,
  hasCanonicalMicroSkillKey,
} from "../canonical-submission-spelling";

import {
  addMissedWordToSubmissionReview,
  approveSubmissionReview,
  captureSpellingCatalogReviewCase,
  finaliseWritingIssueClassification,
  returnSubmissionToChild,
} from "../actions";
import {
  buildSuggestedIssuePanelModel,
  extractReviewableLessonFields,
  getSubmissionStatusLabel,
  isParentAuthoredMisspellingRow,
  normaliseWordForLookup,
  parseReviewWorkEntryId,
  parseSubmissionReview,
} from "../review-utils";

type CourseReviewDetailPageProps = {
  params: Promise<{ submissionId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    saved?: string;
    error?: string;
  }>;
};

type MisspellingReviewRow = {
  id: string;
  misspelled_word: string;
  corrected_word: string;
  suggested_word: string | null;
  error_type:
    | "Phonic"
    | "Pattern/rule"
    | "Morphology"
    | "Homophone"
    | "Irregular/tricky memory word"
    | "Careless performance error"
    | null;
  secondary_error_type:
    | "Phonic"
    | "Pattern/rule"
    | "Morphology"
    | "Homophone"
    | "Irregular/tricky memory word"
    | "Careless performance error"
    | null;
  is_false_positive: boolean | null;
  notes: string | null;
  position_start: number | null;
  position_end: number | null;
};

type WritingIssueSuggestionRow = ReviewWritingIssueSuggestionDetailProjection;
type WritingIssueRow = ReviewWritingIssueProjection;
type CandidateMappingRow = {
  id: string;
  source_misspelling_instance_id: string | null;
  micro_skill_key: string;
  candidate_status: "pending_parent_promotion" | "parent_local_promoted";
  promotion_scope: "parent_local";
};
type CatalogReviewCaseRow = {
  id: string;
  source_misspelling_instance_id: string;
  case_status: "open";
};

async function buildScopedSuggestedMicroSkillKeysByMisspellingId(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  parentUserId: string;
  childId: string;
  misspellings: MisspellingReviewRow[];
  writingIssueSuggestions: WritingIssueSuggestionRow[];
  sourceType: "lesson_submission" | "manual_writing_sample";
}) {
  if (input.sourceType !== "lesson_submission" || input.misspellings.length === 0) {
    return {} as Record<string, string>;
  }

  const suggestedMicroSkillKeysByMisspellingId =
    await buildCanonicalSuggestedMicroSkillKeysByMisspellingId({
      supabase: input.supabase,
      misspellings: input.misspellings,
      writingIssueSuggestions: input.writingIssueSuggestions,
      sourceType: input.sourceType,
    });
  const normalizedMisspellings = Array.from(
    new Set(
      input.misspellings
        .map((misspelling) => normaliseWordForLookup(misspelling.misspelled_word))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const { data: promotedCandidateRows } =
    normalizedMisspellings.length > 0
      ? await input.supabase
          .from("parent_verified_spelling_candidate_mappings")
          .select(
            "misspelling_normalized, correct_spelling_normalized, micro_skill_key, candidate_status, promotion_scope",
          )
          .eq("parent_user_id", input.parentUserId)
          .eq("child_id", input.childId)
          .eq("promotion_scope", "parent_local")
          .eq("candidate_status", "parent_local_promoted")
          .in("misspelling_normalized", normalizedMisspellings)
      : { data: [] as Array<Record<string, unknown>> };
  const unresolvedMisspellings = input.misspellings.filter(
    (misspelling) => !suggestedMicroSkillKeysByMisspellingId[misspelling.id],
  );

  unresolvedMisspellings.forEach((misspelling) => {
    const normalizedMisspelling = normaliseWordForLookup(misspelling.misspelled_word);
    const normalizedCorrectSpelling = normaliseWordForLookup(
      misspelling.suggested_word ?? misspelling.corrected_word,
    );

    if (!normalizedMisspelling || !normalizedCorrectSpelling) {
      return;
    }

    const exactLocalMatches = ((promotedCandidateRows ?? []) as Array<{
      misspelling_normalized?: string;
      correct_spelling_normalized?: string;
      micro_skill_key?: string;
    }>).filter(
      (mapping) =>
        mapping.misspelling_normalized === normalizedMisspelling &&
        mapping.correct_spelling_normalized === normalizedCorrectSpelling &&
        typeof mapping.micro_skill_key === "string" &&
        mapping.micro_skill_key.trim().length > 0,
    );
    const distinctLocalMicroSkillKeys = Array.from(
      new Set(exactLocalMatches.map((mapping) => mapping.micro_skill_key as string)),
    );

    if (distinctLocalMicroSkillKeys.length === 1) {
      suggestedMicroSkillKeysByMisspellingId[misspelling.id] = distinctLocalMicroSkillKeys[0];
    }
  });

  return suggestedMicroSkillKeysByMisspellingId;
}

async function buildDerivedTemplateMetadataByMicroSkillKey(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  sourceType: "lesson_submission" | "manual_writing_sample";
  misspellings: MisspellingReviewRow[];
  writingIssueSuggestions: WritingIssueSuggestionRow[];
  parentVerifications: Array<{
    suggested_micro_skill_key: string | null;
    verified_micro_skill_key: string | null;
  }>;
  canonicalSuggestedMicroSkillKeysByMisspellingId?: Record<string, string>;
}) {
  if (input.sourceType !== "lesson_submission") {
    return {} as Awaited<
      ReturnType<typeof getReviewWorkDerivedTemplateMetadataByMicroSkillKeys>
    >;
  }

  const microSkillKeys = new Set<string>();

  input.misspellings.forEach((misspelling) => {
    const matchedSuggestion = input.writingIssueSuggestions.find(
      (suggestion) => suggestion.misspelling_instance_id === misspelling.id,
    );
    const matchedSuggestedMicroSkillKey = matchedSuggestion?.suggested_micro_skill_key ?? null;
    const matchedSuggestionMicroSkillKey = hasCanonicalMicroSkillKey(
      matchedSuggestedMicroSkillKey,
    )
      ? matchedSuggestedMicroSkillKey
      : input.canonicalSuggestedMicroSkillKeysByMisspellingId?.[misspelling.id] ?? null;

    if (hasCanonicalMicroSkillKey(matchedSuggestionMicroSkillKey)) {
      microSkillKeys.add(matchedSuggestionMicroSkillKey);
    }
  });

  input.parentVerifications.forEach((verification) => {
    const suggestedMicroSkillKey = verification.suggested_micro_skill_key;
    const verifiedMicroSkillKey = verification.verified_micro_skill_key;

    if (hasCanonicalMicroSkillKey(suggestedMicroSkillKey)) {
      microSkillKeys.add(suggestedMicroSkillKey);
    }

    if (hasCanonicalMicroSkillKey(verifiedMicroSkillKey)) {
      microSkillKeys.add(verifiedMicroSkillKey);
    }
  });

  return getReviewWorkDerivedTemplateMetadataByMicroSkillKeys({
    supabase: input.supabase,
    microSkillKeys: [...microSkillKeys],
  });
}

function buildPendingCandidateMappingByMisspellingId(
  rows: CandidateMappingRow[],
) {
  return new Map(
    rows
      .filter(
        (row): row is CandidateMappingRow & { source_misspelling_instance_id: string } =>
          typeof row.source_misspelling_instance_id === "string" &&
          row.source_misspelling_instance_id.length > 0,
      )
      .map((row) => [row.source_misspelling_instance_id, row] as const),
  );
}

function buildOpenCatalogReviewCaseByMisspellingId(
  rows: CatalogReviewCaseRow[],
) {
  return new Map(
    rows
      .filter(
        (row): row is CatalogReviewCaseRow =>
          typeof row.source_misspelling_instance_id === "string" &&
          row.source_misspelling_instance_id.length > 0 &&
          row.case_status === "open",
      )
      .map((row) => [row.source_misspelling_instance_id, row] as const),
  );
}

function ParentAddedMissedWordsSection(props: {
  rows: MisspellingReviewRow[];
  submissionId: string;
  redirectPath: string;
  pendingCandidateMappingsByMisspellingId: Map<string, CandidateMappingRow>;
  openCatalogReviewCasesByMisspellingId: Map<string, CatalogReviewCaseRow>;
  catalogReviewCaseCaptureAvailable: boolean;
  durableIssueMisspellingIds: Set<string>;
}) {
  if (props.rows.length === 0) {
    return null;
  }

  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="brand-eyebrow">Parent-added missed words</p>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
            Saved parent review input
          </h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
            These lesson-only rows were added by the parent during review. They stay
            separate from Suggested Issues engine output.
          </p>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
          {props.rows.length} saved
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {props.rows.map((row) => {
          const openCatalogReviewCase =
            props.openCatalogReviewCasesByMisspellingId.get(row.id) ?? null;
          const pendingCandidateMapping =
            props.pendingCandidateMappingsByMisspellingId.get(row.id) ?? null;
          const hasDurableIssue = props.durableIssueMisspellingIds.has(row.id);
          const canSendToCatalogReview =
            props.catalogReviewCaseCaptureAvailable &&
            !openCatalogReviewCase &&
            !pendingCandidateMapping &&
            !hasDurableIssue;

          return (
            <div
              key={row.id}
              className="rounded-2xl border border-[var(--border)] bg-white px-4 py-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  Parent added
                </span>
                {row.error_type ? (
                  <span className="rounded-full border border-[var(--border)] bg-[rgba(255,247,220,0.35)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                    {row.error_type}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm font-medium text-[color:var(--ink)]">
                {row.misspelled_word} {"->"} {row.corrected_word}
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                Saved as parent-authored review input. This row does not represent
                engine-suggested candidate truth or unresolved engine output.
              </p>
              {openCatalogReviewCase ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  Sent to catalog review
                </p>
              ) : null}
              {canSendToCatalogReview ? (
                <form
                  action={captureSpellingCatalogReviewCase}
                  className="mt-3"
                >
                  <input type="hidden" name="submission_id" value={props.submissionId} />
                  <input type="hidden" name="redirect_path" value={props.redirectPath} />
                  <input
                    type="hidden"
                    name="misspelling_instance_id"
                    value={row.id}
                  />
                  <button
                    type="submit"
                    title="Send this spelling case to catalog review."
                    aria-label={`No matching skill for ${row.misspelled_word}. Send this spelling case to catalog review.`}
                    className="min-h-9 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                  >
                    No matching skill
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReturnedCorrectionsSection(props: {
  items: ReturnedCorrectionReviewItem[];
  redirectPath: string;
}) {
  if (props.items.length === 0) {
    return null;
  }

  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="brand-eyebrow">Returned corrections</p>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
            Child correction responses
          </h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
            These are responses to issues previously sent back to the child. They
            are linked to the original returned writing issue, not regenerated
            Suggested Issues for this new submission.
          </p>
        </div>
        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
          {props.items.length} response{props.items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {props.items.map((item) => {
          const canFinalClassify =
            item.issueStatus === "child_responded" && item.finalClassification === null;
          const expectedText =
            item.approvedReplacement?.trim() ||
            item.suggestedReplacement?.trim() ||
            null;

          return (
            <div
              key={`${item.originalWritingIssueId}:${item.attemptId}`}
              className="rounded-2xl border border-[var(--border)] bg-white px-4 py-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                  Child response
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  {item.sourceLabel}
                </span>
                <span className="rounded-full border border-[var(--border)] bg-[rgba(255,247,220,0.35)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                  {item.issueStatus.replaceAll("_", " ")}
                </span>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.28)] px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
                    Original target
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                    {item.observedText?.trim() || "Returned writing issue"}
                    {expectedText ? ` -> ${expectedText}` : ""}
                  </p>
                  {item.contextText?.trim() ? (
                    <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                      {item.contextText}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-[color:var(--mid)]">
                    Original issue: {item.originalWritingIssueId}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-emerald-800">
                    Child tried
                  </p>
                  <p className="mt-2 text-sm font-semibold text-emerald-950">
                    {item.childAttemptedCorrection?.trim() || "No correction text entered"}
                  </p>
                  <p className="mt-2 text-sm text-emerald-900">
                    Reflection: {item.childReflection}
                  </p>
                  {item.childAttemptNotes?.trim() ? (
                    <p className="mt-2 text-sm leading-6 text-emerald-900">
                      {item.childAttemptNotes}
                    </p>
                  ) : null}
                </div>
              </div>

              {item.parentReviewNote?.trim() ? (
                <p className="mt-3 rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.18)] px-3 py-2 text-sm leading-6 text-[color:var(--ink)]">
                  {item.parentReviewNote}
                </p>
              ) : null}

              {item.finalClassification ? (
                <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  Final classification:{" "}
                  {getWritingIssueFinalClassificationLabel(item.finalClassification)}
                </p>
              ) : canFinalClassify ? (
                <form
                  action={finaliseWritingIssueClassification}
                  className="mt-3 grid gap-3 rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.18)] px-3 py-3 md:grid-cols-[1fr_auto]"
                >
                  <input
                    type="hidden"
                    name="writing_issue_id"
                    value={item.originalWritingIssueId}
                  />
                  <input type="hidden" name="redirect_path" value={props.redirectPath} />
                  <label className="grid gap-1 text-sm text-[color:var(--ink)]">
                    <span className="font-medium">Final classification</span>
                    <select
                      name="final_classification"
                      className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                      defaultValue=""
                      required
                    >
                      <option value="" disabled>
                        Choose outcome
                      </option>
                      {WRITING_ISSUE_FINAL_CLASSIFICATIONS.map((classification) => (
                        <option key={classification} value={classification}>
                          {getWritingIssueFinalClassificationLabel(classification)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-end">
                    <button className="brand-secondary-btn justify-center" type="submit">
                      Save classification
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LessonParentActionsSection(props: {
  submissionId: string;
  redirectPath: string;
  parentReviewNote: string | null;
  reviewableFields: ReturnType<typeof extractReviewableLessonFields>;
  unresolvedCount: number;
  showZeroSuggestionGuidance: boolean;
}) {
  const approvalBlocked = props.unresolvedCount > 0;

  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <div>
        <p className="brand-eyebrow">Parent review actions</p>
        <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
          Lesson-only action surface
        </h2>
        <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
          Approval and send-back controls belong to lesson submissions only. The
          canonical Suggested Issues panel above remains the primary review
          surface for existing shared review truth.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        These controls are available on lesson detail only. Send-back uses the
        existing return flow, and approval stays blocked until shared review
        truth shows no unresolved suggestions.
      </div>

      {props.showZeroSuggestionGuidance ? (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
          No suggestions found. Please check the work and mark it complete when you are
          satisfied.
        </div>
      ) : null}

      <form
        action={addMissedWordToSubmissionReview}
        className="mt-4 grid gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-4"
      >
        <input type="hidden" name="submission_id" value={props.submissionId} />
        <input type="hidden" name="redirect_path" value={props.redirectPath} />
        <div>
          <p className="text-sm font-medium text-[color:var(--ink)]">Add missed word</p>
          <p className="mt-1 text-sm leading-6 text-[color:var(--mid)]">
            Save a missed word the parent spotted in this lesson. It will appear as
            parent-authored review input, not as Suggested Issues engine output.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-[color:var(--ink)]">
            <span className="font-medium">Word child wrote</span>
            <input
              name="misspelled_word"
              type="text"
              className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
              placeholder="eg becos"
            />
          </label>
          <label className="grid gap-1 text-sm text-[color:var(--ink)]">
            <span className="font-medium">Correct spelling</span>
            <input
              name="corrected_word"
              type="text"
              className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
              placeholder="eg because"
            />
          </label>
        </div>
        <div>
          <button className="brand-secondary-btn justify-center" type="submit">
            Add missed word
          </button>
        </div>
      </form>

      <div className="mt-4 grid gap-3">
        <form action={approveSubmissionReview} className="grid gap-2">
          <input type="hidden" name="submission_id" value={props.submissionId} />
          <input type="hidden" name="redirect_path" value={props.redirectPath} />
          <button
            className="brand-primary-btn disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={approvalBlocked}
          >
            Approve / mark complete
          </button>
        </form>

        {approvalBlocked ? (
          <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
            Resolve all suggested issues before approving this lesson.
          </p>
        ) : (
          <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
            Approval is available once shared review truth shows no unresolved
            suggestions.
          </p>
        )}

        <form action={returnSubmissionToChild} className="grid gap-3">
          <input type="hidden" name="submission_id" value={props.submissionId} />
          <input type="hidden" name="redirect_path" value={props.redirectPath} />
          <label className="grid gap-1 text-sm text-[color:var(--ink)]">
            <span className="font-medium">Parent note</span>
            <textarea
              name="parent_review_note"
              rows={3}
              defaultValue={props.parentReviewNote ?? ""}
              className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
              placeholder="Tell her what to fix before trying again."
            />
          </label>

          {props.reviewableFields.length > 0 ? (
            <div className="grid gap-3">
              <div>
                <p className="text-sm font-medium text-[color:var(--ink)]">
                  Structured lesson feedback
                </p>
                <p className="mt-1 text-sm leading-6 text-[color:var(--mid)]">
                  These lesson-only feedback inputs reuse the existing action
                  field names so answer-specific guidance posts through the
                  existing send-back contract.
                </p>
              </div>

              {props.reviewableFields.map((field) => (
                <div
                  key={field.key}
                  className="rounded-2xl border border-[var(--border)] bg-white px-4 py-4"
                >
                  <p className="text-sm font-semibold text-[color:var(--ink)]">
                    {field.label}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-[rgba(255,247,220,0.35)] px-3 py-2 text-sm leading-6 text-[color:var(--ink)]">
                    {field.value}
                  </p>
                  <label className="mt-3 grid gap-1 text-sm text-[color:var(--ink)]">
                    <span className="font-medium">Feedback for this answer</span>
                    <textarea
                      name={`field_feedback__${field.key}`}
                      rows={3}
                      defaultValue={field.feedback}
                      className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                      placeholder="Tell her exactly what to improve in this answer."
                    />
                  </label>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3">
            <button className="brand-secondary-btn justify-center" type="submit">
              Send back to child
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function renderHighlightedText(text: string, misspellings: MisspellingReviewRow[]) {
  const validRanges = [...misspellings]
    .filter(
      (row) =>
        row.position_start !== null &&
        row.position_end !== null &&
        row.position_start >= 0 &&
        row.position_end > row.position_start,
    )
    .sort((left, right) => (left.position_start ?? 0) - (right.position_start ?? 0));

  if (validRanges.length === 0) {
    return text;
  }

  const segments: ReactNode[] = [];
  let cursor = 0;

  validRanges.forEach((row) => {
    const start = row.position_start ?? 0;
    const end = row.position_end ?? 0;

    if (start < cursor || start >= text.length) {
      return;
    }

    if (cursor < start) {
      segments.push(text.slice(cursor, start));
    }

    segments.push(
      <mark
        key={row.id}
        className="rounded-md bg-amber-100 px-1 py-0.5 text-[color:var(--ink)] ring-1 ring-amber-200"
        title={`${row.misspelled_word} -> ${row.corrected_word}`}
      >
        {text.slice(start, Math.min(end, text.length))}
      </mark>,
    );

    cursor = Math.min(end, text.length);
  });

  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  return segments;
}

export default async function CourseReviewDetailPage({
  params,
  searchParams,
}: CourseReviewDetailPageProps) {
  noStore();
  const { submissionId: reviewEntryId } = await params;
  const reviewEntry = parseReviewWorkEntryId(reviewEntryId);
  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode ?? "parent");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const children = await getActiveChildrenForUser(supabase, user.id);
  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );

  if (!selectedChild) {
    notFound();
  }

  const reviewPath = buildScopedPath("/courses/review", selectedChild.id, mode);

  if (reviewEntry.sourceType === "manual_writing_sample") {
    const { data: manualSample } = await supabase
      .from("writing_samples")
      .select(
        "id, title, source, sample_text, written_at, created_at, child_id, review_completed_at",
      )
      .eq("id", reviewEntry.id)
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id)
      .is("task_submission_id", null)
      .maybeSingle();

    if (!manualSample) {
      notFound();
    }

    const [
      { data: misspellingRows, error: misspellingError },
      { data: writingIssueRows, error: writingIssueError },
      { data: writingIssueSuggestionRows, error: writingIssueSuggestionError },
      { data: parentVerificationRows, error: parentVerificationError },
    ] = await Promise.all([
      supabase
        .from("misspelling_instances")
        .select(
          "id, misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, is_false_positive, notes, position_start, position_end",
        )
        .eq("writing_sample_id", manualSample.id)
        .eq("parent_user_id", user.id)
        .order("position_start", { ascending: true }),
      supabase
        .from("writing_issues")
        .select(
          "id, task_submission_id, source_misspelling_instance_id, source_suggestion_id, issue_status, final_classification, observed_text, approved_replacement, micro_skill_key, parent_review_note, parent_marked_at",
        )
        .eq("writing_sample_id", manualSample.id)
        .eq("parent_user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("writing_issue_suggestions")
        .select(
          "id, task_submission_id, misspelling_instance_id, suggestion_status, source_type, observed_text, suggested_replacement, suggested_micro_skill_key, notes, metadata",
        )
        .eq("writing_sample_id", manualSample.id)
        .eq("parent_user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("parent_verifications")
        .select(
          "id, source_entity_id, decision, suggested_category_code, suggested_micro_skill_key, verified_micro_skill_key, verification_notes, metadata, verified_at",
        )
        .eq("writing_sample_id", manualSample.id)
        .eq("parent_user_id", user.id)
        .order("verified_at", { ascending: false }),
    ]);

    const misspellings = (misspellingRows ?? []) as MisspellingReviewRow[];
    const writingIssues = (writingIssueRows ?? []) as ReviewWritingIssueWithSourceSuggestionRow[];
    const writingIssueSuggestions =
      (writingIssueSuggestionRows ?? []) as WritingIssueSuggestionRow[];
    const parentManualSuggestionIds = new Set(
      writingIssueSuggestions
        .filter((suggestion) => suggestion.source_type === "parent_manual")
        .map((suggestion) => suggestion.id),
    );
    const parentAuthoredManualIssues = writingIssues.filter(
      (issue) =>
        typeof issue.source_suggestion_id === "string" &&
        parentManualSuggestionIds.has(issue.source_suggestion_id),
    );
    const sharedDurableIssues = writingIssues.filter(
      (issue) =>
        !(
          typeof issue.source_suggestion_id === "string" &&
          parentManualSuggestionIds.has(issue.source_suggestion_id)
        ),
    );
    const parentVerifications = (parentVerificationRows ?? []) as Parameters<
      typeof buildSuggestedIssuePanelModel
    >[0]["parentVerifications"];
    const panelModel = buildSuggestedIssuePanelModel({
      sourceType: "manual_writing_sample",
      misspellings,
      writingIssues: sharedDurableIssues,
      writingIssueSuggestions,
      parentVerifications,
      taskSubmissionId: null,
      writingSampleId: manualSample.id,
      derivedTemplateMetadataByMicroSkillKey: {},
      hasCanonicalWritingSource: true,
      analysisAttempted: true,
      isReviewed: false,
      hasLoadError:
        Boolean(misspellingError) ||
        Boolean(writingIssueError) ||
        Boolean(writingIssueSuggestionError) ||
        Boolean(parentVerificationError),
    });
    const manualSampleDate = manualSample.written_at ?? manualSample.created_at;
    const manualSampleQueueStatus = getManualReviewSampleStatus({
      reviewCompletedAt:
        typeof manualSample.review_completed_at === "string"
          ? manualSample.review_completed_at
          : null,
      unresolvedMisspellingCount: panelModel.summary.unresolvedCount,
    });

    return (
      <AppShell
        currentPath="/courses/review"
        mode={mode}
        activeChildId={selectedChild.id}
        availableChildren={children}
        userEmail={user.email}
      >
        <section className="grid gap-4">
          <div className="brand-card rounded-3xl p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Review Work</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                  {manualSample.title?.trim() || "Manual writing sample"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                  Entered through {manualSample.source?.trim() || "Add Writing Sample"} ·{" "}
                  {formatCourseDate(manualSampleDate.slice(0, 10))}
                </p>
              </div>
              <Link href={reviewPath} className="brand-secondary-btn">
                Back to review list
              </Link>
            </div>
            {resolvedSearchParams?.saved ? (
              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {resolvedSearchParams.saved}
              </p>
            ) : null}
            {resolvedSearchParams?.error ? (
              <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {resolvedSearchParams.error}
              </p>
            ) : null}
          </div>

          <section className="brand-card overflow-hidden rounded-3xl p-0">
            <table className="min-w-full border-collapse text-left text-[13px]">
              <tbody>
                <tr className="border-b border-[var(--border)]">
                  <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    Review status
                  </th>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${manualSampleQueueStatus.tone}`}
                    >
                      {manualSampleQueueStatus.label}
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    Source type
                  </th>
                  <td className="px-4 py-3 text-[color:var(--ink)]">
                    Manual writing sample
                  </td>
                </tr>
                <tr>
                  <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    Panel mode
                  </th>
                  <td className="px-4 py-3 text-[color:var(--ink)]">
                    {panelModel.panelModeLabel}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <div className="brand-card rounded-3xl p-4 md:p-5">
            <p className="brand-eyebrow">Original writing</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
              {panelModel.originalWritingDescription}
            </p>
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
              <p className="whitespace-pre-wrap text-sm leading-7 text-[color:var(--ink)]">
                {renderHighlightedText(manualSample.sample_text, misspellings)}
              </p>
            </div>
          </div>

          <ManualSampleParentIssueSection
            writingSampleId={manualSample.id}
            redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
            isCompleted={Boolean(manualSample.review_completed_at)}
            completedAt={
              typeof manualSample.review_completed_at === "string"
                ? manualSample.review_completed_at
                : null
            }
          />

          <ManualSampleParentAuthoredIssuesSection rows={parentAuthoredManualIssues} />

        <SuggestedIssuesPanel
          model={panelModel}
          submissionId={reviewEntryId}
          redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
          candidateCaptureMicroSkillProvider={{
            status: "blocked",
            reason: "no_options_available",
          }}
          pendingCandidateMappingsByMisspellingId={new Map()}
        />
        </section>
      </AppShell>
    );
  }

  const submissionId = reviewEntry.id;
  const { data: submission } = await supabase
    .from("task_submissions")
    .select("id, task_id, course_id, child_id, submission_text, submitted_at, parent_review_status, parent_review_note, parent_reviewed_at")
    .eq("id", submissionId)
    .eq("parent_user_id", user.id)
    .eq("child_id", selectedChild.id)
    .maybeSingle();

  if (!submission) {
    notFound();
  }

  const [
    { data: task },
    { data: course },
    { data: linkedSample },
    { data: draftRow },
    { data: writingIssueRows, error: writingIssueError },
    { data: writingIssueSuggestionRows, error: writingIssueSuggestionError },
    { data: parentVerificationRows, error: parentVerificationError },
    { data: pendingCandidateMappingRows, error: pendingCandidateMappingError },
    { data: openCatalogReviewCaseRows, error: openCatalogReviewCaseError },
    returnedCorrectionReviewItems,
  ] = await Promise.all([
    supabase
      .from("course_tasks")
      .select("id, title, module_id, lesson_schema")
      .eq("id", submission.task_id)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("courses")
      .select("id, title")
      .eq("id", submission.course_id)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("writing_samples")
      .select("id, sample_text")
      .eq("task_submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("task_submission_drafts")
      .select("draft_payload")
      .eq("task_id", submission.task_id)
      .eq("child_id", submission.child_id)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("writing_issues")
      .select(
        "id, task_submission_id, source_misspelling_instance_id, issue_status, final_classification, observed_text, approved_replacement, micro_skill_key, parent_review_note, parent_marked_at",
      )
      .eq("task_submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("writing_issue_suggestions")
      .select(
        "id, task_submission_id, misspelling_instance_id, suggestion_status, source_type, observed_text, suggested_replacement, suggested_micro_skill_key, notes, metadata",
      )
      .eq("task_submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("parent_verifications")
      .select(
        "id, source_entity_id, decision, suggested_category_code, suggested_micro_skill_key, verified_micro_skill_key, verification_notes, metadata, verified_at",
      )
      .eq("task_submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .order("verified_at", { ascending: false }),
    supabase
      .from("parent_verified_spelling_candidate_mappings")
      .select(
        "id, source_misspelling_instance_id, micro_skill_key, candidate_status, promotion_scope",
      )
      .eq("task_submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .in("candidate_status", ["pending_parent_promotion", "parent_local_promoted"])
      .order("created_at", { ascending: false }),
    supabase
      .from("spelling_catalog_review_cases")
      .select("id, source_misspelling_instance_id, case_status")
      .eq("task_submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .eq("child_id", submission.child_id)
      .eq("case_status", "open")
      .order("created_at", { ascending: false }),
    loadReturnedCorrectionReviewItemsForSubmission({
      supabase,
      submissionId: submission.id,
      parentUserId: user.id,
      childId: submission.child_id,
    }),
  ]);

  const { data: module } = task?.module_id
    ? await supabase
        .from("course_modules")
        .select("id, title")
        .eq("id", task.module_id)
        .eq("parent_user_id", user.id)
        .maybeSingle()
    : { data: null };

  const misspellingQuery = linkedSample
    ? await supabase
        .from("misspelling_instances")
        .select(
          "id, misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, is_false_positive, notes, position_start, position_end",
        )
        .eq("writing_sample_id", linkedSample.id)
        .eq("parent_user_id", user.id)
        .order("position_start", { ascending: true })
    : { data: [], error: null };

  const misspellings = (misspellingQuery.data ?? []) as MisspellingReviewRow[];
  const parentAddedMissedWords = misspellings.filter((row) => isParentAuthoredMisspellingRow(row));
  const engineMisspellings = misspellings.filter((row) => !isParentAuthoredMisspellingRow(row));
  const writingIssues = (writingIssueRows ?? []) as WritingIssueRow[];
  const durableIssueMisspellingIds = new Set(
    writingIssues
      .map((issue) => issue.source_misspelling_instance_id)
      .filter((value): value is string => typeof value === "string"),
  );
  const writingIssueSuggestions = (writingIssueSuggestionRows ?? []) as WritingIssueSuggestionRow[];
  const canonicalSuggestedMicroSkillKeysByMisspellingId =
    await buildScopedSuggestedMicroSkillKeysByMisspellingId({
      supabase,
      parentUserId: user.id,
      childId: submission.child_id,
      misspellings: engineMisspellings,
      writingIssueSuggestions,
      sourceType: "lesson_submission",
    });
  const candidateCaptureMicroSkillProvider =
    await getReviewWorkCandidateCaptureMicroSkillProvider({
      supabase,
    });
  const parentVerifications = (parentVerificationRows ?? []) as Parameters<
    typeof buildSuggestedIssuePanelModel
  >[0]["parentVerifications"];
  const pendingCandidateMappings =
    (pendingCandidateMappingRows ?? []) as CandidateMappingRow[];
  const pendingCandidateMappingsByMisspellingId =
    buildPendingCandidateMappingByMisspellingId(pendingCandidateMappings);
  const openCatalogReviewCases =
    (openCatalogReviewCaseRows ?? []) as CatalogReviewCaseRow[];
  const openCatalogReviewCasesByMisspellingId =
    buildOpenCatalogReviewCaseByMisspellingId(openCatalogReviewCases);
  const derivedTemplateMetadataByMicroSkillKey =
    await buildDerivedTemplateMetadataByMicroSkillKey({
      supabase,
      sourceType: "lesson_submission",
      misspellings: engineMisspellings,
      writingIssueSuggestions,
      parentVerifications,
      canonicalSuggestedMicroSkillKeysByMisspellingId,
    });
  const panelModel = buildSuggestedIssuePanelModel({
    sourceType: "lesson_submission",
    misspellings: engineMisspellings,
    writingIssues,
    writingIssueSuggestions,
    parentVerifications,
    taskSubmissionId: submission.id,
    writingSampleId: linkedSample?.id ?? null,
    canonicalSuggestedMicroSkillKeysByMisspellingId,
    derivedTemplateMetadataByMicroSkillKey,
    hasCanonicalWritingSource: Boolean(linkedSample?.id),
    analysisAttempted: Boolean(linkedSample?.id),
    isReviewed: submission.parent_review_status !== "pending",
    hasLoadError:
      Boolean(misspellingQuery.error) ||
      Boolean(writingIssueError) ||
      Boolean(writingIssueSuggestionError) ||
      Boolean(parentVerificationError) ||
      Boolean(pendingCandidateMappingError),
  });
  const parsedSubmission = parseSubmissionReview(submission.submission_text);
  const submissionStatus = getSubmissionStatusLabel(submission.parent_review_status);
  const lessonSchema =
    task?.lesson_schema && typeof task.lesson_schema === "object" && !Array.isArray(task.lesson_schema)
      ? task.lesson_schema
      : null;
  const reviewableFields = extractReviewableLessonFields(
    draftRow?.draft_payload ?? null,
    lessonSchema,
  );

  return (
    <AppShell
      currentPath="/courses/review"
      mode={mode}
      activeChildId={selectedChild.id}
      availableChildren={children}
      userEmail={user.email}
    >
      <section className="grid gap-4">
        <div className="brand-card rounded-3xl p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow">Review Work</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                {task?.title ?? "Lesson submission"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                {(course?.title ?? "Course")} · {(module?.title ?? "Module")} ·{" "}
                {formatCourseDate(submission.submitted_at.slice(0, 10))}
              </p>
            </div>
            <Link href={reviewPath} className="brand-secondary-btn">
              Back to review list
            </Link>
          </div>
          {resolvedSearchParams?.saved ? (
            <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {resolvedSearchParams.saved}
            </p>
          ) : null}
          {resolvedSearchParams?.error ? (
            <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {resolvedSearchParams.error}
            </p>
          ) : null}
          {parentAddedMissedWords.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                {parentAddedMissedWords.length} parent-added missed word
                {parentAddedMissedWords.length === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}
        </div>

        <section className="brand-card overflow-hidden rounded-3xl p-0">
          <table className="min-w-full border-collapse text-left text-[13px]">
            <tbody>
              <tr className="border-b border-[var(--border)]">
                <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Submission status
                </th>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium ${submissionStatus.tone}`}>
                    {submissionStatus.label}
                  </span>
                </td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Source type
                </th>
                <td className="px-4 py-3 text-[color:var(--ink)]">Lesson submission</td>
              </tr>
              <tr>
                <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Panel mode
                </th>
                <td className="px-4 py-3 text-[color:var(--ink)]">
                  {panelModel.panelModeLabel}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <div className="brand-card rounded-3xl p-4 md:p-5">
          <p className="brand-eyebrow">Original writing</p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
            {panelModel.originalWritingDescription}
          </p>
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
            <p className="whitespace-pre-wrap text-sm leading-7 text-[color:var(--ink)]">
              {linkedSample?.sample_text
                ? renderHighlightedText(linkedSample.sample_text, misspellings)
                : parsedSubmission.writtenResponse || "No written response on this submission."}
            </p>
          </div>
          {submission.parent_review_note?.trim() ? (
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.18)] px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
                Parent note
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--ink)]">
                {submission.parent_review_note}
              </p>
            </div>
          ) : null}
        </div>

        <SuggestedIssuesPanel
          model={panelModel}
          submissionId={submission.id}
          redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
          candidateCaptureMicroSkillProvider={candidateCaptureMicroSkillProvider}
          pendingCandidateMappingsByMisspellingId={pendingCandidateMappingsByMisspellingId}
          openCatalogReviewCasesByMisspellingId={openCatalogReviewCasesByMisspellingId}
          catalogReviewCaseCaptureAvailable={!openCatalogReviewCaseError}
        />

        <ReturnedCorrectionsSection
          items={returnedCorrectionReviewItems}
          redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
        />

        <ParentAddedMissedWordsSection
          rows={parentAddedMissedWords}
          submissionId={submission.id}
          redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
          pendingCandidateMappingsByMisspellingId={pendingCandidateMappingsByMisspellingId}
          openCatalogReviewCasesByMisspellingId={openCatalogReviewCasesByMisspellingId}
          catalogReviewCaseCaptureAvailable={!openCatalogReviewCaseError}
          durableIssueMisspellingIds={durableIssueMisspellingIds}
        />

        <LessonParentActionsSection
          submissionId={submission.id}
          redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
          parentReviewNote={submission.parent_review_note}
          reviewableFields={reviewableFields}
          unresolvedCount={panelModel.summary.unresolvedCount}
          showZeroSuggestionGuidance={
            submission.parent_review_status === "pending" && panelModel.state === "empty_result"
          }
        />
      </section>
    </AppShell>
  );
}
