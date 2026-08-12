import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- additive tables are intentionally ahead of generated Supabase types */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canonicalWordSkillPair,
  isCanonicalIntakeEnabled,
  resolveCanonicalIntakeReadiness,
  type CanonicalIntakeBlockReason,
  type CanonicalIntakeMappingFact,
  type CanonicalIntakeResolution,
  type CanonicalIntakeRouteReadinessFact,
  type IntakeCandidateState,
  type IntakeDemandType,
  type IntakeReadinessBlocker,
} from "../canonical-intake";
import { resolveCanonicalIntakeRoute } from "../canonical-intake/route-readiness";
import {
  compileBaseWordCanonicalIntakeRouteFacts,
} from "../canonical-intake/base-word-route-readiness";
import { getCurriculumRouteDefinition } from "../curriculum-readiness/route-registry";
import { isBaseWordFamilyPilotEnabledForChild } from "../morphology/base-word-family-pilot-access";
import { loadDynamicPrefixProfiles } from "../morphology/dynamic-prefix-profile-loader";
import { isDynamicPrefixRouteEnabled } from "../morphology/dynamic-prefix-staging-access";
import {
  DYNAMIC_SUFFIX_PROFILE_KEYS,
  loadDynamicSuffixProfiles,
} from "../morphology/dynamic-suffix-profile-loader";
import { isDynamicSuffixRouteEnabled } from "../morphology/dynamic-suffix-route-gate";
import { ADLE_PILOT_CHILD_BAND } from "./composer-facts-loader";
import { resolveAdleRouteActivationEnvironment } from "../route-activation-environment";
import { loadEnabledBaseWordReleaseAuthorities } from "./curriculum-release-authority";
import { isBaseWordIntakeSkill } from "../canonical-intake/route-readiness";
import {
  compileCompoundWordCanonicalIntakeRouteFacts,
  COMPOUND_WORD_ROUTE_ID,
  COMPOUND_WORD_ROUTE_VERSION,
  type CompoundWordClosureWordFact,
  type CompoundWordPublishedStructureFact,
  type CompoundWordReleaseFact,
} from "../canonical-intake/compound-word-release-readiness";

type AdleClient = SupabaseClient;

const BASE_WORD_ROUTE = getCurriculumRouteDefinition("base_word_lab", "v2") ??
  (() => {
    throw new Error("Base Word route is not registered");
  })();

const COMPOUND_WORD_ROUTE = getCurriculumRouteDefinition(
  COMPOUND_WORD_ROUTE_ID,
  COMPOUND_WORD_ROUTE_VERSION,
) ?? (() => {
  throw new Error("Compound Word v2 route is not registered");
})();

