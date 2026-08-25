"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { validateCompiledReviewSnapshotV3 } from "@/lib/adle/review-v3/snapshot-validator";
import {
  answerReviewR31AttemptQuestionDurably,
  confirmReviewR31SuggestionDurably,
  confirmReviewR31WritingSpanDurably,
  hydrateReviewR3Session,
  submitReviewR3AudioCheckDurably,
  submitReviewR3WritingDurably,
} from "@/lib/adle/review-v3/r3-persistence";
import {
  beginReviewRepairDurably,
  hydrateReviewR4Session,
  moveReviewRepairToCoverDurably,
  moveReviewRepairToTrickyPartDurably,
  moveReviewRepairToTryAgainDurably,
  saveReviewRepairMemoryCueDurably,
  saveReviewRepairTrickySpanDurably,
  submitReviewRepairRetryDurably,
} from "@/lib/adle/review-v3/r4-persistence";
import {
  finalizeReviewStageR6,
  loadReviewR6WritingSession,
  transitionReviewR6Writing,
} from "@/lib/adle/review-v3/r6-persistence";
import type { CompiledReviewSnapshotV3, ReviewChallengeType } from "@/lib/adle/review-v3/contracts";
import { ensureSpecialistStageR6 } from "@/lib/adle/review-v3/r6-specialist-stage";

type ReviewActionEnvelope = {
  assignmentId: string;
  reviewSessionId: string;
  snapshotFingerprint: string;
};

async function authorizedReview(input: ReviewActionEnvelope): Promise<{
  serviceClient: ReturnType<typeof createServiceRoleClient>;
  userClient: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  userEmail: string;
  childId: string;
  assignmentDate: string;
  snapshot: CompiledReviewSnapshotV3;
}> {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email) throw new Error("review_r6_not_authenticated");
  const header = await userClient.from("daily_assignments")
    .select("id,child_id,assignment_date,compiled_review_snapshot")
    .eq("id", input.assignmentId)
    .eq("parent_user_id", user.id)
    .maybeSingle();
  if (header.error || !header.data) throw new Error("review_r6_assignment_not_owned");
  const validated = validateCompiledReviewSnapshotV3(header.data.compiled_review_snapshot);
  if (!validated.ok || validated.snapshot.provenance.sourceFingerprint !== input.snapshotFingerprint) {
    throw new Error("review_r6_snapshot_invalid");
  }
  const serviceClient = createServiceRoleClient();
  const session = await serviceClient.from("adle_review_sessions")
    .select("id,daily_assignment_id,parent_user_id")
    .eq("id", input.reviewSessionId)
    .eq("daily_assignment_id", input.assignmentId)
    .eq("parent_user_id", user.id)
    .maybeSingle();
  if (session.error || !session.data) throw new Error("review_r6_session_not_owned");
  return {
    serviceClient,
    userClient,
    userId: user.id,
    userEmail: user.email,
    childId: header.data.child_id as string,
    assignmentDate: header.data.assignment_date as string,
    snapshot: validated.snapshot,
  };
}

export type ReviewR6GatewayRequest = ReviewActionEnvelope & (
  | { action: "hydrate_r3" }
  | { action: "submit_writing"; finalWriting: string; idempotencyKey: string }
  | { action: "submit_audio"; encounterId: string; response: string; idempotencyKey: string }
  | { action: "confirm_suggestion" | "answer_attempt"; encounterId: string; decision: "yes" | "no"; idempotencyKey: string }
  | { action: "confirm_span"; encounterId: string; startOffset: number; endOffset: number; idempotencyKey: string }
  | { action: "hydrate_r4" }
  | { action: "begin_repair" | "move_tricky" | "move_cover" | "move_try"; encounterId: string; idempotencyKey: string }
  | { action: "save_tricky"; encounterId: string; graphemeStart: number; graphemeEnd: number; selectedText: string; idempotencyKey: string }
  | { action: "save_cue"; encounterId: string; cueText: string; retainCueVersionId?: string; idempotencyKey: string }
  | { action: "repair_retry"; encounterId: string; response: string; idempotencyKey: string }
  | { action: "hydrate_writing" }
  | { action: "select_prompt" | "start_writing"; challengeType: ReviewChallengeType; expectedStateVersion: number; idempotencyKey: string }
  | { action: "save_draft"; draftText: string; expectedStateVersion: number; idempotencyKey: string }
  | { action: "extend_writing"; extensionSeconds: 300 | 600 | 900; expectedStateVersion: number; password: string; idempotencyKey: string }
  | { action: "finalize"; idempotencyKey: string }
);

