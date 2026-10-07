import { loadAuthenticUseReview, type AuthenticUseReview } from "@/lib/authentic-use/review";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Suspense, type ComponentProps, type ReactNode } from "react";

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
import { loadAdleParentContextChoices } from "@/lib/adle/review-work/parent-context";
import { loadAdleAuthenticUseReview } from "@/lib/authentic-use/adle-review";
import { loadAdleUnifiedSpellingReviewItems } from "@/lib/adle/review-work/unified-spelling";
import { getReviewWorkCandidateCaptureMicroSkillProvider } from "@/lib/writing-engine/persistence/learning-items";
import {
  loadUnifiedSpellingReviewItemsForSubmission,
  summarizeUnifiedSpellingReviewCompletion,
  type UnifiedSpellingReviewCompletionSummary,
  type UnifiedSpellingReviewItem,
} from "@/lib/writing-engine/persistence/unified-spelling-review-items";
import type { ReviewWritingIssueSuggestionDetailProjection } from "@/lib/writing-practice/types";
import {
  ManualSampleParentAuthoredIssuesSection,
  ManualSampleParentIssueSection,
  type ReviewWritingIssueWithSourceSuggestionRow,
} from "../manual-sample-sections";
import { getManualReviewSampleStatus } from "../manual-sample-review-utils";
import { AdleReviewSections, TargetWordDetails } from "../adle-review-sections";
import { SuggestedIssuesPanel } from "../suggested-issues-panel";
import {
  UnifiedSpellingReviewTable,
  type UnifiedSpellingReviewWorkflowPhase,
} from "../unified-spelling-review-table";
import { ReviewAddWordForm } from "../review-add-word-form";
import { ReviewWordSelectionProvider, SelectableOriginalWriting } from "../review-word-selection";
import { ReviewGuidedSections } from "../review-guided-sections";
import { ReviewActionSubmitButton } from "../review-action-submit-button";
import { ParentContextualFeedbackCases } from "../parent-contextual-feedback-cases";

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
  parseReviewWorkEntryId,
  parseSubmissionReview,
} from "../review-utils";
import type { ParentIdentifiedOccurrenceCandidate } from "@/lib/writing-engine/whole-writing/parent-identified-errors";
import { loadPendingContextReviewDeliveries } from "@/lib/writing-engine/whole-writing/context-review-repository";
import { ContextualUseSuggestionsPanel } from "../contextual-use-suggestions-panel";
import { loadContextAdvisoryReview } from "@/lib/writing-engine/whole-writing/context-advisory-review";
import { loadPassageContextReview, type PassageReviewRow } from "@/lib/writing-engine/whole-writing/context-passage-review";
import { loadReturnedContextExcerpts } from "@/lib/writing-engine/whole-writing/returned-context-excerpts";
import { indexSnapshotOccurrences } from "@/lib/writing-engine/whole-writing/occurrence-index";
import type { SourceSnapshot } from "@/lib/writing-engine/whole-writing/source";

