/**
 * ADLE Slice 5 (5B/5C): micro-skill proficiency — a pure, fact-fed projection
 * over the Slice 4 word evidence states. Breadth credit (state-based, capped
 * 1.0 per word per skill, status-5 gate, contrast exclusion, override-aware
 * levels) -> allocation-derived level targets -> gated-never-averaged level
 * security -> the blueprint reporting shape. No storage, no repricing, no
 * state re-derivation: Slice 4's states are consumed unchanged.
 *
 * Policy sources: adle-daily-assignment-and-evidence-blueprint-contract.md
 * (§"Micro-skill proficiency"; §"Dictionary eligibility ladder" status 5) and
 * the approved banding proposal §2 (floor 8; contrast exclusion; recomputable
 * allocation table). Owner-approved pins (Slice 5 plan, 2026-07-05):
 * - state-based crediting (credit states, not the slipped flag)
 * - the allocation table is the shared denominator (fail-conservative vs the
 *   per-child creditable pool; revisit at Slice 8 bulk population)
 * - levels gate bottom-up from a skill's FIRST POPULATED level; unpopulated
 *   lower levels neither block nor count, and re-gate automatically when a
 *   later import batch populates them
 */

import {
  allocationsForSkill,
  effectiveComplexityLevel,
  isMasteryBreadthEligible,
  type BandingOverrideFact,
  type BandingVersionFact,
  type ChildBandProfile,
  type DictionaryWordFact,
  type SkillLevelAllocationFact,
  type WordBandingFact,
  type WordSupportFact,
} from "./dictionary-eligibility";
import {
  isLimitedAllocation,
  levelTarget,
  stateCredit,
  type LevelBadge,
  type ProficiencyPolicy,
} from "./proficiency-policy";
import type { WordEvidenceState, WordEvidenceStateResult } from "./word-evidence-state";

export interface ProficiencyInputs {
  childId: string;
  /** Slice 4 word evidence states for this child (consumed unchanged). */
  wordStates: readonly WordEvidenceStateResult[];
  words: readonly DictionaryWordFact[];
  supports: readonly WordSupportFact[];
  bandings: readonly WordBandingFact[];
  overrides: readonly BandingOverrideFact[];
  activeBandingVersion: BandingVersionFact;
  childBand: ChildBandProfile;
  allocations: readonly SkillLevelAllocationFact[];
}

export interface CreditedWord {
  canonicalWordId: string;
  state: WordEvidenceState;
  credit: number;
  levelSource: "override" | "computed";
}

export interface LevelProficiency {
  level: number;
  populated: boolean;
  allocation: number;
  /** target(L); null when the level is unpopulated (allocation 0). */
  target: number | null;
  creditSum: number;
  creditedWords: CreditedWord[];
  /** creditSum / target, capped at 1.0 for reporting; null when unpopulated. */
  progress: number | null;
  /** Uncapped creditSum / target, for the audit trail. */
  rawProgress: number | null;
  secured: boolean;
  limitedAllocation: boolean;
  badge: LevelBadge;
}

export type EvidenceGap =
  | { kind: "no_allocation"; level: number }
  | { kind: "allocation_under_floor"; level: number; allocation: number }
  | { kind: "developing_words"; level: number; unseen: number; active: number; produced: number };

export interface SkillProficiencyReport {
  childId: string;
  microSkillKey: string;
  highestSecureLevel: number | null;
  firstPopulatedLevel: number | null;
  /** Lowest non-secure populated level — the level the child is building. */
  developingLevel: number | null;
  levels: LevelProficiency[];
  /** Populated levels above the developing level that carry evidence while
   * gated — each reports `developing (early)`, never averaged, never secure. */
  gatedLevels: LevelProficiency[];
  evidenceGaps: EvidenceGap[];
  /** Any populated cell under floor 8 (proposal §2 item 4). */
  allocationLimited: boolean;
  proficiencyPolicyVersion: string;
  bandingVersion: string;
  explanation: string[];
}

function overrideApplies(
  override: BandingOverrideFact | undefined,
  activeBandingVersion: BandingVersionFact,
): boolean {
  return (
    override !== undefined &&
    override.rowStatus === "active" &&
    Number.isInteger(override.overrideLevel) &&
    override.overrideLevel >= 1 &&
    override.overrideLevel <= activeBandingVersion.levelCount
  );
}

