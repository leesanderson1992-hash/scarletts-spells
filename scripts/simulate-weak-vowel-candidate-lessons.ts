import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareWeakVowelLesson } from "../lib/adle/weak-vowel/prepare";
import type { WeakVowelMicroSkill } from "../lib/adle/weak-vowel/lesson";
import { DINNER_ROUND_VERSION } from "../lib/adle/word-lab/call-it-to-dinner";
import { DETECTIVE_ROUND_VERSION } from "../lib/adle/word-lab/family-tree-detective";

const [candidatePath, sheetPath] = process.argv.slice(2);
assert(candidatePath && sheetPath, "Pass candidate package and reviewed Sheet snapshot paths.");
type Clip = { src: string; sha256: string };
type Fact = {
  sourceFingerprint: string; wordSense: string | null; pronunciationId: string;
  wordRecording: Clip; spokenSyllableCount: number; acceptedCutSets: number[][];
  target: { text: string; start: number; end: number; syllableIndex: number; soundType: "schwa" | "other_unstressed" };
  selectionTarget: { text: string; start: number; end: number }; detectiveVowelIndex: number;
  sentenceRecording: Clip; sentenceTarget: { start: number; end: number };
};
type Candidate = { canonicalWordId: string; spelling: string; microSkillKey: WeakVowelMicroSkill;
  sourceFingerprint: string; sharedDefinition: { definition: string };
  routeContent: { content: { weakVowel: Fact } } };
type SheetRow = { canonical_word_id: string; micro_skill_key: string; rhythm_sentence_text: string };
const candidates = JSON.parse(readFileSync(candidatePath, "utf8")) as { rows: Candidate[] };
const sheet = JSON.parse(readFileSync(sheetPath, "utf8")) as { rows: SheetRow[] };
const sentences = new Map(sheet.rows.map((row) => [`${row.canonical_word_id}|${row.micro_skill_key}`, row.rhythm_sentence_text]));
const grouped = Map.groupBy(candidates.rows, (row) => row.microSkillKey);
let simulated = 0;

function chunks<T>(rows: T[]): T[][] {
  const result: T[][] = [];
  for (let cursor = 0; cursor < rows.length;) {
    const remaining = rows.length - cursor;
    const size = remaining <= 6 ? remaining : remaining - 6 < 4 ? remaining - 4 : 6;
    assert(size >= 4 && size <= 6);
    result.push(rows.slice(cursor, cursor + size));
    cursor += size;
  }
  return result;
}

for (const [key, rows] of grouped) {
  for (const [number, group] of chunks(rows).entries()) {
    const slots = group.map((row, index) => ({ canonicalWordId: row.canonicalWordId,
      provenance: index === 0 ? "learning_item" as const : "stretch" as const,
      learningItemId: index === 0 ? `simulation:${row.canonicalWordId}` : null,
      complexityLevel: null }));
    const assignments = group.map((row) => ({ canonicalWordId: row.canonicalWordId, spelling: row.spelling,
      microSkillKey: key, wordSense: row.routeContent.content.weakVowel.wordSense,
      assignmentStatus: "assigned", sourceFingerprint: row.sourceFingerprint,
      pronunciationId: row.routeContent.content.weakVowel.pronunciationId,
      recordingSha256: row.routeContent.content.weakVowel.wordRecording.sha256 }));
    const dinner = group.map((row) => {
      const facts = row.routeContent.content.weakVowel;
      const ending = ["D4_SCHWA_FINAL_AR_FINAL", "D4_SCHWA_FINAL_ER_FINAL", "D4_SCHWA_FINAL_OR_FINAL"].includes(key);
      return { schemaVersion: DINNER_ROUND_VERSION, contentVersion: "candidate-simulation-v1",
        reviewStatus: "approved" as const, canonicalWordId: row.canonicalWordId, spelling: row.spelling,
        microSkillKey: key, wordSense: facts.wordSense, pronunciationId: facts.pronunciationId,
        sourceFingerprint: facts.sourceFingerprint, recording: { ...facts.wordRecording, reviewStatus: "approved" as const },
        spokenSyllableCount: facts.spokenSyllableCount, acceptedCutSets: facts.acceptedCutSets,
        target: facts.target, ...(ending ? { selectionTarget: facts.selectionTarget } : {}) };
    });
    const detective = group.map((row) => {
      const facts = row.routeContent.content.weakVowel;
      return { schemaVersion: DETECTIVE_ROUND_VERSION, contentVersion: "candidate-simulation-v1",
        reviewStatus: "approved" as const, canonicalWordId: row.canonicalWordId, spelling: row.spelling,
        microSkillKey: key, wordSense: facts.wordSense, pronunciationId: facts.pronunciationId,
        sourceFingerprint: facts.sourceFingerprint, recording: { ...facts.wordRecording, reviewStatus: "approved" as const },
        target: { text: facts.target.text, start: facts.target.start, end: facts.target.end,
          soundType: facts.target.soundType }, reviewedVowelIndex: facts.detectiveVowelIndex,
        family: null };
    });
    const publishedSentences = group.map((row) => {
      const facts = row.routeContent.content.weakVowel;
      const sentence = sentences.get(`${row.canonicalWordId}|${key}`);
      assert(sentence, `Missing sentence for ${row.spelling}`);
      return { canonicalWordId: row.canonicalWordId, microSkillKey: key,
        sourceFingerprint: facts.sourceFingerprint, sentence,
        targetStart: facts.sentenceTarget.start, targetEnd: facts.sentenceTarget.end,
        recording: { ...facts.sentenceRecording, reviewStatus: "approved" as const } };
    });
    const definitions = group.map((row) => ({ canonicalWordId: row.canonicalWordId,
      spelling: row.spelling, wordSense: row.routeContent.content.weakVowel.wordSense,
      text: row.sharedDefinition.definition, sourceFingerprint: row.sourceFingerprint,
      reviewStatus: "approved" as const }));
    const prepared = prepareWeakVowelLesson({ assignmentKey: `candidate-simulation:${key}:${number}`,
      contentVersion: "candidate-simulation-v1", microSkillKey: key, slots,
      currentDinnerAssignments: assignments, currentDetectiveAssignments: assignments,
      publishedDinnerAnnotations: dinner, publishedDetectiveAnnotations: detective,
      currentFamilyAuthorities: [], publishedSentences, currentDefinitions: definitions });
    assert.deepEqual(prepared.blockers, [], `${key} candidate group ${number}: ${JSON.stringify(prepared.blockers)}`);
    assert(prepared.lesson, `${key} candidate group ${number} did not compose`);
    assert.deepEqual(prepared.lesson.words.map((word) => word.canonicalWordId), slots.map((slot) => slot.canonicalWordId));
    simulated += prepared.lesson.words.length;
  }
}
assert.equal(simulated, candidates.rows.length);
console.log(`All ${simulated} candidate word–skill pairs composed into valid frozen lessons across ${grouped.size} skills. Family exploration was omitted in this required-activity simulation.`);