async function loadReleasedCompoundWordIntakeFacts(client: AdleClient) {
  const { data: releases, error: releasesError } = await client
    .from("adle_curriculum_release_manifests")
    .select("id,release_key,release_manifest_sha256,dependency_fingerprint,route_id,route_version,activation_route_key,payload_version,manifest_payload,published_at")
    .eq("route_id", COMPOUND_WORD_ROUTE_ID)
    .eq("route_version", COMPOUND_WORD_ROUTE_VERSION);
  if (releasesError) throwQuery("Compound Word curriculum releases", releasesError);
  const releaseIds = (releases ?? []).map((row: any) => row.id as string);
  if (releaseIds.length === 0) {
    return compileCompoundWordCanonicalIntakeRouteFacts({ releases: [], publishedStructures: [], closureWords: [] });
  }
  const [{ data: dependencies, error: dependenciesError }, { data: structures, error: structuresError }] = await Promise.all([
    client.from("adle_curriculum_release_dependencies")
      .select("release_manifest_id,micro_skill_key,authority_type,authority_id,authority_key,authority_schema_version,semantic_fingerprint")
      .in("release_manifest_id", releaseIds)
      .in("micro_skill_key", [...COMPOUND_WORD_ROUTE.supportedMicroSkillKeys]),
    client.from("canonical_teaching_dictionary_compound_structures_v2")
      .select("canonical_word_id,micro_skill_key,assignment_eligible,row_status,review_status,source_metadata")
      .in("micro_skill_key", [...COMPOUND_WORD_ROUTE.supportedMicroSkillKeys]),
  ]);
  if (dependenciesError) throwQuery("Compound Word release dependencies", dependenciesError);
  if (structuresError) throwQuery("Compound Word published structures", structuresError);
  const authorityIds = [...new Set((dependencies ?? []).map((row: any) => row.authority_id as string))];
  const [{ data: authorities, error: authoritiesError }, { data: closureWords, error: closureWordsError }] = await Promise.all([
    client.from("adle_curriculum_dependency_authorities")
      .select("id,authority_type,authority_key,schema_version,semantic_fingerprint,semantic_projection")
      .in("id", authorityIds),
    client.from("adle_teaching_dictionary_closure_words")
      .select("authority_id,canonical_word_id,display_word,dictation_sentence,dictation_target_token_index,dictation_target_end_exclusive,exact_governed_answer")
      .in("authority_id", authorityIds),
  ]);
  if (authoritiesError) throwQuery("Compound Word dependency authorities", authoritiesError);
  if (closureWordsError) throwQuery("Compound Word Teaching Dictionary closure", closureWordsError);
  const authorityById = new Map((authorities ?? []).map((row: any) => [row.id as string, row]));
  const releaseFacts: CompoundWordReleaseFact[] = [];
  for (const release of releases ?? []) {
    const releaseDependencies = (dependencies ?? []).filter((row: any) => row.release_manifest_id === (release as any).id);
    const skillKeys = [...new Set(releaseDependencies.map((row: any) => row.micro_skill_key as string))];
    for (const microSkillKey of skillKeys) {
      releaseFacts.push({
        releaseManifestId: (release as any).id,
        releaseKey: (release as any).release_key,
        releaseManifestSha256: (release as any).release_manifest_sha256,
        dependencyFingerprint: (release as any).dependency_fingerprint,
        routeId: (release as any).route_id,
        routeVersion: (release as any).route_version,
        activationRouteKey: (release as any).activation_route_key,
        payloadVersion: (release as any).payload_version,
        manifestPayload: (release as any).manifest_payload,
        microSkillKey,
        publishedAt: (release as any).published_at,
        dependencies: releaseDependencies.filter((row: any) => row.micro_skill_key === microSkillKey).map((row: any) => {
          const authority = authorityById.get(row.authority_id) as any;
          return {
            authorityType: row.authority_type,
            authorityId: row.authority_id,
            authorityKey: row.authority_key,
            authoritySchemaVersion: row.authority_schema_version,
            semanticFingerprint: row.semantic_fingerprint,
            authority: authority ? {
              id: authority.id,
              authorityType: authority.authority_type,
              authorityKey: authority.authority_key,
              schemaVersion: authority.schema_version,
              semanticFingerprint: authority.semantic_fingerprint,
              semanticProjection: authority.semantic_projection,
            } : null,
          };
        }),
      });
    }
  }
  return compileCompoundWordCanonicalIntakeRouteFacts({
    releases: releaseFacts,
    publishedStructures: (structures ?? []).map((row: any) => ({
      canonicalWordId: row.canonical_word_id,
      microSkillKey: row.micro_skill_key,
      assignmentEligible: row.assignment_eligible,
      rowStatus: row.row_status,
      reviewStatus: row.review_status,
      dependencyAuthorityId: typeof row.source_metadata?.dependencyAuthorityId === "string" ? row.source_metadata.dependencyAuthorityId : null,
    } satisfies CompoundWordPublishedStructureFact)),
    closureWords: (closureWords ?? []).map((row: any) => ({
      authorityId: row.authority_id,
      canonicalWordId: row.canonical_word_id,
      displayWord: row.display_word,
      dictationSentence: row.dictation_sentence,
      dictationTargetStart: row.dictation_target_token_index,
      dictationTargetEndExclusive: row.dictation_target_end_exclusive,
      exactGovernedAnswer: row.exact_governed_answer,
    } satisfies CompoundWordClosureWordFact)),
  });
}

