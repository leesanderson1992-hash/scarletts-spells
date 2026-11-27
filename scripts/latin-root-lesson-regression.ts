import assert from "node:assert/strict";
import { validateLatinRootLesson } from "../lib/adle/morphology/latin-root-lesson";
import { latinRootPreviewContent } from "../lib/adle/morphology/latin-root-preview-fixture";
for (const families of [1, 2] as const) for (const count of [5, 6] as const) validateLatinRootLesson(latinRootPreviewContent(families, count));
const changed = (edit: (content: ReturnType<typeof latinRootPreviewContent>) => void) => { const content = structuredClone(latinRootPreviewContent(2, 6)); edit(content); return content; };
assert.throws(() => validateLatinRootLesson(changed(content => { content.families[0].words.splice(0, 2); })), /five or six words/);
assert.throws(() => validateLatinRootLesson(changed(content => { content.families[1].words[2].parentWordId = "transport"; })), /same root family/);
assert.throws(() => validateLatinRootLesson(changed(content => { content.families[1].words[0].parentWordId = "construction"; })), /same root family/);
assert.throws(() => validateLatinRootLesson(changed(content => { content.families[1].words[0].id = "transport"; })), /Duplicate/);
assert.throws(() => validateLatinRootLesson(changed(content => { content.families[1].words[0].parts = content.families[0].words[0].parts; })), /facts/);
assert.throws(() => validateLatinRootLesson(changed(content => { content.families[0].words[0].sentence = "A missing target token."; })), /facts/);
console.log("Latin root lesson contract: all four capacities and malformed/cross-family branches passed.");

import { latinRootTreeBuildModel } from "../lib/adle/morphology/latin-root-tree-build";
import { orderedBuildTargetIsCorrect, normaliseOrderedBuildSnapshot } from "../components/adle/activities/shared/ordered-build-engine";
const family = latinRootPreviewContent(2, 6).families[1];
const model = latinRootTreeBuildModel(family);
assert(!model.pieces.some(piece => piece.text === family.root));
const construction = model.targets.find(target => target.id === "construction")!;
const otherCon = model.pieces.find(piece => piece.id === "construct:0")!;
assert(orderedBuildTargetIsCorrect(construction, [otherCon.id, "construction:2"]), "Equivalent con copies must be interchangeable");
assert(!orderedBuildTargetIsCorrect(construction, ["construction:2", otherCon.id]), "Order still matters");
const restored = normaliseOrderedBuildSnapshot(model.targets, model.pieces.map(piece => piece.id), { placements: { construction: [otherCon.id, "construction:2"] }, completedTargetIds: ["construction"] });
assert.deepEqual(restored.completedTargetIds, ["construction"]);
console.log("Root tree builder: fixed roots, equivalent affixes, ordering and restored builds passed.");

import { latinRootReflectionModel } from "../lib/adle/morphology/latin-root-reflection";
const reflectionWords = latinRootPreviewContent(1, 5).families[0].words;
let reflection = latinRootReflectionModel(reflectionWords, { transport: "transprot" }, { portable: "The portabel lamp fits in my bag." });
assert.deepEqual(reflection.mistakes.map(mistake => mistake.id), ["cover:transport", "dictation:portable"]);
assert.equal(reflection.mistakes[1].attempt, "portabel");
reflection = latinRootReflectionModel(reflectionWords, {}, { transport: "We can transport the boxes by train.", portable: "The portable lamp fits in my bag" });
assert.equal(reflection.mistakes.length, 0, "Inserted context and missing punctuation must not invent target spelling mistakes");
assert.equal(reflection.sentenceComparisons.length, 2);
assert.equal(latinRootReflectionModel(reflectionWords, {}, {}).mistakes.length, 0, "Unsubmitted attempts are not mistakes");
reflection = latinRootReflectionModel(reflectionWords, {}, { transport: "We the boxes by train." });
assert.equal(reflection.mistakes[0].attempt, "", "Omitted target is recorded as omitted, not the following word");
console.log("Root reflection: cover/dictation mistakes, aligned tokens, context-only differences and omitted targets passed.");

import { latinRootWordSums, LATIN_ROOT_INTRO_GUIDE } from "../lib/adle/morphology/latin-root-introduction";
for (const familyCount of [1, 2] as const) {
  const content = latinRootPreviewContent(familyCount, 6);
  const examples = latinRootWordSums(content);
  for (const word of ["deport", "report", "porter"]) assert(examples.some(item => item.word === word));
  assert.equal(new Set(examples.map(item => item.word)).size, examples.length);
  for (const example of examples) {
    assert.equal(example.parts.map(part => part.text).join(""), example.word);
    assert(example.parts.every(part => part.meaning.length));
    assert(example.meaning.length);
  }
  assert.equal(content.families.flatMap(family => family.words).length, 6, "Introduction examples do not increase assessed words");
}
assert(!/lumos/i.test(LATIN_ROOT_INTRO_GUIDE[2]));
assert(!/expelliarmus/i.test(LATIN_ROOT_INTRO_GUIDE[4]));
console.log("Root introduction: word sums, meanings, added examples, unique words and hidden answers passed.");
