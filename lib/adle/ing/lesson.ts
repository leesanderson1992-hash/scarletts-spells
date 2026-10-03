import { selectableLearningItems, type LearningItemFact } from "../learning-items";
import { COMPARATIVE_REFLECTION_PROMPT } from "../inflection/content";
import { ING_MICRO_SKILLS, ING_ROUTE_KEY, ING_RULE_FOR_SKILL, ingStem, ingWordBlockers, type IngDictionaryWordV1, type IngLessonV1, type IngMicroSkill, type IngRule, type IngSelectionResult } from "./contracts";

export const ING_RULE_COPY: Record<IngRule, { title: string; explanation: string; example: string }> = {
  regular: { title: "Keep the base word", explanation: "These verbs keep every letter. Add -ing to the end.", example: "jump + ing = jumping" },
  drop_e: { title: "Drop the final e", explanation: "When this verb ends in a silent e, drop the e before adding -ing.", example: "make → mak + ing = making" },
  double_final_consonant: { title: "Double the final consonant", explanation: "There are two times we double before adding -ing: after a short vowel in a short CVC word, or at the end of a longer word when its final syllable is stressed.", example: "hop → hopping · admit → admitting" },
  ie_to_y: { title: "Change ie to y", explanation: "When this verb ends in ie, change ie to y, then add -ing.", example: "lie → ly + ing = lying" },
};

/** Queue priority is the existing ADLE selectable order. Unselected demand stays queued. */
export function selectIngWords(childId: string, microSkillKey: IngMicroSkill, pool: readonly IngDictionaryWordV1[], learningItems: readonly LearningItemFact[], fixture = false): IngSelectionResult {
  if (!ING_MICRO_SKILLS.includes(microSkillKey)) return { ok: false, blockers: ["unsupported_micro_skill"] };
  const queue = selectableLearningItems(learningItems).filter(item => item.childId === childId && item.microSkillKey === microSkillKey && item.sourceKind !== "stretch_selection");
  if (!queue.length) return { ok: false, blockers: ["no_pending_learning_word"] };
  const approved = pool.filter(word => word.microSkillKey === microSkillKey && ingWordBlockers(word, fixture).length === 0);
  if (new Set(approved.map(word => word.canonicalWordId)).size !== approved.length || new Set(approved.map(word => word.word)).size !== approved.length) return { ok: false, blockers: ["approved_word_pool_not_distinct"] };
  const byId = new Map(approved.map(word => [word.canonicalWordId, word]));
  const selectedQueue = queue.slice(0, 6);
  if (selectedQueue.some(item => !byId.has(item.canonicalWordId))) return { ok: false, blockers: ["queued_word_content_missing"] };
  if (new Set(selectedQueue.map(item => item.canonicalWordId)).size !== selectedQueue.length) return { ok: false, blockers: ["duplicate_queued_word"] };
  const selectedIds = new Set(selectedQueue.map(item => item.canonicalWordId));
  const fill = approved.filter(word => !selectedIds.has(word.canonicalWordId)).sort((a, b) => a.word.localeCompare(b.word, "en-GB") || a.canonicalWordId.localeCompare(b.canonicalWordId)).slice(0, 6 - selectedQueue.length);
  if (selectedQueue.length + fill.length !== 6) return { ok: false, blockers: ["six_approved_words_required"] };
  const words = [...selectedQueue.map(item => ({ ...byId.get(item.canonicalWordId)!, learningItemId: item.learningItemId })), ...fill.map(word => ({ ...word, learningItemId: null }))];
  return { ok: true, words, queuedTargets: selectedQueue.map(item => ({ canonicalWordId: item.canonicalWordId, learningItemId: item.learningItemId })), deferredLearningItemIds: queue.slice(6).map(item => item.learningItemId) };
}

