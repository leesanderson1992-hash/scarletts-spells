import type { LatinRootLessonFamily } from "./latin-root-lesson";

export type SpellRootIngredient = { root: string; meaning: string };
// Creative-game distractors and bonus ingredients, never ordinary spelling targets.
const INGREDIENTS: SpellRootIngredient[] = [
  { root: "port", meaning: "Carry" }, { root: "struct", meaning: "Build" },
  { root: "dict", meaning: "Say or speak" }, { root: "vis", meaning: "See" },
  { root: "fect", meaning: "Make or do" },
];
export function spellRootOptions(families: LatinRootLessonFamily[]): SpellRootIngredient[] {
  const all = [...families.map(family => ({ root: family.root, meaning: family.meaning })), ...INGREDIENTS];
  return all.filter((item, index) => all.findIndex(other => other.root === item.root) === index).slice(0, 5);
}
