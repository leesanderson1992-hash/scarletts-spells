export type LatinRootSpellAnimation = "carry_bag" | "carry_book" | "carry_basket" | "build_bridge" | "build_treehouse" | "build_shelter";

/** Presentation contract only. Production assignment/evidence authority is not implied. */
export type LatinRootLessonWord = {
  id: string;
  word: string;
  meaning: string;
  parts: { text: string; meaning: string; role: "prefix" | "root" | "suffix" }[];
  sentence: string;
  recordingSrc?: string;
  target?: boolean;
  parentWordId?: string;
};
export type LatinRootLessonFamily = {
  id: string;
  root: string;
  meaning: string;
  origin: "Latin" | "Latin-derived";
  words: LatinRootLessonWord[];
  /** Reviewed creative prompts; fictional effects are never spelling targets. */
  spellEffects?: string[];
  spellAnimations?: LatinRootSpellAnimation[];
};
export type LatinRootLessonContent = { id: string; families: LatinRootLessonFamily[] };

export function validateLatinRootLesson(content: LatinRootLessonContent): void {
  const words = content.families.flatMap(family => family.words);
  if (![1, 2].includes(content.families.length) || ![5, 6].includes(words.length)) throw new Error("Latin Roots needs five or six words across one or two families.");
  if (new Set(content.families.map(f => f.id)).size !== content.families.length || new Set(content.families.map(f => f.root.toLowerCase())).size !== content.families.length || new Set(words.map(w => w.id)).size !== words.length || new Set(words.map(w => w.word.toLowerCase())).size !== words.length) throw new Error("Duplicate Latin Roots family or word.");
  if (content.families.length === 2 && content.families.some(family => family.words.length < 2 || family.words.length > words.length - 2)) throw new Error("Two root families each need at least two words, with six words at most in total.");
  for (const family of content.families) {
    if (!family.root.trim() || !family.meaning.trim() || !["Latin", "Latin-derived"].includes(family.origin) || family.words.length < 2 || !family.words.some(w => w.target)) throw new Error("Each Latin root family needs a meaning, origin and target word.");
    const preceding = new Set<string>();
    for (const word of family.words) {
      if (!word.word.trim() || !word.meaning.trim() || word.parts.some(part => !part.text.trim() || !part.meaning.trim()) || word.parts.filter(part => part.role === "root").length !== 1 || !word.sentence.split(/[^\p{L}]+/u).some(token => token.toLowerCase() === word.word.toLowerCase()) || word.parts.map(p => p.text).join("") !== word.word || word.parts.filter(p => p.role === "root" && p.text === family.root).length !== 1) throw new Error("Incomplete Latin root word facts.");
      if (word.parentWordId && (!preceding.has(word.parentWordId) || word.target)) throw new Error("A child branch must follow its parent in the same root family.");
      preceding.add(word.id);
    }
  }
}
