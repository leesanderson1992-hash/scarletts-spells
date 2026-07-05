/**
 * ADLE Slice 3 (3C): Part 2 skill selection — the pinned lexicographic
 * tie-breakers (2026-07-04 amendment item 4, extended by the 2026-07-05
 * amendment item 2's prerequisite-precedence tier), implemented exactly, with
 * a full audit trail naming the deciding tier so parents get explainable
 * picks. No weights anywhere.
 *
 * Order: reteach demand (oldest ejection first) -> prerequisite precedence ->
 * largest cluster -> oldest learning item -> frequency usefulness (high- then
 * medium-frequency word counts; ordering only, never Levels) -> family
 * rotation -> micro_skill_key ascending.
 *
 * Lexicographic means each tier only ranks the previous tier's survivors:
 * a skill that uniquely wins an earlier tier is selected there (so reteach
 * demand always outranks prerequisite precedence, which is exactly "reteach
 * lessons always outrank new clusters"). Prerequisite links arrive as an
 * injected fact set; absent data means that tier decides nothing (fail-open
 * to the next tier), as does a deferral that would empty the survivor set
 * (e.g. a prerequisite cycle).
 */

import {
  clustersBySkill,
  reteachDemandBySkill,
  type LearningItemFact,
} from "./learning-items";
import type { IsoDate } from "./review-scheduler";

/** The selectability gate: a skill is a candidate only with at least this
 * many real unresolved learning items (blueprint 5-word rule). */
export const MIN_SELECTABLE_ITEMS = 2;

export interface SkillSelectionFacts {
  learningItems: readonly LearningItemFact[];
  /** micro_skill_key -> skill_family_key (from micro_skill_catalog). */
  skillFamilyKeyBySkill: ReadonlyMap<string, string>;
  /** Taxonomy prerequisite links; empty map = the tier is a no-op. */
  prerequisiteKeysBySkill: ReadonlyMap<string, readonly string[]>;
  /** canonical_word_id -> frequency_band (eligibility metadata; ordering
   * only — the obscure-word firewall keeps it away from Levels). */
  frequencyBandByWordId: ReadonlyMap<string, string | null>;
  /** The immediately previous lesson's family, for the rotation tier. */
  previousLessonFamilyKey: string | null;
}

export type SkillSelectionTier =
  | "selectability_gate"
  | "reteach_demand"
  | "prerequisite_precedence"
  | "largest_cluster"
  | "oldest_learning_item"
  | "frequency_usefulness"
  | "family_rotation"
  | "micro_skill_key";

export interface SkillSelectionAuditEntry {
  tier: SkillSelectionTier;
  candidatesBefore: readonly string[];
  candidatesAfter: readonly string[];
  decided: boolean;
  detail: string;
}

export interface SkillSelectionResult {
  microSkillKey: string | null;
  skipReason: "insufficient_real_learning_items" | null;
  decidingTier: SkillSelectionTier | null;
  audit: SkillSelectionAuditEntry[];
}

function sortedKeys(keys: Iterable<string>): string[] {
  return [...keys].sort();
}

