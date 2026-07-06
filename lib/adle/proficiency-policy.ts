/**
 * ADLE Slice 5 (5A): micro-skill proficiency policy v1 constants — the
 * blueprint's graded-breadth credit table (1.0/0.4/0.1 by evidence state),
 * the level-target formula constants (cap 20, ratio 0.6, floor 8), the
 * non-contrast credit roles, and the parent-facing badging vocabulary.
 * Versioned in the REVIEW_POLICY_V1 / EVIDENCE_POLICY_V1 pattern; the
 * reporting read model stamps `proficiencyPolicyVersion` on every result.
 * Extend only with an approved amendment.
 *
 * Policy sources: adle-daily-assignment-and-evidence-blueprint-contract.md
 * (§"Micro-skill proficiency (graded breadth, gated levels)") and the
 * approved banding proposal §2 (floor 8 kept exactly; targets never tuned to
 * the pilot sample; contrast-role links excluded from breadth allocation).
 */

import type { WordEvidenceState } from "./word-evidence-state";
import type { WordSupportFact } from "./dictionary-eligibility";

/** Breadth credit per word per mapped skill by the word's reported evidence
 * state, capped at 1.0 per word per skill. `secure`/`review_retired`/
 * `mastered` = 1.0; `produced` = 0.4; `active` = 0.1; `unseen` = 0. Credit is
 * state-based, not flag-based (owner-approved 2026-07-05, Slice 5 plan open
 * question 2): a secure-evidence word carrying an unresolved slip already
 * reports `produced`, so its breadth demotes to 0.4 automatically. */
export type BreadthCreditTable = Record<WordEvidenceState, number>;

export interface ProficiencyPolicy {
  proficiencyPolicyVersion: string;
  creditTable: BreadthCreditTable;
  /** target(L) = min(targetCap, max(targetFloor, ceil(targetRatio x
   * allocation(skill, L)))). Under floor: target = allocation (the level is
   * secured from the full allocation and badged limited). */
  targetCap: number;
  targetRatio: number;
  targetFloor: number;
  /** Non-contrast support roles that carry breadth credit — mirrors the
   * allocation runner's contrast exclusion (proposal §2). */
  creditRoles: readonly WordSupportFact["supportRole"][];
}

export const PROFICIENCY_POLICY_V1: ProficiencyPolicy = {
  proficiencyPolicyVersion: "proficiency_policy_v1_2026-07-05",
  creditTable: {
    unseen: 0,
    active: 0.1,
    produced: 0.4,
    secure: 1.0,
    review_retired: 1.0,
    mastered: 1.0,
  },
  targetCap: 20,
  targetRatio: 0.6,
  targetFloor: 8,
  creditRoles: ["support_example", "review_example"],
};

/** Level security badge for a secured level: limited when its allocation is
 * under the floor (proposal §2 item 4 — the honest, designed behaviour until
 * bulk population catches up). */
export type LevelBadge =
  | "secure"
  | "secure (limited allocation)"
  | "developing"
  | "developing (early)"
  | "not started";

/** Parent-facing vocabulary (blueprint: progress-toward-next-level framing,
 * never pass/fail). Shipped as constants so Slice 7's UI consumes, never
 * re-invents. Long developing periods are the system working and read that
 * way. */
export const PROFICIENCY_VOCABULARY = {
  secure: "secure",
  secureLimited: "secure (limited allocation)",
  /** The lowest non-secure populated level a child is actively building. */
  developing: "developing — on track",
  /** Higher-level evidence while a lower level gates it (never averaged). */
  developingEarly: "developing (early)",
  notStarted: "not started",
} as const;

/** target(L) from the allocation table for the active banding version.
 * Never hard-coded; grows automatically as the recomputable allocation table
 * gains words. Allocation 0 -> null (the level is unpopulated: no target, not
 * securable, and skipped by the gate — Slice 5 plan 5C). */
export function levelTarget(policy: ProficiencyPolicy, allocation: number): number | null {
  if (allocation <= 0) {
    return null;
  }
  if (allocation < policy.targetFloor) {
    // Secured from the full allocation; badged limited by the caller.
    return allocation;
  }
  return Math.min(policy.targetCap, Math.max(policy.targetFloor, Math.ceil(policy.targetRatio * allocation)));
}

/** Whether a populated allocation cell is under the floor (limited badging). */
export function isLimitedAllocation(policy: ProficiencyPolicy, allocation: number): boolean {
  return allocation > 0 && allocation < policy.targetFloor;
}

/** The breadth credit a word contributes to a skill given its evidence state
 * (already capped at 1.0 per word per skill by the table). */
export function stateCredit(policy: ProficiencyPolicy, state: WordEvidenceState): number {
  return policy.creditTable[state];
}
