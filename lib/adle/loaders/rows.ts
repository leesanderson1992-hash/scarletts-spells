/**
 * ADLE Slice 6: pure row -> fact mappers for the loader layer. These are the
 * only place storage column names meet the lib/adle fact shapes, and they are
 * exercised DB-free by the session-wiring regression (fixture rows in,
 * asserted facts out). No client import, no I/O, no dates read from a clock.
 */

import type {
  BandingOverrideFact,
  BandingVersionFact,
  DictionaryReviewStatus,
  DictionaryRowStatus,
  DictionaryWordFact,
  SkillLevelAllocationFact,
  WordBandingFact,
  WordSupportFact,
} from "../dictionary-eligibility";
import type { LearningItemFact, LearningItemSourceKind, LearningItemStatus } from "../learning-items";
import type {
  BundleStatus,
  IsoDate,
  ReviewBundleFact,
  ReviewOutcomeEventType,
  ReviewPolicy,
  ScheduleWordFact,
  SchedulerRowStatus,
  WordMembershipStatus,
} from "../review-scheduler";
import type {
  ActivityTemplateFact,
  FamilyMethodFact,
  TeachingContentFact,
  WordStructuralMetadata,
} from "../daily-assignment-composer";
import type { ProbeRunFact } from "../composer-word-selection";
import type {
  AuthenticUseEventFact,
  AuthenticUseKind,
  OutcomeEventFact,
  TaughtHistoryFact,
} from "../evidence-pricing";
import type { SlipContextKind } from "../evidence-policy";

export interface ReviewPolicyRow {
  schedule_policy_version: string;
  interval_ladder_days: number[];
  catch_up_offsets_days: number[];
  session_cap: number;
  pre_retirement_check_gap_days: number;
}
export function reviewPolicyFromRow(row: ReviewPolicyRow): ReviewPolicy {
  if (row.catch_up_offsets_days.length !== 2) {
    throw new Error("reviewPolicyFromRow: catch_up_offsets_days must have exactly two entries");
  }
  return {
    schedulePolicyVersion: row.schedule_policy_version,
    intervalLadderDays: row.interval_ladder_days,
    catchUpOffsetsDays: [row.catch_up_offsets_days[0], row.catch_up_offsets_days[1]],
    sessionCap: row.session_cap,
    preRetirementCheckGapDays: row.pre_retirement_check_gap_days,
  };
}

export interface ReviewBundleRow {
  id: string;
  child_id: string;
  source_ref: string;
  interval_index: number;
  next_due_on: IsoDate;
  schedule_policy_version: string;
  bundle_status: string;
  row_status: string;
}

export function bundleFromRow(row: ReviewBundleRow): ReviewBundleFact {
  return {
    bundleId: row.id,
    childId: row.child_id,
    sourceRef: row.source_ref,
    intervalIndex: row.interval_index,
    nextDueOn: row.next_due_on,
    schedulePolicyVersion: row.schedule_policy_version,
    bundleStatus: row.bundle_status as BundleStatus,
    rowStatus: row.row_status as SchedulerRowStatus,
  };
}

export interface ScheduleWordRow {
  id?: string;
  child_id: string;
  canonical_word_id: string;
  bundle_id: string;
  membership_status: string;
  catch_up_stage: number;
  next_retest_due_on: IsoDate | null;
  failed_review_on: IsoDate | null;
  pre_retirement_check_due_on: IsoDate | null;
  last_28_day_review_on: IsoDate | null;
  reteach_cycle_count: number;
  taught_on: IsoDate;
  row_status: string;
  adle_review_schedule_word_routes?: Array<{
    learning_item_id: string;
    micro_skill_key: string;
    attachment_ordinal: number;
    attached_on: IsoDate;
    row_status: string;
  }>;
}

export function scheduleWordFromRow(row: ScheduleWordRow): ScheduleWordFact {
  return {
    childId: row.child_id,
    canonicalWordId: row.canonical_word_id,
    bundleId: row.bundle_id,
    membershipStatus: row.membership_status as WordMembershipStatus,
    catchUpStage: row.catch_up_stage as 0 | 1 | 2,
    nextRetestDueOn: row.next_retest_due_on,
    failedReviewOn: row.failed_review_on,
    preRetirementCheckDueOn: row.pre_retirement_check_due_on,
    last28DayReviewOn: row.last_28_day_review_on,
    reteachCycleCount: row.reteach_cycle_count,
    taughtOn: row.taught_on,
    rowStatus: row.row_status as SchedulerRowStatus,
  };
}

export interface LearningItemRow {
  id: string;
  child_id: string;
  canonical_word_id: string;
  micro_skill_key: string;
  item_status: string;
  source_kind: string;
  source_ref: string;
  source_attempt_text: string | null;
  reteach_priority: boolean;
  ejected_on: IsoDate | null;
  intake_on: IsoDate;
  row_status: string;
}

