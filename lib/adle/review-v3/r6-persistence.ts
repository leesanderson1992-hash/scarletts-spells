import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { validateCompiledReviewSnapshotV3 } from "./snapshot-validator";
import { CONUNDRUM_VIDEO_BLOCKER } from "./conundrum-video";
import type {
  AdleTodaySessionReadModel,
  AdleSpecialistCheckpointR6View,
  ReviewR6WritingSessionView,
} from "./r6-session-contracts";
import type { ReviewChallengeType } from "./contracts";
import {
  finalizeMixedPolicyReviewSessionC2B6,
  reviewSessionContainsTargetV2,
} from "../review-policy/mixed-policy-finalization";

type Client = SupabaseClient;

function failure(boundary: string, error: { message?: string } | null): never {
  throw new Error(`${boundary}: ${error?.message ?? "unknown error"}`);
}

export async function loadAdleTodaySessionR6(input: {
  client: Client;
  parentUserId: string;
  childId: string;
  assignmentDate: string;
}): Promise<AdleTodaySessionReadModel | null> {
  const orchestrationResult = await input.client
    .from("adle_today_session_orchestrations")
    .select("daily_assignment_id,assignment_date,major_stage,state_version,blocker_code")
    .eq("child_id", input.childId)
    .eq("parent_user_id", input.parentUserId)
    .neq("major_stage", "session_complete")
    .order("assignment_date", { ascending: true })
    .limit(2);
  if (orchestrationResult.error) {
    if (orchestrationResult.error.message.includes("adle_today_session_orchestrations")) return null;
    failure("loadAdleTodaySessionR6:orchestration", orchestrationResult.error);
  }
  let rows = orchestrationResult.data ?? [];
  if (rows.length === 0) {
    const completed = await input.client
      .from("adle_today_session_orchestrations")
      .select("daily_assignment_id,assignment_date,major_stage,state_version,blocker_code")
      .eq("child_id", input.childId)
      .eq("parent_user_id", input.parentUserId)
      .eq("assignment_date", input.assignmentDate)
      .eq("major_stage", "session_complete")
      .limit(1);
    if (completed.error) failure("loadAdleTodaySessionR6:completed", completed.error);
    rows = completed.data ?? [];
  }
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    return {
      childId: input.childId,
      assignmentDate: input.assignmentDate,
      assignmentId: null,
      majorStage: "blocked",
      stateVersion: 0,
      blockerCode: "multiple_unfinished_adle_today_sessions",
      review: null,
      specialist: null,
    };
  }
  const orchestration = rows[0] as {
    daily_assignment_id: string;
    assignment_date: string;
    major_stage: AdleTodaySessionReadModel["majorStage"];
    state_version: number;
    blocker_code: string | null;
  };
  const [headerResult, reviewResult] = await Promise.all([
    input.client.from("daily_assignments")
      .select("id,status,compiled_review_snapshot,compiled_lesson_snapshot,lesson_route_metadata")
      .eq("id", orchestration.daily_assignment_id)
      .eq("child_id", input.childId)
      .eq("parent_user_id", input.parentUserId)
      .maybeSingle(),
    input.client.from("adle_review_sessions")
      .select("id,assignment_item_id,completed_at")
      .eq("daily_assignment_id", orchestration.daily_assignment_id)
      .maybeSingle(),
  ]);
  if (headerResult.error || !headerResult.data) {
    failure("loadAdleTodaySessionR6:header", headerResult.error);
  }
  if (reviewResult.error) failure("loadAdleTodaySessionR6:review", reviewResult.error);
  const header = headerResult.data as {
    compiled_review_snapshot: unknown | null;
    compiled_lesson_snapshot: unknown | null;
    lesson_route_metadata: unknown | null;
    status: string;
  };
  const reviewSession = reviewResult.data as {
    id: string;
    assignment_item_id: string;
    completed_at: string | null;
  } | null;
  let review: AdleTodaySessionReadModel["review"] = null;
  if (header.compiled_review_snapshot !== null || reviewSession !== null) {
    const validated = validateCompiledReviewSnapshotV3(header.compiled_review_snapshot);
    if (!validated.ok || !reviewSession) {
      return {
        childId: input.childId,
        assignmentDate: orchestration.assignment_date,
        assignmentId: orchestration.daily_assignment_id,
        majorStage: "blocked",
        stateVersion: orchestration.state_version,
        blockerCode: !validated.ok && validated.blockers.some((blocker) => blocker.code === CONUNDRUM_VIDEO_BLOCKER)
          ? CONUNDRUM_VIDEO_BLOCKER : "review_r6_snapshot_or_session_conflict",
        review: null,
        specialist: null,
      };
    }
    review = {
      itemId: reviewSession.assignment_item_id,
      sessionId: reviewSession.id,
      complete: reviewSession.completed_at !== null,
      snapshot: validated.snapshot,
    };
  }
  return {
    childId: input.childId,
    assignmentDate: orchestration.assignment_date,
    assignmentId: orchestration.daily_assignment_id,
    majorStage: header.status === "completed" ? "session_complete" : orchestration.major_stage,
    stateVersion: orchestration.state_version,
    blockerCode: orchestration.blocker_code,
    review,
    specialist: header.compiled_lesson_snapshot === null ? null : {
      complete: header.status === "completed",
      compiledLessonSnapshot: header.compiled_lesson_snapshot,
      lessonRouteMetadata: header.lesson_route_metadata,
    },
  };
}