type CourseReviewDetailPageProps = {
  params: Promise<{ submissionId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    saved?: string;
    error?: string;
    section?: string;
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

async function LessonSpellingReviewContent(props: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  rows: UnifiedSpellingReviewItem[];
  contextPairs: { member_a: string; member_b: string; micro_skill_key: string }[];
  submissionId: string;
  parentUserId: string;
  childId: string;
  taskId: string;
  redirectPath: string;
  phase: UnifiedSpellingReviewWorkflowPhase;
}) {
  const [provider, returnedContextExcerpts] = await Promise.all([
    getReviewWorkCandidateCaptureMicroSkillProvider({ supabase: props.supabase }),
    loadReturnedContextExcerpts({ client: props.supabase,
      issueIds: props.rows.filter((row) => row.source === "returned_correction" &&
        row.provenance.sourceKind === "contextual_advisory_v4")
        .map((row) => row.sourceIds.originalWritingIssueId)
        .filter((id): id is string => Boolean(id)),
      parentUserId: props.parentUserId, childId: props.childId, taskId: props.taskId }),
  ]);
  return <UnifiedSpellingReviewTable rows={props.rows}
    contextPairs={props.contextPairs}
    returnedContextExcerpts={returnedContextExcerpts}
    options={provider.status === "available" ? provider.options : []}
    submissionId={props.submissionId} redirectPath={props.redirectPath}
    reviewWorkflowPhase={props.phase} />;
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

async function loadParentIdentifiedOccurrenceCandidates(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  submissionId: string;
  parentUserId: string;
  childId: string;
  canIndex: boolean;
}) {
  const { data: snapshot, error: snapshotError } = await input.supabase
    .from("writing_source_snapshots")
    .select("*")
    .eq("submission_id", input.submissionId)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .maybeSingle();

  // The whole-writing migrations and cohort capture are independently
  // deployable. Review Work remains usable while either is unavailable.
  if (snapshotError) return { rows: [] as ParentIdentifiedOccurrenceCandidate[], reason: "The original writing could not be read. Try refreshing this review." };
  if (!snapshot) return { rows: [] as ParentIdentifiedOccurrenceCandidate[], reason: "This submission has no captured writing source, so exact context selection is unavailable." };

  async function readOccurrences() {
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
      if (error) throw error;
      const rows = data ?? [];
      occurrences.push(...rows.map((row) => ({
        id: row.id,
        observedText: row.observed_text,
        fieldPath: row.field_path,
        startUtf16: row.start_utf16,
        endUtf16: row.end_utf16,
        provenance: row.provenance as "learner_response" | "unknown",
      })));
      if (rows.length < 1000) break;
    }
    return occurrences;
  }
  try {
    let rows = await readOccurrences();
    if (!rows.length && input.canIndex) {
      const indexed = await indexSnapshotOccurrences(createServiceRoleClient(), snapshot as SourceSnapshot);
      if (indexed.reason === "NO_VERIFIED_WRITING") return { rows, reason: "This source has no verified learner-written words for exact context selection." };
      if (indexed.reason === "NO_WORDS") return { rows, reason: "No selectable words were found in the verified writing." };
      rows = await readOccurrences();
    }
    return { rows, reason: rows.length ? null : "No selectable words were found in the original writing." };
  } catch {
    return { rows: [] as ParentIdentifiedOccurrenceCandidate[], reason: "Exact word positions could not be prepared. Refresh this review to retry." };
  }
}

type LessonReviewActionsProps = {
  submissionId: string;
  redirectPath: string;
  parentReviewNote: string | null;
  reviewableFields: ReturnType<typeof extractReviewableLessonFields>;
  completionSummary: UnifiedSpellingReviewCompletionSummary;
  showZeroSuggestionGuidance: boolean;
  freeWritingEvidenceCandidates: FreeWritingEvidenceReviewCandidate[];
  authenticUse: AuthenticUseReview;
  passageReview: Awaited<ReturnType<typeof loadPassageContextReview>>;
};

function LessonFeedbackSection(props: Pick<LessonReviewActionsProps,
  "submissionId" | "parentReviewNote" | "reviewableFields">) {
  const returnFormId = `lesson-send-back-${props.submissionId}`;
  return <div className="grid gap-4">
    <p className="text-sm leading-6 text-[color:var(--mid)]">
      Add guidance beside each answer. The child sees these notes when you choose Send back to child.
    </p>
    <label className="grid gap-1 text-sm text-[color:var(--ink)]">
      <span className="font-medium">Parent note</span>
      <textarea form={returnFormId} name="parent_review_note" rows={3}
        defaultValue={props.parentReviewNote ?? ""}
        className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
        placeholder="Tell her what to fix before trying again." />
    </label>
    {props.reviewableFields.length ? props.reviewableFields.map((field) =>
      <div key={field.key} className="rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
        <p className="text-sm font-semibold text-[color:var(--ink)]">{field.label}</p>
        <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-[rgba(255,247,220,0.35)] px-3 py-2 text-sm leading-6 text-[color:var(--ink)]">{field.value}</p>
        <label className="mt-3 grid gap-1 text-sm text-[color:var(--ink)]">
          <span className="font-medium">Feedback for this answer</span>
          <textarea form={returnFormId} name={`field_feedback__${field.key}`} rows={3}
            defaultValue={field.feedback}
            className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
            placeholder="Tell her exactly what to improve in this answer." />
        </label>
      </div>) : <p className="rounded-xl bg-[var(--mist)] p-3 text-sm text-[var(--mid)]">
        This submission has no structured answers or quiz questions for individual feedback. You can still send a parent note.
      </p>}
  </div>;
}