export async function reviewR6GatewayAction(request: ReviewR6GatewayRequest): Promise<unknown> {
  const context = await authorizedReview(request);
  const common = {
    client: context.serviceClient,
    snapshot: context.snapshot,
    reviewSessionId: request.reviewSessionId,
  };
  switch (request.action) {
    case "hydrate_r3": return hydrateReviewR3Session(common);
    case "submit_writing": return submitReviewR3WritingDurably({
      ...common,
      submission: { finalWriting: request.finalWriting, idempotencyKey: request.idempotencyKey },
    });
    case "submit_audio": return submitReviewR3AudioCheckDurably({
      ...common,
      submission: { encounterId: request.encounterId, response: request.response, idempotencyKey: request.idempotencyKey },
    });
    case "confirm_suggestion": return confirmReviewR31SuggestionDurably({
      ...common,
      submission: { encounterId: request.encounterId, decision: request.decision, idempotencyKey: request.idempotencyKey },
    });
    case "answer_attempt": return answerReviewR31AttemptQuestionDurably({
      ...common,
      submission: { encounterId: request.encounterId, decision: request.decision, idempotencyKey: request.idempotencyKey },
    });
    case "confirm_span": return confirmReviewR31WritingSpanDurably({
      ...common,
      submission: { encounterId: request.encounterId, startOffset: request.startOffset, endOffset: request.endOffset, idempotencyKey: request.idempotencyKey },
    });
    case "hydrate_r4": return hydrateReviewR4Session(common);
    case "begin_repair": return beginReviewRepairDurably({ ...common, submission: request });
    case "move_tricky": return moveReviewRepairToTrickyPartDurably({ ...common, submission: request });
    case "move_cover": return moveReviewRepairToCoverDurably({ ...common, submission: request });
    case "move_try": return moveReviewRepairToTryAgainDurably({ ...common, submission: request });
    case "save_tricky": return saveReviewRepairTrickySpanDurably({ ...common, submission: request });
    case "save_cue": return saveReviewRepairMemoryCueDurably({ ...common, submission: request });
    case "repair_retry": return submitReviewRepairRetryDurably({ ...common, submission: request });
    case "hydrate_writing": return loadReviewR6WritingSession({
      client: context.serviceClient,
      reviewSessionId: request.reviewSessionId,
      snapshotFingerprint: request.snapshotFingerprint,
    });
    case "select_prompt":
    case "start_writing": return transitionReviewR6Writing({
      client: context.serviceClient,
      reviewSessionId: request.reviewSessionId,
      snapshotFingerprint: request.snapshotFingerprint,
      transitionKind: request.action,
      challengeType: request.challengeType,
      expectedStateVersion: request.expectedStateVersion,
      idempotencyKey: request.idempotencyKey,
    });
    case "save_draft": return transitionReviewR6Writing({
      client: context.serviceClient,
      reviewSessionId: request.reviewSessionId,
      snapshotFingerprint: request.snapshotFingerprint,
      transitionKind: "save_draft",
      draftText: request.draftText,
      expectedStateVersion: request.expectedStateVersion,
      idempotencyKey: request.idempotencyKey,
    });
    case "extend_writing": {
      const auth = await context.userClient.auth.signInWithPassword({
        email: context.userEmail,
        password: request.password,
      });
      if (auth.error || auth.data.user?.id !== context.userId) {
        throw new Error("review_r6_parent_reauthentication_failed");
      }
      return transitionReviewR6Writing({
        client: context.serviceClient,
        reviewSessionId: request.reviewSessionId,
        snapshotFingerprint: request.snapshotFingerprint,
        transitionKind: "extend_writing",
        extensionSeconds: request.extensionSeconds,
        authorizedParentUserId: context.userId,
        expectedStateVersion: request.expectedStateVersion,
        idempotencyKey: request.idempotencyKey,
      });
    }
    case "finalize": {
      const result = await finalizeReviewStageR6({
        client: context.serviceClient,
        reviewSessionId: request.reviewSessionId,
        snapshotFingerprint: request.snapshotFingerprint,
        idempotencyKey: request.idempotencyKey,
      });
      const specialist = await ensureSpecialistStageR6({
        userClient: context.userClient,
        serviceClient: context.serviceClient,
        parentUserId: context.userId,
        childId: context.childId,
        assignmentId: request.assignmentId,
        assignmentDate: context.assignmentDate,
      });
      revalidatePath("/learn/week");
      revalidatePath("/learn/week/adle");
      return { ...result, specialistOutcome: specialist.outcome };
    }
  }
}