/** Compute the proficiency report for one micro-skill. */
export function computeSkillProficiency(
  policy: ProficiencyPolicy,
  inputs: ProficiencyInputs,
  microSkillKey: string,
): SkillProficiencyReport {
  const explanation: string[] = [];
  const { activeBandingVersion, childBand } = inputs;

  const wordById = new Map(inputs.words.map((word) => [word.canonicalWordId, word]));
  const bandingById = new Map(
    inputs.bandings
      .filter((row) => row.rowStatus === "active" && row.bandingVersion === activeBandingVersion.bandingVersion)
      .map((row) => [row.canonicalWordId, row]),
  );
  const overrideById = new Map(
    inputs.overrides.filter((row) => row.rowStatus === "active").map((row) => [row.canonicalWordId, row]),
  );
  const stateById = new Map(
    inputs.wordStates
      .filter((row) => row.childId === inputs.childId)
      .map((row) => [row.canonicalWordId, row.state]),
  );

  // --- 5B: breadth credit --------------------------------------------------
  // Qualifying links: active, approved review status, non-contrast role,
  // mapped to this skill. One credit per (word, skill) — the 1.0-per-word cap
  // applied structurally by deduping on the word id.
  const creditRoles = new Set(policy.creditRoles);
  const qualifyingWordIds = new Set<string>();
  for (const support of inputs.supports) {
    if (
      support.microSkillKey !== microSkillKey ||
      support.rowStatus !== "active" ||
      !creditRoles.has(support.supportRole)
    ) {
      continue;
    }
    // Approved support mapping is required for evidence eligibility; the
    // status-5 gate below re-checks it, so accept the link here and let the
    // per-word eligibility decide.
    qualifyingWordIds.add(support.canonicalWordId);
  }

  // Bucket credited words by effective level.
  const byLevel = new Map<number, CreditedWord[]>();
  let excludedOutOfBand = 0;
  let excludedUnbanded = 0;
  for (const wordId of qualifyingWordIds) {
    const word = wordById.get(wordId);
    if (word === undefined) {
      continue;
    }
    // Status-5 gate: mastery-breadth-eligible (evidence-eligible + in band).
    if (!isMasteryBreadthEligible(word, inputs.supports, childBand)) {
      excludedOutOfBand += 1;
      continue;
    }
    const banding = bandingById.get(wordId) ?? null;
    const override = overrideById.get(wordId) ?? null;
    const level = effectiveComplexityLevel(banding, override, activeBandingVersion);
    if (level === null) {
      excludedUnbanded += 1;
      continue;
    }
    const state = stateById.get(wordId) ?? "unseen";
    const credited: CreditedWord = {
      canonicalWordId: wordId,
      state,
      credit: stateCredit(policy, state),
      levelSource: overrideApplies(overrideById.get(wordId), activeBandingVersion) ? "override" : "computed",
    };
    const bucket = byLevel.get(level);
    if (bucket === undefined) {
      byLevel.set(level, [credited]);
    } else {
      bucket.push(credited);
    }
  }

  // --- 5C: targets, gating, reporting --------------------------------------
  const allocationByLevel = allocationsForSkill(inputs.allocations, activeBandingVersion, microSkillKey);
  const levelCount = activeBandingVersion.levelCount;

  // First pass: per-level detail without gating (secured filled in below).
  const levels: LevelProficiency[] = [];
  for (let level = 1; level <= levelCount; level += 1) {
    const allocation = allocationByLevel.get(level) ?? 0;
    const target = levelTarget(policy, allocation);
    const words = (byLevel.get(level) ?? []).sort((a, b) =>
      a.canonicalWordId < b.canonicalWordId ? -1 : a.canonicalWordId > b.canonicalWordId ? 1 : 0,
    );
    const creditSum = words.reduce((sum, word) => sum + word.credit, 0);
    const populated = allocation > 0;
    const rawProgress = target !== null ? creditSum / target : null;
    const progress = rawProgress !== null ? Math.min(1, rawProgress) : null;
    levels.push({
      level,
      populated,
      allocation,
      target,
      creditSum,
      creditedWords: words,
      progress,
      rawProgress,
      secured: false,
      limitedAllocation: isLimitedAllocation(policy, allocation),
      badge: "not started",
    });
  }

  // Gating: bottom-up from the first populated level. A populated level is
  // secure when its progress >= 1.0 and every populated lower level is secure.
  const populatedLevels = levels.filter((entry) => entry.populated);
  const firstPopulatedLevel = populatedLevels.length > 0 ? populatedLevels[0].level : null;
  let lowerAllSecure = true;
  for (const entry of populatedLevels) {
    const meetsProgress = (entry.rawProgress ?? 0) >= 1;
    entry.secured = lowerAllSecure && meetsProgress;
    if (!entry.secured) {
      lowerAllSecure = false;
    }
  }

  const securedPopulated = populatedLevels.filter((entry) => entry.secured);
  const highestSecureLevel =
    securedPopulated.length > 0 ? securedPopulated[securedPopulated.length - 1].level : null;
  const developing = populatedLevels.find((entry) => !entry.secured) ?? null;
  const developingLevel = developing ? developing.level : null;

  // Badges + gated-level collection.
  const gatedLevels: LevelProficiency[] = [];
  for (const entry of levels) {
    if (!entry.populated) {
      entry.badge = "not started";
      continue;
    }
    if (entry.secured) {
      entry.badge = entry.limitedAllocation ? "secure (limited allocation)" : "secure";
    } else if (developingLevel !== null && entry.level === developingLevel) {
      entry.badge = entry.creditSum > 0 ? "developing" : "not started";
    } else if (developingLevel !== null && entry.level > developingLevel) {
      // Above the developing level: gated. Evidence => developing (early).
      if (entry.creditSum > 0) {
        entry.badge = "developing (early)";
        gatedLevels.push(entry);
      } else {
        entry.badge = "not started";
      }
    } else {
      entry.badge = "not started";
    }
  }

  // Evidence gaps.
  const evidenceGaps: EvidenceGap[] = [];
  for (const entry of levels) {
    if (!entry.populated) {
      evidenceGaps.push({ kind: "no_allocation", level: entry.level });
    } else if (entry.limitedAllocation) {
      evidenceGaps.push({ kind: "allocation_under_floor", level: entry.level, allocation: entry.allocation });
    }
  }
  if (developing !== null) {
    const counts = { unseen: 0, active: 0, produced: 0 };
    for (const word of developing.creditedWords) {
      if (word.state === "unseen") counts.unseen += 1;
      else if (word.state === "active") counts.active += 1;
      else if (word.state === "produced") counts.produced += 1;
    }
    if (counts.unseen + counts.active + counts.produced > 0) {
      evidenceGaps.push({ kind: "developing_words", level: developing.level, ...counts });
    }
  }

  const allocationLimited = levels.some((entry) => entry.limitedAllocation);

  explanation.push(
    `skill ${microSkillKey}: ${qualifyingWordIds.size} qualifying mapped word(s); ` +
      `${excludedOutOfBand} excluded out-of-band (status-5), ${excludedUnbanded} excluded unbanded`,
  );
  explanation.push(
    `first populated level ${firstPopulatedLevel ?? "none"}; highest secure ${highestSecureLevel ?? "none"}; ` +
      `developing ${developingLevel ?? "none (fully secure or unpopulated)"}`,
  );
  for (const entry of levels) {
    explanation.push(
      `L${entry.level}: allocation ${entry.allocation}, target ${entry.target ?? "—"}, ` +
        `credit ${entry.creditSum.toFixed(2)} (${entry.creditedWords.length} words), ` +
        `progress ${entry.progress === null ? "—" : entry.progress.toFixed(2)}, badge ${entry.badge}`,
    );
  }
  if (allocationLimited) {
    explanation.push("allocation-limited: at least one populated level is under floor 8 (proposal §2)");
  }

  return {
    childId: inputs.childId,
    microSkillKey,
    highestSecureLevel,
    firstPopulatedLevel,
    developingLevel,
    levels,
    gatedLevels,
    evidenceGaps,
    allocationLimited,
    proficiencyPolicyVersion: policy.proficiencyPolicyVersion,
    bandingVersion: activeBandingVersion.bandingVersion,
    explanation,
  };
}

