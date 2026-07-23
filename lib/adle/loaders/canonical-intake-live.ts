import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- additive tables are intentionally ahead of generated Supabase types */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ADLE_CANONICAL_INTAKE_FEATURE_FLAG,
  canonicalWordSkillPair,
  resolveCanonicalIntakeReadiness,
  type CanonicalIntakeBlockReason,
  type CanonicalIntakeMappingFact,
  type CanonicalIntakeResolution,
} from "../canonical-intake";
import { isBaseWordFamilyPilotEnabledForChild } from "../morphology/base-word-family-pilot-access";
import { loadDynamicPrefixProfiles } from "../morphology/dynamic-prefix-profile-loader";
import { isDynamicPrefixRouteEnabled } from "../morphology/dynamic-prefix-staging-access";
import { ADLE_PILOT_CHILD_BAND } from "./composer-facts-loader";

type AdleClient = SupabaseClient;

export interface CanonicalIntakeLiveResult {
  enabled: boolean;
  eligible: number;
  inserted: number;
  strengthened: number;
  blocked: Array<{
    candidateMappingId: string;
    reason: CanonicalIntakeBlockReason;
    evidence: Record<string, unknown>;
  }>;
}

function isoDate(value: unknown): string {
  const parsed = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed)
    ? parsed
    : new Date().toISOString().slice(0, 10);
}

function throwQuery(
  context: string,
  error: { message?: string } | null | undefined,
): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

async function productionRouteFacts(client: AdleClient, childId: string) {
  const enabled = new Set<string>();
  const readyPairs = new Set<string>();

  if (isDynamicPrefixRouteEnabled()) {
    const { profiles } = await loadDynamicPrefixProfiles(client, childId);
    for (const profile of profiles) {
      if (!profile.productionEnabled) continue;
      enabled.add(profile.microSkillKey);
      for (const canonicalWordId of profile.wordsByCanonicalId.keys()) {
        readyPairs.add(
          canonicalWordSkillPair(canonicalWordId, profile.microSkillKey),
        );
      }
    }
  }

  if (isBaseWordFamilyPilotEnabledForChild(childId)) {
    const { data: familyRows, error: familyError } = await client
      .from("canonical_teaching_dictionary_base_word_families")
      .select("id, micro_skill_key")
      .eq("row_status", "active")
      .eq("review_status", "approved_for_first_exposure");
    if (familyError) throwQuery("canonical intake base families", familyError);
    const familyById = new Map(
      (familyRows ?? []).map((row: any) => [
        row.id as string,
        row.micro_skill_key as string,
      ]),
    );
    const familyIds = [...familyById.keys()];
    if (familyIds.length > 0) {
      const { data: memberRows, error: memberError } = await client
        .from("canonical_teaching_dictionary_base_word_family_members")
        .select("base_word_family_id, canonical_word_id")
        .in("base_word_family_id", familyIds)
        .eq("assignment_eligible", true)
        .eq("row_status", "active")
        .eq("review_status", "approved_for_first_exposure");
      if (memberError)
        throwQuery("canonical intake base family members", memberError);
      for (const row of memberRows ?? []) {
        const skill = familyById.get((row as any).base_word_family_id);
        if (!skill) continue;
        enabled.add(skill);
        readyPairs.add(
          canonicalWordSkillPair((row as any).canonical_word_id, skill),
        );
      }
    }
  }
  return { enabled, readyPairs };
}

async function persistEligibleIntake(
  client: AdleClient,
  resolution: Extract<CanonicalIntakeResolution, { status: "eligible" }>,
) {
  const { data, error } = await client.rpc("adle_persist_canonical_intake", {
    p_child_id: resolution.childId,
    p_canonical_word_id: resolution.canonicalWordId,
    p_micro_skill_key: resolution.microSkillKey,
    p_candidate_mapping_id: resolution.candidateMappingId,
    p_canonical_mapping_id: resolution.canonicalMappingId,
    p_misspelling_normalized: resolution.misspellingNormalized,
    p_correct_spelling_normalized: resolution.correctSpellingNormalized,
    p_source_ref: resolution.sourceRef,
    p_verified_on: resolution.verifiedOn,
  });
  if (error) throwQuery("canonical intake atomic persistence", error);
  return Boolean((data as Array<{ inserted?: boolean }> | null)?.[0]?.inserted);
}

