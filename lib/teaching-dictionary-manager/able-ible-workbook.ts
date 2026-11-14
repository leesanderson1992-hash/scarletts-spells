export const ABLE_IBLE_SKILL = "D4_MOR_SUFFIXES_ABLE_IBLE";
export const ABLE_IBLE_ROUTE = "dynamic_affix_word_lab";

export type SuffixWorkbookFacts = {
  age_band: string;
  frequency_band: string;
  complexity_band: string;
  has_schwa: string;
};

export const FUL_LESS_SKILL = "D4_MOR_SUFFIXES_FUL_LESS";

export function suffixDictionaryOnly(skill: string) {
  return (skill === ABLE_IBLE_SKILL && process.env.ADLE_ABLE_IBLE_DICTIONARY_ONLY === "enabled")
    || (skill === FUL_LESS_SKILL && process.env.ADLE_FUL_LESS_DICTIONARY_ONLY === "enabled");
}
