import manifest from "@/data/adle/homophone/convergence-v1/manifest.json";

/** Only the organised, reviewed roster is eligible for the homophone workflow. */
export type HomophoneReviewSkill = `D4_HOM_${string}`;
export const HOMOPHONE_REVIEW_SKILLS = manifest.skills.map(skill => skill.key);
export const CONFUSABLE_DICTIONARY_SKILLS = HOMOPHONE_REVIEW_SKILLS.filter(key => key.startsWith("D4_HOM_CONFUSABLE_WORDS_"));
export function homophoneReviewSpec(skill: unknown) {
  return typeof skill === "string" ? manifest.skills.find(row => row.key === skill) : undefined;
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
