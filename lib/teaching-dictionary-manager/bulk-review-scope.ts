import { ingReviewEnvironment } from "./ing-staging-scope";
import { isStagingIngSkill } from "./ing-staging-release";
import { ABLE_IBLE_SKILL } from "./able-ible-workbook";

export function isAbleIblePilot(skill: unknown): skill is typeof ABLE_IBLE_SKILL {
  return skill === ABLE_IBLE_SKILL && ingReviewEnvironment() === "staging";
}

export function supportsReviewWorkbook(skill: unknown): skill is string {
  return isAbleIblePilot(skill) || (ingReviewEnvironment() !== null && isStagingIngSkill(skill));
}
