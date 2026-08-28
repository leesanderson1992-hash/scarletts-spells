import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveCanonicalIntakeRoute } from "./route-readiness";

type GovernedSourceAuthority = {
  candidateMappingId: string;
  parentUserId: string;
  childId: string;
  submissionId: string | null;
  adleReviewSessionId: string | null;
  occurrenceId: string | null;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  transitionedCount: number;
  handoffState: string | null;
};

export type GovernedSourceContinuationResult = GovernedSourceAuthority & {
  canonicalIntakeCandidateId: string;
  routeId: string;
  routeVersion: string;
};

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Governed-source continuation returned no ${label}`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, label);
}

function parseAuthority(
  value: unknown,
  expected: {
    candidateMappingId: string;
    parentUserId: string;
    childId: string;
  },
): GovernedSourceAuthority {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Governed-source continuation returned an invalid receipt");
  }
  const row = value as Record<string, unknown>;
  const authority: GovernedSourceAuthority = {
    candidateMappingId: requiredString(
      row.candidate_mapping_id,
      "candidate mapping ID",
    ),
    parentUserId: requiredString(row.parent_user_id, "parent ID"),
    childId: requiredString(row.child_id, "child ID"),
    submissionId: nullableString(row.task_submission_id, "submission ID"),
    adleReviewSessionId: nullableString(
      row.source_adle_review_session_id,
      "ADLE Review session ID",
    ),
    occurrenceId: nullableString(
      row.source_misspelling_instance_id,
      "occurrence ID",
    ),
    misspellingNormalized: requiredString(
      row.misspelling_normalized,
      "misspelling identity",
    ),
    correctSpellingNormalized: requiredString(
      row.correct_spelling_normalized,
      "corrected spelling identity",
    ),
    microSkillKey: requiredString(row.micro_skill_key, "micro-skill identity"),
    transitionedCount:
      typeof row.transitioned_count === "number" ? row.transitioned_count : 0,
    handoffState: nullableString(row.handoff_state, "handoff state"),
  };
  if (
    authority.candidateMappingId !== expected.candidateMappingId ||
    authority.parentUserId !== expected.parentUserId ||
    authority.childId !== expected.childId
  ) {
    throw new Error("Governed-source continuation receipt changed exact identity");
  }
  if (Number(Boolean(authority.submissionId)) + Number(Boolean(authority.adleReviewSessionId)) !== 1) {
    throw new Error("Governed-source continuation returned an ambiguous source anchor");
  }
  return authority;
}

/**
 * Makes one exact governed source durable in canonical intake. This function
 * does not evaluate readiness or activate an ADLE item: the released seed RPC
 * creates/reuses the source-owned candidate and queues the ordinary evaluator.
 */
export async function ensureCanonicalIntakeForGovernedSource(input: {
  serviceClient: SupabaseClient;
  candidateMappingId: string;
  parentUserId: string;
  childId: string;
}): Promise<GovernedSourceContinuationResult> {
  const { data: authorization, error: authorizationError } =
    await input.serviceClient.rpc("adle_authorize_governed_source_continuation", {
      p_candidate_mapping_id: input.candidateMappingId,
      p_expected_parent_user_id: input.parentUserId,
      p_expected_child_id: input.childId,
    });
  if (authorizationError) {
    throw new Error(
      `Governed-source continuation authorization failed: ${authorizationError.message}`,
    );
  }
  const authority = parseAuthority(authorization, input);

  const { data: skill, error: skillError } = await input.serviceClient
    .from("micro_skill_catalog")
    .select("micro_skill_key,skill_cluster_key,mastery_domain_key,is_active,is_assignable")
    .eq("micro_skill_key", authority.microSkillKey)
    .eq("mastery_domain_key", "D4")
    .eq("is_active", true)
    .eq("is_assignable", true)
    .maybeSingle();
  if (skillError) {
    throw new Error(`Governed-source micro-skill load failed: ${skillError.message}`);
  }
  if (!skill || skill.micro_skill_key !== authority.microSkillKey) {
    throw new Error("Governed-source micro-skill is no longer active and assignable");
  }
  const route = resolveCanonicalIntakeRoute(
    authority.microSkillKey,
    typeof skill.skill_cluster_key === "string" ? skill.skill_cluster_key : null,
  );
  const { data: canonicalIntakeCandidateId, error: seedError } =
    await input.serviceClient.rpc("adle_seed_canonical_intake_candidate", {
      p_candidate_mapping_id: authority.candidateMappingId,
      p_normalized_target_token: authority.correctSpellingNormalized,
      p_route_id: route.routeId,
      p_route_version: route.routeVersion,
      p_micro_skill_key: authority.microSkillKey,
      p_source_ref: authority.adleReviewSessionId
        ? `adle_review_governed_source:${authority.candidateMappingId}`
        : `governed_occurrence_source:${authority.candidateMappingId}`,
    });
  if (seedError) {
    throw new Error(`Governed-source canonical candidate seed failed: ${seedError.message}`);
  }

  return {
    ...authority,
    canonicalIntakeCandidateId: requiredString(
      canonicalIntakeCandidateId,
      "canonical-intake candidate ID",
    ),
    routeId: route.routeId,
    routeVersion: route.routeVersion,
  };
}

/** The controlled Stage-F replay boundary for a stable spelling occurrence. */
export async function continueResolvedHistoricalOccurrence(input: {
  serviceClient: SupabaseClient;
  occurrenceId: string;
  parentUserId: string;
  childId: string;
}): Promise<GovernedSourceContinuationResult> {
  const { data: materialized, error: materializationError } =
    await input.serviceClient.rpc(
      "materialize_resolved_stage_f_spelling_occurrence_source",
      {
        p_source_misspelling_instance_id: input.occurrenceId,
        p_expected_parent_user_id: input.parentUserId,
        p_expected_child_id: input.childId,
      },
    );
  if (materializationError) {
    throw new Error(
      `Stage-F governed occurrence materialization failed: ${materializationError.message}`,
    );
  }
  if (!materialized || typeof materialized !== "object" || Array.isArray(materialized)) {
    throw new Error("Stage-F governed occurrence materialization returned an invalid receipt");
  }
  const candidateMappingId = requiredString(
    (materialized as Record<string, unknown>).candidate_mapping_id,
    "materialized candidate mapping ID",
  );
  return ensureCanonicalIntakeForGovernedSource({
    serviceClient: input.serviceClient,
    candidateMappingId,
    parentUserId: input.parentUserId,
    childId: input.childId,
  });
}
