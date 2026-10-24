import assert from "node:assert/strict";
import { APPROVED_CONVERGENCE_LESSONS, buildConvergenceLessonForSets, buildConvergencePreview } from "../lib/adle/homophone/convergence-preview";
import { convergenceTeachingConfig } from "../lib/adle/homophone/convergence-teaching";

assert.equal(APPROVED_CONVERGENCE_LESSONS.length, 58);
let variants = 0;
const coveredSets = new Set<string>();
const pairScopedKeys = new Set([
  "D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS",
  "D4_HOM_CONFUSABLE_WORDS_SE_SY_CE_CY",
  "D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T",
]);
for (const source of APPROVED_CONVERGENCE_LESSONS) {
  const selectedInReverse = source.sets.slice(0, 3).map(set => set.setKey).reverse();
  const frozen = buildConvergenceLessonForSets(source.microSkillKey, selectedInReverse);
  assert.deepEqual(frozen.selectedSetKeys, selectedInReverse);
  assert.deepEqual(frozen.snapshot.lesson.contrastSets?.map(set => set.setKey), selectedInReverse);
  assert.throws(() => buildConvergenceLessonForSets(source.microSkillKey, [selectedInReverse[0], selectedInReverse[0]]),
    /selected_sets_invalid/);
  for (let rotation = 0; rotation < Math.ceil(source.sets.length / 3); rotation++) {
    const preview = buildConvergencePreview(source.microSkillKey, rotation);
    variants++;
    assert.ok(preview.selectedSetKeys.length >= 1 && preview.selectedSetKeys.length <= 3);
    for (const key of preview.selectedSetKeys) coveredSets.add(key);
    const selected = source.sets.filter(set => preview.selectedSetKeys.includes(set.setKey));
    const words = selected.flatMap(set => set.members.map(member => member.word));
    const teaching = convergenceTeachingConfig(preview.snapshot.lesson);
    assert.deepEqual(teaching.homophone?.groups.map(group => group.words.map(word => word.word).sort()),
      selected.map(set => set.members.map(member => member.word).sort()));
    assert.ok(teaching.homophone?.groups.every(group => group.words.every(word => word.definition && word.cheatCode)));
    assert.equal(teaching.pages.length, pairScopedKeys.has(source.microSkillKey) ? 2 : 1);
    assert.deepEqual(preview.snapshot.lesson.words.map(member => member.word), words);
    assert.ok(preview.questions.length >= words.length);
    assert.deepEqual(new Set(preview.questions.map(question => question.word)), new Set(words));
    assert.ok(preview.snapshot.lesson.binSort.every(item => item.sentence.includes("____")));
    assert.ok(preview.snapshot.lesson.balloonPrompts.every(item => item.sentence.includes("____")));
    if (pairScopedKeys.has(source.microSkillKey)) {
      assert.deepEqual(preview.snapshot.lesson.contrastSets,
        selected.map(set => ({ setKey: set.setKey, members: set.members.map(member => member.word) })));
      for (const prompt of [...preview.snapshot.lesson.binSort, ...preview.snapshot.lesson.balloonPrompts]) {
        const pair = selected.find(set => set.setKey === prompt.setKey)?.members.map(member => member.word);
        assert.equal(pair?.length, 2);
        assert.ok(pair?.includes(prompt.answer));
      }
    }
    assert.equal(preview.snapshot.lesson.binSort.length + preview.snapshot.lesson.balloonPrompts.length,
      selected.reduce((count, set) => count + set.shortSentences.length, 0));
    assert.ok(preview.snapshot.lesson.dictationPassages.every(passage => passage.targets[0] !== passage.targets[1]));
  }
}
assert.equal(coveredSets.size, 74);
console.log(JSON.stringify({ valid: true, lessons: APPROVED_CONVERGENCE_LESSONS.length,
  reviewVariants: variants, reviewedSets: coveredSets.size }));
