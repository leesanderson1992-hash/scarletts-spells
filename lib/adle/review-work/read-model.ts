import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any -- Review v3 additive tables precede generated database types. */
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CompiledReviewSnapshotV3,
  ReviewDueKindV3,
  ReviewOriginalOutcome,
  ReviewOriginalOutcomeSource,
  ReviewRepairState,
} from "@/lib/adle/review-v3/contracts";
import { validateCompiledReviewSnapshotV3 } from "@/lib/adle/review-v3/snapshot-validator";
import {
  buildAdleReviewWorkSourceId,
  parseAdleReviewWorkSourceId,
} from "@/lib/adle/review-work/source-id";

export type AdleReviewObservationalStatus =
  | "available_to_review"
  | "reviewed";

export type AdleReviewWorkSource = {
  sourceType: "adle_review_v3";
  observationalStatus: AdleReviewObservationalStatus;
  progressionRole: "none";
  learnerReviewCompleted: true;
};

export type AdleReviewWorkSummary = AdleReviewWorkSource & {
  sourceId: string;
  reviewSessionId: string;
  dailyAssignmentId: string;
  assignmentDate: string;
  completedAt: string;
  challengeType: string;
  challengeTitle: string;
  targetCount: number;
  originalSuccessCount: number;
  originalFailureCount: number;
  repairedCount: number;
};

export type AdleReviewRepairAttemptEvidence = {
  id: string;
  attemptNumber: number;
  attemptText: string;
  isCorrect: boolean;
  createdAt: string;
  attemptKind: "repair_retry";
  evidenceClass: "immediate_repair_attempt";
};

export type AdleReviewTargetEvidence = {
  encounterId: string;
  order: number;
  canonicalWordId: string;
  canonicalSpelling: string;
  originalOutcome: Exclude<ReviewOriginalOutcome, "pending">;
  originalOutcomeSource: Exclude<ReviewOriginalOutcomeSource, null>;
  writingDisposition: string;
  attributionProvenance: Record<string, unknown> | null;
  originalAttempt: {
    id: string;
    attemptText: string | null;
    isCorrect: boolean | null;
    attemptKind: string;
    evidenceClass: string;
    createdAt: string;
  } | null;
  repairState: Extract<
    ReviewRepairState,
    "not_required" | "completed_correct" | "attempted_not_secured"
  >;
  repairAttempts: AdleReviewRepairAttemptEvidence[];
  memoryCue: {
    id: string;
    versionNumber: number;
    selectedTrickyText: string;
    cueText: string;
  } | null;
  outcomeTransition: {
    id: string;
    eventType: string;
    originalResult: "success" | "failure";
    resultSource: "review_writing" | "review_audio_check";
    dueKind: ReviewDueKindV3;
    frozenDueOn: string;
    frozenIntervalIndex: number;
    reviewCompletedOn: string;
  };
  currentSchedule: {
    membershipStatus: string;
    catchUpStage: number;
    nextRetestDueOn: string | null;
    preRetirementCheckDueOn: string | null;
    transitionCount: number;
    lastReviewCompletedOn: string | null;
  };
  promptedWritingUse: boolean;
};

export type AdleReviewParentIssue = {
  id: string;
  positionStart: number;
  positionEnd: number;
  observedSpelling: string;
  correctSpelling: string;
  resolutionStatus:
    | "needs_route"
    | "confirmed"
    | "not_a_learning_issue"
    | "sent_to_admin";
  sourceSuggestionId: string;
  parentVerificationId: string | null;
  candidateMappingId: string | null;
  catalogReviewCaseId: string | null;
  canonicalRecommendationId: string | null;
  analysisPayload: Record<string, unknown>;
};

export type AdleReviewWorkDetail = AdleReviewWorkSource & {
  sourceId: string;
  reviewSessionId: string;
  dailyAssignmentId: string;
  childId: string;
  parentUserId: string;
  assignmentDate: string;
  completedAt: string;
  snapshotFingerprint: string;
  challengeType: string;
  challengeTitle: string;
  challengeText: string;
  challengeInstruction: string;
  submittedWritingText: string;
  writingSubmittedAt: string;
  targets: AdleReviewTargetEvidence[];
  parentIssues: AdleReviewParentIssue[];
};