/** The full set of skills worth reporting: every skill in the allocation
 * table for the active version plus every skill with a qualifying credit
 * link. Deterministic ascending order. */
export function skillsToReport(policy: ProficiencyPolicy, inputs: ProficiencyInputs): string[] {
  const creditRoles = new Set(policy.creditRoles);
  const skills = new Set<string>();
  for (const allocation of inputs.allocations) {
    if (allocation.rowStatus === "active" && allocation.bandingVersion === inputs.activeBandingVersion.bandingVersion) {
      skills.add(allocation.microSkillKey);
    }
  }
  for (const support of inputs.supports) {
    if (support.rowStatus === "active" && creditRoles.has(support.supportRole)) {
      skills.add(support.microSkillKey);
    }
  }
  return [...skills].sort();
}

/** Compute proficiency for every reportable skill (ascending key order). */
export function computeAllSkillProficiency(
  policy: ProficiencyPolicy,
  inputs: ProficiencyInputs,
): SkillProficiencyReport[] {
  return skillsToReport(policy, inputs).map((skill) => computeSkillProficiency(policy, inputs, skill));
}

/** The set of skills with no secure level — the injected fact for the
 * composer's "not yet secure" prerequisite-precedence extension (5D). Derived
 * from reports so the composer never recomputes proficiency. */
export function notYetSecureSkillKeys(reports: readonly SkillProficiencyReport[]): Set<string> {
  return new Set(reports.filter((report) => report.highestSecureLevel === null).map((report) => report.microSkillKey));
}
