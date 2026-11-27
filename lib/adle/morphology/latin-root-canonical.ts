import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { selectableLearningItems, type LearningItemFact } from "../learning-items";
import { validateLatinRootLesson, type LatinRootLessonContent, type LatinRootLessonWord } from "./latin-root-lesson";

export const LATIN_ROOT_SKILL = "D4_MOR_ROOTS_COMMON_LATIN_ROOTS" as const;
export const LATIN_ROOT_ROUTE = "latin_root_word_lab" as const;
export const LATIN_ROOT_CONTENT_VERSION = "latin_root_word_lab:v1" as const;

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
export interface LatinRootCanonicalLessonV1 {
  schemaVersion: 1; routeId: typeof LATIN_ROOT_ROUTE; microSkillKey: typeof LATIN_ROOT_SKILL;
  assignmentKey: string; contentVersion: string; content: LatinRootLessonContent;
  words: { canonicalWordId: string; senseId: string; learningItemId: string | null;
    targetTokenIndex: number; sourceFingerprint: string }[];
  familyAuthorities: { familyKey: string; revision: number; sourceFingerprint: string }[];
}
export type LatinRootReadiness = { status: "ready"; lesson: LatinRootCanonicalLessonV1 }
  | { status: "blocked"; blockers: { wordId: string; reason: string }[] };