function selectedPrompt(
  snapshot: CompiledReviewSnapshotV3,
  promptVersionId: string,
) {
  return (
    snapshot.promptCandidates.find(
      (candidate) => candidate.promptVersionId === promptVersionId,
    ) ?? null
  );
}

function assertQuery(
  context: string,
  error: { message?: string } | null | undefined,
) {
  if (error) throw new Error(`${context}: ${error.message ?? "query failed"}`);
}

export async function loadAdleReviewWorkSummaries(input: {
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
  parentUserId: string;
  childId: string;
}): Promise<AdleReviewWorkSummary[]> {
  const assignmentsResult = await input.userClient
    .from("daily_assignments")
    .select("id,assignment_date,compiled_review_snapshot")
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .not("compiled_review_snapshot", "is", null);
  assertQuery("ADLE Review Work assignments", assignmentsResult.error);

  const ownedAssignments = (assignmentsResult.data ?? [])
    .map((row: any) => {
      const validated = validateCompiledReviewSnapshotV3(
        row.compiled_review_snapshot,
      );
      return validated.ok
        ? {
            id: row.id as string,
            assignmentDate: row.assignment_date as string,
            snapshot: validated.snapshot,
          }
        : null;
    })
    .filter(Boolean) as Array<{
    id: string;
    assignmentDate: string;
    snapshot: CompiledReviewSnapshotV3;
  }>;
  if (ownedAssignments.length === 0) return [];

  const assignmentById = new Map(
    ownedAssignments.map((assignment) => [assignment.id, assignment]),
  );
  const sessionsResult = await input.serviceClient
    .from("adle_review_sessions")
    .select(
      "id,daily_assignment_id,parent_user_id,child_id,snapshot_fingerprint,selected_prompt_version_id,selected_challenge_type,completed_at",
    )
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("stage", "completed")
    .not("completed_at", "is", null)
    .in(
      "daily_assignment_id",
      ownedAssignments.map((assignment) => assignment.id),
    )
    .order("completed_at", { ascending: false });
  assertQuery("ADLE Review Work sessions", sessionsResult.error);
  const sessions = sessionsResult.data ?? [];
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((row: any) => row.id as string);
  const [receiptsResult, encountersResult] = await Promise.all([
    input.serviceClient
      .from("adle_review_parent_reviews")
      .select("review_session_id")
      .eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.childId)
      .in("review_session_id", sessionIds),
    input.serviceClient
      .from("adle_review_word_encounters")
      .select("review_session_id,original_outcome,repair_state")
      .in("review_session_id", sessionIds),
  ]);
  assertQuery("ADLE Review Work receipts", receiptsResult.error);
  assertQuery("ADLE Review Work encounter summaries", encountersResult.error);
  const reviewedSessionIds = new Set(
    (receiptsResult.data ?? []).map((row: any) => row.review_session_id),
  );

  return sessions.flatMap((row: any) => {
    const assignment = assignmentById.get(row.daily_assignment_id);
    if (
      !assignment ||
      assignment.snapshot.provenance.sourceFingerprint !==
        row.snapshot_fingerprint ||
      typeof row.selected_prompt_version_id !== "string" ||
      typeof row.completed_at !== "string"
    ) {
      return [];
    }
    const prompt = selectedPrompt(
      assignment.snapshot,
      row.selected_prompt_version_id,
    );
    if (!prompt) return [];
    const encounters = (encountersResult.data ?? []).filter(
      (encounter: any) => encounter.review_session_id === row.id,
    );
    return [
      {
        sourceType: "adle_review_v3" as const,
        sourceId: buildAdleReviewWorkSourceId({
          dailyAssignmentId: row.daily_assignment_id,
          reviewSessionId: row.id,
        }),
        reviewSessionId: row.id,
        dailyAssignmentId: row.daily_assignment_id,
        assignmentDate: assignment.assignmentDate,
        completedAt: row.completed_at,
        challengeType: row.selected_challenge_type ?? prompt.challengeType,
        challengeTitle: prompt.promptText,
        targetCount: assignment.snapshot.targets.length,
        originalSuccessCount: encounters.filter(
          (encounter: any) => encounter.original_outcome === "success",
        ).length,
        originalFailureCount: encounters.filter(
          (encounter: any) => encounter.original_outcome === "failure",
        ).length,
        repairedCount: encounters.filter(
          (encounter: any) => encounter.repair_state === "completed_correct",
        ).length,
        observationalStatus: reviewedSessionIds.has(row.id)
          ? ("reviewed" as const)
          : ("available_to_review" as const),
        progressionRole: "none" as const,
        learnerReviewCompleted: true as const,
      },
    ];
  });
}

