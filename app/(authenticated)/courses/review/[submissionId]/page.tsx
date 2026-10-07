import { loadAuthenticUseReview, type AuthenticUseReview } from "@/lib/authentic-use/review";
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
import {
  formatCourseDate,
  getActiveChildrenForUser,
} from "@/lib/courses/queries";
import {
  getFreeWritingEvidenceCandidatesForReview,
  type FreeWritingEvidenceReviewCandidate,
} from "@/lib/rewards/free-writing-evidence";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadAdleReviewWorkDetail } from "@/lib/adle/review-work/read-model";
import { loadAdleContextReview } from "@/lib/adle/review-work/context-review";
import { loadAdleAuthenticUseReview } from "@/lib/authentic-use/adle-review";
import { loadAdleUnifiedSpellingReviewItems } from "@/lib/adle/review-work/unified-spelling";
import {
  getReviewWorkCandidateCaptureMicroSkillProvider,
  getReviewWorkDerivedTemplateMetadataByMicroSkillKeys,
} from "@/lib/writing-engine/persistence/learning-items";
import {
  loadUnifiedSpellingReviewItemsForSubmission,
  summarizeUnifiedSpellingReviewCompletion,
  type UnifiedSpellingReviewCompletionSummary,
  type UnifiedSpellingReviewItem,
} from "@/lib/writing-engine/persistence/unified-spelling-review-items";
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
import { AdleReviewSections } from "../adle-review-sections";
import { SuggestedIssuesPanel } from "../suggested-issues-panel";
import {
  UnifiedSpellingReviewTable,
  type UnifiedSpellingReviewWorkflowPhase,
} from "../unified-spelling-review-table";
import { ReviewAddWordForm } from "../review-add-word-form";
import { ReviewWordSelectionProvider, SelectableOriginalWriting } from "../review-word-selection";
import { ParentContextualFeedbackCases } from "../parent-contextual-feedback-cases";
import {
  buildCanonicalSuggestedMicroSkillKeysByMisspellingId,
  hasCanonicalMicroSkillKey,
} from "../canonical-submission-spelling";

