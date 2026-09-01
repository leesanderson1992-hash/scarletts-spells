import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import type {
  ReviewPromptCandidateSnapshotV3,
  ReviewTargetSnapshotV3,
} from "@/lib/adle/review-v3/contracts";
import { validateCompiledReviewSnapshotV3 } from "@/lib/adle/review-v3/snapshot-validator";
import { findExactReviewTargetMatches } from "@/lib/adle/review-v3/target-word-matcher";

import {
  GOLD_BAR_CONTEXT_VALIDATOR_VERSION,
  sentenceContainingSpan,
  validateContextualGoldBarUse,
} from "./contextual-use-validator";
import {
  type GoldBarAnswerVisibilityStatus,
  type GoldBarContextValidationStatus,
  type GoldBarUseQualificationStatus,
  GOLD_BAR_AUTHENTIC_USE_POLICY_VERSION,
  type ReviewWritingGoldBarGateConfig,
  qualifyReviewWritingGoldBarUse,
} from "./gold-bar-authentic-use";
import { normaliseWordTreasureWord } from "./word-treasures";

type Client = SupabaseClient;

type ReviewSessionFact = {
  id: string;
  daily_assignment_id: string;
  child_id: string;
  parent_user_id: string;
  snapshot_fingerprint: string;
  selected_prompt_version_id: string | null;
  submitted_writing_text: string | null;
  writing_submitted_at: string | null;
  completed_at: string | null;
  stage: string;
};

type PromptedUseFact = {
  id: string;
  canonical_word_id: string;
  use_kind: string;
  parent_verified: boolean;
  row_status: string;
  provenance_kind: string;
  review_session_id: string | null;
  review_encounter_id: string | null;
  writing_submitted_at: string | null;
  prompt_version_id: string | null;
  snapshot_fingerprint: string | null;
};

type EncounterFact = {
  id: string;
  canonical_word_id: string;
  writing_disposition: string | null;
  original_outcome: string;
  original_outcome_source: string | null;
  repair_state: string;
};

type TreasureFact = {
  id: string;
  canonical_word_id: string | null;
  status: string;
  entered_forge_at: string | null;
};

export interface ReviewWritingGoldBarConsumerResult {
  considered: number;
  eligible: number;
  credited: number;
  goldenBarsAwarded: number;
  ineligible: number;
  uncertain: number;
  skippedNoTreasure: number;
}

function databaseFailure(boundary: string, error: { message?: string } | null): never {
  throw new Error(`${boundary}:${error?.message ?? "unknown_database_error"}`);
}

function learnerVisiblePromptStrings(prompt: ReviewPromptCandidateSnapshotV3): string[] {
  const strings = [prompt.promptText, prompt.instructionText];
  const visit = (value: unknown): void => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  // Configuration is renderer-owned. Treat every configured string as visible
  // until a future prompt contract explicitly marks server-only fields.
  visit(prompt.configuration);
  return strings;
}

function answerVisibility(
  prompt: ReviewPromptCandidateSnapshotV3 | undefined,
  target: ReviewTargetSnapshotV3,
): GoldBarAnswerVisibilityStatus {
  if (!prompt) return "UNKNOWN";
  return learnerVisiblePromptStrings(prompt).some((text) =>
    findExactReviewTargetMatches(text, [target]).length > 0
  ) ? "VISIBLE" : "HIDDEN";
}

async function contextualStatus(input: {
  client: Client;
  target: ReviewTargetSnapshotV3;
  writing: string;
  startOffset: number;
  endOffset: number;
}): Promise<{
  status: GoldBarContextValidationStatus;
  validatorVersion: string;
  reasonCodes: string[];
}> {
  const routeKeys = [...new Set(input.target.routeProvenance.map((route) => route.microSkillKey))];
  if (routeKeys.length === 0) {
    return {
      status: "UNCERTAIN",
      validatorVersion: GOLD_BAR_CONTEXT_VALIDATOR_VERSION,
      reasonCodes: ["CONTEXT_ROUTE_MISSING"],
    };
  }
  const catalog = await input.client.from("micro_skill_catalog")
    .select("micro_skill_key,skill_family_key")
    .in("micro_skill_key", routeKeys);
  if (catalog.error) databaseFailure("recordReviewWritingGoldBarUses:catalog", catalog.error);
  const families = new Map(
    (catalog.data ?? []).map((row) => [row.micro_skill_key as string, row.skill_family_key as string]),
  );
  if (routeKeys.some((key) => !families.has(key))) {
    return {
      status: "UNCERTAIN",
      validatorVersion: GOLD_BAR_CONTEXT_VALIDATOR_VERSION,
      reasonCodes: ["CONTEXT_ROUTE_UNRESOLVED"],
    };
  }
  return validateContextualGoldBarUse({
    canonicalWord: input.target.canonicalSpelling,
    containingSentence: sentenceContainingSpan(input.writing, input.startOffset, input.endOffset),
    contextRequired: routeKeys.some((key) => families.get(key) === "D4_HOM"),
  });
}

