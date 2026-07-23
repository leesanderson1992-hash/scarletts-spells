/**
 * ADLE Slice 6: the composer-facts loader — the DB boundary that assembles
 * one atomic DailyPlanFacts value for (child, day). lib/adle stays pure; all
 * Supabase access for ADLE composition lives here. ADLE tables are
 * service-role-only (RLS revokes anon/authenticated), so callers pass the
 * service-role client after doing their own auth/ownership checks.
 *
 * Documented Slice 6 pins (flagged for owner QA):
 * - primary micro-skill per word = the child's own learning-item mapping
 *   (newest intake first), else the alphabetically first active approved
 *   support mapping; a word with neither fails closed into the composer's
 *   existing skip vocabulary.
 * - prerequisiteKeysBySkill loads empty: no taxonomy prerequisite storage
 *   exists yet, and the selection tier is pinned fail-open on empty facts.
 * - ADLE_PILOT_CHILD_BAND is the pilot default child band profile (frequency
 *   high/medium, age early/middle primary against the imported workbook's
 *   band vocabulary); pilot-tunable, passed explicitly everywhere.
 * - notYetSecureSkillKeys is derived here (Slice 5 owner-approved wiring):
 *   evidence facts -> pricing -> word states -> proficiency reports. The
 *   composer receives the set as an injected fact and is untouched.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- conditional nested route select is ahead of generated Supabase types */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChildBandProfile } from "../dictionary-eligibility";
import type { DailyPlanFacts } from "../daily-assignment-composer";
import type { ReviewWordFact } from "../daily-assignment-composer";
import { COMPOSER_POLICY_V1 } from "../composer-policy";
import { EVIDENCE_POLICY_V1 } from "../evidence-policy";
import { PROFICIENCY_POLICY_V1 } from "../proficiency-policy";
import { priceWordEvidence } from "../evidence-pricing";
import { computeWordEvidenceState, type WordEvidenceStateResult } from "../word-evidence-state";
import { computeAllSkillProficiency, notYetSecureSkillKeys } from "../micro-skill-proficiency";
import { taughtWordHistoryProviderFromFacts } from "../taught-word-history";
import { ADLE_CANONICAL_INTAKE_FEATURE_FLAG } from "../canonical-intake";
import { resolveSharedWordReviewPolicy } from "../shared-word-routes";
import type { IsoDate, ReviewPolicy, SchedulerRowStatus } from "../review-scheduler";
import {
  activityTemplateFromRow,
  authenticUseEventFromRow,
  bandingOverrideFromRow,
  bandingVersionFromRow,
  bundleFromRow,
  dictionaryWordFromRow,
  familyMethodFromRow,
  learningItemFromRow,
  outcomeEventFromRow,
  probeRunFromRow,
  reviewPolicyFromRow,
  scheduleWordFromRow,
  skillLevelAllocationFromRow,
  slippageEventFromRow,
  taughtHistoryFromRow,
  teachingContentFromRow,
  wordBandingFromRow,
  wordStructuralMetadataFromRow,
  wordSupportFromRow,
  type ActivityTemplateRow,
  type AuthenticUseEventRow,
  type BandingOverrideRow,
  type BandingVersionRow,
  type DictionaryWordRow,
  type FamilyMethodRow,
  type LearningItemRow,
  type OutcomeEventRow,
  type ProbeRunRow,
  type ReviewBundleRow,
  type ReviewPolicyRow,
  type ScheduleWordRow,
  type SkillLevelAllocationRow,
  type SlippageEventRow,
  type TaughtHistoryRow,
  type TeachingContentRow,
  type WordBandingRow,
  type WordStructuralMetadataRow,
  type WordSupportRow,
} from "./rows";

/** Pilot default child band profile (Slice 6 pin, owner-tunable). Values are
 * the imported workbook's band vocabulary verified in local dev. */
export const ADLE_PILOT_CHILD_BAND: ChildBandProfile = {
  allowedFrequencyBands: ["high", "medium"],
  allowedAgeBands: ["early_primary", "middle_primary"],
};

type AdleClient = SupabaseClient;

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, context: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
  return (data ?? []) as T[];
}
export async function loadActiveReviewPolicy(client: AdleClient): Promise<ReviewPolicy> {
  const policies = await rows<ReviewPolicyRow>(
    client
      .from("adle_review_policy_versions")
      .select(
        "schedule_policy_version, interval_ladder_days, catch_up_offsets_days, session_cap, pre_retirement_check_gap_days",
      )
      .eq("is_active", true),
    "loadActiveReviewPolicy",
  );
  if (policies.length !== 1) {
    throw new Error(`loadActiveReviewPolicy: expected exactly one active review policy, found ${policies.length}`);
  }
  return reviewPolicyFromRow(policies[0]);
}