export async function loadReviewR6WritingSession(input: {
  client: Client;
  reviewSessionId: string;
  snapshotFingerprint: string;
}): Promise<ReviewR6WritingSessionView> {
  const result = await input.client.from("adle_review_sessions")
    .select("id,state_version,selected_challenge_type,draft_text,stage,writing_started_at,writing_deadline_at,extension_seconds,submitted_writing_text,completed_at,snapshot_fingerprint")
    .eq("id", input.reviewSessionId)
    .maybeSingle();
  if (result.error || !result.data) failure("loadReviewR6WritingSession", result.error);
  if (result.data.snapshot_fingerprint !== input.snapshotFingerprint) {
    throw new Error("loadReviewR6WritingSession: snapshot fingerprint conflict");
  }
  return {
    reviewSessionId: result.data.id as string,
    stateVersion: result.data.state_version as number,
    selectedChallengeType: result.data.selected_challenge_type as string | null,
    draftText: result.data.draft_text as string,
    stage: result.data.stage as string,
    writingStartedAt: result.data.writing_started_at as string | null,
    writingDeadlineAt: result.data.writing_deadline_at as string | null,
    extensionSeconds: result.data.extension_seconds as number | null,
    submittedWritingText: result.data.submitted_writing_text as string | null,
    completedAt: result.data.completed_at as string | null,
  };
}

export async function loadAdleSpecialistCheckpointR6(input: {
  client: Client;
  assignmentId: string;
}): Promise<AdleSpecialistCheckpointR6View | null> {
  const result = await input.client.from("adle_specialist_stage_checkpoints")
    .select("adapter_key,checkpoint_schema_version,lesson_snapshot_fingerprint,checkpoint_payload,state_version,completed_at")
    .eq("daily_assignment_id", input.assignmentId)
    .maybeSingle();
  if (result.error) failure("loadAdleSpecialistCheckpointR6", result.error);
  if (!result.data || result.data.completed_at !== null) return null;
  return {
    adapterKey: result.data.adapter_key as string,
    checkpointSchemaVersion: result.data.checkpoint_schema_version as string,
    lessonSnapshotFingerprint: result.data.lesson_snapshot_fingerprint as string,
    checkpointPayload: result.data.checkpoint_payload as Record<string, unknown>,
    stateVersion: result.data.state_version as number,
  };
}

export async function transitionReviewR6Writing(input: {
  client: Client;
  reviewSessionId: string;
  snapshotFingerprint: string;
  transitionKind: "select_prompt" | "start_writing" | "save_draft" | "extend_writing";
  challengeType?: ReviewChallengeType;
  draftText?: string;
  extensionSeconds?: 300 | 600 | 900;
  authorizedParentUserId?: string;
  expectedStateVersion: number;
  idempotencyKey: string;
}): Promise<ReviewR6WritingSessionView> {
  const result = await input.client.rpc("transition_adle_review_writing_r6", {
    p_review_session_id: input.reviewSessionId,
    p_snapshot_fingerprint: input.snapshotFingerprint,
    p_transition_kind: input.transitionKind,
    p_challenge_type: input.challengeType ?? null,
    p_draft_text: input.draftText ?? null,
    p_extension_seconds: input.extensionSeconds ?? null,
    p_authorized_parent_user_id: input.authorizedParentUserId ?? null,
    p_expected_state_version: input.expectedStateVersion,
    p_idempotency_key: input.idempotencyKey,
  });
  if (result.error) failure("transitionReviewR6Writing", result.error);
  return loadReviewR6WritingSession(input);
}

export async function finalizeReviewStageR6(input: {
  client: Client;
  reviewSessionId: string;
  snapshotFingerprint: string;
  idempotencyKey: string;
}): Promise<Record<string, unknown>> {
  if (await reviewSessionContainsTargetV2({
    client: input.client,
    reviewSessionId: input.reviewSessionId,
  })) {
    return finalizeMixedPolicyReviewSessionC2B6(input);
  }
  const result = await input.client.rpc("finalize_adle_review_stage_r6", {
    p_review_session_id: input.reviewSessionId,
    p_snapshot_fingerprint: input.snapshotFingerprint,
    p_idempotency_key: input.idempotencyKey,
  });
  if (result.error) failure("finalizeReviewStageR6", result.error);
  return (result.data ?? {}) as Record<string, unknown>;
}

/** Adds the server-owned major-stage record to a lesson-only assignment for
 * active R6 scope. Inactive and pre-migration environments remain no-ops. */
export async function adoptSpecialistOnlySessionR6(input: {
  client: Client;
  assignmentId: string;
}): Promise<boolean> {
  const result = await input.client.rpc("adopt_adle_specialist_only_session_r6", {
    p_daily_assignment_id: input.assignmentId,
  });
  if (result.error) {
    if (result.error.code === "42883" || result.error.message.includes("adopt_adle_specialist_only_session_r6")) {
      return false;
    }
    failure("adoptSpecialistOnlySessionR6", result.error);
  }
  return Boolean((result.data as { adopted?: boolean } | null)?.adopted);
}