export async function loadAdleReviewWorkDetail(input: {
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
  parentUserId: string;
  childId: string;
  sourceId: string;
}): Promise<AdleReviewWorkDetail | null> {
  const source = parseAdleReviewWorkSourceId(input.sourceId);
  if (!source) return null;

  // Ownership is established through the user-scoped assignment before any
  // service-role Review evidence is loaded.
  const assignmentResult = await input.userClient
    .from("daily_assignments")
    .select("id,child_id,parent_user_id,assignment_date,compiled_review_snapshot")
    .eq("id", source.dailyAssignmentId)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .maybeSingle();
  if (assignmentResult.error || !assignmentResult.data) return null;
  const validated = validateCompiledReviewSnapshotV3(
    (assignmentResult.data as any).compiled_review_snapshot,
  );
  if (!validated.ok) return null;
  const snapshot = validated.snapshot;

  const sessionResult = await input.serviceClient
    .from("adle_review_sessions")
    .select(
      "id,daily_assignment_id,assignment_item_id,child_id,parent_user_id,snapshot_fingerprint,selected_prompt_version_id,selected_challenge_type,submitted_writing_text,writing_submitted_at,completed_at,stage",
    )
    .eq("id", source.reviewSessionId)
    .eq("daily_assignment_id", source.dailyAssignmentId)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("stage", "completed")
    .not("completed_at", "is", null)
    .maybeSingle();
  if (sessionResult.error || !sessionResult.data) return null;
  const session = sessionResult.data as any;
  if (
    session.snapshot_fingerprint !== snapshot.provenance.sourceFingerprint ||
    typeof session.selected_prompt_version_id !== "string" ||
    typeof session.submitted_writing_text !== "string" ||
    typeof session.writing_submitted_at !== "string" ||
    typeof session.completed_at !== "string"
  ) {
    return null;
  }
  const prompt = selectedPrompt(snapshot, session.selected_prompt_version_id);
  if (!prompt) return null;

  const encountersResult = await input.serviceClient
    .from("adle_review_word_encounters")
    .select(
      "id,review_session_id,schedule_word_id,canonical_word_id,target_order,writing_disposition,original_outcome,original_outcome_source,attribution_provenance,original_attempt_event_id,review_outcome_event_id,repair_state,repair_memory_cue_version_id",
    )
    .eq("review_session_id", session.id)
    .order("target_order", { ascending: true });
  assertQuery("ADLE Review Work encounters", encountersResult.error);
  const encounters = encountersResult.data ?? [];
  if (encounters.length !== snapshot.targets.length) return null;
  const encounterIds = encounters.map((row: any) => row.id as string);
  const attemptIds = encounters
    .map((row: any) => row.original_attempt_event_id as string | null)
    .filter((value): value is string => Boolean(value));
  const cueIds = encounters
    .map((row: any) => row.repair_memory_cue_version_id as string | null)
    .filter((value): value is string => Boolean(value));
  const scheduleIds = encounters.map((row: any) => row.schedule_word_id as string);

  const [
    receiptResult,
    repairsResult,
    attemptsResult,
    cuesResult,
    outcomesResult,
    schedulesResult,
    promptedUseResult,
    issueLinksResult,
  ] = await Promise.all([
    input.serviceClient
      .from("adle_review_parent_reviews")
      .select("review_session_id")
      .eq("review_session_id", session.id)
      .eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.childId)
      .maybeSingle(),
    input.serviceClient
      .from("adle_review_repair_attempts")
      .select("id,review_encounter_id,attempt_number,attempt_text,is_correct,created_at")
      .in("review_encounter_id", encounterIds)
      .order("attempt_number", { ascending: true }),
    attemptIds.length
      ? input.serviceClient
          .from("adle_assignment_attempt_events")
          .select("id,attempt_text,is_correct,attempt_kind,evidence_class,created_at")
          .in("id", attemptIds)
      : Promise.resolve({ data: [], error: null }),
    cueIds.length
      ? input.serviceClient
          .from("adle_review_memory_cue_versions")
          .select("id,version_number,selected_tricky_text,cue_text")
          .in("id", cueIds)
      : Promise.resolve({ data: [], error: null }),
    input.serviceClient
      .from("adle_review_outcome_events")
      .select(
        "id,review_encounter_id,event_type,original_result,result_source,due_kind,frozen_due_on,frozen_interval_index,review_completed_on",
      )
      .eq("review_session_id", session.id),
    input.serviceClient
      .from("adle_review_schedule_words")
      .select(
        "id,membership_status,catch_up_stage,next_retest_due_on,pre_retirement_check_due_on,word_schedule_transition_count,word_last_review_completed_on",
      )
      .in("id", scheduleIds),
    input.serviceClient
      .from("adle_authentic_use_events")
      .select("review_encounter_id")
      .eq("review_session_id", session.id)
      .eq("provenance_kind", "prompted_review_writing_application")
      .eq("parent_verified", false),
    input.serviceClient
      .from("adle_review_parent_issue_links")
      .select(
        "id,position_start,position_end,observed_spelling_normalized,correct_spelling_normalized,resolution_status,source_suggestion_id,parent_verification_id,candidate_mapping_id,catalog_review_case_id,canonical_recommendation_id,analysis_payload",
      )
      .eq("review_session_id", session.id)
      .eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.childId)
      .order("created_at", { ascending: true }),
  ]);
  for (const [context, result] of [
    ["receipt", receiptResult],
    ["repair attempts", repairsResult],
    ["original attempts", attemptsResult],
    ["Memory Cues", cuesResult],
    ["outcomes", outcomesResult],
    ["schedules", schedulesResult],
    ["prompted writing use", promptedUseResult],
    ["parent issues", issueLinksResult],
  ] as const) {
    assertQuery(`ADLE Review Work ${context}`, result.error);
  }

  const attemptById = new Map(
    (attemptsResult.data ?? []).map((row: any) => [row.id, row]),
  );
  const cueById = new Map((cuesResult.data ?? []).map((row: any) => [row.id, row]));
  const outcomeByEncounterId = new Map(
    (outcomesResult.data ?? []).map((row: any) => [row.review_encounter_id, row]),
  );
  const scheduleById = new Map(
    (schedulesResult.data ?? []).map((row: any) => [row.id, row]),
  );
  const promptedEncounterIds = new Set(
    (promptedUseResult.data ?? []).map((row: any) => row.review_encounter_id),
  );

  const targets: AdleReviewTargetEvidence[] = [];
  for (const rawEncounter of encounters) {
    const encounter = rawEncounter as any;
    const frozenTarget = snapshot.targets.find(
      (target) => target.encounterId === encounter.id,
    );
    const outcome = outcomeByEncounterId.get(encounter.id) as any;
    const schedule = scheduleById.get(encounter.schedule_word_id) as any;
    if (
      !frozenTarget ||
      !outcome ||
      !schedule ||
      frozenTarget.order !== encounter.target_order ||
      frozenTarget.canonicalWordId !== encounter.canonical_word_id ||
      frozenTarget.schedule.scheduleWordId !== encounter.schedule_word_id ||
      encounter.original_outcome === "pending" ||
      outcome.id !== encounter.review_outcome_event_id ||
      outcome.original_result !== encounter.original_outcome ||
      outcome.result_source !==
        (encounter.original_outcome_source === "writing"
          ? "review_writing"
          : "review_audio_check") ||
      !["not_required", "completed_correct", "attempted_not_secured"].includes(
        encounter.repair_state,
      )
    ) {
      return null;
    }
    const originalAttempt = encounter.original_attempt_event_id
      ? (attemptById.get(encounter.original_attempt_event_id) as any)
      : null;
    const memoryCue = encounter.repair_memory_cue_version_id
      ? (cueById.get(encounter.repair_memory_cue_version_id) as any)
      : null;
    targets.push({
      encounterId: encounter.id,
      order: encounter.target_order,
      canonicalWordId: encounter.canonical_word_id,
      canonicalSpelling: frozenTarget.canonicalSpelling,
      originalOutcome: encounter.original_outcome,
      originalOutcomeSource: encounter.original_outcome_source,
      writingDisposition: encounter.writing_disposition,
      attributionProvenance:
        encounter.attribution_provenance &&
        typeof encounter.attribution_provenance === "object"
          ? encounter.attribution_provenance
          : null,
      originalAttempt: originalAttempt
        ? {
            id: originalAttempt.id,
            attemptText: originalAttempt.attempt_text,
            isCorrect: originalAttempt.is_correct,
            attemptKind: originalAttempt.attempt_kind,
            evidenceClass: originalAttempt.evidence_class,
            createdAt: originalAttempt.created_at,
          }
        : null,
      repairState: encounter.repair_state,
      repairAttempts: (repairsResult.data ?? [])
        .filter((row: any) => row.review_encounter_id === encounter.id)
        .map((row: any) => ({
          id: row.id,
          attemptNumber: row.attempt_number,
          attemptText: row.attempt_text,
          isCorrect: row.is_correct,
          createdAt: row.created_at,
          attemptKind: "repair_retry" as const,
          evidenceClass: "immediate_repair_attempt" as const,
        })),
      memoryCue: memoryCue
        ? {
            id: memoryCue.id,
            versionNumber: memoryCue.version_number,
            selectedTrickyText: memoryCue.selected_tricky_text,
            cueText: memoryCue.cue_text,
          }
        : null,
      outcomeTransition: {
        id: outcome.id,
        eventType: outcome.event_type,
        originalResult: outcome.original_result,
        resultSource: outcome.result_source,
        dueKind: outcome.due_kind,
        frozenDueOn: outcome.frozen_due_on,
        frozenIntervalIndex: outcome.frozen_interval_index,
        reviewCompletedOn: outcome.review_completed_on,
      },
      currentSchedule: {
        membershipStatus: schedule.membership_status,
        catchUpStage: schedule.catch_up_stage,
        nextRetestDueOn: schedule.next_retest_due_on,
        preRetirementCheckDueOn: schedule.pre_retirement_check_due_on,
        transitionCount: schedule.word_schedule_transition_count,
        lastReviewCompletedOn: schedule.word_last_review_completed_on,
      },
      promptedWritingUse: promptedEncounterIds.has(encounter.id),
    });
  }

  return {
    sourceType: "adle_review_v3",
    sourceId: input.sourceId,
    reviewSessionId: session.id,
    dailyAssignmentId: session.daily_assignment_id,
    childId: session.child_id,
    parentUserId: session.parent_user_id,
    assignmentDate: (assignmentResult.data as any).assignment_date,
    completedAt: session.completed_at,
    snapshotFingerprint: session.snapshot_fingerprint,
    challengeType: session.selected_challenge_type ?? prompt.challengeType,
    challengeTitle: prompt.promptText,
    challengeText: prompt.promptText,
    challengeInstruction: prompt.instructionText,
    submittedWritingText: session.submitted_writing_text,
    writingSubmittedAt: session.writing_submitted_at,
    observationalStatus: receiptResult.data
      ? "reviewed"
      : "available_to_review",
    progressionRole: "none",
    learnerReviewCompleted: true,
    targets,
    parentIssues: (issueLinksResult.data ?? []).map((row: any) => ({
      id: row.id,
      positionStart: row.position_start,
      positionEnd: row.position_end,
      observedSpelling: row.observed_spelling_normalized,
      correctSpelling: row.correct_spelling_normalized,
      resolutionStatus: row.resolution_status,
      sourceSuggestionId: row.source_suggestion_id,
      parentVerificationId: row.parent_verification_id,
      candidateMappingId: row.candidate_mapping_id,
      catalogReviewCaseId: row.catalog_review_case_id,
      canonicalRecommendationId: row.canonical_recommendation_id,
      analysisPayload:
        row.analysis_payload && typeof row.analysis_payload === "object"
          ? row.analysis_payload
          : {},
    })),
  };
}