/**
 * Reward-owned, post-completion consumer. Review finalization remains the
 * authority for the immutable prompted-use fact; this function only qualifies
 * that fact for Word Treasure reward credit and delegates all state mutation to
 * one idempotent database transaction.
 */
export async function recordReviewWritingGoldBarUses(input: {
  client: Client;
  reviewSessionId: string;
  gate: ReviewWritingGoldBarGateConfig;
}): Promise<ReviewWritingGoldBarConsumerResult> {
  const result: ReviewWritingGoldBarConsumerResult = {
    considered: 0,
    eligible: 0,
    credited: 0,
    goldenBarsAwarded: 0,
    ineligible: 0,
    uncertain: 0,
    skippedNoTreasure: 0,
  };
  if (input.gate.policyVersion !== GOLD_BAR_AUTHENTIC_USE_POLICY_VERSION) {
    throw new Error("recordReviewWritingGoldBarUses:policy_version_mismatch");
  }

  const sessionQuery = await input.client.from("adle_review_sessions")
    .select("id,daily_assignment_id,child_id,parent_user_id,snapshot_fingerprint,selected_prompt_version_id,submitted_writing_text,writing_submitted_at,completed_at,stage")
    .eq("id", input.reviewSessionId)
    .maybeSingle();
  if (sessionQuery.error || !sessionQuery.data) {
    databaseFailure("recordReviewWritingGoldBarUses:session", sessionQuery.error);
  }
  const session = sessionQuery.data as ReviewSessionFact;
  if (session.stage !== "completed" || !session.completed_at ||
      !session.submitted_writing_text || !session.writing_submitted_at) {
    throw new Error("recordReviewWritingGoldBarUses:review_not_completed");
  }

  const [assignmentQuery, usesQuery] = await Promise.all([
    input.client.from("daily_assignments")
      .select("compiled_review_snapshot")
      .eq("id", session.daily_assignment_id)
      .maybeSingle(),
    input.client.from("adle_authentic_use_events")
      .select("id,canonical_word_id,use_kind,parent_verified,row_status,provenance_kind,review_session_id,review_encounter_id,writing_submitted_at,prompt_version_id,snapshot_fingerprint")
      .eq("review_session_id", session.id)
      .eq("provenance_kind", "prompted_review_writing_application")
      .eq("row_status", "active"),
  ]);
  if (assignmentQuery.error || !assignmentQuery.data) {
    databaseFailure("recordReviewWritingGoldBarUses:assignment", assignmentQuery.error);
  }
  if (usesQuery.error) databaseFailure("recordReviewWritingGoldBarUses:uses", usesQuery.error);
  const validated = validateCompiledReviewSnapshotV3(assignmentQuery.data.compiled_review_snapshot);
  if (!validated.ok || validated.snapshot.provenance.sourceFingerprint !== session.snapshot_fingerprint) {
    throw new Error("recordReviewWritingGoldBarUses:snapshot_conflict");
  }
  const snapshot = validated.snapshot;
  const prompt = snapshot.promptCandidates.find(
    (candidate) => candidate.promptVersionId === session.selected_prompt_version_id,
  );
  const uses = (usesQuery.data ?? []) as PromptedUseFact[];
  result.considered = uses.length;
  if (uses.length === 0) return result;

  const encounterIds = uses.flatMap((use) => use.review_encounter_id ? [use.review_encounter_id] : []);
  const encountersQuery = await input.client.from("adle_review_word_encounters")
    .select("id,canonical_word_id,writing_disposition,original_outcome,original_outcome_source,repair_state")
    .in("id", encounterIds);
  if (encountersQuery.error) {
    databaseFailure("recordReviewWritingGoldBarUses:encounters", encountersQuery.error);
  }
  const encounterById = new Map(
    ((encountersQuery.data ?? []) as EncounterFact[]).map((encounter) => [encounter.id, encounter]),
  );

  for (const use of uses) {
    const encounter = use.review_encounter_id ? encounterById.get(use.review_encounter_id) : undefined;
    const target = snapshot.targets.find((candidate) => candidate.encounterId === use.review_encounter_id);
    if (!encounter || !target) {
      throw new Error("recordReviewWritingGoldBarUses:source_target_conflict");
    }
    const matches = findExactReviewTargetMatches(session.submitted_writing_text, [target]);
    const match = matches[0];
    const context = match
      ? await contextualStatus({
          client: input.client,
          target,
          writing: session.submitted_writing_text,
          startOffset: match.startOffset,
          endOffset: match.endOffset,
        })
      : {
          status: "UNCERTAIN" as const,
          validatorVersion: GOLD_BAR_CONTEXT_VALIDATOR_VERSION,
          reasonCodes: ["CONTEXT_NOT_EVALUATED_NO_OCCURRENCE"],
        };

    const treasureQuery = await input.client.from("child_word_treasures")
      .select("id,canonical_word_id,status,entered_forge_at")
      .eq("child_id", session.child_id)
      .eq("parent_user_id", session.parent_user_id)
      .eq("corrected_word_normalized", normaliseWordTreasureWord(target.canonicalSpelling))
      .maybeSingle();
    if (treasureQuery.error) {
      databaseFailure("recordReviewWritingGoldBarUses:treasure", treasureQuery.error);
    }
    if (!treasureQuery.data) {
      result.skippedNoTreasure += 1;
      continue;
    }
    const treasure = treasureQuery.data as TreasureFact;
    const visibility = answerVisibility(prompt, target);
    const decision = qualifyReviewWritingGoldBarUse({
      reviewCompleted: session.stage === "completed" && session.completed_at !== null,
      sourceEventActive: use.row_status === "active" && !use.parent_verified,
      provenanceKind: use.provenance_kind,
      useKind: use.use_kind,
      writingDisposition: encounter.writing_disposition,
      originalOutcome: encounter.original_outcome,
      originalOutcomeSource: encounter.original_outcome_source,
      repairState: encounter.repair_state,
      exactAuthoredOccurrence: matches.length > 0,
      answerVisibilityStatus: visibility,
      contextValidationStatus: context.status,
      writingSubmittedAt: session.writing_submitted_at,
      enteredForgeAt: treasure.entered_forge_at,
      policyEffectiveAt: input.gate.effectiveAt,
    });
    const requestedStatus: GoldBarUseQualificationStatus =
      treasure.canonical_word_id !== null && treasure.canonical_word_id !== use.canonical_word_id
        ? "INELIGIBLE"
        : decision.status;
    const reasonCodes = treasure.canonical_word_id !== null &&
        treasure.canonical_word_id !== use.canonical_word_id
      ? [...decision.reasonCodes, "TREASURE_CANONICAL_WORD_CONFLICT"]
      : [...decision.reasonCodes, ...context.reasonCodes];
    const request = {
      sourceAuthenticUseEventId: use.id,
      treasureId: treasure.id,
      qualificationStatus: requestedStatus,
      answerVisibilityStatus: visibility,
      contextValidationStatus: context.status,
      contextValidatorVersion: context.validatorVersion,
      reasonCodes: [...new Set(reasonCodes)].sort(),
      rewardPolicyVersion: input.gate.policyVersion,
      policyEffectiveAt: input.gate.effectiveAt,
    };
    const persisted = await input.client.rpc("record_review_writing_gold_bar_use_v2", {
      p_source_authentic_use_event_id: request.sourceAuthenticUseEventId,
      p_treasure_id: request.treasureId,
      p_qualification_status: request.qualificationStatus,
      p_answer_visibility_status: request.answerVisibilityStatus,
      p_context_validation_status: request.contextValidationStatus,
      p_context_validator_version: request.contextValidatorVersion,
      p_reason_codes: request.reasonCodes,
      p_reward_policy_version: request.rewardPolicyVersion,
      p_policy_effective_at: request.policyEffectiveAt,
      p_request_fingerprint: fingerprintSnapshotValue(request),
    });
    if (persisted.error) databaseFailure("recordReviewWritingGoldBarUses:persist", persisted.error);
    const payload = persisted.data as {
      qualificationStatus?: GoldBarUseQualificationStatus;
      credited?: boolean;
      goldenBarAwarded?: boolean;
    } | null;
    const finalStatus = payload?.qualificationStatus ?? requestedStatus;
    if (finalStatus === "ELIGIBLE") result.eligible += 1;
    else if (finalStatus === "UNCERTAIN") result.uncertain += 1;
    else result.ineligible += 1;
    if (payload?.credited === true) result.credited += 1;
    if (payload?.goldenBarAwarded === true) result.goldenBarsAwarded += 1;
  }
  return result;
}