export function learningItemFromRow(row: LearningItemRow): LearningItemFact {
  return {
    learningItemId: row.id,
    childId: row.child_id,
    canonicalWordId: row.canonical_word_id,
    microSkillKey: row.micro_skill_key,
    itemStatus: row.item_status as LearningItemStatus,
    sourceKind: row.source_kind as LearningItemSourceKind,
    sourceRef: row.source_ref,
    sourceAttemptText: row.source_attempt_text,
    reteachPriority: row.reteach_priority,
    ejectedOn: row.ejected_on,
    intakeOn: row.intake_on,
    rowStatus: row.row_status as SchedulerRowStatus,
  };
}

export interface FamilyMethodRow {
  family_key: string;
  family_name: string;
  guided_question_sequence: string[];
  review_sort_dimension: string;
  production_task: string;
  row_status: string;
}

export function familyMethodFromRow(row: FamilyMethodRow): FamilyMethodFact {
  return {
    familyKey: row.family_key,
    familyName: row.family_name,
    guidedQuestionSequence: row.guided_question_sequence,
    reviewSortDimension: row.review_sort_dimension,
    productionTask: row.production_task,
    rowStatus: row.row_status as SchedulerRowStatus,
  };
}

export interface ActivityTemplateRow {
  template_key: string;
  phase: string;
  min_words_required: number;
  requires_sentence_context: boolean;
  requires_contrast_words: boolean;
  evidence_kind: string;
  child_facing_copy: string;
  purpose: string | null;
  child_response: string | null;
  row_status: string;
}

export function activityTemplateFromRow(row: ActivityTemplateRow): ActivityTemplateFact {
  return {
    templateKey: row.template_key,
    phase: row.phase,
    minWordsRequired: row.min_words_required,
    requiresSentenceContext: row.requires_sentence_context,
    requiresContrastWords: row.requires_contrast_words,
    evidenceKind: row.evidence_kind,
    childFacingCopy: row.child_facing_copy,
    // Slice 7a: purpose + child_response back the Tier-C warm prompt copy the
    // activity registry derives client-side. Coalesced so a null never leaks a
    // non-string into the payload.
    purpose: row.purpose ?? "",
    childResponse: row.child_response ?? "",
    rowStatus: row.row_status as SchedulerRowStatus,
  };
}

/**
 * Slice 7a: structural word metadata (from
 * canonical_teaching_dictionary_word_metadata), surfaced only for the fields
 * that back a real interaction — the syllable *count* (`syllables` is a count
 * string, not a segmentation) and `has_schwa` drive the two derivable quick-sort
 * schemes; `phoneme_hint`/`stress_pattern` ride along for warm display only.
 */
export interface WordStructuralMetadataRow {
  canonical_word_id: string;
  syllables: string | null;
  has_schwa: boolean | null;
  phoneme_hint: string | null;
  stress_pattern: string | null;
}

export function wordStructuralMetadataFromRow(row: WordStructuralMetadataRow): WordStructuralMetadata {
  return {
    canonicalWordId: row.canonical_word_id,
    syllables: row.syllables,
    hasSchwa: row.has_schwa,
    phonemeHint: row.phoneme_hint,
    stressPattern: row.stress_pattern,
  };
}

export interface TeachingContentRow {
  micro_skill_key: string;
  teaching_objective: string | null;
  child_friendly_explanation: string | null;
  rule_explanation: string | null;
  common_misconceptions: string | null;
}

export function teachingContentFromRow(row: TeachingContentRow): TeachingContentFact {
  return {
    microSkillKey: row.micro_skill_key,
    teachingObjective: row.teaching_objective ?? "",
    childFriendlyExplanation: row.child_friendly_explanation ?? "",
    ruleExplanation: row.rule_explanation ?? "",
    commonMisconceptions: row.common_misconceptions ?? "",
  };
}

export interface DictionaryWordRow {
  id: string;
  word_key: string;
  normalised_word: string;
  display_word: string | null;
  row_status: string;
  review_status: string;
  frequency_band: string | null;
  age_band: string | null;
}

export function dictionaryWordFromRow(row: DictionaryWordRow): DictionaryWordFact {
  return {
    canonicalWordId: row.id,
    wordKey: row.word_key,
    normalisedWord: row.normalised_word,
    // True child-facing spelling; coalesce so a null never leaves the identity
    // word blank in the UI.
    displayWord: row.display_word ?? row.normalised_word,
    rowStatus: row.row_status as DictionaryRowStatus,
    reviewStatus: row.review_status as DictionaryReviewStatus,
    frequencyBand: row.frequency_band,
    ageBand: row.age_band,
  };
}

export interface WordSupportRow {
  canonical_word_id: string;
  micro_skill_key: string;
  support_role: string;
  row_status: string;
  review_status: string;
}

export function wordSupportFromRow(row: WordSupportRow): WordSupportFact {
  return {
    canonicalWordId: row.canonical_word_id,
    microSkillKey: row.micro_skill_key,
    supportRole: row.support_role as WordSupportFact["supportRole"],
    rowStatus: row.row_status as DictionaryRowStatus,
    reviewStatus: row.review_status as DictionaryReviewStatus,
  };
}

