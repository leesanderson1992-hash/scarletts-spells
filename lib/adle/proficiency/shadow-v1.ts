/** Approved ADLE_PROFICIENCY_MODEL_V1, kept separate from released Slice 5. */
import type { LearnerSkillEvidenceProjection } from "./evidence/contracts";

export const SHADOW_MODEL_VERSION = "ADLE_PROFICIENCY_MODEL_V1";
export const SHADOW_REQUIREMENTS_VERSION = "ADLE_PROFICIENCY_REQUIREMENTS_V1_2026_09_08";
export const SHADOW_ELIGIBILITY_VERSION = "CHILD_REQUIREMENT_ELIGIBILITY_V1_2026_09_08";
export const SHADOW_COMPLEXITY_VERSION = "SKILL_RELATIVE_COMPLEXITY_V1_GLOBAL_RANK";
export const SHADOW_PROGRESS_VERSION = "ADLE_PROFICIENCY_PROGRESS_V1_EQUAL_ACTIVE_GATES";

export type RelativeBand = "FOUNDATION" | "EXTENDED" | "CHALLENGE";
export type ShadowProfile = "PRODUCTIVE_PATTERN_DEFAULT" | "CONTEXT_DEPENDENT_CLOSED_SET_V1";
export type ShadowStatus = "calculated" | "eligibility_unresolved" | "requirement_profile_unresolved" | "evidence_unresolved";

export interface ShadowWord {
  id: string;
  active: boolean;
  reviewEligible: boolean;
  frequencyBand: string | null;
  ageBand: string | null;
  complexityLevel: number | null;
  structuralScore: number | null;
  /** null means authority unavailable; [] means governed absence. */
  groupIds: readonly string[] | null;
}

export interface ShadowRelationship {
  wordId: string;
  skillKey: string;
  authorityFingerprint: string;
}

export interface ShadowSkill {
  key: string;
  label: string;
  profile: ShadowProfile | null;
  /** Explicitly approved absence allows zero group minimum for productive skills. */
  groupsUnavailableApproved?: boolean;
}

export interface ShadowInput {
  learnerId: string;
  dateOfBirth: string | null;
  asOf: string;
  words: readonly ShadowWord[];
  relationships: readonly ShadowRelationship[];
  skills: readonly ShadowSkill[];
  projections: readonly LearnerSkillEvidenceProjection[];
  /** A complete, qualified source/recovery adapter is required for level certification. */
  evidenceAuthorityComplete: boolean;
  recurrenceAuthorityComplete: boolean;
  resolvedNegativeEventIds: readonly string[];
}

export interface ShadowGate {
  name: string;
  observed: number;
  required: number;
  passed: boolean;
}

export interface ShadowLevel {
  level: number;
  certifiable: boolean;
  passed: boolean;
  gates: ShadowGate[];
  requiredBands: RelativeBand[];
  missingBands: RelativeBand[];
  blockedReasons: string[];
}

export interface ShadowSkillResult {
  skillKey: string;
  label: string;
  profile: ShadowProfile | null;
  status: ShadowStatus;
  achievedLevel: number | null;
  nextLevelProgress: number | null;
  requiredPoolSize: number;
  observedWordCount: number;
  outsidePoolObservedWordCount: number;
  eligibleWordIds: string[];
  outsidePoolObservedWordIds: string[];
  levels: ShadowLevel[];
  blockers: string[];
  sourceEventIds: string[];
  versions: {
    model: string; requirements: string; eligibility: string;
    complexity: string; progress: string;
  };
}

const AGE_BANDS = ["early_primary", "middle_primary", "upper_primary", "lower_secondary", "mid_secondary", "later_review"] as const;
const PRODUCTIVE = [
  { floor: 2, ratio: .10, cap: 3, groups: 1, independent: 0, contextual: 0, authentic: 0, challenge: 0, days: 1, elapsed: 0, lookback: 0, unresolved: 0 },
  { floor: 4, ratio: .20, cap: 6, groups: 1, independent: 2, contextual: 0, authentic: 0, challenge: 0, days: 2, elapsed: 3, lookback: 28, unresolved: 2 },
  { floor: 8, ratio: .35, cap: 12, groups: 2, independent: 3, contextual: 1, authentic: 0, challenge: 0, days: 2, elapsed: 7, lookback: 28, unresolved: 1 },
  { floor: 12, ratio: .50, cap: 18, groups: 3, independent: 4, contextual: 3, authentic: 1, challenge: 1, days: 3, elapsed: 21, lookback: 28, unresolved: 0 },
  { floor: 20, ratio: .70, cap: 30, groups: 4, independent: 7, contextual: 5, authentic: 3, challenge: 2, days: 4, elapsed: 56, lookback: 56, unresolved: 0 },
] as const;

