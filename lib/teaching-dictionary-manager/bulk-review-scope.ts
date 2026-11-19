import { homophoneReviewRoute } from "./homophone-review-contract";
import { isCompoundWorkbookSkill, COMPOUND_WORKBOOK_ROUTE } from "./compound-workbook";
import { COMPARATIVE_MICRO_SKILLS } from "@/lib/adle/inflection/contracts";
import { prefixWorkbookEnabled, PREFIX_WORKBOOK_ROUTE } from "./prefix-workbook";
import { ingReviewEnvironment } from "./ing-staging-scope";
import { isStagingIngSkill } from "./ing-staging-release";
import { isSuffixReviewSkill, type SuffixReviewSkill } from "./able-ible-workbook";

import { IDENTIFY_BASE_SKILL } from "./lesson-candidate";
export { IDENTIFY_BASE_SKILL };
export const isIdentifyBaseReview = (skill: unknown): skill is typeof IDENTIFY_BASE_SKILL =>
  skill === IDENTIFY_BASE_SKILL && ingReviewEnvironment() !== null;

export function isSuffixWorkbookPilot(skill: unknown): skill is SuffixReviewSkill {
  return isSuffixReviewSkill(skill) && ingReviewEnvironment() !== null;
}

const specialistRoutes: Readonly<Record<string, string>> = {
  D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX: "base_word_lab",
  D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX: "base_word_lab",
  D4_MOR_BASE_WORDS_PRESERVE_BASE: "base_word_lab",
  D4_SCHWA_FINAL_ET: "weak_vowel_word_lab",
  D4_SCHWA_FINAL_AL: "weak_vowel_word_lab",
  D4_SCHWA_INITIAL_A_INITIAL: "weak_vowel_word_lab",
  D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS: "weak_vowel_word_lab",
  ...Object.fromEntries(COMPARATIVE_MICRO_SKILLS.map(skill => [skill, "comparative_superlative_word_lab"])),
};

export function specialistWorkbookRoute(skill: unknown) {
  if (ingReviewEnvironment() !== null && homophoneReviewRoute(skill)) return homophoneReviewRoute(skill);
  if (ingReviewEnvironment() !== null && isCompoundWorkbookSkill(skill)) return COMPOUND_WORKBOOK_ROUTE;
  if (prefixWorkbookEnabled(skill)) return PREFIX_WORKBOOK_ROUTE;
  return ingReviewEnvironment() !== null && typeof skill === "string" && Object.hasOwn(specialistRoutes, skill)
    ? specialistRoutes[skill] : null;
}

export function supportsReviewWorkbook(skill: unknown): skill is string {
  return Boolean(specialistWorkbookRoute(skill)) || isIdentifyBaseReview(skill) || isSuffixWorkbookPilot(skill) || (ingReviewEnvironment() !== null && isStagingIngSkill(skill));
}
