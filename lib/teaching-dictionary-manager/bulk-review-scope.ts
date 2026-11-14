import { ingReviewEnvironment } from "./ing-staging-scope";
import { isStagingIngSkill } from "./ing-staging-release";
import { ABLE_IBLE_SKILL } from "./able-ible-workbook";

export const IDENTIFY_BASE_SKILL = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
export const isIdentifyBaseReview = (skill: unknown): skill is typeof IDENTIFY_BASE_SKILL =>
  skill === IDENTIFY_BASE_SKILL && ingReviewEnvironment() === "staging";

export function isAbleIblePilot(skill: unknown): skill is typeof ABLE_IBLE_SKILL {
  return skill === ABLE_IBLE_SKILL && ingReviewEnvironment() === "staging";
}

export function supportsReviewWorkbook(skill: unknown): skill is string {
  return isIdentifyBaseReview(skill) || isAbleIblePilot(skill) || (ingReviewEnvironment() !== null && isStagingIngSkill(skill));
}
