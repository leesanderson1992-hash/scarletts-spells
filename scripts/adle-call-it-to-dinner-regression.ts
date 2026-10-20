import assert from "node:assert/strict";
import candidates from "../content/secret-life-of-vowels/dinner-preview-candidates.json";
import {
  DINNER_ACTIVITY_VERSION,
  DINNER_ROUND_VERSION,
  isDinnerCutPrefix,
  parseDinnerActivityConfig,
  parseDinnerRound,
  resolveDinnerForSelectedWords,
  scoreDinnerCuts,
  scoreDinnerTarget,
} from "../lib/adle/word-lab/call-it-to-dinner";
import { prepareDinnerForComposerSlots, WEAK_VOWEL_DINNER_CANDIDATE_RECIPE, WEAK_VOWEL_MICRO_SKILLS } from "../lib/adle/word-lab/weak-vowel-dinner";
import { compileWordLabSnapshot } from "../lib/adle/word-lab/compile-word-lab";
import type { WordLabSelectedWordV1 } from "../lib/adle/word-lab/contracts";

const fixture = parseDinnerActivityConfig(candidates, true);
assert.ok(fixture, "Four review candidates must validate for preview");
assert.equal(parseDinnerActivityConfig(candidates), null, "Candidates must never enter a live activity");
assert.equal(parseDinnerActivityConfig({ ...candidates, rounds: [candidates.rounds[0], { ...candidates.rounds[0], pronunciationId: "another-variant" }] }, true), null,
  "An assignment cannot contain two pronunciation variants for one word");
const byWord = Object.fromEntries(fixture.rounds.map((round) => [round.spelling, round]));
assert.equal(fixture.schemaVersion, DINNER_ACTIVITY_VERSION);
assert.equal(byWord.sofa.schemaVersion, DINNER_ROUND_VERSION);
assert.equal(byWord.sofa.target.text, "a");
assert.equal(byWord.dinner.target.text, "er");
assert.equal(scoreDinnerTarget(byWord.dinner, 4, 5), false, "A partial spelling group is incorrect");
assert.equal(scoreDinnerTarget(byWord.dinner, 4, 6), true);
assert.equal(scoreDinnerCuts(byWord.player, [4]), "correct");
assert.equal(byWord.player.spokenSyllableCount, 2);
assert.equal(scoreDinnerCuts(byWord.different, [3]), "wrong_count");
assert.equal(scoreDinnerCuts(byWord.different, [4, 6]), "wrong_boundaries");
assert.equal(scoreDinnerCuts(byWord.different, [3, 6]), "correct");
assert.equal(isDinnerCutPrefix(byWord.different, [3]), true, "A reviewed partial cut may precede another cut");
assert.equal(isDinnerCutPrefix(byWord.different, [6, 3]), true, "The child may make cuts in either order");
assert.equal(isDinnerCutPrefix(byWord.different, [4]), false, "A wrong gap is rejected immediately");
assert.equal(isDinnerCutPrefix(byWord.different, [3, 3]), false, "Repeated cuts cannot form a syllable pattern");
assert.equal(scoreDinnerCuts(byWord.different, [3, 3, 6]), "wrong_count");

const alternative = { ...byWord.dinner, acceptedCutSets: [[3], [4]], reviewStatus: "approved" as const, pronunciationId: "registered-dinner-uk-v1" };
assert.ok(parseDinnerRound(alternative));
assert.equal(scoreDinnerCuts(alternative, [4]), "correct", "Approved alternative cuts are accepted");
assert.equal(parseDinnerRound({ ...alternative, acceptedCutSets: [[5]] }), null, "A cut cannot split the target group");
assert.equal(parseDinnerRound({ ...alternative, spokenSyllableCount: 1 }), null, "Never invent a compressed syllable");
assert.equal(parseDinnerRound({ ...alternative, target: { ...alternative.target, start: 4, end: 6, text: "e" } }), null,
  "The reviewed spelling must match its full indexed span");

const published = [{ ...byWord.sofa, reviewStatus: "approved" as const, pronunciationId: "registered-sofa-uk-v1" }];
const selected = { canonicalWordId: byWord.sofa.canonicalWordId, spelling: byWord.sofa.spelling,
  microSkillKey: byWord.sofa.microSkillKey, assignmentStatus: "assigned", sourceFingerprint: byWord.sofa.sourceFingerprint,
  pronunciationId: "registered-sofa-uk-v1", wordSense: byWord.sofa.wordSense, recordingSha256: byWord.sofa.recording.sha256 };
