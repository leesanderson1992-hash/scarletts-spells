export const LATIN_ROOT_SKILL = "D4_MOR_ROOTS_COMMON_LATIN_ROOTS";
export const GREEK_ROOT_SKILL = "D4_MOR_ROOTS_COMMON_GREEK_ROOTS";
export type RootLanguageAssignment = {
  canonical_word_id: string; sense_id: string | null; assignment_role: "root_support" | "family_member";
  family_key: string; revision: number; root_text: string; origin_language: string;
  micro_skill_key: string; display_name: string;
};
/** A mixed dictionary entry must never borrow the root sense's support classification for its noun. */
export function rootSkillsForMeaning(assignments: readonly RootLanguageAssignment[], senseId: string,
  isRoot: boolean) {
  const grouped = new Map<string, { key: string; name: string; roots: { root: string; origin: string }[] }>();
  for (const row of assignments) {
    if (row.assignment_role !== (isRoot ? "root_support" : "family_member") ||
      row.sense_id !== senseId && (isRoot || row.sense_id !== null)) continue;
    const group = grouped.get(row.micro_skill_key) ?? { key: row.micro_skill_key, name: row.display_name, roots: [] };
    if (!group.roots.some(root => root.root === row.root_text && root.origin === row.origin_language))
      group.roots.push({ root: row.root_text, origin: row.origin_language });
    grouped.set(row.micro_skill_key, group);
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}
