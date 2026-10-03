import assert from "node:assert/strict";
import { ING_MICRO_SKILLS, ingStem, ingWordBlockers } from "../lib/adle/ing/contracts";
import { ingPreviewPool } from "../lib/adle/ing/preview-fixture";
import { compileIngLesson, selectIngWords, validateIngLesson } from "../lib/adle/ing/lesson";
import { initialIngScrabbleBoard, ingScrabbleSpelling, moveIngTile, validIngScrabbleBoard } from "../lib/adle/ing/scrabble";
import { initialIngProgress, ingProgressValid, ingProgressTransitionValid } from "../lib/adle/ing/progress";
import type { LearningItemFact } from "../lib/adle/learning-items";
import { isSpecialistSnapshotV3 } from "../lib/adle/composable-lesson/specialist-snapshot-v3-validator";

assert(isSpecialistSnapshotV3({ snapshotSchemaVersion: 3, route: { routeId: "ing_endings_word_lab" } }));

const itemsFor = (skill: typeof ING_MICRO_SKILLS[number], count: number): LearningItemFact[] => ingPreviewPool(skill).slice(0, count).map((word, index) => ({
  learningItemId: `item:${index}`, childId: "child", canonicalWordId: word.canonicalWordId, microSkillKey: skill,
  itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: `source:${index}`, sourceAttemptText: null,
  reteachPriority: false, ejectedOn: null, intakeOn: `2026-09-${String(10 + index).padStart(2, "0")}`, rowStatus: "active",
}));

let checks = 0;
for (const skill of ING_MICRO_SKILLS) {
  const pool = ingPreviewPool(skill);
  for (const queued of [1, 3, 6, 7]) {
    const selected = selectIngWords("child", skill, pool, itemsFor(skill, queued), true);
    assert(selected.ok); checks++;
    assert.equal(selected.words.length, 6); checks++;
    assert.equal(selected.queuedTargets.length, Math.min(queued, 6)); checks++;
    assert.deepEqual(selected.words.slice(0, Math.min(queued, 6)).map(word => word.canonicalWordId), pool.slice(0, Math.min(queued, 6)).map(word => word.canonicalWordId)); checks++;
    assert.equal(selected.deferredLearningItemIds.length, Math.max(0, queued - 6)); checks++;
    const lesson = compileIngLesson(selected, `fixture:${skill}:${queued}`, "dev_fixture");
    assert(validateIngLesson(lesson, true)); checks++;
    const forgedFill = { ...lesson, words: lesson.words.map((word, index) => index === 5 ? { ...word, learningItemId: "forged:fill" } : word) };
    if (lesson.queuedTargets.length < 6) { assert(!validateIngLesson(forgedFill, true)); checks++; }
    assert(ingProgressValid(initialIngProgress(lesson), lesson)); checks++;
    const firstWord = lesson.words[0];
    const initial = initialIngProgress(lesson);
    const covered = { ...initial, coverAttempts: { [firstWord.canonicalWordId]: firstWord.word } };
    assert(ingProgressTransitionValid(initial, covered, lesson)); checks++;
    assert(!ingProgressTransitionValid(covered, { ...covered, coverAttempts: { [firstWord.canonicalWordId]: "changed" } }, lesson)); checks++;
    const dictated = { ...covered, dictationValues: { [firstWord.canonicalWordId]: firstWord.word }, dictationChecked: [firstWord.canonicalWordId] };
    assert(ingProgressTransitionValid(covered, dictated, lesson)); checks++;
    assert(!ingProgressTransitionValid(dictated, { ...dictated, dictationValues: { [firstWord.canonicalWordId]: "changed" } }, lesson)); checks++;
    for (const index of [1, 3, 5]) {
      const word = lesson.words[index];
      let board = initialIngScrabbleBoard(word);
      assert(validIngScrabbleBoard(board, word)); checks++;
      assert.equal(board.tiles.filter(tile => tile.origin === "distractor").length, 3); checks++;
      let retained = 0;
      while (word.base[retained] && word.base[retained] === word.word[retained]) retained++;
      for (let i = retained; i < word.base.length; i++) board = moveIngTile(board, `base:${i}`, { kind: "bank" });
      for (let i = retained; i < word.word.length; i++) board = moveIngTile(board, `required:${i - retained}`, { kind: "slot", index: i });
      assert.equal(ingScrabbleSpelling(board), word.word); checks++;
      assert(validIngScrabbleBoard(board, word)); checks++;
    }
  }
  if (skill === "D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT") {
    const lesson = compileIngLesson(selectIngWords("child", skill, pool, itemsFor(skill, 1), true) as Extract<ReturnType<typeof selectIngWords>, { ok: true }>, "fixture:double:gold", "dev_fixture");
    const boxes = lesson.teaching.pages[1].sections ?? [];
    assert.equal(boxes.length, 2); checks++;
    assert(boxes.every(box => box.tone === "gold" && box.examples?.length === 2)); checks++;
    assert.match(boxes[0].heading ?? "", /rule 1/i); checks++;
    assert.match(boxes[1].heading ?? "", /rule 2/i); checks++;
    const stressed = { ...pool[0], canonicalWordId: "fixture:stressed", base: "admit", word: "admitting", dictationSentence: "He is admitting that he made a mistake.", audioText: "He is admitting that he made a mistake.", doublingPattern: "stressed_final_syllable" as const };
    assert.deepEqual(ingWordBlockers(stressed, true), []); checks++;
    assert(ingWordBlockers({ ...stressed, doublingPattern: undefined }, true).includes("doubling_condition_invalid")); checks++;
  }
  const missing = selectIngWords("child", skill, pool.slice(0, 5), itemsFor(skill, 1), true);
  assert.deepEqual(missing, { ok: false, blockers: ["six_approved_words_required"] }); checks++;
  const noDemand = selectIngWords("child", skill, pool, [], true);
  assert.deepEqual(noDemand, { ok: false, blockers: ["no_pending_learning_word"] }); checks++;
  for (const word of pool) { assert.equal(`${ingStem(word.base, lessonRule(skill))}ing`, word.word); checks++; }
}
function lessonRule(skill: typeof ING_MICRO_SKILLS[number]) {
  return ({ D4_INF_ING_ENDINGS_REGULAR: "regular", D4_INF_ING_ENDINGS_DROP_E: "drop_e", D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT: "double_final_consonant", D4_INF_ING_ENDINGS_IE_TO_Y: "ie_to_y" } as const)[skill];
}
console.log(`PASS: -ing selection, frozen lesson, four rules and Scrabble tile inventory (${checks} checks)`);
