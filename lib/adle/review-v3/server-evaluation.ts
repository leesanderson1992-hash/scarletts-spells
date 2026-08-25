import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { suggestCorrection } from "@/lib/spelling/suggestCorrection";
import { findResolverVisibleTokenSafeCanonicalMappings } from "@/lib/writing-engine/persistence/spelling-canonical-mappings";

import type { ReviewTargetSnapshotV3 } from "./contracts";
import {
  evaluateSubmittedReviewWriting,
  type GovernedReviewMisspellingMapping,
  type NonAuthoritativeReviewSuggestion,
  type ReviewWritingEvaluation,
} from "./r3-evaluation";
import { tokenizeReviewWriting } from "./target-word-matcher";

async function learnerConfirmedMappings(input: {
  client?: SupabaseClient;
  reviewSessionId?: string;
  targets: readonly ReviewTargetSnapshotV3[];
}): Promise<GovernedReviewMisspellingMapping[]> {
  if (!input.client || !input.reviewSessionId) return [];
  const current = await input.client.from("adle_review_sessions").select("child_id")
    .eq("id", input.reviewSessionId).maybeSingle();
  if (current.error || !current.data?.child_id) return [];
  const sessions = await input.client.from("adle_review_sessions").select("id")
    .eq("child_id", current.data.child_id).neq("id", input.reviewSessionId);
  if (sessions.error) throw new Error(`Review R3.1 personal mapping lookup failed: ${sessions.error.message}`);
  const sessionIds = (sessions.data ?? []).map((row) => row.id as string);
  if (sessionIds.length === 0) return [];
  const encounters = await input.client.from("adle_review_word_encounters")
    .select("id,canonical_word_id,attribution_provenance")
    .in("review_session_id", sessionIds)
    .in("canonical_word_id", input.targets.map((target) => target.canonicalWordId))
    .eq("original_outcome", "failure")
    .eq("original_outcome_source", "writing")
    .eq("attribution_algorithm_version", "learner_confirmed_writing_intent_v1");
  if (encounters.error) throw new Error(`Review R3.1 personal mapping lookup failed: ${encounters.error.message}`);
  const targetByCanonicalId = new Map(input.targets.map((target) => [target.canonicalWordId, target]));
  return (encounters.data ?? []).flatMap((row) => {
    const provenance = row.attribution_provenance as Record<string, unknown> | null;
    const observedNormalized = provenance?.observedNormalized;
    const target = targetByCanonicalId.get(row.canonical_word_id as string);
    if (typeof observedNormalized !== "string" || !target || !/^[a-z]+$/.test(observedNormalized)) return [];
    return [{
      mappingId: `learner-review-encounter:${row.id as string}`,
      misspellingNormalized: observedNormalized,
      correctSpellingNormalized: target.canonicalSpelling.normalize("NFC").toLowerCase(),
      microSkillKey: "LEARNER_CONFIRMED_REVIEW_CONFUSION",
      dialectCode: "en-GB",
      normalizationVersion: "spelling_normalize_v1",
      authorityReference: `adle_review_word_encounters:${row.id as string}`,
      authorityLevel: "learner_confirmed" as const,
      sourceReviewEncounterId: row.id as string,
    }];
  });
}

function nonAuthoritativeSuggestions(writing: string): NonAuthoritativeReviewSuggestion[] {
  return tokenizeReviewWriting(writing).flatMap((token) => {
    if (!/^[a-z]+$/.test(token.normalized)) return [];
    const suggestion = suggestCorrection(token.normalized);
    if (!suggestion) return [];
    return [{
      observedNormalized: token.normalized,
      correctSpellingNormalized: suggestion.word.normalize("NFC").toLowerCase(),
      resolverVersion: "writing_engine_suggest_correction_v1",
      source: "heuristic_correction_resolver" as const,
    }];
  });
}

/**
 * Accepted answers and irreversible automatic failures come only from frozen
 * exact authority or resolver-visible token-safe canonical/personal mappings.
 * Heuristic corrections are confirmation prompts, never scoring evidence.
 */
export async function evaluateSubmittedReviewWritingServer(input: {
  writing: string;
  targets: readonly ReviewTargetSnapshotV3[];
  client?: SupabaseClient;
  reviewSessionId?: string;
}): Promise<ReviewWritingEvaluation[]> {
  const observedNormalizedTokens = tokenizeReviewWriting(input.writing)
    .map((token) => token.normalized)
    .filter((token) => /^[a-z]+$/.test(token));
  const governedMappings = await findResolverVisibleTokenSafeCanonicalMappings({
    observedNormalizedTokens,
    dialectCode: "en-GB",
    normalizationVersion: "spelling_normalize_v1",
  });
  const personalMappings = await learnerConfirmedMappings({
    client: input.client,
    reviewSessionId: input.reviewSessionId,
    targets: input.targets,
  });
  return evaluateSubmittedReviewWriting({
    writing: input.writing,
    targets: input.targets,
    governedMappings,
    confirmationFlow: {
      learnerConfirmedMappings: personalMappings,
      nonAuthoritativeSuggestions: nonAuthoritativeSuggestions(input.writing),
    },
  });
}
