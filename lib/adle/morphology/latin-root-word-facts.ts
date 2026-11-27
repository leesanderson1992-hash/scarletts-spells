export interface CanonicalLatinRootFamily {
  familyKey: string; revision: number; rootWordId: string; rootSenseId: string;
  root: string; meaning: string; origin: string; reviewStatus: string;
}
export interface CanonicalLatinRootWord {
  canonicalWordId: string; spelling: string; familyKey: string; senseId: string;
  definition: string; partOfSpeech: string; ipa: string; sentence: string;
  targetTokenIndex: number; reviewStatus: string; reviewedAt: string;
  morphologyId: string; componentPartId: string; wordSum: string;
  parts: { id: string; kind: string; sourceText: string; surfaceText: string; gloss: string }[];
  joins: unknown[]; transformations: unknown[];
  wordRecordingSrc?: string; sentenceRecordingSrc?: string;
}

/** Sense-bound canonical facts only. A spelling in a root's example list is not a member. */
export function latinRootWordBlocker(word: CanonicalLatinRootWord, family: CanonicalLatinRootFamily): string | null {
  if (family.reviewStatus !== "approved" || !["Latin", "Latin-derived"].includes(family.origin)) return "root_family_not_approved_latin";
  if (word.reviewStatus !== "approved_for_first_exposure" || !word.reviewedAt || !word.senseId || !word.morphologyId) return "word_meaning_or_parts_not_reviewed";
  if (word.partOfSpeech === "root" || word.canonicalWordId === family.rootWordId && word.senseId === family.rootSenseId) return "root_support_is_not_a_spelling_target";
  if (!word.definition.trim() || !word.ipa.trim() || !word.wordSum.trim()) return "word_definition_pronunciation_or_sum_missing";
  const tokens = word.sentence.match(/[\p{L}]+(?:['’ʼ-][\p{L}]+)*/gu) ?? [];
  if (!Number.isInteger(word.targetTokenIndex) || tokens[word.targetTokenIndex]?.toLowerCase() !== word.spelling.toLowerCase() ||
    tokens.filter(token => token.toLowerCase() === word.spelling.toLowerCase()).length !== 1) return "meaning_sentence_target_invalid";
  if (!word.parts.length || word.parts.some(part => !["prefix", "root", "suffix"].includes(part.kind) || !part.surfaceText || !part.sourceText || part.kind !== "root" && !part.gloss?.trim()) ||
    word.parts.map(part => part.surfaceText).join("") !== word.spelling || word.transformations.length) return "unsupported_or_incomplete_reviewed_word_parts";
  const root = word.parts.filter(part => part.kind === "root");
  if (root.length !== 1 || root[0].id !== word.componentPartId || root[0].surfaceText !== family.root || root[0].sourceText !== family.root)
    return "reviewed_root_component_mismatch";
  if (word.joins.length !== word.parts.length - 1 || word.joins.some(join => !join || typeof join !== "object" || (join as { joinType?: string }).joinType !== "none"))
    return "reviewed_word_joins_invalid";
  return null;
}