export function compileIngLesson(selection: Extract<IngSelectionResult, { ok: true }>, assignmentKey: string, authority: IngLessonV1["authority"] = "reviewed_content"): IngLessonV1 {
  if (!assignmentKey || selection.words.length !== 6 || !selection.queuedTargets.length) throw new Error("ing_lesson_selection_invalid");
  const microSkillKey = selection.words[0].microSkillKey;
  const rule = ING_RULE_FOR_SKILL[microSkillKey];
  if (selection.words.some(word => word.microSkillKey !== microSkillKey || ingWordBlockers(word, authority === "dev_fixture").length)) throw new Error("ing_lesson_content_invalid");
  const teaching: IngLessonV1["teaching"] = {
    pages: [
      { id: "why-ing", type: "teaching", title: "Why do we add -ing to words?", paragraphs: ["A verb is an action word, like jump or play. Add -ing to talk about an action happening now or continuing at a particular time.", "We often use an -ing word after am, is, are, was or were. Was and were can describe an action that was happening in the past."], callout: "I am jumping. She is reading. They are playing.", sections: [{ heading: "Notice the helper word", paragraphs: ["‘I jumping’ is missing am. ‘I jump’ can be correct, but it does not say I am jumping right now."] }] },
      rule === "double_final_consonant"
        ? { id: "ing-rule", type: "teaching", title: "When do we double the final consonant?", paragraphs: ["There are two spelling patterns for doubling before -ing. Look at both before you build the new word."], sections: [
          { tone: "gold", heading: "Doubling rule 1 — short CVC words", paragraphs: ["When a short word ends consonant + vowel + consonant, double its final consonant before adding -ing."], examples: [{ text: "hop → hopping" }, { text: "run → running" }] },
          { tone: "gold", heading: "Doubling rule 2 — stressed final syllables", paragraphs: ["In a longer word, double the final consonant before adding -ing when the final syllable is stressed."], examples: [{ text: "admit → admitting" }, { text: "forget → forgetting" }] },
        ] }
        : { id: "ing-rule", type: "teaching", title: ING_RULE_COPY[rule].title, paragraphs: [ING_RULE_COPY[rule].explanation], callout: ING_RULE_COPY[rule].example, examples: selection.words.slice(0, 3).map(word => ({ text: `${word.base} → ${word.word}`, explanation: word.meaning })) },
    ],
    meetWords: { title: "Today's six words", introduction: "Read each action word and its base verb.", words: selection.words.map(word => ({ id: word.canonicalWordId, word: word.word, label: `from ${word.base}`, detail: word.meaning })) },
  };
  return JSON.parse(JSON.stringify({ schemaVersion: 1, routeKey: ING_ROUTE_KEY, assignmentKey, authority, microSkillKey, rule, words: selection.words, queuedTargets: selection.queuedTargets, deferredLearningItemIds: selection.deferredLearningItemIds, teaching, reflectionPrompt: COMPARATIVE_REFLECTION_PROMPT })) as IngLessonV1;
}

export function validateIngLesson(value: unknown, fixture = false): value is IngLessonV1 {
  if (!value || typeof value !== "object") return false;
  const lesson = value as IngLessonV1;
  try {
    if (lesson.schemaVersion !== 1 || lesson.routeKey !== ING_ROUTE_KEY || !lesson.assignmentKey || !ING_MICRO_SKILLS.includes(lesson.microSkillKey)
      || lesson.rule !== ING_RULE_FOR_SKILL[lesson.microSkillKey] || !["reviewed_content", ...(fixture ? ["dev_fixture"] : [])].includes(lesson.authority)
      || !Array.isArray(lesson.words) || lesson.words.length !== 6 || new Set(lesson.words.map(w => w.canonicalWordId)).size !== 6 || new Set(lesson.words.map(w => w.word)).size !== 6
      || lesson.words.some(w => w.microSkillKey !== lesson.microSkillKey || ingWordBlockers(w, lesson.authority === "dev_fixture").length)
      || !Array.isArray(lesson.queuedTargets) || lesson.queuedTargets.length < 1 || lesson.queuedTargets.length > 6
      || new Set(lesson.queuedTargets.map(t => t.canonicalWordId)).size !== lesson.queuedTargets.length
      || lesson.queuedTargets.some(t => !t.learningItemId || !lesson.words.some(w => w.canonicalWordId === t.canonicalWordId && w.learningItemId === t.learningItemId))
      || lesson.words.some(w => (w.learningItemId !== null) !== lesson.queuedTargets.some(t => t.canonicalWordId === w.canonicalWordId && t.learningItemId === w.learningItemId))
      || !Array.isArray(lesson.deferredLearningItemIds) || !lesson.teaching || lesson.teaching.pages.length !== 2 || lesson.teaching.pages[0]?.id !== "why-ing" || lesson.teaching.pages[1]?.id !== "ing-rule" || lesson.teaching.meetWords.words.length !== 6
      || !lesson.reflectionPrompt?.trim()) return false;
    const selected = { ok: true as const, words: lesson.words, queuedTargets: lesson.queuedTargets, deferredLearningItemIds: lesson.deferredLearningItemIds };
    const expected = compileIngLesson(selected, lesson.assignmentKey, lesson.authority);
    return JSON.stringify(lesson.teaching.meetWords) === JSON.stringify(expected.teaching.meetWords)
      && lesson.teaching.pages.every(page => !!page.title?.trim())
      && JSON.stringify({ ...expected, teaching: lesson.teaching, reflectionPrompt: lesson.reflectionPrompt }) === JSON.stringify(lesson);
  } catch { return false; }
}

export function ingTransformation(word: IngLessonV1["words"][number]) {
  const rule = ING_RULE_FOR_SKILL[word.microSkillKey];
  return { base: word.base, stem: ingStem(word.base, rule), ending: "ing" as const, result: word.word, explanation: ING_RULE_COPY[rule].explanation };
}
