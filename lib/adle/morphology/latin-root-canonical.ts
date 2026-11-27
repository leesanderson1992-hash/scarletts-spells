import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { selectableLearningItems, type LearningItemFact } from "../learning-items";
import { validateLatinRootLesson, type LatinRootLessonContent, type LatinRootLessonWord } from "./latin-root-lesson";

import { latinRootWordBlocker, type CanonicalLatinRootFamily, type CanonicalLatinRootWord } from "./latin-root-word-facts";
export { latinRootWordBlocker, type CanonicalLatinRootFamily, type CanonicalLatinRootWord } from "./latin-root-word-facts";

export const LATIN_ROOT_SKILL = "D4_MOR_ROOTS_COMMON_LATIN_ROOTS" as const;
export const LATIN_ROOT_ROUTE = "latin_root_word_lab" as const;
export const LATIN_ROOT_CONTENT_VERSION = "latin_root_word_lab:v1" as const;

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

/** One or two relevant root families; five/six words, without manufacturing learner lineage. */
export function prepareCanonicalLatinRootLesson(input: {
  childId: string; assignmentKey: string; families: readonly CanonicalLatinRootFamily[];
  words: readonly CanonicalLatinRootWord[]; learningItems: readonly LearningItemFact[];
  allowedFamilyKeys: ReadonlySet<string>; teachingSenseIds?: ReadonlyMap<string, string>; desiredWordCount?: 5 | 6;
}): LatinRootReadiness {
  const blocked = (wordId: string, reason: string): LatinRootReadiness => ({ status: "blocked", blockers: [{ wordId, reason }] });
  const familyByKey = new Map(input.families.map(f => [f.familyKey, f]));
  if (familyByKey.size !== input.families.length) return blocked("*", "ambiguous_current_root_family");
  const targets = selectableLearningItems(input.learningItems).filter(item => item.childId === input.childId && item.microSkillKey === LATIN_ROOT_SKILL && item.sourceKind !== "stretch_selection");
  if (!targets.length) return blocked("*", "no_authentic_root_target");
  const selectableWords = input.words.filter(word => !input.teachingSenseIds?.has(word.canonicalWordId) || input.teachingSenseIds.get(word.canonicalWordId) === word.senseId);
  const matched = targets.map(target => ({ target, candidates: selectableWords.filter(word => word.canonicalWordId === target.canonicalWordId && input.allowedFamilyKeys.has(word.familyKey)) }));
  // Never replace the oldest chosen demand word with an easier content-complete word.
  const first = matched[0];
  if (first.candidates.length !== 1) return blocked(first.target.canonicalWordId, first.candidates.length ? "ambiguous_target_meaning" : "target_has_no_released_root_membership");
  const selectedKeys = [first.candidates[0].familyKey];
  const second = matched.find(m => m.candidates.length === 1 && m.candidates[0].familyKey !== selectedKeys[0]);
  if (second) selectedKeys.push(second.candidates[0].familyKey);
  const maximum = input.desiredWordCount ?? 6;
  const targetByWord = new Map<string, LearningItemFact>();
  const familyWords = selectedKeys.map(key => {
    const family = familyByKey.get(key);
    if (!family) return { key, family, demand: [], pool: [], blocker: "selected_family_missing" };
    const relevant = matched.filter(m => m.candidates.some(w => w.familyKey === key));
    if (relevant.some(m => m.candidates.length !== 1)) return { key, family, demand: [], pool: [], blocker: "ambiguous_target_meaning" };
    const demand = relevant.map(m => m.candidates[0]);
    const invalid = demand.find(word => latinRootWordBlocker(word, family));
    if (invalid) return { key, family, demand, pool: [], blocker: latinRootWordBlocker(invalid, family) };
    const pool = selectableWords.filter(word => word.familyKey === key && !demand.some(target => target.canonicalWordId === word.canonicalWordId) && !latinRootWordBlocker(word, family))
      .sort((a, b) => a.parts.length - b.parts.length || a.spelling.localeCompare(b.spelling));
    return { key, family, demand, pool: pool.filter(word => pool.filter(other => other.canonicalWordId === word.canonicalWordId).length === 1), blocker: null };
  });
  const invalid = familyWords.find(group => group.blocker);
  if (invalid) return blocked(invalid.family?.rootWordId ?? "*", invalid.blocker!);
  const available = familyWords.map(group => group.demand.length + group.pool.length);
  const desired = Math.min(maximum, available.reduce((sum, count) => sum + count, 0));
  if (desired < 5 || available.some(count => count < 2)) return blocked("*", "not_enough_reviewed_family_words");
  // Keep the two families balanced where possible, then use spare capacity in
  // either family. A family needs two examples, rather than five of its own.
  const limits = familyWords.length === 1 ? [desired] : [Math.min(Math.ceil(desired / 2), available[0]), 0];
  if (limits.length === 2) {
    limits[1] = Math.min(desired - limits[0], available[1]);
    limits[0] += desired - limits[0] - limits[1];
  }
  const selected: CanonicalLatinRootWord[] = [];
  for (const [index, group] of familyWords.entries()) {
    const demand = group.demand.slice(0, limits[index]);
    for (const word of demand) targetByWord.set(word.canonicalWordId, matched.find(m => m.target.canonicalWordId === word.canonicalWordId)!.target);
    selected.push(...demand, ...group.pool.slice(0, limits[index] - demand.length));
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
