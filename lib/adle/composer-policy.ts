/**
 * ADLE Slice 3: composer policy v1 constants — the owner-approved session
 * budget numbers (Slice 3 plan, open question 5, answered 2026-07-05).
 * Versioned and pilot-tunable per the blueprint's pilot list; extend only
 * with an approved amendment.
 */

export interface ComposerPolicy {
  composerPolicyVersion: string;
  /** ~20-minute session, interaction budget in child responses. */
  sessionResponseBudget: number;
  /** The 5-word rule: every lesson has exactly this many words. */
  lessonWordCount: number;
  /** Guided sequence runs on 2-3 of the lesson words under the budget. */
  guidedWordCountMax: number;
  guidedWordCountMin: number;
  /** Must-use free writing is capped at 3-5 required words. */
  mustUseWordCountMin: number;
  mustUseWordCountMax: number;
  /** One diagnostic probe per micro-skill per this many days. */
  probeCapDays: number;
}

export const COMPOSER_POLICY_V1: ComposerPolicy = {
  composerPolicyVersion: "composer_policy_v1_2026-07-05",
  sessionResponseBudget: 25,
  lessonWordCount: 5,
  guidedWordCountMax: 3,
  guidedWordCountMin: 2,
  mustUseWordCountMin: 3,
  mustUseWordCountMax: 5,
  probeCapDays: 14,
};