export interface DailyPlanFactsLoad {
  facts: DailyPlanFacts;
  /** canonical_word_id -> primary micro_skill_key (also the completion
   * helpers' microSkillKeyByWordId input). */
  microSkillKeyByWordId: Map<string, string>;
  /** canonical_word_id -> every deterministic linked route. */
  microSkillKeysByWordId: Map<string, readonly string[]>;
  /** canonical_word_id -> display word for read models and completion UI. */
  displayWordByWordId: Map<string, string>;
  /** canonical_word_id -> normalised word (server-side correctness checks). */
  normalisedWordByWordId: Map<string, string>;
}

export interface LoadDailyPlanFactsParams {
  childId: string;
  today: IsoDate;
  childBand?: ChildBandProfile;
}

export async function loadDailyPlanFacts(
  client: AdleClient,
  params: LoadDailyPlanFactsParams,
): Promise<DailyPlanFactsLoad> {
  const { childId, today } = params;
  const childBand = params.childBand ?? ADLE_PILOT_CHILD_BAND;
  const sharedRoutesEnabled = process.env[ADLE_CANONICAL_INTAKE_FEATURE_FLAG] === "enabled";
  const scheduleWordQuery = (client.from("adle_review_schedule_words") as any)
    .select(sharedRoutesEnabled
      ? "id, child_id, canonical_word_id, bundle_id, membership_status, catch_up_stage, next_retest_due_on, failed_review_on, pre_retirement_check_due_on, last_28_day_review_on, reteach_cycle_count, taught_on, row_status, adle_review_schedule_word_routes(learning_item_id, micro_skill_key, attachment_ordinal, attached_on, row_status)"
      : "child_id, canonical_word_id, bundle_id, membership_status, catch_up_stage, next_retest_due_on, failed_review_on, pre_retirement_check_due_on, last_28_day_review_on, reteach_cycle_count, taught_on, row_status")
    .eq("child_id", childId)
    .eq("row_status", "active");

  const [
    reviewPolicy,
    bundleRows,
    scheduleWordRows,
    learningItemRows,
    familyMethodRows,
    activityTemplateRows,
    teachingContentRows,
    catalogRows,
    wordRows,
    supportRows,
    bandingRows,
    overrideRows,
    bandingVersionRows,
    allocationRows,
    probeRunRows,
    taughtHistoryRows,
    outcomeEventRows,
    authenticUseRows,
    slippageRows,
    wordMetadataRows,
  ] = await Promise.all([
    loadActiveReviewPolicy(client),
    rows<ReviewBundleRow>(
      client
        .from("adle_review_bundles")
        .select("id, child_id, source_ref, interval_index, next_due_on, schedule_policy_version, bundle_status, row_status")
        .eq("child_id", childId)
        .eq("row_status", "active"),
      "loadDailyPlanFacts:bundles",
    ),
    rows<ScheduleWordRow>(
      scheduleWordQuery,
      "loadDailyPlanFacts:scheduleWords",
    ),
    rows<LearningItemRow>(
      client
        .from("adle_learning_items")
        .select(
          "id, child_id, canonical_word_id, micro_skill_key, item_status, source_kind, source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status",
        )
        .eq("child_id", childId),
      "loadDailyPlanFacts:learningItems",
    ),
    rows<FamilyMethodRow>(
      client
        .from("adle_family_methods")
        .select("family_key, family_name, guided_question_sequence, review_sort_dimension, production_task, row_status")
        .eq("row_status", "active"),
      "loadDailyPlanFacts:familyMethods",
    ),
    rows<ActivityTemplateRow>(
      client
        .from("adle_activity_templates")
        .select(
          "template_key, phase, min_words_required, requires_sentence_context, requires_contrast_words, evidence_kind, child_facing_copy, purpose, child_response, row_status",
        )
        .eq("row_status", "active"),
      "loadDailyPlanFacts:activityTemplates",
    ),
    rows<TeachingContentRow>(
      client
        .from("canonical_teaching_dictionary_content_versions")
        .select("micro_skill_key, teaching_objective, child_friendly_explanation, rule_explanation, common_misconceptions")
        .eq("is_active", true),
      "loadDailyPlanFacts:teachingContent",
    ),
    rows<{ micro_skill_key: string; skill_family_key: string }>(
      client.from("micro_skill_catalog").select("micro_skill_key, skill_family_key").eq("is_active", true),
      "loadDailyPlanFacts:microSkillCatalog",
    ),
    rows<DictionaryWordRow>(
      client
        .from("canonical_teaching_dictionary_words")
        .select("id, word_key, normalised_word, display_word, row_status, review_status, frequency_band, age_band")
        .eq("row_status", "active"),
      "loadDailyPlanFacts:words",
    ),
    rows<WordSupportRow>(
      client
        .from("canonical_teaching_dictionary_word_support")
        .select("canonical_word_id, micro_skill_key, support_role, row_status, review_status")
        .eq("row_status", "active"),
      "loadDailyPlanFacts:supports",
    ),
    rows<WordBandingRow>(
      client
        .from("canonical_teaching_dictionary_word_banding")
        .select("canonical_word_id, banding_version, structural_score, complexity_level, row_status")
        .eq("row_status", "active"),
      "loadDailyPlanFacts:bandings",
    ),
    rows<BandingOverrideRow>(
      client
        .from("canonical_teaching_dictionary_banding_overrides")
        .select("canonical_word_id, override_level, override_reason, row_status")
        .eq("row_status", "active"),
      "loadDailyPlanFacts:overrides",
    ),
    rows<BandingVersionRow>(
      client
        .from("canonical_teaching_dictionary_banding_versions")
        .select("banding_version, is_active, level_count")
        .eq("is_active", true),
      "loadDailyPlanFacts:bandingVersion",
    ),
    rows<SkillLevelAllocationRow>(
      client
        .from("canonical_teaching_dictionary_skill_level_allocation")
        .select("micro_skill_key, complexity_level, allocation, banding_version, row_status")
        .eq("row_status", "active"),
      "loadDailyPlanFacts:allocations",
    ),
    rows<ProbeRunRow>(
      client
        .from("adle_probe_runs")
        .select("child_id, micro_skill_key, run_on, row_status")
        .eq("child_id", childId)
        .eq("row_status", "active"),
      "loadDailyPlanFacts:probeRuns",
    ),
    rows<TaughtHistoryRow>(
      client
        .from("adle_taught_word_history")
        .select("child_id, canonical_word_id, event_kind, occurred_on, source_ref, row_status, attempt_text")
        .eq("child_id", childId),
      "loadDailyPlanFacts:taughtHistory",
    ),
    rows<OutcomeEventRow>(
      client
        .from("adle_review_outcome_events")
        .select(
          "child_id, canonical_word_id, bundle_id, event_type, occurred_on, interval_index, schedule_policy_version, attempt_text",
        )
        .eq("child_id", childId),
      "loadDailyPlanFacts:outcomeEvents",
    ),
    rows<AuthenticUseEventRow>(
      client
        .from("adle_authentic_use_events")
        .select("child_id, canonical_word_id, occurred_on, use_kind, parent_verified, piece_ref, source_ref, row_status")
        .eq("child_id", childId)
        .eq("row_status", "active"),
      "loadDailyPlanFacts:authenticUse",
    ),
    rows<SlippageEventRow>(
      client
        .from("adle_slippage_events")
        .select(
          "child_id, canonical_word_id, occurred_on, context_kind, self_corrected, attempt_text, source_ref, slip_ordinal, row_status",
        )
        .eq("child_id", childId)
        .eq("row_status", "active"),
      "loadDailyPlanFacts:slippage",
    ),
    rows<WordStructuralMetadataRow>(
      client
        .from("canonical_teaching_dictionary_word_metadata")
        .select("canonical_word_id, syllables, has_schwa, phoneme_hint, stress_pattern")
        .eq("row_status", "active"),
      "loadDailyPlanFacts:wordMetadata",
    ),
  ]);

  if (bandingVersionRows.length !== 1) {
    throw new Error(
      `loadDailyPlanFacts: expected exactly one active banding version, found ${bandingVersionRows.length}`,
    );
  }

  const bundles = bundleRows.map(bundleFromRow);
  const scheduleWords = scheduleWordRows.map(scheduleWordFromRow);
  const learningItems = learningItemRows.map(learningItemFromRow);
  const words = wordRows.map(dictionaryWordFromRow);
  const supports = supportRows.map(wordSupportFromRow);
  const bandings = bandingRows.map(wordBandingFromRow);
  const overrides = overrideRows.map(bandingOverrideFromRow);
  const activeBandingVersion = bandingVersionFromRow(bandingVersionRows[0]);
  const allocations = allocationRows.map(skillLevelAllocationFromRow);
  const taughtHistory = taughtHistoryRows.map(taughtHistoryFromRow);
  const outcomeEvents = outcomeEventRows.map(outcomeEventFromRow);
  const authenticUseEvents = authenticUseRows.map(authenticUseEventFromRow);
  const slippageEvents = slippageRows.map(slippageEventFromRow);

  const skillFamilyKeyBySkill = new Map(catalogRows.map((row) => [row.micro_skill_key, row.skill_family_key]));
  const teachingContent = new Map(teachingContentRows.map((row) => [row.micro_skill_key, teachingContentFromRow(row)]));
  const activeTeachingSkillKeys = new Set(teachingContent.keys());
  const displayWordByWordId = new Map(wordRows.map((row) => [row.id, row.display_word ?? row.normalised_word]));
  const normalisedWordByWordId = new Map(wordRows.map((row) => [row.id, row.normalised_word]));
  const wordMetadataByWordId = new Map(
    wordMetadataRows.map((row) => [row.canonical_word_id, wordStructuralMetadataFromRow(row)]),
  );
  const frequencyBandByWordId = new Map(words.map((word) => [word.canonicalWordId, word.frequencyBand]));

  // Primary micro-skill per word (Slice 6 pin, see module header).
  const microSkillKeyByWordId = new Map<string, string>();
  const supportSkillByWord = new Map<string, string>();
  for (const support of [...supports].sort((a, b) => (a.microSkillKey < b.microSkillKey ? -1 : 1))) {
    if (
      support.supportRole !== "contrast" &&
      !supportSkillByWord.has(support.canonicalWordId) &&
      (support.reviewStatus === "approved_for_guided_review" ||
        support.reviewStatus === "approved_for_first_exposure")
    ) {
      supportSkillByWord.set(support.canonicalWordId, support.microSkillKey);
    }
  }
  const itemsNewestFirst = [...learningItems].sort((a, b) =>
    a.intakeOn !== b.intakeOn ? (a.intakeOn > b.intakeOn ? -1 : 1) : a.learningItemId < b.learningItemId ? -1 : 1,
  );
  for (const item of itemsNewestFirst) {
    if (!microSkillKeyByWordId.has(item.canonicalWordId)) {
      microSkillKeyByWordId.set(item.canonicalWordId, item.microSkillKey);
    }
  }
  for (const [wordId, skill] of supportSkillByWord) {
    if (!microSkillKeyByWordId.has(wordId)) {
      microSkillKeyByWordId.set(wordId, skill);
    }
  }

  const reviewWordFacts = new Map<string, ReviewWordFact>();
  const microSkillKeysByWordId = new Map<string, readonly string[]>();
  for (const scheduleWord of scheduleWords) {
    const displayWord = displayWordByWordId.get(scheduleWord.canonicalWordId);
    const storedRow = scheduleWordRows.find((row) =>
      row.canonical_word_id === scheduleWord.canonicalWordId && row.bundle_id === scheduleWord.bundleId
    );
    const activeItemsForWord = learningItems.filter((item) =>
      item.canonicalWordId === scheduleWord.canonicalWordId && item.rowStatus === "active" && item.itemStatus !== "resolved"
    );
    const linkedRoutes = (storedRow?.adle_review_schedule_word_routes ?? [])
      .filter((route) => route.row_status === "active")
      .map((route) => ({
        learningItemId: route.learning_item_id,
        microSkillKey: route.micro_skill_key,
        attachmentOrdinal: route.attachment_ordinal,
        attachedOn: route.attached_on,
        requiresSentenceContext: skillFamilyKeyBySkill.get(route.micro_skill_key) === "D4_HOM",
        rowStatus: route.row_status as "active" | "superseded",
      }));
    const routePolicy = resolveSharedWordReviewPolicy({
      learningItems: activeItemsForWord,
      explicitRoutes: linkedRoutes,
    });
    if (displayWord !== undefined && routePolicy !== null) {
      microSkillKeyByWordId.set(scheduleWord.canonicalWordId, routePolicy.activationMicroSkillKey);
      microSkillKeysByWordId.set(scheduleWord.canonicalWordId, routePolicy.microSkillKeys);
      reviewWordFacts.set(scheduleWord.canonicalWordId, {
        canonicalWordId: scheduleWord.canonicalWordId,
        displayWord,
        microSkillKey: routePolicy.activationMicroSkillKey,
        microSkillKeys: routePolicy.microSkillKeys,
        learningItemIds: routePolicy.learningItemIds,
        requiresSentenceContext: routePolicy.requiresSentenceContext,
      });
    }
    // Missing metadata fails closed inside the composer's skip vocabulary.
  }

  // Previous lesson family, from the newest lesson-taught event's source ref
  // (`lesson:{child}:{date}:{skill}`).
  let previousLessonFamilyKey: string | null = null;
  const lessonEvents = taughtHistory
    .filter((event) => event.rowStatus === "active" && event.sourceRef.startsWith("lesson:"))
    .sort((a, b) => (a.occurredOn !== b.occurredOn ? (a.occurredOn > b.occurredOn ? -1 : 1) : 0));
  if (lessonEvents.length > 0) {
    const parts = lessonEvents[0].sourceRef.split(":");
    const skill = parts.slice(3).join(":");
    previousLessonFamilyKey = skillFamilyKeyBySkill.get(skill) ?? null;
  }

  // Today's completed cold-probe misses: active probe-miss items taken in
  // today (their intake landed via the probe completion path).
  const probeMissWordIdsToday = learningItems
    .filter((item) => item.rowStatus === "active" && item.sourceKind === "probe_miss" && item.intakeOn === today)
    .map((item) => item.canonicalWordId)
    .sort();

  // Slice 5 wiring: derive notYetSecureSkillKeys from the evidence read
  // models. Cold start (no evidence, no items) leaves composer behaviour
  // byte-identical (the extension's actionability guard never fires).
  const evidenceWordIds = new Set<string>([
    ...taughtHistory.map((event) => event.canonicalWordId),
    ...outcomeEvents.map((event) => event.canonicalWordId),
    ...authenticUseEvents.map((event) => event.canonicalWordId),
    ...slippageEvents.map((event) => event.canonicalWordId),
  ]);
  const wordStates: WordEvidenceStateResult[] = [];
  for (const wordId of [...evidenceWordIds].sort()) {
    const normalisedWord = normalisedWordByWordId.get(wordId);
    if (normalisedWord === undefined) {
      continue; // no canonical truth -> never priced, never guessed
    }
    const primarySkill = microSkillKeyByWordId.get(wordId) ?? null;
    const pricing = priceWordEvidence(EVIDENCE_POLICY_V1, {
      childId,
      canonicalWordId: wordId,
      normalisedWord,
      skillFamilyKey: primarySkill === null ? null : skillFamilyKeyBySkill.get(primarySkill) ?? null,
      outcomeEvents,
      taughtHistory,
      authenticUseEvents,
      slippageEvents,
    });
    wordStates.push(
      computeWordEvidenceState(EVIDENCE_POLICY_V1, pricing, {
        outcomeEvents,
        taughtHistory,
        slippageEvents,
      }),
    );
  }
  const proficiencyReports = computeAllSkillProficiency(PROFICIENCY_POLICY_V1, {
    childId,
    wordStates,
    words,
    supports,
    bandings,
    overrides,
    activeBandingVersion,
    childBand,
    allocations,
  });
  const notYetSecure = notYetSecureSkillKeys(proficiencyReports);

  const facts: DailyPlanFacts = {
    childId,
    reviewPolicy,
    composerPolicy: COMPOSER_POLICY_V1,
    bundles,
    scheduleWords,
    reviewWordFacts,
    familyMethods: familyMethodRows.map(familyMethodFromRow),
    activityTemplates: activityTemplateRows.map(activityTemplateFromRow),
    wordMetadataByWordId,
    teachingContent,
    skillFamilyKeyBySkill,
    learningItems,
    // No taxonomy prerequisite storage exists yet; the tier is pinned
    // fail-open on empty facts (Slice 6 pin).
    prerequisiteKeysBySkill: new Map(),
    frequencyBandByWordId,
    previousLessonFamilyKey,
    dictionary: {
      words,
      supports,
      bandings,
      overrides,
      activeBandingVersion,
      activeTeachingSkillKeys,
    },
    childBand,
    taughtHistory: taughtWordHistoryProviderFromFacts(
      taughtHistory.map((event) => ({
        childId: event.childId,
        canonicalWordId: event.canonicalWordId,
        eventKind: event.eventKind,
        occurredOn: event.occurredOn,
        sourceRef: event.sourceRef,
        rowStatus: event.rowStatus as SchedulerRowStatus,
      })),
    ),
    probeRuns: probeRunRows.map(probeRunFromRow),
    probeMissWordIdsToday,
    notYetSecureSkillKeys: notYetSecure,
  };

  return {
    facts,
    microSkillKeyByWordId,
    microSkillKeysByWordId,
    displayWordByWordId,
    normalisedWordByWordId,
  };
}