export function validCalculationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function ageOn(dob: string | null, asOf: string): number | null {
  if (!dob || !validCalculationDate(dob) || !validCalculationDate(asOf)) return null;
  const birth = new Date(`${dob}T00:00:00Z`);
  const date = new Date(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(date.getTime()) || birth > date) return null;
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  if (date.getUTCMonth() < birth.getUTCMonth() ||
    (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 1 && age <= 18 ? age : null;
}

export function requiredAgeBands(dateOfBirth: string | null, asOf: string): readonly string[] | null {
  const age = ageOn(dateOfBirth, asOf);
  if (age === null) return null;
  const last = age <= 7 ? 0 : age <= 9 ? 1 : age <= 11 ? 2 : age <= 13 ? 3 : age <= 15 ? 4 : 5;
  return AGE_BANDS.slice(0, last + 1);
}

function bandFor(word: ShadowWord, pool: readonly ShadowWord[]): RelativeBand | null {
  if (word.complexityLevel === null || word.structuralScore === null || pool.length === 0) return null;
  const less = pool.filter((other) => other.complexityLevel !== null && other.structuralScore !== null &&
    (other.complexityLevel < word.complexityLevel! ||
      (other.complexityLevel === word.complexityLevel && other.structuralScore < word.structuralScore!))).length;
  const rank = pool.length <= 1 ? 0 : Math.min(1, less / (pool.length - 1));
  return rank < 1 / 3 ? "FOUNDATION" : rank < 2 / 3 ? "EXTENDED" : "CHALLENGE";
}

function gate(name: string, observed: number, required: number): ShadowGate {
  return { name, observed, required, passed: observed >= required };
}
function maximumGate(name: string, observed: number, maximum: number): ShadowGate {
  return { name, observed, required: maximum, passed: observed <= maximum };
}
function fraction(observed: number, required: number) { return required === 0 ? 1 : Math.min(1, observed / required); }
function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

export function calculateShadowProficiency(input: ShadowInput): ShadowSkillResult[] {
  const allowedBands = requiredAgeBands(input.dateOfBirth, input.asOf);
  const wordById = new Map(input.words.map((word) => [word.id, word]));
  const results: ShadowSkillResult[] = [];
  for (const skill of input.skills) {
    const relation = input.relationships.filter((row) => row.skillKey === skill.key);
    const relationIds = new Set(relation.map((row) => row.wordId));
    const relevant = input.projections.filter((row) => row.learnerId === input.learnerId && row.microSkillKey === skill.key && row.occurredAt.slice(0, 10) <= input.asOf &&
      (row.polarity === "negative" || relationIds.has(row.canonicalWordId)));
    const positive = relevant.filter((row) => row.polarity === "positive");
    const negatives = relevant.filter((row) => row.polarity === "negative");
    const observedIds = new Set(positive.map((row) => row.canonicalWordId));
    const pool = relation.map((row) => wordById.get(row.wordId)).filter((row): row is ShadowWord => !!row && row.active && row.reviewEligible && !!allowedBands?.includes(row.ageBand ?? "") && ["high", "medium"].includes(row.frequencyBand ?? ""));
    const poolIds = new Set(pool.map((word) => word.id));
    const outside = [...observedIds].filter((id) => !poolIds.has(id)).sort();
    const blockers: string[] = [];
    if (!allowedBands) blockers.push("date_of_birth_or_age_unresolved");
    if (relation.length === 0) blockers.push("relationship_authority_unresolved");
    for (const row of relation) {
      const word = wordById.get(row.wordId);
      if (!word || !word.active || !word.reviewEligible || !word.ageBand || !word.frequencyBand) blockers.push(`word_authority_unresolved:${row.wordId}`);
    }
    if (!input.evidenceAuthorityComplete) blockers.push("qualified_evidence_authority_incomplete");
    if (!input.recurrenceAuthorityComplete) blockers.push("recurrence_authority_incomplete");
    if (!skill.profile) blockers.push("requirement_profile_unresolved");
    if (skill.profile === "CONTEXT_DEPENDENT_CLOSED_SET_V1" && pool.length === 0) blockers.push("closed_set_pool_empty");
    const bands = new Map<string, RelativeBand>();
    for (const id of relationIds) {
      const word = wordById.get(id);
      if (!word) continue;
      const band = bandFor(word, pool);
      if (band) bands.set(id, band);
    }
    if (pool.some((word) => !bands.has(word.id))) blockers.push("complexity_authority_unresolved");
    const populated = new Set([...poolIds].map((id) => bands.get(id)).filter((band): band is RelativeBand => !!band));
    const governedGroups = new Set(pool.flatMap((word) => word.groupIds ?? []));
    if (pool.some((word) => word.groupIds === null) && !skill.groupsUnavailableApproved) blockers.push("group_authority_unresolved");
    if (skill.profile === "CONTEXT_DEPENDENT_CLOSED_SET_V1" && governedGroups.size === 0) blockers.push("context_role_groups_unresolved");
    const observedBands = new Set([...observedIds].map((id) => bands.get(id)).filter((band): band is RelativeBand => !!band));
    const observedGroups = new Set([...observedIds].flatMap((id) => wordById.get(id)?.groupIds ?? []));
    const independent = new Set(positive.filter((row) => row.environment !== "CONTROLLED_LESSON").map((row) => row.canonicalWordId));
    const contextual = new Set(positive.filter((row) => row.environment === "CONTEXTUAL_TRANSFER").map((row) => row.canonicalWordId));
    const authentic = new Set(positive.filter((row) => row.environment === "AUTHENTIC_WRITING").map((row) => row.canonicalWordId));
    const challenge = new Set(positive.filter((row) => row.environment !== "CONTROLLED_LESSON" && bands.get(row.canonicalWordId) === "CHALLENGE" && ["CONTEXTUAL_TRANSFER", "AUTHENTIC_WRITING"].includes(row.environment)).map((row) => row.canonicalWordId));
    const days = [...new Set(positive.map((row) => row.occurredAt.slice(0, 10)))].sort();
    const elapsed = days.length < 2 ? 0 : Math.round((Date.parse(`${days.at(-1)}T00:00:00Z`) - Date.parse(`${days[0]}T00:00:00Z`)) / 86400000);
    const levels: ShadowLevel[] = [];
    for (let index = 0; index < 5; index += 1) {
      const row = PRODUCTIVE[index];
      const level = index + 1;
      const closed = skill.profile === "CONTEXT_DEPENDENT_CLOSED_SET_V1";
      const breadth = closed ? level === 1 ? 1 : level <= 3 ? Math.min(2, pool.length) : pool.length : Math.max(row.floor, Math.min(row.cap, Math.ceil(row.ratio * pool.length)));
      const groupMin = skill.groupsUnavailableApproved && !closed ? 0 : closed ? Math.min(row.groups, governedGroups.size) : row.groups;
      const independentMin = closed ? level === 1 ? 0 : level === 2 ? 1 : level === 3 ? Math.min(2, pool.length) : pool.length : row.independent;
      const contextualMin = closed ? level === 1 ? 0 : level === 2 ? 1 : level === 3 || level === 4 ? Math.min(2, pool.length) : pool.length : row.contextual;
      const authenticMin = closed ? level < 4 ? 0 : level === 4 ? 1 : pool.length : row.authentic;
      const challengeMin = closed ? level < 4 ? 0 : Math.min(level === 4 ? 1 : 2, [...poolIds].filter((id) => bands.get(id) === "CHALLENGE").length) : row.challenge;
      const requiredBands: RelativeBand[] = level === 1 ? [] : level === 2 ? ["FOUNDATION"] : level === 3 ? (["FOUNDATION", "EXTENDED"] as RelativeBand[]).filter((band) => !closed || populated.has(band)) : (["FOUNDATION", "EXTENDED", "CHALLENGE"] as RelativeBand[]).filter((band) => !closed || populated.has(band));
      const missingBands = requiredBands.filter((band) => !observedBands.has(band));
      const resolvedNegatives = new Set(input.resolvedNegativeEventIds);
      const recentNegatives = row.lookback === 0 ? [] : negatives.filter((entry) => !resolvedNegatives.has(entry.eventId) &&
        (Date.parse(`${input.asOf}T00:00:00Z`) - Date.parse(entry.occurredAt)) / 86400000 <= row.lookback);
      const gates = [gate("breadth", observedIds.size, breadth), gate("groups", observedGroups.size, groupMin),
        gate("independent", independent.size, independentMin), gate("contextual", contextual.size, contextualMin),
        gate("authentic", authentic.size, authenticMin), gate("challenge_transfer", challenge.size, challengeMin),
        gate("positive_days", days.length, row.days), gate("elapsed_days", elapsed, row.elapsed)];
      if (row.lookback) gates.push(maximumGate("unresolved_causal_errors", recentNegatives.length, row.unresolved));
      const blockedReasons = [...(skill.profile === "PRODUCTIVE_PATTERN_DEFAULT" && pool.length < row.floor ? ["allocation_limited"] : []),
        ...(requiredBands.some((band) => !populated.has(band)) ? ["allocation_limited:required_band_missing"] : []),
        ...(level === 1 && observedBands.size === 0 ? ["observed_band_missing"] : []),
        ...missingBands.map((band) => `band_not_demonstrated:${band}`)];
      levels.push({ level, certifiable: blockers.length === 0 && !blockedReasons.some((reason) => reason.startsWith("allocation_limited")),
        passed: false, gates, requiredBands, missingBands, blockedReasons });
    }
    let achievedLevel: number | null = null;
    if (blockers.length === 0) {
      for (const level of levels) {
        level.passed = level.certifiable && level.blockedReasons.length === 0 && level.gates.every((entry) => entry.passed) && (level.level === 1 || achievedLevel === level.level - 1);
        if (level.passed) achievedLevel = level.level;
      }
    }
    const next = levels[achievedLevel ?? 0] ?? null;
    let nextLevelProgress: number | null = null;
    if (blockers.length === 0 && next?.certifiable) {
      const dimensions = [fraction(next.gates[0].observed, next.gates[0].required)];
      const diversity = [
        ...(next.gates[1].required > 0 ? [fraction(next.gates[1].observed, next.gates[1].required)] : []),
        ...(next.requiredBands.length ? [(next.requiredBands.length - next.missingBands.length) / next.requiredBands.length] : []),
      ];
      if (diversity.length) dimensions.push(average(diversity));
      const transfer = next.gates.slice(2, 6).filter((entry) => entry.required > 0).map((entry) => fraction(entry.observed, entry.required));
      if (transfer.length) dimensions.push(average(transfer));
      const stability = next.gates.slice(6).filter((entry) => entry.required > 0 || entry.name === "unresolved_causal_errors")
        .map((entry) => entry.name === "unresolved_causal_errors" ? Number(entry.passed) : fraction(entry.observed, entry.required));
      if (stability.length) dimensions.push(average(stability));
      nextLevelProgress = Math.round(100 * average(dimensions));
    }
    const status: ShadowStatus = blockers.some((reason) => reason.startsWith("date_of_birth") || reason.startsWith("word_authority")) ? "eligibility_unresolved" :
      blockers.some((reason) => reason.includes("profile") || reason.includes("group") || reason.includes("complexity") || reason.includes("relationship") || reason.includes("closed_set")) ? "requirement_profile_unresolved" :
      blockers.length ? "evidence_unresolved" : "calculated";
    results.push({ skillKey: skill.key, label: skill.label, profile: skill.profile, status, achievedLevel, nextLevelProgress,
      requiredPoolSize: pool.length, observedWordCount: observedIds.size, outsidePoolObservedWordCount: outside.length,
      eligibleWordIds: [...poolIds].sort(), outsidePoolObservedWordIds: outside, levels, blockers: [...new Set(blockers)].sort(),
      sourceEventIds: [...new Set(relevant.map((row) => row.eventId))].sort(),
      versions: { model: SHADOW_MODEL_VERSION, requirements: SHADOW_REQUIREMENTS_VERSION, eligibility: SHADOW_ELIGIBILITY_VERSION, complexity: SHADOW_COMPLEXITY_VERSION, progress: SHADOW_PROGRESS_VERSION } });
  }
  return results.sort((a, b) => a.label.localeCompare(b.label) || a.skillKey.localeCompare(b.skillKey));
}
