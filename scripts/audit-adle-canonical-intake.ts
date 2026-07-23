/** Read-only canonical-intake and shared-schedule audit. No write path exists. */
/* eslint-disable @typescript-eslint/no-explicit-any -- operational audit reads additive tables absent from generated types */
import { createClient } from "@supabase/supabase-js";
import {
  canonicalWordSkillPair,
  resolveCanonicalIntakeReadiness,
} from "../lib/adle/canonical-intake";
import { isBaseWordFamilyPilotEnabledForChild } from "../lib/adle/morphology/base-word-family-pilot-access";
import { isDynamicPrefixRouteEnabled } from "../lib/adle/morphology/dynamic-prefix-route-gate";
import { ADLE_PILOT_CHILD_BAND } from "../lib/adle/loaders/composer-facts-loader";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
function assertRead(error: { message: string } | null, label: string): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function main(): Promise<void> {
  const db = createClient(
    required("STAGING_SUPABASE_URL"),
    required("STAGING_SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const [
    candidateResult,
    wordResult,
    skillResult,
    mappingResult,
    supportResult,
    contentResult,
    prefixProfileResult,
    baseFamilyResult,
    scheduleResult,
    itemResult,
  ] = await Promise.all([
    db
      .from("parent_verified_spelling_candidate_mappings")
      .select(
        "id,parent_user_id,child_id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,candidate_status,updated_at",
      )
      .limit(20000),
    db
      .from("canonical_teaching_dictionary_words")
      .select(
        "id,normalised_word,row_status,review_status,frequency_band,age_band",
      )
      .limit(20000),
    db
      .from("micro_skill_catalog")
      .select("micro_skill_key,mastery_domain_key,is_active,is_assignable")
      .limit(5000),
    db
      .from("spelling_canonical_mappings")
      .select(
        "id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status",
      )
      .limit(20000),
    db
      .from("canonical_teaching_dictionary_word_support")
      .select(
        "canonical_word_id,micro_skill_key,support_role,row_status,review_status",
      )
      .limit(30000),
    db
      .from("canonical_teaching_dictionary_content_versions")
      .select(
        "micro_skill_key,version_status,is_active,final_readiness_review_status,child_friendly_explanation,rule_explanation",
      )
      .limit(10000),
    db
      .from("canonical_teaching_dictionary_prefix_profiles")
      .select("id,micro_skill_key,production_enabled,row_status,review_status")
      .eq("row_status", "active")
      .limit(5000),
    db
      .from("canonical_teaching_dictionary_base_word_families")
      .select("id,micro_skill_key,row_status,review_status")
      .eq("row_status", "active")
      .limit(5000),
    db
      .from("adle_review_schedule_words")
      .select("id,child_id,canonical_word_id")
      .eq("row_status", "active")
      .limit(10000),
    db
      .from("adle_learning_items")
      .select("id,child_id,canonical_word_id,micro_skill_key,item_status")
      .eq("row_status", "active")
      .neq("item_status", "resolved")
      .limit(20000),
  ]);
  for (const [result, label] of [
    [candidateResult, "candidates"],
    [wordResult, "words"],
    [skillResult, "skills"],
    [mappingResult, "mappings"],
    [supportResult, "supports"],
    [contentResult, "content"],
    [prefixProfileResult, "prefix profiles"],
    [baseFamilyResult, "base families"],
    [scheduleResult, "schedules"],
    [itemResult, "items"],
  ] as const)
    assertRead(result.error, label);

  const mappings = mappingResult.data ?? [];
  const mappingIds = mappings.map((row: any) => row.id as string);
  const prefixProfiles = prefixProfileResult.data ?? [];
  const baseFamilies = baseFamilyResult.data ?? [];
  const [visibilityResult, prefixMemberResult, baseMemberResult] =
    await Promise.all([
      mappingIds.length
        ? db
            .from("spelling_canonical_mapping_events")
            .select("mapping_id")
            .in("mapping_id", mappingIds)
            .eq("event_type", "resolver_visibility_enabled")
            .eq("new_resolver_visibility_status", "visible")
            .limit(30000)
        : Promise.resolve({ data: [], error: null }),
      prefixProfiles.length
        ? db
            .from("canonical_teaching_dictionary_prefix_members")
            .select(
              "prefix_profile_id,canonical_word_id,assignment_eligible,row_status,review_status",
            )
            .in(
              "prefix_profile_id",
              prefixProfiles.map((row: any) => row.id),
            )
            .limit(30000)
        : Promise.resolve({ data: [], error: null }),
      baseFamilies.length
        ? db
            .from("canonical_teaching_dictionary_base_word_family_members")
            .select(
              "base_word_family_id,canonical_word_id,assignment_eligible,row_status,review_status",
            )
            .in(
              "base_word_family_id",
              baseFamilies.map((row: any) => row.id),
            )
            .limit(30000)
        : Promise.resolve({ data: [], error: null }),
    ]);
  assertRead(visibilityResult.error, "visibility events");
  assertRead(prefixMemberResult.error, "prefix members");
  assertRead(baseMemberResult.error, "base members");
  const visibleMappingIds = new Set(
    (visibilityResult.data ?? []).map((row: any) => row.mapping_id as string),
  );
  const mappingFacts = mappings.map((row: any) => ({
    mappingId: row.id,
    misspellingNormalized: row.misspelling_normalized,
    correctSpellingNormalized: row.correct_spelling_normalized,
    microSkillKey: row.micro_skill_key,
    mappingStatus: row.mapping_status,
    resolverVisibilityStatus: row.resolver_visibility_status,
    hasVisibilityEnableEvent: visibleMappingIds.has(row.id),
  }));
  const profileById = new Map(
    prefixProfiles.map((row: any) => [row.id as string, row]),
  );
  const familyById = new Map(
    baseFamilies.map((row: any) => [row.id as string, row]),
  );

  const blockerCounts: Record<string, number> = {};
  const eligible: Array<{
    candidateMappingId: string;
    childId: string;
    canonicalWordId: string;
    microSkillKey: string;
  }> = [];
  const unresolvedTargetText: Array<{
    candidateMappingId: string;
    correctSpelling: string;
    reason: string;
  }> = [];
  const candidateRows = candidateResult.data ?? [];
  for (const candidate of candidateRows as any[]) {
    const enabled = new Set<string>();
    const readyPairs = new Set<string>();
    for (const member of isDynamicPrefixRouteEnabled() ? prefixMemberResult.data ?? [] : []) {
      const profile: any = profileById.get((member as any).prefix_profile_id);
      if (
        profile?.production_enabled &&
        profile.review_status === "approved_for_first_exposure" &&
        (member as any).assignment_eligible &&
        (member as any).row_status === "active" &&
        (member as any).review_status === "approved_for_first_exposure"
      ) {
        enabled.add(profile.micro_skill_key);
        readyPairs.add(
          canonicalWordSkillPair(
            (member as any).canonical_word_id,
            profile.micro_skill_key,
          ),
        );
      }
    }
    if (isBaseWordFamilyPilotEnabledForChild(candidate.child_id))
      for (const member of baseMemberResult.data ?? []) {
        const family: any = familyById.get((member as any).base_word_family_id);
        if (
          family?.review_status === "approved_for_first_exposure" &&
          (member as any).assignment_eligible &&
          (member as any).row_status === "active" &&
          (member as any).review_status === "approved_for_first_exposure"
        ) {
          enabled.add(family.micro_skill_key);
          readyPairs.add(
            canonicalWordSkillPair(
              (member as any).canonical_word_id,
              family.micro_skill_key,
            ),
          );
        }
      }
    const resolution = resolveCanonicalIntakeReadiness({
      candidate: {
        candidateMappingId: candidate.id,
        parentUserId: candidate.parent_user_id,
        childId: candidate.child_id,
        misspellingNormalized: candidate.misspelling_normalized,
        correctSpellingNormalized: candidate.correct_spelling_normalized,
        microSkillKey: candidate.micro_skill_key,
        candidateStatus: candidate.candidate_status,
        verifiedOn: `${candidate.updated_at}`.slice(0, 10),
      },
      canonicalMappings: mappingFacts,
      words: (wordResult.data ?? []).map((row: any) => ({
        canonicalWordId: row.id,
        normalisedWord: row.normalised_word,
        rowStatus: row.row_status,
        reviewStatus: row.review_status,
        frequencyBand: row.frequency_band,
        ageBand: row.age_band,
      })),
      microSkills: (skillResult.data ?? []).map((row: any) => ({
        microSkillKey: row.micro_skill_key,
        masteryDomainKey: row.mastery_domain_key,
        isActive: row.is_active,
        isAssignable: row.is_assignable,
      })),
      supports: (supportResult.data ?? []).map((row: any) => ({
        canonicalWordId: row.canonical_word_id,
        microSkillKey: row.micro_skill_key,
        supportRole: row.support_role,
        rowStatus: row.row_status,
        reviewStatus: row.review_status,
      })),
      contentVersions: (contentResult.data ?? []).map((row: any) => ({
        microSkillKey: row.micro_skill_key,
        versionStatus: row.version_status,
        isActive: row.is_active,
        finalReadinessReviewStatus: row.final_readiness_review_status,
        childFriendlyExplanation: row.child_friendly_explanation,
        ruleExplanation: row.rule_explanation,
      })),
      productionEnabledSkillKeys: enabled,
      routeSpecificReadyWordSkillPairs: readyPairs,
      allowedFrequencyBands: new Set(
        ADLE_PILOT_CHILD_BAND.allowedFrequencyBands,
      ),
      allowedAgeBands: new Set(ADLE_PILOT_CHILD_BAND.allowedAgeBands),
    });
    if (resolution.status === "eligible")
      eligible.push({
        candidateMappingId: resolution.candidateMappingId,
        childId: resolution.childId,
        canonicalWordId: resolution.canonicalWordId,
        microSkillKey: resolution.microSkillKey,
      });
    else {
      blockerCounts[resolution.reason] =
        (blockerCounts[resolution.reason] ?? 0) + 1;
      if (
        resolution.reason === "canonical_target_not_found" ||
        resolution.reason === "canonical_target_ambiguous"
      )
        unresolvedTargetText.push({
          candidateMappingId: candidate.id,
          correctSpelling: candidate.correct_spelling_normalized,
          reason: resolution.reason,
        });
    }
  }

  const itemsByChildWord = new Map<string, any[]>();
  for (const item of itemResult.data ?? []) {
    const key = `${(item as any).child_id}\u0000${(item as any).canonical_word_id}`;
    const rows = itemsByChildWord.get(key) ?? [];
    rows.push(item);
    itemsByChildWord.set(key, rows);
  }
  const scheduleIds = (scheduleResult.data ?? []).map(
    (row: any) => row.id as string,
  );
  const linkResult = scheduleIds.length
    ? await db
        .from("adle_review_schedule_word_routes")
        .select("schedule_word_id")
        .in("schedule_word_id", scheduleIds)
        .eq("row_status", "active")
        .limit(20000)
    : { data: [], error: null };
  assertRead(linkResult.error, "schedule route links");
  const linkedSchedules = new Set(
    (linkResult.data ?? []).map((row: any) => row.schedule_word_id as string),
  );
  const multiSkillWords = [...itemsByChildWord.entries()]
    .map(([key, rows]) => ({
      key,
      microSkillKeys: [
        ...new Set(rows.map((row) => row.micro_skill_key as string)),
      ].sort(),
    }))
    .filter((entry) => entry.microSkillKeys.length > 1);
  const schedulesNeedingLinkage = (scheduleResult.data ?? [])
    .filter(
      (row: any) =>
        (itemsByChildWord.get(`${row.child_id}\u0000${row.canonical_word_id}`)
          ?.length ?? 0) > 1 && !linkedSchedules.has(row.id),
    )
    .map((row: any) => row.id);
  console.log(
    JSON.stringify(
      {
        mode: "read_only",
        candidateCount: candidateRows.length,
        inReviewCandidatesExcluded: candidateRows.filter(
          (row: any) => row.candidate_status === "in_review",
        ).length,
        eligible,
        blockerCounts,
        unresolvedTargetText,
        multiSkillWords,
        schedulesNeedingLinkage,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