export interface CanonicalIntakeLiveResult {
  enabled: boolean;
  eligible: number;
  inserted: number;
  strengthened: number;
  pendingMapping: number;
  pendingContent: number;
  demandsCreated: number;
  blocked: Array<{
    candidateMappingId: string;
    reason: CanonicalIntakeBlockReason;
    evidence: Record<string, unknown>;
    candidateState: IntakeCandidateState;
    demandType: IntakeDemandType;
    blockers: IntakeReadinessBlocker[];
    demandId?: string;
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

async function routeActivationFacts(client: AdleClient, childId: string) {
  const enabled = new Set<string>();
  const readyPairs = new Set<string>();
  const routeReadiness: CanonicalIntakeRouteReadinessFact[] = [];
  const baseWordClosureWords: Array<{
    activationRevisionId: string;
    microSkillKey: string;
    canonicalWordId: string;
    normalisedWord: string;
  }> = [];
  const activationEnvironment = resolveAdleRouteActivationEnvironment();
  const compoundFactsPromise = loadReleasedCompoundWordIntakeFacts(client);
  const { data: selectorProfiles, error: selectorProfileError } = await client
    .from("canonical_teaching_dictionary_transfer_selector_profiles")
    .select("micro_skill_key,row_status,review_status,allowed_age_bands")
    .eq("row_status", "active")
    .eq("review_status", "approved_for_first_exposure");
  if (selectorProfileError)
    throwQuery("canonical intake transfer selector profiles", selectorProfileError);
  for (const profile of selectorProfiles ?? []) {
    enabled.add((profile as any).micro_skill_key);
  }

  if (isDynamicPrefixRouteEnabled()) {
    const allowStagingProfiles =
      activationEnvironment === "staging" || process.env.VERCEL_ENV === "preview";
    const { data: rawPrefixProfiles, error: rawPrefixError } = await client
      .from("canonical_teaching_dictionary_prefix_profiles")
      .select(
        "micro_skill_key,production_enabled,row_status,review_status,canonical_teaching_dictionary_prefix_members(canonical_word_id,assignment_eligible,row_status,review_status)",
      )
      .like("micro_skill_key", "D4_MOR_PREFIXES_%");
    if (rawPrefixError)
      throwQuery("canonical intake Prefix readiness facts", rawPrefixError);
    const { profiles } = await loadDynamicPrefixProfiles(client, childId, {
      allowStagingProfiles,
    });
    for (const profile of profiles) {
      if (!profile.productionEnabled) continue;
      enabled.add(profile.microSkillKey);
      for (const canonicalWordId of profile.wordsByCanonicalId.keys()) {
        readyPairs.add(
          canonicalWordSkillPair(canonicalWordId, profile.microSkillKey),
        );
      }
    }
    for (const rawProfile of rawPrefixProfiles ?? []) {
      const profile = rawProfile as any;
      if (
        (profile.production_enabled !== true && !allowStagingProfiles) ||
        profile.row_status !== "active" ||
        profile.review_status !== "approved_for_first_exposure"
      )
        continue;
      enabled.add(profile.micro_skill_key);
      for (const rawMember of
        profile.canonical_teaching_dictionary_prefix_members ?? []) {
        const member = rawMember as any;
        const pair = canonicalWordSkillPair(
          member.canonical_word_id,
          profile.micro_skill_key,
        );
        const memberApproved =
          member.assignment_eligible === true &&
          member.row_status === "active" &&
          member.review_status === "approved_for_first_exposure";
        routeReadiness.push({
          canonicalWordId: member.canonical_word_id,
          microSkillKey: profile.micro_skill_key,
          ready: memberApproved && readyPairs.has(pair),
          blockers: !memberApproved
            ? ["profile_member_unapproved"]
            : readyPairs.has(pair)
              ? []
              : ["payload_not_compilable"],
          evidence: [
            {
              source: "canonical_teaching_dictionary_prefix_members",
              status: member.review_status,
            },
          ],
        });
      }
    }
  }

  if (isDynamicSuffixRouteEnabled()) {
    const allowStagingProfiles =
      activationEnvironment === "staging" || process.env.VERCEL_ENV === "preview";
    const [{ data: rawSuffixProfiles, error: rawSuffixError }, loaded] =
      await Promise.all([
        client
          .from("canonical_teaching_dictionary_suffix_profiles")
          .select(
            "micro_skill_key,production_enabled,row_status,review_status,canonical_teaching_dictionary_suffix_members(canonical_word_id,assignment_eligible,row_status,review_status)",
          )
          .in("micro_skill_key", DYNAMIC_SUFFIX_PROFILE_KEYS),
        loadDynamicSuffixProfiles(client, childId, { allowStagingProfiles }),
      ]);
    if (rawSuffixError)
      throwQuery("canonical intake Affix readiness facts", rawSuffixError);

    const loadedProfileByKey = new Map(
      loaded.profiles.map((profile) => [profile.microSkillKey, profile]),
    );
    for (const rawProfile of rawSuffixProfiles ?? []) {
      const profile = rawProfile as any;
      const profileKey = profile.micro_skill_key as string;
      const profileEligible =
        (profile.production_enabled === true || allowStagingProfiles) &&
        profile.row_status === "active" &&
        profile.review_status === "approved_for_first_exposure";
      const loadedProfile = profileEligible
        ? loadedProfileByKey.get(profileKey)
        : undefined;
      if (loadedProfile?.productionEnabled) enabled.add(profileKey);
      for (const rawMember of
        profile.canonical_teaching_dictionary_suffix_members ?? []) {
        const member = rawMember as any;
        const canonicalWordId = member.canonical_word_id as string;
        const pair = canonicalWordSkillPair(canonicalWordId, profileKey);
        const memberApproved =
          member.assignment_eligible === true &&
          member.row_status === "active" &&
          member.review_status === "approved_for_first_exposure";
        const memberReady =
          Boolean(loadedProfile?.wordsByCanonicalId.has(canonicalWordId)) &&
          memberApproved;
        if (memberReady) readyPairs.add(pair);
        routeReadiness.push({
          canonicalWordId,
          microSkillKey: profileKey,
          ready: memberReady,
          blockers: !profileEligible
            ? ["profile_not_enabled"]
            : !memberApproved
              ? ["profile_member_unapproved"]
              : memberReady
                ? []
                : ["payload_not_compilable"],
          evidence: [
            {
              source: "canonical_teaching_dictionary_suffix_members",
              status: member.review_status as string,
            },
          ],
        });
      }
    }
  }

  if (isBaseWordFamilyPilotEnabledForChild(childId)) {
    if (!activationEnvironment) {
      const compoundFacts = await compoundFactsPromise;
      for (const skill of compoundFacts.enabledSkills) enabled.add(skill);
      for (const pair of compoundFacts.readyPairs) readyPairs.add(pair);
      routeReadiness.push(...compoundFacts.routeReadiness);
      return { enabled, readyPairs, routeReadiness, selectorProfiles: selectorProfiles ?? [], baseWordClosureWords };
    }
    const activations = await loadEnabledBaseWordReleaseAuthorities({
      client,
      environmentKey: activationEnvironment,
      microSkillKeys: BASE_WORD_ROUTE.supportedMicroSkillKeys,
    });
    const baseFacts = compileBaseWordCanonicalIntakeRouteFacts({
      activations,
    });
    for (const activation of activations) {
      for (const word of activation.dictionaryWords) {
        baseWordClosureWords.push({
          activationRevisionId: activation.activationRevisionId,
          microSkillKey: activation.microSkillKey,
          canonicalWordId: word.canonicalWordId,
          normalisedWord: word.normalisedWord,
        });
      }
    }
    for (const skill of baseFacts.enabledSkills) enabled.add(skill);
    for (const pair of baseFacts.readyPairs) readyPairs.add(pair);
    routeReadiness.push(...baseFacts.routeReadiness);
  }
  const compoundFacts = await compoundFactsPromise;
  for (const skill of compoundFacts.enabledSkills) enabled.add(skill);
  for (const pair of compoundFacts.readyPairs) readyPairs.add(pair);
  routeReadiness.push(...compoundFacts.routeReadiness);
  return {
    enabled,
    readyPairs,
    routeReadiness,
    selectorProfiles: selectorProfiles ?? [],
    baseWordClosureWords,
  };
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
    p_route_id: resolution.routeId,
    p_route_version: resolution.routeVersion,
    p_route_activation_id: resolution.routeActivationId ?? null,
    p_release_manifest_id: resolution.curriculumRelease?.releaseManifestId ?? null,
    p_release_manifest_sha256: resolution.curriculumRelease?.releaseManifestSha256 ?? null,
    p_dependency_fingerprint: resolution.curriculumRelease?.dependencyFingerprint ?? null,
  });
  if (error) throwQuery("canonical intake atomic persistence", error);
  return Boolean((data as Array<{ inserted?: boolean }> | null)?.[0]?.inserted);
}