assert.equal(resolveDinnerForSelectedWords([selected], published).ready.length, 1);
assert.equal(resolveDinnerForSelectedWords([{ ...selected, assignmentStatus: "deassigned" }], published).blockers[0].reason, "not_assigned");
assert.equal(resolveDinnerForSelectedWords([{ ...selected, sourceFingerprint: "0".repeat(64) }], published).blockers[0].reason, "dinner_source_changed");
assert.equal(resolveDinnerForSelectedWords([{ ...selected, canonicalWordId: "new-dictionary-word" }], published).blockers[0].reason, "dinner_content_not_approved");
assert.equal(resolveDinnerForSelectedWords([selected], []).ready.length, 0);
assert.equal(WEAK_VOWEL_MICRO_SKILLS.length, 8);
const composerSlots = [
  { canonicalWordId: byWord.dinner.canonicalWordId, provenance: "learning_item" as const, learningItemId: "demand-dinner", complexityLevel: 1 },
  { canonicalWordId: byWord.sofa.canonicalWordId, provenance: "stretch" as const, learningItemId: null, complexityLevel: 1 },
];
const prepared = prepareDinnerForComposerSlots({
  microSkillKey: byWord.dinner.microSkillKey,
  slots: composerSlots,
  currentAssignments: [{ ...selected, canonicalWordId: byWord.dinner.canonicalWordId, spelling: byWord.dinner.spelling,
    microSkillKey: byWord.dinner.microSkillKey, sourceFingerprint: byWord.dinner.sourceFingerprint,
    pronunciationId: "registered-dinner-uk-v1", wordSense: byWord.dinner.wordSense, recordingSha256: byWord.dinner.recording.sha256 }],
  publishedAnnotations: [{ ...byWord.dinner, reviewStatus: "approved", pronunciationId: "registered-dinner-uk-v1" }],
});
assert.deepEqual(prepared.readyWordIds, [byWord.dinner.canonicalWordId]);
assert.deepEqual(prepared.blockers, [{ canonicalWordId: byWord.sofa.canonicalWordId, reason: "assignment_missing" }]);

const fiveWords: WordLabSelectedWordV1[] = [byWord.sofa, byWord.dinner, byWord.player, byWord.different, {
  ...byWord.sofa, canonicalWordId: "new-pending-word", spelling: "pending",
}].map((round, index) => ({
  canonicalWordId: round.canonicalWordId, displayWord: round.spelling,
  roles: [index === 0 ? "authentic_target" : "transfer"], learningItemId: index === 0 ? "demand" : null,
  complexityBand: "band-1", contentRef: { sourceKey: round.canonicalWordId, sourceVersion: "v1" }, coverage: {},
}));
const snapshotConfig = { schemaVersion: DINNER_ACTIVITY_VERSION, rounds: [{ ...byWord.sofa, reviewStatus: "approved", pronunciationId: "registered-sofa-uk-v1" }] };
const compiled = compileWordLabSnapshot({
  assignmentId: "dinner-regression", childId: "child", assignmentDate: "2026-10-20", compiledAt: "2026-10-20T00:00:00.000Z",
  taxonomy: { familyKey: "D4_SCHWA", clusterKey: "D4_SCHWA_FINAL", microSkillKey: byWord.sofa.microSkillKey },
  recipe: WEAK_VOWEL_DINNER_CANDIDATE_RECIPE, selectedWords: fiveWords,
  assignmentItemIdsByActivityKey: { "call-it-to-dinner": ["guided-dinner-item"] },
  activityConfigsByKey: { "call-it-to-dinner": snapshotConfig },
  activityWordIdsByKey: { "call-it-to-dinner": [byWord.sofa.canonicalWordId] },
  content: { dictionaryReleaseIds: ["reviewed-dictionary"], profileKeys: ["weak-vowel"], profileVersions: ["v1"] },
  selectionPolicyVersion: "demand-first-v1", evidencePolicyVersion: "guided-v1",
});
assert.ok(compiled.ok, JSON.stringify(compiled));
assert.equal(compiled.snapshot.words.length, 5, "Unready demand remains in the lesson word snapshot");
assert.equal(compiled.snapshot.activities[0].wordSlotIds.length, 1, "Only Dinner-ready words enter Dinner");
snapshotConfig.rounds[0].spelling = "changed later";
assert.equal((compiled.snapshot.activities[0].config.rounds as { spelling: string }[])[0].spelling, "sofa", "Snapshot content is frozen");
console.log("Call It to Dinner contract, selection, cut and full-span regression passed.");