import {
  addMissedWordToSubmissionReview,
  addParentContextualMiss,
  approveSubmissionReview,
  returnSubmissionToChild,
  retryPassageContextScan,
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
import type { ParentIdentifiedOccurrenceCandidate } from "@/lib/writing-engine/whole-writing/parent-identified-errors";
import { loadPendingContextReviewDeliveries } from "@/lib/writing-engine/whole-writing/context-review-repository";
import { ContextualUseSuggestionsPanel } from "../contextual-use-suggestions-panel";
import { loadContextAdvisoryReview } from "@/lib/writing-engine/whole-writing/context-advisory-review";
import { loadPassageContextReview, type PassageReviewRow } from "@/lib/writing-engine/whole-writing/context-passage-review";
import { loadReturnedContextExcerpts } from "@/lib/writing-engine/whole-writing/returned-context-excerpts";

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

function hasReturnedCorrectionRows(rows: UnifiedSpellingReviewItem[]) {
  return rows.some((row) => row.source === "returned_correction");
}

function getReviewWorkflowPhase(input: {
  parentReviewStatus: string | null | undefined;
  unifiedSpellingReviewItems: UnifiedSpellingReviewItem[];
}): UnifiedSpellingReviewWorkflowPhase {
  if (input.parentReviewStatus === "approved") {
    return "read_only";
  }

  if (hasReturnedCorrectionRows(input.unifiedSpellingReviewItems)) {
    return "returned_correction";
  }

  if (input.parentReviewStatus === "pending") {
    return "prepare_retry";
  }

  return "returned_correction";
}

type WritingIssueSuggestionRow = ReviewWritingIssueSuggestionDetailProjection;
type WritingIssueRow = ReviewWritingIssueProjection;

async function buildScopedSuggestedMicroSkillKeysByMisspellingId(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  parentUserId: string;
  childId: string;
  misspellings: MisspellingReviewRow[];
  writingIssueSuggestions: WritingIssueSuggestionRow[];
  sourceType: "lesson_submission" | "manual_writing_sample";
}) {
  if (
    input.sourceType !== "lesson_submission" ||
    input.misspellings.length === 0
  ) {
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
        .map((misspelling) =>
          normaliseWordForLookup(misspelling.misspelled_word),
        )
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
    const normalizedMisspelling = normaliseWordForLookup(
      misspelling.misspelled_word,
    );
    const normalizedCorrectSpelling = normaliseWordForLookup(
      misspelling.suggested_word ?? misspelling.corrected_word,
    );

    if (!normalizedMisspelling || !normalizedCorrectSpelling) {
      return;
    }

    const exactLocalMatches = (
      (promotedCandidateRows ?? []) as Array<{
        misspelling_normalized?: string;
        correct_spelling_normalized?: string;
        micro_skill_key?: string;
      }>
    ).filter(
      (mapping) =>
        mapping.misspelling_normalized === normalizedMisspelling &&
        mapping.correct_spelling_normalized === normalizedCorrectSpelling &&
        typeof mapping.micro_skill_key === "string" &&
        mapping.micro_skill_key.trim().length > 0,
    );
    const distinctLocalMicroSkillKeys = Array.from(
      new Set(
        exactLocalMatches.map((mapping) => mapping.micro_skill_key as string),
      ),
    );

    if (distinctLocalMicroSkillKeys.length === 1) {
      suggestedMicroSkillKeysByMisspellingId[misspelling.id] =
        distinctLocalMicroSkillKeys[0];
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
    const matchedSuggestedMicroSkillKey =
      matchedSuggestion?.suggested_micro_skill_key ?? null;
    const matchedSuggestionMicroSkillKey = hasCanonicalMicroSkillKey(
      matchedSuggestedMicroSkillKey,
    )
      ? matchedSuggestedMicroSkillKey
      : (input.canonicalSuggestedMicroSkillKeysByMisspellingId?.[
          misspelling.id
        ] ?? null);

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

async function loadParentIdentifiedOccurrenceCandidates(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  submissionId: string;
  parentUserId: string;
  childId: string;
}) {
  const { data: snapshot, error: snapshotError } = await input.supabase
    .from("writing_source_snapshots")
    .select("id")
    .eq("submission_id", input.submissionId)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .maybeSingle();

  // The whole-writing migrations and cohort capture are independently
  // deployable. Review Work remains usable while either is unavailable.
  if (snapshotError || !snapshot) return [];

  const occurrences: ParentIdentifiedOccurrenceCandidate[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await input.supabase
      .from("writing_occurrences")
      .select("id,observed_text,field_path,start_utf16,end_utf16,provenance")
      .eq("snapshot_id", snapshot.id)
      .eq("provenance", "learner_response")
      .order("field_path", { ascending: true })
      .order("start_utf16", { ascending: true })
      .range(offset, offset + 999);
    if (error) return [];
    const rows = data ?? [];
    occurrences.push(
      ...rows.map((row) => ({
        id: row.id,
        observedText: row.observed_text,
        fieldPath: row.field_path,
        startUtf16: row.start_utf16,
        endUtf16: row.end_utf16,
        provenance: row.provenance as "learner_response" | "unknown",
      })),
    );
    if (rows.length < 1000) break;
  }
  return occurrences;
}

function LessonParentActionsSection(props: {
  submissionId: string;
  parentUserId: string;
  childId: string;
  redirectPath: string;
  parentReviewNote: string | null;
  reviewableFields: ReturnType<typeof extractReviewableLessonFields>;
  completionSummary: UnifiedSpellingReviewCompletionSummary;
  showZeroSuggestionGuidance: boolean;
  freeWritingEvidenceCandidates: FreeWritingEvidenceReviewCandidate[];
  parentIdentifiedOccurrences: ParentIdentifiedOccurrenceCandidate[];
  authenticUse: AuthenticUseReview;
  passageReview: Awaited<ReturnType<typeof loadPassageContextReview>>;
}) {
  const passagePending = props.passageReview.readError || props.passageReview.status === "pending" ||
    props.passageReview.rows.some((row) => !row.dismissed && row.issueStatus === null);
  const authenticActive = props.authenticUse.control.mode !== "off";
  const manualRequired = props.authenticUse.preview?.requiresManualReview || props.authenticUse.sourceMissing || passagePending;
  const approvalBlocked = !props.completionSummary.canComplete || (passagePending && !authenticActive);
  const blockingReasons = [...props.completionSummary.blockingReasons,
    ...(passagePending && !authenticActive ? ["Finish or dismiss the context suggestions before approval."] : [])];
  const confirmableEvidenceCandidates =
    props.freeWritingEvidenceCandidates.filter(
      (candidate) => candidate.canConfirm,
    );
  const duplicateEvidenceCandidates =
    props.freeWritingEvidenceCandidates.filter(
      (candidate) => !candidate.canConfirm,
    );
  const renderEvidenceConfirmationInputs = () =>
    props.authenticUse.control.mode !== "enabled" && confirmableEvidenceCandidates.length > 0 ? (
      <div className="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-semibold text-amber-950">
          Confirm free-writing Gold Bar evidence
        </p>
        <div className="grid gap-2">
          {confirmableEvidenceCandidates.map((candidate) => (
            <label
              key={candidate.id}
              className="flex items-start gap-2 text-sm leading-6 text-amber-950"
            >
              <input
                name="free_writing_evidence_candidate_id"
                type="checkbox"
                value={candidate.id}
                defaultChecked
                className="mt-1"
              />
              <span>
                <span className="font-semibold">{candidate.matched_word}</span>
                {" in "}
                <span className="font-mono text-xs">
                  {candidate.source_field_key}
                </span>
                {candidate.would_award_golden_bar
                  ? " can become a confirmed Gold Bar."
                  : " can count as confirmed forge evidence."}
              </span>
            </label>
          ))}
        </div>
      </div>
    ) : null;

  const renderAuthenticConfirmation = () => props.authenticUse.eligibleForAwards ? (
    <div className="grid gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" name="authentic_use_review_confirmed" value="true" required />
        <span>I have checked the child&apos;s original lesson writing and review text, and recorded any spelling or context errors.</span>
      </label>
      {manualRequired ? <label className="flex items-start gap-2">
        <input type="checkbox" name="authentic_use_manual_review" value="true" required />
        <span>The automatic checks are incomplete. I have manually reviewed the original writing. Unresolved findings will still exclude affected words.</span>
      </label> : null}
    </div>
  ) : null;

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
        existing return flow, and approval stays blocked until unified spelling
        review items are resolved.
      </div>

      {props.showZeroSuggestionGuidance ? (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
          No suggestions found. Please check the work and mark it complete when
          you are satisfied.
        </div>
      ) : null}

      {authenticActive ? <div className="mt-4 grid gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm">
        <p className="font-semibold">Authentic use {props.authenticUse.control.mode === "shadow" ? "preview (shadow)" : "from original writing"}</p>
        <p>{props.authenticUse.finalised ? "The first review is finalised. Further reviews and retries add no credits." :
          !props.authenticUse.firstAttempt ? "This is a retry. It earns no new authentic-use credit." :
          props.authenticUse.control.mode === "shadow" ? "This preview does not award gold or skill credit." :
          props.authenticUse.eligibleForAwards ? "Each qualifying word receives one credit when you first send back or mark complete. Gold and skill eligibility are checked separately." :
          "This writing predates activation and will not receive new credits."}</p>
        {props.authenticUse.sourceMissing ? <p>The original writing snapshot is unavailable; no words can receive credit.</p> : <>
          <p>{props.authenticUse.preview?.candidates.length ?? 0} qualifying words: {props.authenticUse.preview?.candidates.map(word => word.observedWord).join(", ") || "None"}.</p>
          <p>Excluded by confirmed or unresolved findings: {props.authenticUse.preview?.blocked.map(word => word.wordKey).join(", ") || "None"}.</p>
        </>}
      </div> : null}

      {props.authenticUse.control.mode !== "enabled" && props.freeWritingEvidenceCandidates.length > 0 ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
          <div>
            <p className="text-sm font-medium text-[color:var(--ink)]">
              Free-writing evidence
            </p>
            <p className="mt-1 text-sm leading-6 text-[color:var(--mid)]">
              These matches are only estimates until you confirm them during
              approve or send-back.
            </p>
          </div>
          {confirmableEvidenceCandidates.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {confirmableEvidenceCandidates.map((candidate) => (
                <span
                  key={candidate.id}
                  className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                >
                  {candidate.matched_word}
                  {candidate.would_award_golden_bar
                    ? " · possible Gold Bar"
                    : ""}
                </span>
              ))}
            </div>
          ) : null}
          {duplicateEvidenceCandidates.length > 0 ? (
            <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
              {duplicateEvidenceCandidates.length} duplicate or
              already-confirmed match
              {duplicateEvidenceCandidates.length === 1 ? "" : "es"} skipped.
            </p>
          ) : null}
        </div>
      ) : null}

      <ReviewAddWordForm
        spellingAction={addMissedWordToSubmissionReview}
        contextAction={addParentContextualMiss}
        submissionId={props.submissionId}
        redirectPath={props.redirectPath}
        occurrences={props.parentIdentifiedOccurrences}
      />
      <ParentContextualFeedbackCases
        submissionId={props.submissionId}
        parentUserId={props.parentUserId}
        childId={props.childId}
      />

      <div className="mt-4 grid gap-3">
        <form action={approveSubmissionReview} className="grid gap-2">
          <input
            type="hidden"
            name="submission_id"
            value={props.submissionId}
          />
          <input
            type="hidden"
            name="redirect_path"
            value={props.redirectPath}
          />
          {renderEvidenceConfirmationInputs()}
          {renderAuthenticConfirmation()}
          <button
            className="brand-primary-btn disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={approvalBlocked}
          >
            Approve / mark complete
          </button>
        </form>

        {approvalBlocked ? (
          <div className="grid gap-1 text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
            {blockingReasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </div>
        ) : (
          <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
            Approval is available once unified spelling review items are
            resolved.
          </p>
        )}

        <form action={returnSubmissionToChild} className="grid gap-3">
          <input
            type="hidden"
            name="submission_id"
            value={props.submissionId}
          />
          <input
            type="hidden"
            name="redirect_path"
            value={props.redirectPath}
          />
          {renderEvidenceConfirmationInputs()}
          {renderAuthenticConfirmation()}
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
                    <span className="font-medium">
                      Feedback for this answer
                    </span>
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
            <button
              className="brand-secondary-btn justify-center"
              type="submit"
            >
              Send back to child
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function renderHighlightedText(
  text: string,
  misspellings: MisspellingReviewRow[],
  contextRows: PassageReviewRow[] = [],
) {
  const spelling = misspellings.filter((row) => row.position_start !== null && row.position_end !== null &&
    row.position_start >= 0 && row.position_end > row.position_start && row.position_end <= text.length);
  const context = contextRows.filter((row) => !row.dismissed && row.sourceStatus === "ready" &&
    row.startUtf16 >= 0 && row.endUtf16 <= text.length && row.endUtf16 > row.startUtf16 &&
    text.slice(row.startUtf16, row.endUtf16) === row.observed);
  const boundaries = [...new Set([0, text.length,
    ...spelling.flatMap((row) => [row.position_start!, row.position_end!]),
    ...context.flatMap((row) => [row.startUtf16, row.endUtf16])])].sort((a, b) => a - b);
  const segments: ReactNode[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index], end = boundaries[index + 1];
    if (start === end) continue;
    const passage = context.find((row) => row.startUtf16 <= start && row.endUtf16 >= end);
    if (passage) {
      segments.push(<mark key={`context-${index}`} id={start === passage.startUtf16 ? `context-${passage.findingId}` : undefined}
        tabIndex={start === passage.startUtf16 ? -1 : undefined}
        className="rounded-md bg-sky-200 px-0.5 text-[color:var(--ink)] ring-1 ring-sky-400 focus:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-800 target:bg-sky-300 target:ring-2 target:ring-sky-800"
        title={`${passage.observed} → ${passage.correction}`}>{text.slice(start, end)}</mark>);
      continue;
    }
    const spellingRow = spelling.find((row) => row.position_start! <= start && row.position_end! >= end);
    segments.push(spellingRow ? <mark key={`spelling-${index}`}
      className="rounded-md bg-amber-100 px-0.5 text-[color:var(--ink)] ring-1 ring-amber-200"
      title={`${spellingRow.misspelled_word} → ${spellingRow.corrected_word}`}>{text.slice(start, end)}</mark>
      : text.slice(start, end));
  }
  return segments.length ? segments : text;
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

  if (reviewEntry.sourceType === "adle_review_v3") {
    if (mode !== "parent") {
      redirect(buildScopedPath("/learn/week", selectedChild.id, "child"));
    }
    const serviceClient = createServiceRoleClient();
    const detail = await loadAdleReviewWorkDetail({
      userClient: supabase,
      serviceClient,
      parentUserId: user.id,
      childId: selectedChild.id,
      sourceId: reviewEntry.id,
    });
    if (!detail) notFound();
    const [adleSpellingRows, candidateCaptureMicroSkillProvider, adleContextReview, adleAuthenticUseReview] =
      await Promise.all([
        loadAdleUnifiedSpellingReviewItems({ serviceClient, detail }),
        getReviewWorkCandidateCaptureMicroSkillProvider({ supabase }),
        loadAdleContextReview({ client: serviceClient, reviewSessionId: detail.reviewSessionId,
          parentUserId: detail.parentUserId, childId: detail.childId,
          submittedText: detail.submittedWritingText }),
        loadAdleAuthenticUseReview({ client: serviceClient, detail }),
      ]);
    const originalSuccessCount = detail.targets.filter(
      (target) => target.originalOutcome === "success",
    ).length;
    const repairedCount = detail.targets.filter(
      (target) => target.repairState === "completed_correct",
    ).length;
    const notSecuredCount = detail.targets.filter(
      (target) => target.repairState === "attempted_not_secured",
    ).length;
    const detailPath = buildScopedPath(
      `/courses/review/${reviewEntryId}`,
      selectedChild.id,
      mode,
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="brand-eyebrow">
                  ADLE Review · {formatCourseDate(detail.assignmentDate)}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                  {detail.challengeTitle}
                </h1>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    Learner Review complete
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${detail.observationalStatus === "reviewed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}
                  >
                    {detail.observationalStatus === "reviewed"
                      ? "Reviewed"
                      : "Available to review"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[color:var(--mid)]">
                  Parent inspection does not affect completion, schedules or
                  rewards.
                </p>
              </div>
              <div className="grid gap-3">
                <Link href={reviewPath} className="brand-secondary-btn">
                  Back to review list
                </Link>
                <div className="grid grid-cols-2 gap-2 text-center text-xs font-medium sm:grid-cols-4">
                  <span className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2">
                    {detail.targets.length} targets
                  </span>
                  <span className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
                    {originalSuccessCount} correct
                  </span>
                  <span className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                    {repairedCount} repaired
                  </span>
                  <span className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
                    {notSecuredCount} not secured
                  </span>
                </div>
              </div>
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

          <AdleReviewSections
            detail={detail}
            contextReview={adleContextReview}
            authenticUse={adleAuthenticUseReview}
            rows={adleSpellingRows}
            options={
              candidateCaptureMicroSkillProvider.status === "available"
                ? candidateCaptureMicroSkillProvider.options
                : []
            }
            redirectPath={detailPath}
          />
        </section>
      </AppShell>
    );
  }

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
    const writingIssues = (writingIssueRows ??
      []) as ReviewWritingIssueWithSourceSuggestionRow[];
    const writingIssueSuggestions = (writingIssueSuggestionRows ??
      []) as WritingIssueSuggestionRow[];
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
                  Entered through{" "}
                  {manualSample.source?.trim() || "Add Writing Sample"} ·{" "}
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
            redirectPath={buildScopedPath(
              `/courses/review/${reviewEntryId}`,
              selectedChild.id,
              mode,
            )}
            isCompleted={Boolean(manualSample.review_completed_at)}
            completedAt={
              typeof manualSample.review_completed_at === "string"
                ? manualSample.review_completed_at
                : null
            }
          />

          <ManualSampleParentAuthoredIssuesSection
            rows={parentAuthoredManualIssues}
          />

          <SuggestedIssuesPanel
            model={panelModel}
            submissionId={reviewEntryId}
            redirectPath={buildScopedPath(
              `/courses/review/${reviewEntryId}`,
              selectedChild.id,
              mode,
            )}
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
    .select(
      "id, task_id, course_id, child_id, submission_text, submitted_at, parent_review_status, parent_review_note, parent_reviewed_at",
    )
    .eq("id", submissionId)
    .eq("parent_user_id", user.id)
    .eq("child_id", selectedChild.id)
    .maybeSingle();

  if (!submission) {
    notFound();
  }

  const authenticUse = await loadAuthenticUseReview({ submissionId: submission.id, parentUserId: user.id, childId: submission.child_id });

  const [
    { data: task },
    { data: course },
    { data: linkedSample },
    { data: draftRow },
    { data: writingIssueRows, error: writingIssueError },
    { data: writingIssueSuggestionRows, error: writingIssueSuggestionError },
    { data: parentVerificationRows, error: parentVerificationError },
    unifiedSpellingReviewItems,
    freeWritingEvidenceCandidates,
    parentIdentifiedOccurrences,
    contextReviewDeliveries,
    contextAdvisory,
    passageReview,
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
    loadUnifiedSpellingReviewItemsForSubmission({
      supabase,
      submissionId: submission.id,
      parentUserId: user.id,
      childId: submission.child_id,
    }),
    getFreeWritingEvidenceCandidatesForReview({
      supabase,
      parentUserId: user.id,
      childId: submission.child_id,
      taskSubmissionId: submission.id,
    }),
    loadParentIdentifiedOccurrenceCandidates({
      supabase,
      submissionId: submission.id,
      parentUserId: user.id,
      childId: submission.child_id,
    }),
    loadPendingContextReviewDeliveries({
      client: createServiceRoleClient(),
      parentUserId: user.id,
      childId: submission.child_id,
      taskSubmissionId: submission.id,
    }),
    loadContextAdvisoryReview({
      client: createServiceRoleClient(), submissionId: submission.id,
      parentUserId: user.id, childId: submission.child_id,
    }),
    loadPassageContextReview({
      client: createServiceRoleClient(), submissionId: submission.id,
      parentUserId: user.id, childId: submission.child_id,
    }),
  ]);
  const reviewWorkflowPhase = getReviewWorkflowPhase({
    parentReviewStatus: submission.parent_review_status,
    unifiedSpellingReviewItems,
  });
  const unifiedCompletionSummary = summarizeUnifiedSpellingReviewCompletion(
    unifiedSpellingReviewItems,
  );
  const returnedContextExcerpts = await loadReturnedContextExcerpts({
    client: supabase,
    issueIds: unifiedSpellingReviewItems
      .filter((row) => row.source === "returned_correction" &&
        row.provenance.sourceKind === "contextual_advisory_v4")
      .map((row) => row.sourceIds.originalWritingIssueId)
      .filter((id): id is string => Boolean(id)),
    parentUserId: user.id,
    childId: submission.child_id,
    taskId: submission.task_id,
  });
  const contextSkillPairsResult = await createServiceRoleClient()
    .from("contextual_micro_skill_pairs")
    .select("member_a,member_b,micro_skill_key");
  if (contextSkillPairsResult.error) throw new Error(contextSkillPairsResult.error.message);

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
  const parentAddedMissedWords = misspellings.filter((row) =>
    isParentAuthoredMisspellingRow(row),
  );
  const engineMisspellings = misspellings.filter(
    (row) => !isParentAuthoredMisspellingRow(row),
  );
  const writingIssues = (writingIssueRows ?? []) as WritingIssueRow[];
  const writingIssueSuggestions = (writingIssueSuggestionRows ??
    []) as WritingIssueSuggestionRow[];
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
      Boolean(parentVerificationError),
  });
  const parsedSubmission = parseSubmissionReview(submission.submission_text);
  const submissionStatus = getSubmissionStatusLabel(
    submission.parent_review_status,
  );
  const lessonSchema =
    task?.lesson_schema &&
    typeof task.lesson_schema === "object" &&
    !Array.isArray(task.lesson_schema)
      ? task.lesson_schema
      : null;
  const reviewableFields = extractReviewableLessonFields(
    draftRow?.draft_payload ?? null,
    lessonSchema,
  );
  const displayedWritingText = linkedSample?.sample_text ?? parsedSubmission.writtenResponse ?? "";
  const displayedSourceField = passageReview.sourceFields.find((field) => field.text === displayedWritingText);

  return (
    <AppShell
      currentPath="/courses/review"
      mode={mode}
      activeChildId={selectedChild.id}
      availableChildren={children}
      userEmail={user.email}
    >
      <ReviewWordSelectionProvider><section className="grid gap-4">
        <div className="brand-card rounded-3xl p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow">Review Work</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                {task?.title ?? "Lesson submission"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                {course?.title ?? "Course"} · {module?.title ?? "Module"} ·{" "}
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
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${submissionStatus.tone}`}
                  >
                    {submissionStatus.label}
                  </span>
                </td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Source type
                </th>
                <td className="px-4 py-3 text-[color:var(--ink)]">
                  Lesson submission
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
            <SelectableOriginalWriting text={displayedWritingText}
              fieldPath={displayedSourceField?.path ?? "/rawSubmissionText"}
              occurrences={parentIdentifiedOccurrences}
              className="whitespace-pre-wrap text-sm leading-7 text-[color:var(--ink)]">
              {displayedWritingText ? renderHighlightedText(displayedWritingText, misspellings,
                passageReview.rows.filter((row) => row.fieldPath === displayedSourceField?.path))
                : "No written response on this submission."}
            </SelectableOriginalWriting>
          </div>
          {passageReview.sourceFields.filter((field) => field.path !== displayedSourceField?.path).map((field, index) =>
            <div key={field.path} className="mt-3 rounded-2xl border border-sky-200 bg-white px-4 py-4">
              <p className="mb-2 text-xs font-medium text-sky-800">Original answer {index + 1}</p>
              <SelectableOriginalWriting text={field.text} fieldPath={field.path}
                occurrences={parentIdentifiedOccurrences}
                className="whitespace-pre-wrap text-sm leading-7 text-[color:var(--ink)]">
                {renderHighlightedText(field.text, [], passageReview.rows.filter((row) => row.fieldPath === field.path))}
              </SelectableOriginalWriting>
            </div>)}
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

        <ContextualUseSuggestionsPanel
          rows={contextReviewDeliveries}
          redirectPath={buildScopedPath(
            `/courses/review/${reviewEntryId}`,
            selectedChild.id,
            mode,
          )}
        />

        {passageReview.status === "pending" ? <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Context checking is still running. <Link className="underline" href={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}>Refresh status</Link> before sending work back.
        </div> : null}
        {passageReview.status === "failed" ? <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Luna could not finish checking this writing. You can add a contextual word manually and continue.
          {passageReview.canRetry ? <form action={retryPassageContextScan} className="mt-2">
            <input type="hidden" name="submission_id" value={submission.id} />
            <button className="rounded border border-sky-300 bg-white px-3 py-1 font-medium">Try again</button>
          </form> : null}
        </div> : null}

        <UnifiedSpellingReviewTable
          rows={unifiedSpellingReviewItems}
          contextPairs={contextSkillPairsResult.data ?? []}
          returnedContextExcerpts={returnedContextExcerpts}
          contextRows={contextAdvisory.rows}
          passageRows={passageReview.rows}
          contextReadOnly={!contextAdvisory.enabled}
          options={
            candidateCaptureMicroSkillProvider.status === "available"
              ? candidateCaptureMicroSkillProvider.options
              : []
          }
          submissionId={submission.id}
          redirectPath={buildScopedPath(
            `/courses/review/${reviewEntryId}`,
            selectedChild.id,
            mode,
          )}
          reviewWorkflowPhase={reviewWorkflowPhase}
        />

        <LessonParentActionsSection
          submissionId={submission.id}
          parentUserId={user.id}
          childId={submission.child_id}
          redirectPath={buildScopedPath(
            `/courses/review/${reviewEntryId}`,
            selectedChild.id,
            mode,
          )}
          parentReviewNote={submission.parent_review_note}
          reviewableFields={reviewableFields}
          completionSummary={unifiedCompletionSummary}
          showZeroSuggestionGuidance={
            submission.parent_review_status === "pending" &&
            panelModel.state === "empty_result" &&
            contextReviewDeliveries.length === 0
          }
          freeWritingEvidenceCandidates={freeWritingEvidenceCandidates}
          parentIdentifiedOccurrences={parentIdentifiedOccurrences}
          authenticUse={authenticUse}
          passageReview={passageReview}
        />
      </section></ReviewWordSelectionProvider>
    </AppShell>
  );
}