export interface WordBandingRow {
  canonical_word_id: string;
  banding_version: string;
  structural_score: number;
  complexity_level: number;
  row_status: string;
}

export function wordBandingFromRow(row: WordBandingRow): WordBandingFact {
  return {
    canonicalWordId: row.canonical_word_id,
    bandingVersion: row.banding_version,
    structuralScore: Number(row.structural_score),
    complexityLevel: row.complexity_level,
    rowStatus: row.row_status as DictionaryRowStatus,
  };
}

export interface BandingOverrideRow {
  canonical_word_id: string;
  override_level: number;
  override_reason: string;
  row_status: string;
}

export function bandingOverrideFromRow(row: BandingOverrideRow): BandingOverrideFact {
  return {
    canonicalWordId: row.canonical_word_id,
    overrideLevel: row.override_level,
    overrideReason: row.override_reason,
    rowStatus: row.row_status as DictionaryRowStatus,
  };
}

export interface BandingVersionRow {
  banding_version: string;
  is_active: boolean;
  level_count: number;
}

export function bandingVersionFromRow(row: BandingVersionRow): BandingVersionFact {
  return {
    bandingVersion: row.banding_version,
    isActive: row.is_active,
    levelCount: row.level_count,
  };
}

export interface SkillLevelAllocationRow {
  micro_skill_key: string;
  complexity_level: number;
  allocation: number;
  banding_version: string;
  row_status: string;
}

export function skillLevelAllocationFromRow(row: SkillLevelAllocationRow): SkillLevelAllocationFact {
  return {
    microSkillKey: row.micro_skill_key,
    complexityLevel: row.complexity_level,
    allocation: row.allocation,
    bandingVersion: row.banding_version,
    rowStatus: row.row_status as DictionaryRowStatus,
  };
}

export interface ProbeRunRow {
  child_id: string;
  micro_skill_key: string;
  run_on: IsoDate;
  row_status: string;
}

export function probeRunFromRow(row: ProbeRunRow): ProbeRunFact {
  return {
    childId: row.child_id,
    microSkillKey: row.micro_skill_key,
    runOn: row.run_on,
    rowStatus: row.row_status as SchedulerRowStatus,
  };
}

export interface TaughtHistoryRow {
  child_id: string;
  canonical_word_id: string;
  event_kind: string;
  occurred_on: IsoDate;
  source_ref: string;
  row_status: string;
  attempt_text: string | null;
}

export function taughtHistoryFromRow(row: TaughtHistoryRow): TaughtHistoryFact {
  return {
    childId: row.child_id,
    canonicalWordId: row.canonical_word_id,
    eventKind: row.event_kind as "taught" | "probed",
    occurredOn: row.occurred_on,
    sourceRef: row.source_ref,
    rowStatus: row.row_status,
    attemptText: row.attempt_text,
  };
}

export interface OutcomeEventRow {
  child_id: string;
  canonical_word_id: string;
  bundle_id: string | null;
  event_type: string;
  occurred_on: IsoDate;
  interval_index: number | null;
  schedule_policy_version: string;
  attempt_text: string | null;
}

export function outcomeEventFromRow(row: OutcomeEventRow): OutcomeEventFact {
  return {
    childId: row.child_id,
    canonicalWordId: row.canonical_word_id,
    bundleId: row.bundle_id,
    eventType: row.event_type as ReviewOutcomeEventType,
    occurredOn: row.occurred_on,
    intervalIndex: row.interval_index,
    schedulePolicyVersion: row.schedule_policy_version,
    attemptText: row.attempt_text,
  };
}

export interface AuthenticUseEventRow {
  child_id: string;
  canonical_word_id: string;
  occurred_on: IsoDate;
  use_kind: string;
  parent_verified: boolean;
  piece_ref: string;
  source_ref: string;
  row_status: string;
}

export function authenticUseEventFromRow(row: AuthenticUseEventRow): AuthenticUseEventFact {
  return {
    childId: row.child_id,
    canonicalWordId: row.canonical_word_id,
    occurredOn: row.occurred_on,
    useKind: row.use_kind as AuthenticUseKind,
    parentVerified: row.parent_verified,
    pieceRef: row.piece_ref,
    sourceRef: row.source_ref,
    rowStatus: row.row_status,
  };
}

export interface SlippageEventRow {
  child_id: string;
  canonical_word_id: string;
  occurred_on: IsoDate;
  context_kind: string;
  self_corrected: boolean;
  attempt_text: string | null;
  source_ref: string;
  slip_ordinal: number;
  row_status: string;
}

export function slippageEventFromRow(row: SlippageEventRow) {
  return {
    childId: row.child_id,
    canonicalWordId: row.canonical_word_id,
    occurredOn: row.occurred_on,
    contextKind: row.context_kind as SlipContextKind,
    selfCorrected: row.self_corrected,
    attemptText: row.attempt_text,
    sourceRef: row.source_ref,
    slipOrdinal: row.slip_ordinal,
    rowStatus: row.row_status,
  };
}