export async function continueAdleAfterReviewR6Action(formData: FormData): Promise<never> {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const reviewSessionId = String(formData.get("reviewSessionId") ?? "");
  const snapshotFingerprint = String(formData.get("snapshotFingerprint") ?? "");
  const childId = String(formData.get("childId") ?? "");
  const context = await authorizedReview({ assignmentId, reviewSessionId, snapshotFingerprint });
  await ensureSpecialistStageR6({
    userClient: context.userClient,
    serviceClient: context.serviceClient,
    parentUserId: context.userId,
    childId: context.childId,
    assignmentId,
    assignmentDate: context.assignmentDate,
  });
  revalidatePath("/learn/week/adle");
  redirect(`/learn/week/adle?child=${encodeURIComponent(childId || context.childId)}&mode=child`);
}

export async function persistAdleSpecialistCheckpointR6Action(request: {
  assignmentId: string;
  adapterKey: string;
  checkpointSchemaVersion: string;
  lessonSnapshotFingerprint: string;
  checkpointPayload: Record<string, unknown>;
  expectedStateVersion: number;
}): Promise<{ stateVersion: number }> {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new Error("adle_specialist_checkpoint_not_authenticated");
  const header = await userClient.from("daily_assignments")
    .select("child_id,parent_user_id,compiled_lesson_snapshot")
    .eq("id", request.assignmentId).eq("parent_user_id", user.id).maybeSingle();
  if (header.error || !header.data || header.data.compiled_lesson_snapshot === null) {
    throw new Error("adle_specialist_checkpoint_assignment_not_owned");
  }
  const result = await createServiceRoleClient().rpc("persist_adle_specialist_checkpoint_r6", {
    p_daily_assignment_id: request.assignmentId,
    p_child_id: header.data.child_id,
    p_parent_user_id: user.id,
    p_adapter_key: request.adapterKey,
    p_checkpoint_schema_version: request.checkpointSchemaVersion,
    p_lesson_snapshot_fingerprint: request.lessonSnapshotFingerprint,
    p_checkpoint_payload: request.checkpointPayload,
    p_expected_state_version: request.expectedStateVersion,
    p_mark_completed: false,
  });
  if (result.error) throw new Error(`persistAdleSpecialistCheckpointR6: ${result.error.message}`);
  const stateVersion = (result.data as { stateVersion?: number } | null)?.stateVersion;
  if (!Number.isInteger(stateVersion)) throw new Error("adle_specialist_checkpoint_response_invalid");
  return { stateVersion: stateVersion as number };
}
