import manifest from "@/data/adle/homophone/convergence-v1/manifest.json";

/** Only the organised, reviewed roster is eligible for the homophone workflow. */
export type HomophoneReviewSkill = `D4_HOM_${string}`;
export const HOMOPHONE_REVIEW_SKILLS = manifest.skills.map(skill => skill.key);
export const CONFUSABLE_DICTIONARY_SKILLS = HOMOPHONE_REVIEW_SKILLS.filter(key => key.startsWith("D4_HOM_CONFUSABLE_WORDS_"));
/** Content-word lessons whose reviewed Dictionary facts are now publishable. */
export const CONTENT_WORD_DICTIONARY_SKILLS = [
  "D4_HOM_CONTENT_WORD_HOMOPHONES_ALLOWED_ALOUD",
  "D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T",
  "D4_HOM_CONTENT_WORD_HOMOPHONES_MORNING_MOURNING",
] as const;
export const CONTRACTION_DICTIONARY_SKILLS = [
  "D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS",
] as const;
export const FUNCTION_WORD_DICTIONARY_SKILLS = HOMOPHONE_REVIEW_SKILLS.filter(key => key.startsWith("D4_HOM_FUNCTION_WORD_HOMOPHONES_"));
export function homophoneReviewSpec(skill: unknown) {
  const spec = typeof skill === "string" ? manifest.skills.find(row => row.key === skill) : undefined;
  if (!spec || !FUNCTION_WORD_DICTIONARY_SKILLS.includes(spec.key)) return spec;
  return { ...spec, routeStatus: "needs_contextual_choice_v1",
    sets: spec.key === "D4_HOM_FUNCTION_WORD_HOMOPHONES_WERE_WHERE_WEAR"
      ? spec.sets.map(set => ({ ...set, members: ["where", "we're", "wear"] })) : spec.sets };
}
export function isHomophoneReviewSkill(skill: unknown): skill is HomophoneReviewSkill {
  return Boolean(homophoneReviewSpec(skill));
}
export function homophoneReviewRoute(skill: unknown) {
  const spec = homophoneReviewSpec(skill);
  return spec ? spec.routeStatus === "retain_v2" ? "homophone_word_lab" : "homophone_contextual_choice" : null;
}
export function homophoneReviewWords(skill: string) {
  return [...new Set(homophoneReviewSpec(skill)?.sets.flatMap(set => set.members) ?? [])];
}

export function homophoneCanonicalPartOfSpeech(role: string) {
  if (role.startsWith("verb ")) return "verb";
  return role === "number" ? "numeral" : role;
}
