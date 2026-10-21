import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { prepareLessonFromPublishedWeakVowelWords, type PublishedWeakVowelWord } from "../lib/adle/weak-vowel/governed-content";
import { compileWeakVowelSnapshotV3, validateWeakVowelSnapshotV3 } from "../lib/adle/weak-vowel/snapshot";
import { initialWeakVowelProgress, weakVowelProgressTransitionValid, weakVowelReadyToFinish } from "../lib/adle/weak-vowel/progress";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";

const candidates = JSON.parse(readFileSync("content/secret-life-of-vowels/weak-vowel-route-content-candidates.json", "utf8")) as {
  rows: Array<PublishedWeakVowelWord & { sharedDefinition: { definition: string } }>;
};
const sheet = JSON.parse(readFileSync("content/secret-life-of-vowels/reviewed-sheet-snapshot.json", "utf8")) as {
  rows: Array<{ canonical_word_id: string; micro_skill_key: string; rhythm_sentence_text: string }>;
};
const sentences = new Map(sheet.rows.map((row) => [`${row.canonical_word_id}|${row.micro_skill_key}`, row.rhythm_sentence_text]));
const source = candidates.rows.filter((row) => row.microSkillKey === "D4_SCHWA_FINAL_A_FINAL").slice(0, 4);
assert.equal(source.length, 4);
const published: PublishedWeakVowelWord[] = source.map((row, index) => ({
  ...row, contentVersionId: `publication-${index}`, definition: row.sharedDefinition.definition,
  contentSha256AtPublication: fingerprintSnapshotValue(row.routeContent),
  sentence: sentences.get(`${row.canonicalWordId}|${row.microSkillKey}`)!,
  dictionaryFingerprintAtReview: `fingerprint-${index}`,
  currentDictionaryFingerprint: `fingerprint-${index}`,
  wordAudioSha256AtPublication: row.routeContent.content.weakVowel.wordRecording.sha256,
  sentenceAudioSha256AtPublication: row.routeContent.content.weakVowel.sentenceRecording.sha256,
}));
const slots = published.map((row, index) => ({ canonicalWordId: row.canonicalWordId,
  provenance: index === 0 ? "learning_item" as const : "stretch" as const,
  learningItemId: index === 0 ? `demand-${index}` : null, complexityLevel: null }));
const currentAssignedPairs = published.map((row) => ({ canonicalWordId: row.canonicalWordId,
  microSkillKey: row.microSkillKey, assignmentStatus: "assigned" as const }));
const input = { assignmentKey: "frozen-governed-test",
  microSkillKey: "D4_SCHWA_FINAL_A_FINAL" as const, slots, currentAssignedPairs,
  published, currentFamilyAuthorities: [] };
const ready = prepareLessonFromPublishedWeakVowelWords(input);
assert.deepEqual(ready.blockers, []);
assert(ready.lesson);
assert.deepEqual(ready.lesson.words.map((row) => row.canonicalWordId), slots.map((row) => row.canonicalWordId));
assert.equal(ready.lesson.words[0].provenance, "learning_item");
assert.match(ready.lesson.contentVersion, /^weak_vowel_selected_v1:[a-f0-9]{64}$/);
const release = { activationRevisionId: "revision-1", releaseManifestId: "manifest-1",
  releaseKey: "weak-vowel-test", releaseManifestSha256: "a".repeat(64), dependencyFingerprint: "b".repeat(64) };
const { header, items, snapshot } = compileWeakVowelSnapshotV3({ lesson: ready.lesson, release,
  contentAuthorities: [
    { authorityType: "release_manifest", authorityId: release.releaseManifestId, version: "2", sourceHash: release.releaseManifestSha256 },
    { authorityType: "activation_revision", authorityId: release.activationRevisionId, version: "2", sourceHash: "c".repeat(64) },
    { authorityType: "dependency_set", authorityId: release.releaseManifestId, version: "2", sourceHash: release.dependencyFingerprint },
    ...published.map((word) => ({ authorityType: "teaching_content" as const, authorityId: word.contentVersionId,
      version: "1", sourceHash: word.contentSha256AtPublication })),
  ], childId: "child-1", parentUserId: "parent-1", date: "2026-10-21" });
assert.equal(items.length, 17);
assert.equal(snapshot.payload.resolvedLesson.words.length, 4);
assert.deepEqual(snapshot.words.map((word) => word.lineageKind),
  ["authentic_target", "transfer", "transfer", "transfer"]);
assert.equal(validateWeakVowelSnapshotV3(snapshot, { lessonRouteMetadata: header.lessonRouteMetadata,
  assignmentGenerationSource: header.assignmentGenerationSource,
  items: items.map((item) => ({ ...item, sectionKey: item.metadata.sectionKey,
    canonicalWordId: item.metadata.canonicalWordId })) }).ok, true);
const emitIndex = process.argv.indexOf("--emit-snapshot");
if (emitIndex >= 0) writeFileSync(process.argv[emitIndex + 1], `${JSON.stringify(snapshot)}\n`);
assert.equal(validateWeakVowelSnapshotV3({ ...snapshot, payload: { ...snapshot.payload,
  resolvedLesson: { ...snapshot.payload.resolvedLesson, words: snapshot.payload.resolvedLesson.words.slice(1) } } }).ok, false);
const initial = initialWeakVowelProgress(ready.lesson);
const firstId = ready.lesson.words[0].canonicalWordId;
const frozen = { ...initial, coverAttempts: { [firstId]: "first hidden spelling" },
  dictationAttempts: { [firstId]: "first sentence" }, dictationChecked: [firstId] };
assert.equal(weakVowelProgressTransitionValid(initial, frozen, ready.lesson), true);
assert.equal(weakVowelProgressTransitionValid(frozen, { ...frozen,
  coverAttempts: { [firstId]: "revealed correction" } }, ready.lesson), false);
assert.equal(weakVowelProgressTransitionValid(frozen, { ...frozen,
  dictationAttempts: { [firstId]: "revealed correction" } }, ready.lesson), false);
assert.equal(weakVowelReadyToFinish({ ...frozen, stageId: "reflection", reflection: "My clue",
  dinnerResponse: { guided: true, words: [] }, detectiveResponse: { guided: true, words: [] } }, ready.lesson), false);

const stale = prepareLessonFromPublishedWeakVowelWords({ ...input, published: [
  { ...published[0], currentDictionaryFingerprint: "changed" }, ...published.slice(1),
] });
assert.equal(stale.lesson, null);
assert.deepEqual(stale.blockers, [{ canonicalWordId: published[0].canonicalWordId,
  reason: "published_content_or_dictionary_source_changed" }]);

const deassigned = prepareLessonFromPublishedWeakVowelWords({ ...input, currentAssignedPairs: [
  { ...currentAssignedPairs[0], assignmentStatus: "deassigned" }, ...currentAssignedPairs.slice(1),
] });
assert.equal(deassigned.lesson, null);
assert.equal(deassigned.blockers[0].reason, "word_skill_pair_not_currently_assigned");

const missing = prepareLessonFromPublishedWeakVowelWords({ ...input, published: published.slice(1) });
assert.equal(missing.lesson, null);
assert.deepEqual(missing.blockers, [{ canonicalWordId: published[0].canonicalWordId,
  reason: "required_route_content_unpublished" }]);
console.log("PASS: published weak-vowel content freezes selected demand words and blocks stale, deassigned and unpublished pairs");