export function validateCanonicalLatinRootLesson(value: unknown): value is LatinRootCanonicalLessonV1 {
  try {
    if (!value || typeof value !== "object") return false;
    const lesson = value as LatinRootCanonicalLessonV1;
    if (lesson.schemaVersion !== 1 || lesson.routeId !== LATIN_ROOT_ROUTE || lesson.microSkillKey !== LATIN_ROOT_SKILL ||
      !lesson.assignmentKey || lesson.content.id !== lesson.assignmentKey) return false;
    validateLatinRootLesson(lesson.content);
    const words = lesson.content.families.flatMap(family => family.words);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const hash = /^[0-9a-f]{64}$/;
    if (lesson.words.length !== words.length || !lesson.words.some(word => word.learningItemId) ||
      lesson.words.some((word, index) => word.canonicalWordId !== words[index].id || !uuid.test(word.canonicalWordId) ||
        !word.senseId || !hash.test(word.sourceFingerprint) || (word.learningItemId !== null && !uuid.test(word.learningItemId)) ||
        Boolean(words[index].target) !== Boolean(word.learningItemId) || !Number.isInteger(word.targetTokenIndex) || word.targetTokenIndex < 0)) return false;
    if (lesson.familyAuthorities.length !== lesson.content.families.length || lesson.familyAuthorities.some((family, index) =>
      family.familyKey !== lesson.content.families[index].id || !Number.isInteger(family.revision) || family.revision < 1 || !hash.test(family.sourceFingerprint))) return false;
    return lesson.contentVersion === `${LATIN_ROOT_CONTENT_VERSION}:${fingerprintSnapshotValue({ content: lesson.content, familyAuthorities: lesson.familyAuthorities, words: lesson.words })}`;
  } catch { return false; }
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

/** One or two relevant root families; five/six words, without manufacturing learner lineage. */
export function prepareCanonicalLatinRootLesson(input: {
  childId: string; assignmentKey: string; families: readonly CanonicalLatinRootFamily[];
  words: readonly CanonicalLatinRootWord[]; learningItems: readonly LearningItemFact[];
  allowedFamilyKeys: ReadonlySet<string>; desiredWordCount?: 5 | 6;
}): LatinRootReadiness {
  const blocked = (wordId: string, reason: string): LatinRootReadiness => ({ status: "blocked", blockers: [{ wordId, reason }] });
  const familyByKey = new Map(input.families.map(f => [f.familyKey, f]));
  if (familyByKey.size !== input.families.length) return blocked("*", "ambiguous_current_root_family");
  const targets = selectableLearningItems(input.learningItems).filter(item => item.childId === input.childId && item.microSkillKey === LATIN_ROOT_SKILL && item.sourceKind !== "stretch_selection");
  if (!targets.length) return blocked("*", "no_authentic_root_target");
  const matched = targets.map(target => ({ target, candidates: input.words.filter(word => word.canonicalWordId === target.canonicalWordId && input.allowedFamilyKeys.has(word.familyKey)) }));
  // Never replace the oldest chosen demand word with an easier content-complete word.
  const first = matched[0];
  if (first.candidates.length !== 1) return blocked(first.target.canonicalWordId, first.candidates.length ? "ambiguous_target_meaning" : "target_has_no_released_root_membership");
  const selectedKeys = [first.candidates[0].familyKey];
  const second = matched.find(m => m.candidates.length === 1 && m.candidates[0].familyKey !== selectedKeys[0]);
  if (second) selectedKeys.push(second.candidates[0].familyKey);
  const desired = input.desiredWordCount ?? 5;
  const selected: CanonicalLatinRootWord[] = [];
  const targetByWord = new Map<string, LearningItemFact>();
  for (const [familyIndex, key] of selectedKeys.entries()) {
    const family = familyByKey.get(key);
    if (!family) return blocked("*", "selected_family_missing");
    const limit = selectedKeys.length === 1 ? desired : familyIndex === 0 ? 3 : desired - 3;
    const relevant = matched.filter(m => m.candidates.some(w => w.familyKey === key));
    if (relevant.some(m => m.candidates.length !== 1)) return blocked(relevant.find(m => m.candidates.length !== 1)!.target.canonicalWordId, "ambiguous_target_meaning");
    const demand = relevant.slice(0, limit).map(m => { targetByWord.set(m.target.canonicalWordId, m.target); return m.candidates[0]; });
    for (const word of demand) {
      const reason = latinRootWordBlocker(word, family);
      if (reason) return blocked(word.canonicalWordId, reason);
    }
    const pool = input.words.filter(word => word.familyKey === key && !targetByWord.has(word.canonicalWordId) && !latinRootWordBlocker(word, family))
      .sort((a, b) => a.parts.length - b.parts.length || a.spelling.localeCompare(b.spelling));
    const remaining = pool.filter(word => pool.filter(other => other.canonicalWordId === word.canonicalWordId).length === 1);
    const words = [...demand, ...remaining.slice(0, limit - demand.length)];
    if (words.length !== limit) return blocked(family.rootWordId, "not_enough_reviewed_family_words");
    selected.push(...words);
  }
  const content: LatinRootLessonContent = { id: input.assignmentKey, families: selectedKeys.map(key => {
    const family = familyByKey.get(key)!;
    return { id: key, root: family.root, meaning: family.meaning, origin: family.origin as "Latin" | "Latin-derived",
      words: selected.filter(word => word.familyKey === key).map((word): LatinRootLessonWord => ({
        id: word.canonicalWordId, word: word.spelling, meaning: word.definition,
        parts: word.parts.map(part => ({ text: part.surfaceText, role: part.kind as "prefix" | "root" | "suffix", meaning: part.kind === "root" ? family.meaning : part.gloss })),
        sentence: word.sentence, target: targetByWord.has(word.canonicalWordId), ...(word.sentenceRecordingSrc ? { recordingSrc: word.sentenceRecordingSrc } : {}),
      })) };
  }) };
  validateLatinRootLesson(content);
  const familyAuthorities = selectedKeys.map(key => ({ familyKey: key, revision: familyByKey.get(key)!.revision, sourceFingerprint: fingerprintSnapshotValue(familyByKey.get(key)) }));
  const words = selected.map(word => ({ canonicalWordId: word.canonicalWordId, senseId: word.senseId,
    learningItemId: targetByWord.get(word.canonicalWordId)?.learningItemId ?? null,
    targetTokenIndex: word.targetTokenIndex, sourceFingerprint: fingerprintSnapshotValue(word) }));
  return { status: "ready", lesson: { schemaVersion: 1, routeId: LATIN_ROOT_ROUTE, microSkillKey: LATIN_ROOT_SKILL,
    assignmentKey: input.assignmentKey, contentVersion: `${LATIN_ROOT_CONTENT_VERSION}:${fingerprintSnapshotValue({ content, familyAuthorities, words })}`,
    content, familyAuthorities, words } };
}
