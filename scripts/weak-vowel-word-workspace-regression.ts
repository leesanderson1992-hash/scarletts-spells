import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WeakVowelRouteEditor } from "../app/(authenticated)/admin/teaching-dictionary/weak-vowel-route-editor";
import { hydrateWorkspaceFacts } from "../lib/teaching-dictionary-manager/workspace-hydration";
import { weakVowelRouteBlockers, type WeakVowelRouteFactsV1 } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";
import type { WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";

const packageRows = JSON.parse(readFileSync("content/secret-life-of-vowels/weak-vowel-route-content-candidates.json", "utf8")) as {
  rows: { spelling: string; microSkillKey: string; routeContent: WordDraftPayload["routeContents"][number];
    sharedDefinition: { definition: string } }[];
};
const sample = packageRows.rows.find(row => row.spelling === "camera");
assert.ok(sample, "approved camera record should exist");
const sentence = "Mia put the camera carefully on the table.";
const current = { displayWord: sample.spelling, definition: sample.sharedDefinition.definition,
  dictationSentence: sentence, skillKeys: [sample.microSkillKey],
  routeContents: [sample.routeContent] } as WordDraftPayload;
const placeholder = { ...sample.routeContent, content: {} };
const hydrated = hydrateWorkspaceFacts({ current, initial: current, draftId: null, edited: false,
  skillKeys: [sample.microSkillKey], routeContents: [placeholder] });
assert.deepEqual(hydrated.routeContents[0], sample.routeContent,
  "generic group preflight must not erase published weak-vowel facts");
const facts = sample.routeContent.content.weakVowel as WeakVowelRouteFactsV1;
assert.deepEqual(weakVowelRouteBlockers(facts, { displayWord: sample.spelling,
  definition: sample.sharedDefinition.definition, dictationSentence: sentence,
  microSkillKey: sample.microSkillKey }), []);
const html = renderToStaticMarkup(React.createElement(WeakVowelRouteEditor, {
  skillKey: sample.microSkillKey, word: sample.spelling, sentence,
  facts, dictionaryFingerprint: "a".repeat(64), dictionarySyllables: "3", blockers: [], onChange: () => {},
}));
for (const label of ["Reviewed pronunciation ID", "Accepted cut positions", "Vowel letter selected in Dinner",
  "Sentence recording SHA-256", "Family exploration", "Activity eligibility"]) {
  assert.ok(html.includes(label), `missing structured field: ${label}`);
}
assert.ok(html.includes("44ecea36307dec5c"), "approved word recording hash should be populated");
const falseBinding = { ...facts, sentenceTarget: { start: 1, end: 3 } };
assert.ok(weakVowelRouteBlockers(falseBinding, { displayWord: "he", definition: "pronoun",
  dictationSentence: "the teacher waited", microSkillKey: sample.microSkillKey })
  .some(blocker => blocker.includes("exact span")), "a substring inside another word is not a valid sentence target");
const unreviewedSound = { ...facts, target: { ...facts.target, soundType: "" } };
assert.ok(weakVowelRouteBlockers(unreviewedSound, { displayWord: sample.spelling,
  definition: sample.sharedDefinition.definition, dictationSentence: sentence,
  microSkillKey: sample.microSkillKey }).some(blocker => blocker.includes("sound type")),
"choosing a target span must not implicitly approve schwa");
console.log("PASS: published facts survive hydration and structured weak-vowel fields are populated");