async function persistBlockedIntake(
  client: AdleClient,
  resolution: Extract<CanonicalIntakeResolution, { status: "blocked" }>,
  normalizedTargetToken: string,
): Promise<{ demandId: string | null; demandCreated: boolean }> {
  const readiness = resolution.readiness;
  const primary = readiness.blockers[0];
  const { data, error } = await client.rpc(
    "adle_record_canonical_intake_blocked",
    {
      p_candidate_mapping_id: resolution.candidateMappingId,
      p_normalized_target_token:
        readiness.canonicalTargetToken ?? normalizedTargetToken,
      p_canonical_word_id: readiness.canonicalWordId ?? null,
      p_target_identity_status: readiness.targetIdentityStatus,
      p_route_id: readiness.routeId,
      p_route_version: readiness.routeVersion,
      p_micro_skill_key: readiness.microSkillKey,
      p_candidate_state: readiness.candidateState,
      p_blockers: readiness.blockers,
      p_readiness_fingerprint: readiness.readinessFingerprint,
      p_demand_type: primary.demandType,
      p_primary_blocker_code: primary.code,
    },
  );
  if (error) throwQuery("canonical intake blocked persistence", error);
  const row = (data as
    | Array<{ demand_id?: string; demand_created?: boolean }>
    | null)?.[0];
  return {
    demandId: typeof row?.demand_id === "string" ? row.demand_id : null,
    demandCreated: row?.demand_created === true,
  };
}

