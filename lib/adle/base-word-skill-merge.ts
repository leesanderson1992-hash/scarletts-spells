export const IDENTIFY_BASE_WORD_SKILL = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";

export const RETIRING_BASE_WORD_SKILLS = [
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX",
  "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX",
] as const;

export const HISTORICAL_BASE_WORD_SKILLS = [
  IDENTIFY_BASE_WORD_SKILL,
  ...RETIRING_BASE_WORD_SKILLS,
] as const;

const historical = new Set<string>(HISTORICAL_BASE_WORD_SKILLS);

/** Use at new-work boundaries; historical rows and pinned lessons retain their keys. */
export function baseWordSkillForNewWork(key: string): string {
  return historical.has(key) ? IDENTIFY_BASE_WORD_SKILL : key;
}

export function isHistoricalBaseWordSkill(key: string): boolean {
  return historical.has(key);
}

export function mergedBaseWordCausalSkills(keys: readonly string[]): string[] {
  return [...new Set(keys.map(baseWordSkillForNewWork))].sort();
}
