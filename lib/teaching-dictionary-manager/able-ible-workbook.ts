import { DYNAMIC_SUFFIX_PROFILE_KEYS } from "@/lib/adle/morphology/dynamic-suffix-profile-keys";
import { ingReviewEnvironment } from "./ing-staging-scope";

export const ABLE_IBLE_SKILL = "D4_MOR_SUFFIXES_ABLE_IBLE";
export const ABLE_IBLE_ROUTE = "dynamic_affix_word_lab";

export type SuffixWorkbookFacts = {
  age_band: string;
  frequency_band: string;
  complexity_band: string;
  has_schwa: string;
};

export const FUL_LESS_SKILL = "D4_MOR_SUFFIXES_FUL_LESS";

export type SuffixReviewSkill = (typeof DYNAMIC_SUFFIX_PROFILE_KEYS)[number];

export const isSuffixReviewSkill = (skill: unknown): skill is SuffixReviewSkill =>
  DYNAMIC_SUFFIX_PROFILE_KEYS.some(key => key === skill);

export function suffixReviewTitle(skill: string) {
  if (!isSuffixReviewSkill(skill)) return "";
  if (skill === ABLE_IBLE_SKILL) return "-able/-ible";
  if (skill === FUL_LESS_SKILL) return "-ful/-less";
  return `-${skill.slice("D4_MOR_SUFFIXES_".length).toLowerCase()}`;
}

export function suffixDictionaryOnly(skill: string) {
  if (skill === FUL_LESS_SKILL && ingReviewEnvironment() === "production") return true;
  return (skill === ABLE_IBLE_SKILL && process.env.ADLE_ABLE_IBLE_DICTIONARY_ONLY === "enabled")
    || (skill === FUL_LESS_SKILL && process.env.ADLE_FUL_LESS_DICTIONARY_ONLY === "enabled");
}