export function selectPartTwoSkill(facts: SkillSelectionFacts): SkillSelectionResult {
  const audit: SkillSelectionAuditEntry[] = [];
  const clusters = clustersBySkill(facts.learningItems);
  const candidates = sortedKeys(
    [...clusters.entries()]
      .filter(([, items]) => items.length >= MIN_SELECTABLE_ITEMS)
      .map(([skill]) => skill),
  );
  audit.push({
    tier: "selectability_gate",
    candidatesBefore: sortedKeys(clusters.keys()),
    candidatesAfter: candidates,
    decided: candidates.length === 1,
    detail: `skills with >= ${MIN_SELECTABLE_ITEMS} real unresolved learning items`,
  });
  if (candidates.length === 0) {
    return {
      microSkillKey: null,
      skipReason: "insufficient_real_learning_items",
      decidingTier: null,
      audit,
    };
  }

  let survivors = candidates;
  const finish = (tier: SkillSelectionTier): SkillSelectionResult => ({
    microSkillKey: survivors[0],
    skipReason: null,
    decidingTier: tier,
    audit,
  });
  const runTier = (
    tier: SkillSelectionTier,
    detail: string,
    narrow: (current: readonly string[]) => readonly string[],
  ): boolean => {
    const before = survivors;
    const after = narrow(before);
    // Fail-open: a tier that would empty the survivor set decides nothing.
    const applied = after.length > 0 ? sortedKeys(after) : before;
    audit.push({
      tier,
      candidatesBefore: before,
      candidatesAfter: applied,
      decided: applied.length === 1,
      detail,
    });
    survivors = applied;
    return applied.length === 1;
  };

  // Tier 1: reteach demand, oldest ejection first.
  const reteach = reteachDemandBySkill(facts.learningItems);
  const reteachSurvivors = survivors.filter((skill) => reteach.has(skill));
  if (reteachSurvivors.length > 0) {
    const oldest = reteachSurvivors
      .map((skill) => reteach.get(skill) as IsoDate)
      .reduce((a, b) => (a < b ? a : b));
    if (
      runTier(
        "reteach_demand",
        `reteach demand present; oldest ejection ${oldest}`,
        () => reteachSurvivors.filter((skill) => reteach.get(skill) === oldest),
      )
    ) {
      return finish("reteach_demand");
    }
  } else {
    audit.push({
      tier: "reteach_demand",
      candidatesBefore: survivors,
      candidatesAfter: survivors,
      decided: false,
      detail: "no reteach demand among candidates",
    });
  }

  // Tier 2: prerequisite precedence — defer a survivor whose prerequisite is
  // itself a selectable candidate; the prerequisite is selected first.
  if (
    runTier(
      "prerequisite_precedence",
      "defer skills whose prerequisite micro-skill is a selectable candidate",
      (current) => {
        const currentSet = new Set(current);
        return current.filter((skill) => {
          const prerequisites = facts.prerequisiteKeysBySkill.get(skill) ?? [];
          return !prerequisites.some(
            (prerequisite) => prerequisite !== skill && currentSet.has(prerequisite),
          );
        });
      },
    )
  ) {
    return finish("prerequisite_precedence");
  }

  // Tier 3: largest cluster of unresolved learning items.
  if (
    runTier("largest_cluster", "largest cluster of unresolved learning items", (current) => {
      const size = (skill: string) => (clusters.get(skill) ?? []).length;
      const max = Math.max(...current.map(size));
      return current.filter((skill) => size(skill) === max);
    })
  ) {
    return finish("largest_cluster");
  }

  // Tier 4: oldest learning item.
  if (
    runTier("oldest_learning_item", "oldest unresolved learning item", (current) => {
      const oldestFor = (skill: string) => (clusters.get(skill) as LearningItemFact[])[0].intakeOn;
      const oldest = current.map(oldestFor).reduce((a, b) => (a < b ? a : b));
      return current.filter((skill) => oldestFor(skill) === oldest);
    })
  ) {
    return finish("oldest_learning_item");
  }

  // Tier 5: frequency usefulness — count of high-, then medium-frequency
  // words among the skill's unresolved items. Ordering only, never Levels.
  if (
    runTier(
      "frequency_usefulness",
      "more high-frequency, then medium-frequency item words",
      (current) => {
        const bandCount = (skill: string, band: string) =>
          (clusters.get(skill) ?? []).filter(
            (item) =>
              (facts.frequencyBandByWordId.get(item.canonicalWordId) ?? "").toLowerCase() === band,
          ).length;
        const maxHigh = Math.max(...current.map((skill) => bandCount(skill, "high")));
        const highSurvivors = current.filter((skill) => bandCount(skill, "high") === maxHigh);
        if (highSurvivors.length === 1) {
          return highSurvivors;
        }
        const maxMedium = Math.max(...highSurvivors.map((skill) => bandCount(skill, "medium")));
        return highSurvivors.filter((skill) => bandCount(skill, "medium") === maxMedium);
      },
    )
  ) {
    return finish("frequency_usefulness");
  }

  // Tier 6: family rotation — avoid the immediately previous lesson's family
  // when an alternative exists.
  if (
    runTier(
      "family_rotation",
      `avoid previous lesson family ${facts.previousLessonFamilyKey ?? "(none)"}`,
      (current) => {
        if (facts.previousLessonFamilyKey === null) {
          return current;
        }
        return current.filter(
          (skill) => facts.skillFamilyKeyBySkill.get(skill) !== facts.previousLessonFamilyKey,
        );
      },
    )
  ) {
    return finish("family_rotation");
  }

  // Tier 7: micro_skill_key ascending — always decides (survivors are sorted).
  survivors = [survivors[0]];
  audit.push({
    tier: "micro_skill_key",
    candidatesBefore: audit[audit.length - 1].candidatesAfter,
    candidatesAfter: survivors,
    decided: true,
    detail: "stable micro_skill_key ascending",
  });
  return finish("micro_skill_key");
}
