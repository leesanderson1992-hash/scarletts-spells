import { COMPARATIVE_MICRO_SKILLS } from "@/lib/adle/inflection/contracts";
import { ingReviewEnvironment } from "./ing-staging-scope";
import { isStagingIngSkill } from "./ing-staging-release";
import { isSuffixReviewSkill, ABLE_IBLE_SKILL, FUL_LESS_SKILL } from "./able-ible-workbook";

import { IDENTIFY_BASE_SKILL } from "./lesson-candidate";
export { IDENTIFY_BASE_SKILL };
export const isIdentifyBaseReview = (skill: unknown): skill is typeof IDENTIFY_BASE_SKILL =>
  skill === IDENTIFY_BASE_SKILL && ingReviewEnvironment() !== null;

export function isSuffixWorkbookPilot(skill: unknown): skill is typeof ABLE_IBLE_SKILL | typeof FUL_LESS_SKILL {
  return isSuffixReviewSkill(skill) && ingReviewEnvironment() !== null;
}

const specialistRoutes: Readonly<Record<string, string>> = {
  D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX: "base_word_lab",
  D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX: "base_word_lab",
  D4_MOR_BASE_WORDS_PRESERVE_BASE: "base_word_lab",
  D4_MOR_PREFIXES_UN: "dynamic_prefix_word_lab",
  D4_SCHWA_FINAL_ET: "weak_vowel_word_lab",
  D4_SCHWA_FINAL_AL: "weak_vowel_word_lab",
  D4_SCHWA_INITIAL_A_INITIAL: "weak_vowel_word_lab",
  D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS: "weak_vowel_word_lab",
  ...Object.fromEntries(COMPARATIVE_MICRO_SKILLS.map(skill => [skill, "comparative_superlative_word_lab"])),
};

export function specialistWorkbookRoute(skill: unknown) {
  return ingReviewEnvironment() !== null && typeof skill === "string" && Object.hasOwn(specialistRoutes, skill)
    ? specialistRoutes[skill] : null;
}

export function supportsReviewWorkbook(skill: unknown): skill is string {
  return Boolean(specialistWorkbookRoute(skill)) || isIdentifyBaseReview(skill) || isSuffixWorkbookPilot(skill) || (ingReviewEnvironment() !== null && isStagingIngSkill(skill));
}