function LessonReviewActionFooter(props: LessonReviewActionsProps) {
  const passagePending = props.passageReview.readError || props.passageReview.status === "pending" ||
    props.passageReview.rows.some((row) => !row.dismissed && row.issueStatus === null);
  const authenticActive = props.authenticUse.control.mode !== "off";
  const manualRequired = props.authenticUse.preview?.requiresManualReview || props.authenticUse.sourceMissing || passagePending;
  const approvalBlocked = !props.completionSummary.canComplete || (passagePending && !authenticActive);
  const blockingReasons = [...props.completionSummary.blockingReasons,
    ...(passagePending && !authenticActive ? ["Finish or dismiss the context suggestions before approval."] : [])];
  const evidence = props.authenticUse.control.mode !== "enabled"
    ? props.freeWritingEvidenceCandidates.filter((candidate) => candidate.canConfirm) : [];
  const confirmations = () => <>
    {evidence.length ? <fieldset className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <legend className="font-semibold">Confirm free-writing Gold Bar evidence</legend>
      {evidence.map((candidate) => <label key={candidate.id} className="flex items-start gap-2">
        <input type="checkbox" name="free_writing_evidence_candidate_id" value={candidate.id} defaultChecked className="mt-1" />
        <span>{candidate.matched_word} in {candidate.source_field_key}{candidate.would_award_golden_bar ? " · possible Gold Bar" : " · forge evidence"}</span>
      </label>)}
    </fieldset> : null}
    {props.authenticUse.eligibleForAwards ? <div className="grid gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
      <label className="flex items-start gap-2"><input type="checkbox" name="authentic_use_review_confirmed" value="true" required className="mt-1" />
        <span>I checked the original lesson writing and recorded any spelling or context errors.</span></label>
      {manualRequired ? <label className="flex items-start gap-2"><input type="checkbox" name="authentic_use_manual_review" value="true" required className="mt-1" />
        <span>Automatic checks are incomplete. I manually reviewed the original writing.</span></label> : null}
    </div> : null}
  </>;
  const hiddenInputs = <>
    <input type="hidden" name="submission_id" value={props.submissionId} />
    <input type="hidden" name="redirect_path" value={props.redirectPath} />
  </>;
  return <section aria-label="Review decisions" className="brand-card rounded-3xl p-4 md:p-5">
    <p className="brand-eyebrow">Review decisions</p>
    {props.showZeroSuggestionGuidance ? <p className="mt-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
      No suggestions found. Check the work and mark it complete when satisfied.
    </p> : null}
    <div className="mt-4 grid gap-3 md:grid-cols-2 md:items-start">
      <form id={`lesson-send-back-${props.submissionId}`} action={returnSubmissionToChild}
        className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
        {hiddenInputs}{confirmations()}
        <button type="submit" className="brand-secondary-btn justify-center">Send back to child</button>
        <p className="text-xs text-[var(--mid)]">Sends the parent note and answer feedback to the child.</p>
      </form>
      <form action={approveSubmissionReview}
        className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
        {hiddenInputs}{confirmations()}
        <ReviewActionSubmitButton className="brand-primary-btn justify-center disabled:cursor-not-allowed disabled:opacity-60"
          disabled={approvalBlocked}>Approve / mark complete</ReviewActionSubmitButton>
        {approvalBlocked ? <div className="grid gap-1 text-xs text-[var(--mid)]">
          {blockingReasons.map((reason) => <p key={reason}>{reason}</p>)}
        </div> : null}
      </form>
    </div>
  </section>;
}

async function DeferredLessonSpellingReviewContent(props: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  rowsPromise: Promise<UnifiedSpellingReviewItem[]>;
  contextPairsPromise: Promise<{ member_a: string; member_b: string; micro_skill_key: string }[]>;
  submissionId: string; parentUserId: string; childId: string; taskId: string;
  redirectPath: string; phase: UnifiedSpellingReviewWorkflowPhase;
}) {
  const [rows, contextPairs] = await Promise.all([props.rowsPromise, props.contextPairsPromise]);
  return <LessonSpellingReviewContent {...props} rows={rows} contextPairs={contextPairs} />;
}