/** Failure-isolated caller hook: the feature flag is the first gate and no
 * candidate outside the approved submission/child scope is read or written. */
export async function intakeApprovedSubmissionCorrections(params: {
  serviceClient: AdleClient;
  parentUserId: string;
  childId: string;
  submissionId: string;
  dryRun?: boolean;
}): Promise<CanonicalIntakeLiveResult> {
  const result: CanonicalIntakeLiveResult = {
    enabled: false,
    eligible: 0,
    inserted: 0,
    strengthened: 0,
    blocked: [],
  };
  if (process.env[ADLE_CANONICAL_INTAKE_FEATURE_FLAG] !== "enabled")
    return result;
  result.enabled = true;
  const client = params.serviceClient;
  const { data: candidateRows, error: candidateError } = await client
    .from("parent_verified_spelling_candidate_mappings")
    .select(
      "id,parent_user_id,child_id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,candidate_status,updated_at",
    )
    .eq("parent_user_id", params.parentUserId)
    .eq("child_id", params.childId)
    .eq("task_submission_id", params.submissionId)
    .in("candidate_status", [
      "parent_local_promoted",
      "global_canonical_promoted",
    ]);
  if (candidateError) throwQuery("canonical intake candidates", candidateError);
  if ((candidateRows ?? []).length === 0) return result;

  const corrections = [
    ...new Set(
      (candidateRows ?? []).map(
        (row: any) => row.correct_spelling_normalized as string,
      ),
    ),
  ];
  const misspellings = [
    ...new Set(
      (candidateRows ?? []).map(
        (row: any) => row.misspelling_normalized as string,
      ),
    ),
  ];
  const skillKeys = [
    ...new Set(
      (candidateRows ?? []).map((row: any) => row.micro_skill_key as string),
    ),
  ];
  const [
    { data: words, error: wordsError },
    { data: skills, error: skillsError },
    { data: mappings, error: mappingsError },
  ] = await Promise.all([
    client
      .from("canonical_teaching_dictionary_words")
      .select(
        "id,normalised_word,row_status,review_status,frequency_band,age_band",
      )
      .in("normalised_word", corrections),
    client
      .from("micro_skill_catalog")
      .select("micro_skill_key,mastery_domain_key,is_active,is_assignable")
      .in("micro_skill_key", skillKeys),
    client
      .from("spelling_canonical_mappings")
      .select(
        "id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status",
      )
      .in("misspelling_normalized", misspellings)
      .in("correct_spelling_normalized", corrections),
  ]);
  if (wordsError) throwQuery("canonical intake words", wordsError);
  if (skillsError) throwQuery("canonical intake skills", skillsError);
  if (mappingsError) throwQuery("canonical intake mappings", mappingsError);
  const wordIds = (words ?? []).map((row: any) => row.id as string);
  const mappingIds = (mappings ?? []).map((row: any) => row.id as string);
  const [
    { data: supports, error: supportsError },
    { data: content, error: contentError },
    visibilityEvents,
    routeFacts,
  ] = await Promise.all([
    wordIds.length
      ? client
          .from("canonical_teaching_dictionary_word_support")
          .select(
            "canonical_word_id,micro_skill_key,support_role,row_status,review_status",
          )
          .in("canonical_word_id", wordIds)
          .in("micro_skill_key", skillKeys)
      : Promise.resolve({ data: [], error: null }),
    client
      .from("canonical_teaching_dictionary_content_versions")
      .select(
        "micro_skill_key,version_status,is_active,final_readiness_review_status,child_friendly_explanation,rule_explanation",
      )
      .in("micro_skill_key", skillKeys)
      .eq("is_active", true),
    mappingIds.length
      ? client
          .from("spelling_canonical_mapping_events")
          .select("mapping_id")
          .in("mapping_id", mappingIds)
          .eq("event_type", "resolver_visibility_enabled")
          .eq("new_resolver_visibility_status", "visible")
      : Promise.resolve({ data: [], error: null }),
    productionRouteFacts(client, params.childId),
  ]);
  if (supportsError) throwQuery("canonical intake supports", supportsError);
  if (contentError) throwQuery("canonical intake content", contentError);
  if (visibilityEvents.error)
    throwQuery("canonical intake visibility events", visibilityEvents.error);
  const enabledMappingIds = new Set(
    (visibilityEvents.data ?? []).map((row: any) => row.mapping_id as string),
  );
  const mappingFacts: CanonicalIntakeMappingFact[] = (mappings ?? []).map(
    (row: any) => ({
      mappingId: row.id,
      misspellingNormalized: row.misspelling_normalized,
      correctSpellingNormalized: row.correct_spelling_normalized,
      microSkillKey: row.micro_skill_key,
      mappingStatus: row.mapping_status,
      resolverVisibilityStatus: row.resolver_visibility_status,
      hasVisibilityEnableEvent: enabledMappingIds.has(row.id),
    }),
  );

  for (const row of candidateRows ?? []) {
    const candidate = row as any;
    const resolution = resolveCanonicalIntakeReadiness({
      candidate: {
        candidateMappingId: candidate.id,
        parentUserId: candidate.parent_user_id,
        childId: candidate.child_id,
        misspellingNormalized: candidate.misspelling_normalized,
        correctSpellingNormalized: candidate.correct_spelling_normalized,
        microSkillKey: candidate.micro_skill_key,
        candidateStatus: candidate.candidate_status,
        verifiedOn: isoDate(candidate.updated_at),
      },
      canonicalMappings: mappingFacts,
      words: (words ?? []).map((word: any) => ({
        canonicalWordId: word.id,
        normalisedWord: word.normalised_word,
        rowStatus: word.row_status,
        reviewStatus: word.review_status,
        frequencyBand: word.frequency_band,
        ageBand: word.age_band,
      })),
      microSkills: (skills ?? []).map((skill: any) => ({
        microSkillKey: skill.micro_skill_key,
        masteryDomainKey: skill.mastery_domain_key,
        isActive: skill.is_active,
        isAssignable: skill.is_assignable,
      })),
      supports: (supports ?? []).map((support: any) => ({
        canonicalWordId: support.canonical_word_id,
        microSkillKey: support.micro_skill_key,
        supportRole: support.support_role,
        rowStatus: support.row_status,
        reviewStatus: support.review_status,
      })),
      contentVersions: (content ?? []).map((entry: any) => ({
        microSkillKey: entry.micro_skill_key,
        versionStatus: entry.version_status,
        isActive: entry.is_active,
        finalReadinessReviewStatus: entry.final_readiness_review_status,
        childFriendlyExplanation: entry.child_friendly_explanation,
        ruleExplanation: entry.rule_explanation,
      })),
      productionEnabledSkillKeys: routeFacts.enabled,
      routeSpecificReadyWordSkillPairs: routeFacts.readyPairs,
      allowedFrequencyBands: new Set(
        ADLE_PILOT_CHILD_BAND.allowedFrequencyBands,
      ),
      allowedAgeBands: new Set(ADLE_PILOT_CHILD_BAND.allowedAgeBands),
    });
    if (resolution.status === "blocked") {
      result.blocked.push({
        candidateMappingId: resolution.candidateMappingId,
        reason: resolution.reason,
        evidence: resolution.evidence,
      });
      continue;
    }
    result.eligible += 1;
    if (!params.dryRun) {
      const inserted = await persistEligibleIntake(client, resolution);
      if (inserted) result.inserted += 1;
      else result.strengthened += 1;
    }
  }
  return result;
}