async function seedApprovedCandidate(
  client: AdleClient,
  candidate: {
    id: string;
    correct_spelling_normalized: string;
    micro_skill_key: string;
  },
  skillClusterKey: string | null,
) {
  const route = resolveCanonicalIntakeRoute(
    candidate.micro_skill_key,
    skillClusterKey,
  );
  const { error } = await client.rpc("adle_seed_canonical_intake_candidate", {
    p_candidate_mapping_id: candidate.id,
    p_normalized_target_token: candidate.correct_spelling_normalized,
    p_route_id: route.routeId,
    p_route_version: route.routeVersion,
    p_micro_skill_key: candidate.micro_skill_key,
    p_source_ref: `parent_approval:${candidate.id}`,
  });
  if (error) throwQuery("canonical intake candidate seed", error);
}

/** Failure-isolated caller hook: the feature flag is the first gate and no
 * candidate outside the approved submission/child scope is read or written. */
export async function intakeApprovedSubmissionCorrections(params: {
  serviceClient: AdleClient;
  parentUserId: string;
  childId: string;
  submissionId: string;
  dryRun?: boolean;
  candidateMappingIds?: readonly string[];
  seedCandidates?: boolean;
}): Promise<CanonicalIntakeLiveResult> {
  const result: CanonicalIntakeLiveResult = {
    enabled: false,
    eligible: 0,
    inserted: 0,
    strengthened: 0,
    pendingMapping: 0,
    pendingContent: 0,
    demandsCreated: 0,
    blocked: [],
  };
  if (!isCanonicalIntakeEnabled())
    return result;
  result.enabled = true;
  const client = params.serviceClient;
  let candidateQuery = client
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
  if (params.candidateMappingIds?.length) {
    candidateQuery = candidateQuery.in("id", [...params.candidateMappingIds]);
  }
  const { data: candidateRows, error: candidateError } = await candidateQuery;
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
      .select(
        "micro_skill_key,mastery_domain_key,skill_cluster_key,is_active,is_assignable",
      )
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
  const skillByKey = new Map(
    (skills ?? []).map((skill: any) => [skill.micro_skill_key as string, skill]),
  );
  if (!params.dryRun && params.seedCandidates !== false) {
    for (const rawCandidate of candidateRows ?? []) {
      const candidate = rawCandidate as any;
      await seedApprovedCandidate(
        client,
        candidate,
        skillByKey.get(candidate.micro_skill_key)?.skill_cluster_key ?? null,
      );
    }
  }
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
    routeActivationFacts(client, params.childId),
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
    const candidateSkill = skillByKey.get(candidate.micro_skill_key);
    const baseWordCandidate = isBaseWordIntakeSkill(
      candidate.micro_skill_key,
      candidateSkill?.skill_cluster_key ?? null,
    );
    const exactBaseWordReadiness = routeFacts.routeReadiness.find((entry) =>
      entry.microSkillKey === candidate.micro_skill_key &&
      entry.curriculumRelease &&
      routeFacts.baseWordClosureWords.some((word) =>
        word.activationRevisionId === entry.routeActivationId &&
        word.microSkillKey === candidate.micro_skill_key &&
        word.normalisedWord === candidate.correct_spelling_normalized,
      ),
    );
    const exactBaseWordWords = baseWordCandidate && exactBaseWordReadiness
      ? routeFacts.baseWordClosureWords
          .filter((word) => word.activationRevisionId === exactBaseWordReadiness.routeActivationId &&
            word.microSkillKey === candidate.micro_skill_key && word.normalisedWord === candidate.correct_spelling_normalized)
          .map((word) => ({
            canonicalWordId: word.canonicalWordId,
            normalisedWord: word.normalisedWord,
            rowStatus: "active",
            reviewStatus: "approved_for_first_exposure",
            frequencyBand: null,
            ageBand: null,
          }))
      : null;
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
      words: exactBaseWordWords ?? (words ?? []).map((word: any) => ({
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
        skillClusterKey: skill.skill_cluster_key,
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
      selectorProfiles: (routeFacts.selectorProfiles ?? []).map((profile: any) => ({
        microSkillKey: profile.micro_skill_key,
        rowStatus: profile.row_status,
        reviewStatus: profile.review_status,
        allowedAgeBands: Array.isArray(profile.allowed_age_bands)
          ? profile.allowed_age_bands.map(String)
          : [],
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
      routeReadiness: routeFacts.routeReadiness,
      allowedFrequencyBands: new Set(
        ADLE_PILOT_CHILD_BAND.allowedFrequencyBands,
      ),
      allowedAgeBands: new Set(ADLE_PILOT_CHILD_BAND.allowedAgeBands),
    });
    if (resolution.status === "blocked") {
      const readiness = resolution.readiness;
      let persisted: { demandId: string | null; demandCreated: boolean } = {
        demandId: null,
        demandCreated: false,
      };
      if (!params.dryRun) {
        persisted = await persistBlockedIntake(
          client,
          resolution,
          candidate.correct_spelling_normalized,
        );
      }
      if (readiness.candidateState === "pending_content")
        result.pendingContent += 1;
      else result.pendingMapping += 1;
      if (persisted.demandCreated) result.demandsCreated += 1;
      result.blocked.push({
        candidateMappingId: resolution.candidateMappingId,
        reason: resolution.reason,
        evidence: resolution.evidence,
        candidateState: readiness.candidateState,
        demandType: readiness.blockers[0].demandType,
        blockers: readiness.blockers,
        ...(persisted.demandId ? { demandId: persisted.demandId } : {}),
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

export interface CanonicalIntakeSweepResult {
  enabled: boolean;
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
  inserted: number;
  strengthened: number;
  pendingMapping: number;
  pendingContent: number;
}

/** Bounded event/safety-sweep worker. It reuses the same submission-scoped
 * evaluator path as the parent approval hook; database uniqueness makes
 * repeated sibling processing safe and reconciliation never writes an
 * assignment. */
export async function runCanonicalIntakeReconciliationSweep(params: {
  serviceClient: AdleClient;
  leaseOwner: string;
  limit?: number;
}): Promise<CanonicalIntakeSweepResult> {
  const summary: CanonicalIntakeSweepResult = {
    enabled: isCanonicalIntakeEnabled(),
    claimed: 0,
    completed: 0,
    retried: 0,
    failed: 0,
    inserted: 0,
    strengthened: 0,
    pendingMapping: 0,
    pendingContent: 0,
  };
  if (!summary.enabled) return summary;

  const client = params.serviceClient;
  const limit = Math.max(1, Math.min(params.limit ?? 25, 100));
  const { data: unresolved, error: unresolvedError } = await client
    .from("adle_canonical_intake_candidates")
    .select("id")
    .in("candidate_state", [
      "pending_mapping",
      "pending_content",
      "error_retryable",
    ])
    .order("priority", { ascending: false })
    .order("first_seen_at", { ascending: true })
    .limit(limit);
  if (unresolvedError)
    throwQuery("canonical intake safety sweep candidates", unresolvedError);
  for (const row of unresolved ?? []) {
    const { error } = await client.rpc(
      "adle_enqueue_canonical_intake_candidate",
      {
        p_candidate_id: (row as any).id,
        p_trigger_type: "safety_sweep",
        p_source_ref: "cron:adle-canonical-intake",
      },
    );
    if (error) throwQuery("canonical intake safety sweep enqueue", error);
  }

  const { data: jobs, error: claimError } = await client.rpc(
    "adle_claim_canonical_intake_jobs",
    {
      p_limit: limit,
      p_lease_owner: params.leaseOwner,
      p_lease_seconds: 240,
    },
  );
  if (claimError) throwQuery("canonical intake queue claim", claimError);
  summary.claimed = (jobs ?? []).length;

  for (const rawJob of jobs ?? []) {
    const job = rawJob as any;
    try {
      const { data: intakeCandidate, error: intakeCandidateError } =
        await client
          .from("adle_canonical_intake_candidates")
          .select("source_candidate_mapping_id")
          .eq("id", job.candidate_id)
          .single();
      if (intakeCandidateError)
        throwQuery(
          "canonical intake reconciler candidate",
          intakeCandidateError,
        );
      const { data: source, error: sourceError } = await client
        .from("parent_verified_spelling_candidate_mappings")
        .select("parent_user_id,child_id,task_submission_id")
        .eq(
          "id",
          (intakeCandidate as any).source_candidate_mapping_id,
        )
        .single();
      if (sourceError)
        throwQuery("canonical intake reconciler source", sourceError);
      if (!(source as any).task_submission_id)
        throw new Error("canonical intake reconciler source has no submission");

      const outcome = await intakeApprovedSubmissionCorrections({
        serviceClient: client,
        parentUserId: (source as any).parent_user_id,
        childId: (source as any).child_id,
        submissionId: (source as any).task_submission_id,
        candidateMappingIds: [
          (intakeCandidate as any).source_candidate_mapping_id,
        ],
        seedCandidates: false,
      });
      summary.completed += 1;
      summary.inserted += outcome.inserted;
      summary.strengthened += outcome.strengthened;
      summary.pendingMapping += outcome.pendingMapping;
      summary.pendingContent += outcome.pendingContent;
      const { error: completeError } = await client
        .from("adle_canonical_intake_reconciliation_queue")
        .update({
          job_status: "completed",
          lease_owner: null,
          lease_expires_at: null,
          last_error_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.job_id)
        .eq("lease_owner", params.leaseOwner);
      if (completeError)
        throwQuery("canonical intake queue completion update", completeError);
    } catch (error) {
      const attemptCount = Number(job.attempt_count ?? 1);
      const failed = attemptCount >= 5;
      const delaySeconds = Math.min(300, 15 * 2 ** Math.max(0, attemptCount - 1));
      const { error: updateError } = await client
        .from("adle_canonical_intake_reconciliation_queue")
        .update({
          job_status: failed ? "failed" : "retry",
          available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
          lease_owner: null,
          lease_expires_at: null,
          last_error_code: "candidate_reconciliation_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.job_id);
      if (updateError)
        throwQuery("canonical intake queue retry update", updateError);
      if (failed) summary.failed += 1;
      else summary.retried += 1;
      console.error("[adle-canonical-intake] reconciliation candidate failed", {
        jobId: job.job_id,
        attemptCount,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }
  return summary;
}