async function loadLessonContextPairs() {
  const result = await createServiceRoleClient().from("contextual_micro_skill_pairs")
    .select("member_a,member_b,micro_skill_key");
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

async function DeferredLessonContextTable(props: Omit<ComponentProps<typeof UnifiedSpellingReviewTable>, "contextPairs"> & {
  contextPairsPromise: Promise<{ member_a: string; member_b: string; micro_skill_key: string }[]>;
}) {
  const contextPairs = await props.contextPairsPromise;
  return <UnifiedSpellingReviewTable {...props} contextPairs={contextPairs} />;
}

async function DeferredLessonAuthenticUse(props: { reviewPromise: Promise<AuthenticUseReview> }) {
  const review = await props.reviewPromise;
  return <div className="grid gap-2 text-sm text-[var(--ink)]">
    <p>{review.finalised ? "The first review is finalised; retries add no new credit." :
      review.eligibleForAwards ? "Qualifying words can receive credit when the first review is completed." :
      review.control.mode === "off" ? "Authentic use is not enabled for this child." :
      review.sourceMissing ? "The immutable original writing is unavailable, so authentic use cannot be verified." :
      !review.firstAttempt ? "Authentic-use credit is available only on the first submission." :
      "This writing predates authentic-use activation and has no historical credit grant."}</p>
    <p>Qualifying words: {review.preview?.candidates.map((word) => word.observedWord).join(", ") || "None"}.</p>
    <p>Excluded by spelling or context findings: {review.preview?.blocked.map((word) => word.wordKey).join(", ") || "None"}.</p>
  </div>;
}

async function DeferredLessonReviewActionFooter(props: {
  submissionId: string; redirectPath: string; parentReviewNote: string | null;
  reviewableFields: ReturnType<typeof extractReviewableLessonFields>;
  passageReview: Awaited<ReturnType<typeof loadPassageContextReview>>;
  parentReviewStatus: string; contextDeliveryCount: number;
  rowsPromise: Promise<UnifiedSpellingReviewItem[]>;
  evidencePromise: Promise<FreeWritingEvidenceReviewCandidate[]>;
  authenticUsePromise: Promise<AuthenticUseReview>;
}) {
  const [rows, freeWritingEvidenceCandidates, authenticUse] = await Promise.all([
    props.rowsPromise, props.evidencePromise, props.authenticUsePromise,
  ]);
  return <LessonReviewActionFooter submissionId={props.submissionId} redirectPath={props.redirectPath}
    parentReviewNote={props.parentReviewNote} reviewableFields={props.reviewableFields}
    passageReview={props.passageReview} authenticUse={authenticUse}
    freeWritingEvidenceCandidates={freeWritingEvidenceCandidates}
    completionSummary={summarizeUnifiedSpellingReviewCompletion(rows)}
    showZeroSuggestionGuidance={props.parentReviewStatus === "pending" && rows.length === 0 &&
      props.contextDeliveryCount === 0} />;
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
    const [adleSpellingRows, candidateCaptureMicroSkillProvider, adleContextReview, adleAuthenticUseReview, adleParentContext] =
      await Promise.all([
        loadAdleUnifiedSpellingReviewItems({ serviceClient, detail }),
        getReviewWorkCandidateCaptureMicroSkillProvider({ supabase }),
        loadAdleContextReview({ client: serviceClient, reviewSessionId: detail.reviewSessionId,
          parentUserId: detail.parentUserId, childId: detail.childId,
          submittedText: detail.submittedWritingText }),
        loadAdleAuthenticUseReview({ client: serviceClient, detail }),
        loadAdleParentContextChoices({ client: serviceClient, reviewSessionId: detail.reviewSessionId,
          parentUserId: detail.parentUserId, childId: detail.childId }),
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
        <section className="review-work grid gap-4">
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
            <TargetWordDetails detail={detail} />
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
            parentContext={adleParentContext}
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
                <p className="brand-eyebrow">Manual writing sample</p>
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

  const [
    { data: task },
    { data: course },
    { data: linkedSample },
    { data: draftRow },
    parentOccurrenceIndex,
    contextReviewDeliveries,
    contextAdvisory,
    passageReview,
    { count: previousSubmissionCount },
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
    loadParentIdentifiedOccurrenceCandidates({
      supabase,
      submissionId: submission.id,
      parentUserId: user.id,
      childId: submission.child_id,
      canIndex: submission.parent_review_status === "pending",
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
    supabase.from("task_submissions").select("id", { count: "exact", head: true })
      .eq("task_id", submission.task_id).eq("child_id", submission.child_id)
      .eq("parent_user_id", user.id).neq("id", submission.id),
  ]);
  const parentIdentifiedOccurrences = parentOccurrenceIndex.rows;
  const contextPairsPromise = loadLessonContextPairs();
  const unifiedRowsPromise = loadUnifiedSpellingReviewItemsForSubmission({
    supabase, submissionId: submission.id, parentUserId: user.id, childId: submission.child_id,
  });
  const freeWritingEvidencePromise = getFreeWritingEvidenceCandidatesForReview({
    supabase, parentUserId: user.id, childId: submission.child_id, taskSubmissionId: submission.id,
  });
  const authenticUsePromise = loadAuthenticUseReview({
    submissionId: submission.id, parentUserId: user.id, childId: submission.child_id,
  });
  const isResubmission = (previousSubmissionCount ?? 0) > 0;
  const unifiedSpellingReviewItems = isResubmission ? await unifiedRowsPromise : [];
  const authenticUse = isResubmission ? await authenticUsePromise : null;
  const reviewWorkflowPhase = getReviewWorkflowPhase({
    parentReviewStatus: submission.parent_review_status,
    unifiedSpellingReviewItems,
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
      <ReviewWordSelectionProvider><section className="review-work grid gap-4">
        <div className="brand-card rounded-3xl p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow">Lesson review submission</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                {task?.title ?? "Lesson submission"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                {course?.title ?? "Course"} ·{" "}
                {formatCourseDate(submission.submitted_at.slice(0, 10))}
              </p>
              <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${submissionStatus.tone}`}>{submissionStatus.label}</span>
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

        <ReviewGuidedSections
          storageKey={`lesson-review-${submission.id}`}
          initialSection={(previousSubmissionCount ?? 0) > 0
            ? unifiedSpellingReviewItems.some((row) => !row.terminalStatus) ? "words"
              : contextReviewDeliveries.length ||
                contextAdvisory.rows.some((row) => row.parentClassification === null && row.sourceStatus === "ready") ||
                passageReview.rows.some((row) => !row.dismissed && !row.confirmed && row.sourceStatus === "ready") ? "context"
              : authenticUse?.eligibleForAwards ? "authentic" : "feedback"
            : "writing"}
          sections={[
            { id: "writing", title: "Original writing & Add Word", summary: "Select a word in the submitted writing", content: (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                <div className="min-w-0">
                  <p className="text-sm leading-6 text-[var(--mid)]">Select an exact word in the submitted writing to add spelling or context feedback.</p>
                  <div className="mt-3 rounded-2xl border border-[var(--border)] bg-white p-4">
                    <SelectableOriginalWriting text={displayedWritingText}
                      fieldPath={displayedSourceField?.path ?? "/rawSubmissionText"}
                      occurrences={parentIdentifiedOccurrences}
                      className="whitespace-pre-wrap text-sm leading-7 text-[var(--ink)]">
                      {displayedWritingText ? renderHighlightedText(displayedWritingText, [],
                        passageReview.rows.filter((row) => row.fieldPath === displayedSourceField?.path))
                        : "No written response on this submission."}
                    </SelectableOriginalWriting>
                  </div>
                  {passageReview.sourceFields.filter((field) => field.path !== displayedSourceField?.path).map((field, index) =>
                    <div key={field.path} className="mt-3 rounded-2xl border border-[var(--border)] bg-white p-4">
                      <p className="mb-2 text-xs font-medium text-[var(--mid)]">Original answer {index + 1}</p>
                      <SelectableOriginalWriting text={field.text} fieldPath={field.path}
                        occurrences={parentIdentifiedOccurrences}
                        className="whitespace-pre-wrap text-sm leading-7 text-[var(--ink)]">
                        {renderHighlightedText(field.text, [], passageReview.rows.filter((row) => row.fieldPath === field.path))}
                      </SelectableOriginalWriting>
                    </div>)}
                </div>
                <ReviewAddWordForm spellingAction={addMissedWordToSubmissionReview}
                  contextAction={addParentContextualMiss} submissionId={submission.id}
                  redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
                  occurrences={parentIdentifiedOccurrences} sourceFields={passageReview.sourceFields} />
                {parentOccurrenceIndex.reason ? <p role="status" className="text-sm text-amber-900">{parentOccurrenceIndex.reason}</p> : null}
              </div>
            ) },
            { id: "context", title: "Context analysis", summary: "AI and parent choices", content: (
              <div className="grid gap-4">
                <ContextualUseSuggestionsPanel rows={contextReviewDeliveries}
                  redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)} />
                {passageReview.status === "pending" ? <p role="status" className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">Context checking is still running. Refresh before sending work back.</p> : null}
                {passageReview.status === "unavailable" ? <p role="status" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-800">AI context analysis was unavailable for this submission. If the writing has verified word positions, you can add a contextual word in Original writing.</p> : null}
                {passageReview.status === "failed" ? <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900">
                  Luna could not finish checking this writing. You can add a contextual word manually and continue.
                  {passageReview.canRetry ? <form action={retryPassageContextScan} className="mt-2">
                    <input type="hidden" name="submission_id" value={submission.id} />
                    <button className="brand-secondary-btn">Try again</button>
                  </form> : null}
                </div> : null}
                <Suspense fallback={<p role="status" className="text-sm text-[var(--mid)]">Loading context decisions…</p>}>
                  <DeferredLessonContextTable rows={[]} contextPairsPromise={contextPairsPromise}
                    contextRows={contextAdvisory.rows} passageRows={passageReview.rows}
                    contextReadOnly={!contextAdvisory.enabled} options={[]}
                    submissionId={submission.id}
                    redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
                    reviewWorkflowPhase={reviewWorkflowPhase} />
                </Suspense>
                <Suspense fallback={<p role="status" className="text-sm text-[var(--mid)]">Loading parent context choices…</p>}>
                  <ParentContextualFeedbackCases submissionId={submission.id}
                    parentUserId={user.id} childId={submission.child_id} />
                </Suspense>
              </div>
            ) },
            { id: "words", title: "Added misspellings", summary: "Review spelling decisions",
              count: isResubmission ? unifiedSpellingReviewItems.length : 0, content: (
              <Suspense fallback={<p role="status" className="text-sm text-[var(--mid)]">Loading spelling decisions…</p>}>
                <DeferredLessonSpellingReviewContent supabase={supabase} rowsPromise={unifiedRowsPromise}
                  contextPairsPromise={contextPairsPromise}
                  submissionId={submission.id}
                  parentUserId={user.id} childId={submission.child_id} taskId={submission.task_id}
                  redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
                  phase={reviewWorkflowPhase} />
              </Suspense>
            ) },
            { id: "authentic", title: "Authentic use from original writing", summary: authenticUse?.eligibleForAwards ? "Confirmation needed" : "Review evidence", content: (
              <Suspense fallback={<p role="status" className="text-sm text-[var(--mid)]">Loading authentic-use evidence…</p>}>
                <DeferredLessonAuthenticUse reviewPromise={authenticUsePromise} />
              </Suspense>
            ) },
            { id: "feedback", title: "Structured lesson feedback", summary: "Notes beside answers", keepMounted: true, content: (
              <LessonFeedbackSection submissionId={submission.id}
                parentReviewNote={submission.parent_review_note} reviewableFields={reviewableFields} />
            ) },
          ]}
        />
        <Suspense fallback={<section className="brand-card rounded-3xl p-4 text-sm text-[var(--mid)]" role="status">Checking review decisions…</section>}>
          <DeferredLessonReviewActionFooter submissionId={submission.id}
            redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
            parentReviewNote={submission.parent_review_note} reviewableFields={reviewableFields}
            parentReviewStatus={submission.parent_review_status}
            contextDeliveryCount={contextReviewDeliveries.length}
            rowsPromise={unifiedRowsPromise} evidencePromise={freeWritingEvidencePromise}
            authenticUsePromise={authenticUsePromise} passageReview={passageReview} />
        </Suspense>
      </section></ReviewWordSelectionProvider>
    </AppShell>
  );
}
