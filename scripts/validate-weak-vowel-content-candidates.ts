import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

const [packagePath, sheetPath] = process.argv.slice(2);
assert(packagePath && sheetPath, "Pass the candidate package and reviewed Sheet snapshot paths.");
type Row = { canonical_word_id: string; micro_skill_key: string; rhythm_sentence_text: string };
const sheet = JSON.parse(readFileSync(sheetPath, "utf8")) as { rows: Row[] };
const packageData = JSON.parse(readFileSync(packagePath, "utf8")) as {
  reviewStatus: string;
  assignedPairCount: number;
  rows: Array<{ canonicalWordId: string; spelling: string; microSkillKey: string;
    sharedDefinition: { definition: string }; routeContent: { content: { weakVowel: unknown } } }>;
};
assert.equal(packageData.reviewStatus, "candidate", "Compiler cannot approve its own facts.");
assert.equal(packageData.rows.length, packageData.assignedPairCount);
const source = new Map(sheet.rows.map((row) => [`${row.canonical_word_id}|${row.micro_skill_key}`, row]));
const failures = packageData.rows.flatMap((row) => {
  const recorded = source.get(`${row.canonicalWordId}|${row.microSkillKey}`);
  if (!recorded) return [{ word: row.spelling, microSkillKey: row.microSkillKey, blockers: ["SOURCE_PAIR_MISSING"] }];
  const blockers = weakVowelRouteBlockers(row.routeContent.content.weakVowel, {
    displayWord: row.spelling,
    dictationSentence: recorded.rhythm_sentence_text,
    definition: row.sharedDefinition.definition,
    microSkillKey: row.microSkillKey,
  });
  return blockers.length ? [{ word: row.spelling, microSkillKey: row.microSkillKey, blockers }] : [];
});
if (failures.length) {
  console.error(JSON.stringify(failures.slice(0, 20), null, 2));
  throw new Error(`${failures.length} candidate rows failed the route fact contract`);
}
console.log(`All ${packageData.rows.length} candidate rows satisfy the weak-vowel route-fact schema. Governed publication remains required.`);
