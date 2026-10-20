import assert from "node:assert/strict";
import {
  DETECTIVE_ROUND_VERSION, correctVowelTile, maskedDetectiveWord, parseDetectiveRound,
  resolveDetectiveForSelectedWords, toggleDetectiveClue, type DetectiveRoundV1,
} from "../lib/adle/word-lab/family-tree-detective";
import { currentDetectiveFamiliesFromAuthority, detectiveFamilyFromAuthority, prepareDetectiveForComposerSlots } from "../lib/adle/word-lab/weak-vowel-detective";
import { compileWeakVowelDetectiveCandidate } from "../lib/adle/word-lab/weak-vowel-detective-compiler";
import type { BaseWordFamilyAuthorityProjectionV2 } from "../lib/adle/curriculum-release-activation";

const hash = "a".repeat(64);
const recording = { src: "/audio/word.mp3", sha256: "b".repeat(64), reviewStatus: "approved" as const };
const base: DetectiveRoundV1 = {
  schemaVersion: DETECTIVE_ROUND_VERSION,
  contentVersion: "reviewed-v1", reviewStatus: "approved",
  canonicalWordId: "dinner-id", spelling: "dinner", microSkillKey: "D4_SCHWA_FINAL_ER_FINAL",
  wordSense: null, pronunciationId: "dinner-uk-v1", sourceFingerprint: hash, recording,
  target: { start: 4, end: 6, text: "er", soundType: "schwa" }, reviewedVowelIndex: null,
  family: null,
};

assert.equal(maskedDetectiveWord(base), "dinn_r");
assert.equal(correctVowelTile(base), "E");
assert.ok(parseDetectiveRound(base));
assert.equal(parseDetectiveRound({ ...base, spelling: "diner" }), null);
assert.equal(parseDetectiveRound({ ...base, target: { ...base.target, start: 0, end: 6, text: "dinner" } }), null);
assert.equal(parseDetectiveRound({ ...base, spelling: "bicycle", target: { start: 3, end: 4, text: "y", soundType: "other_unstressed" } }), null);
assert.equal(parseDetectiveRound({ ...base, spelling: "brochure", target: { start: 5, end: 8, text: "ure", soundType: "schwa" } }), null);
assert.ok(parseDetectiveRound({ ...base, spelling: "brochure", target: { start: 5, end: 8, text: "ure", soundType: "schwa" }, reviewedVowelIndex: 5 }));
assert.deepEqual(toggleDetectiveClue(["clearer_sound"], "same_spelling"), ["clearer_sound", "same_spelling"]);
assert.deepEqual(toggleDetectiveClue(["clearer_sound", "same_spelling"], "no_helpful_clue"), ["no_helpful_clue"]);
assert.deepEqual(toggleDetectiveClue(["no_helpful_clue"], "meaningful_part"), ["meaningful_part"]);

const family = {
  authorityId: "family-id", sourceFingerprint: "c".repeat(64), reviewStatus: "approved" as const,
  name: "dine", explanation: "Dinner belongs to the dine family.",
  members: [
    { canonicalWordId: "dinner-id", spelling: "dinner", recording, morphologyNote: null, alignedVowelSpan: null },
    { canonicalWordId: "dine-id", spelling: "dine", recording: null, morphologyNote: null, alignedVowelSpan: null },
  ],
};
const withFamily = { ...base, family };
assert.ok(parseDetectiveRound(withFamily)); // A relative without audio may still be explored visually.
assert.equal(parseDetectiveRound({ ...base, family: { ...family, members: [family.members[0]] } }), null);
const authority = { schemaVersion: 2, skillClusterKey: "D4_MOR_BASE_WORDS", sourceAuthorities: [],
  families: [{ familyId: "family-id", sourceFingerprint: family.sourceFingerprint, baseWordId: "dine-id",
    members: [{ canonicalWordId: "dinner-id", assignmentEligible: true }, { canonicalWordId: "dine-id", assignmentEligible: true }] }],
} as unknown as BaseWordFamilyAuthorityProjectionV2;
assert.deepEqual(currentDetectiveFamiliesFromAuthority(authority)[0].memberWordIds, ["dinner-id", "dine-id"]);
const derived = detectiveFamilyFromAuthority({ authority, targetWordId: "dinner-id",
  words: [{ canonicalWordId: "dinner-id", spelling: "dinner" }, { canonicalWordId: "dine-id", spelling: "dine" }],
  reviewedAudio: [{ canonicalWordId: "dinner-id", recording }] });
assert.equal(derived.family?.name, "dine");
assert.equal(derived.family?.members[1].recording, null);
assert.equal(derived.family?.members[1].alignedVowelSpan, null);
assert.equal(derived.family?.explanation, null); // No invented phoneme or morphology claim.

const selected = [{ canonicalWordId: base.canonicalWordId, spelling: base.spelling, microSkillKey: base.microSkillKey,
  wordSense: base.wordSense, assignmentStatus: "assigned", pronunciationId: base.pronunciationId,
  sourceFingerprint: base.sourceFingerprint, recordingSha256: base.recording.sha256 }];
const current = [{ authorityId: family.authorityId, sourceFingerprint: family.sourceFingerprint,
  memberWordIds: ["dinner-id", "dine-id"] }];
assert.equal(resolveDetectiveForSelectedWords(selected, [withFamily], current).ready[0].family?.authorityId, "family-id");
assert.equal(resolveDetectiveForSelectedWords(selected, [withFamily], []).ready[0].family, null);
assert.equal(resolveDetectiveForSelectedWords(selected, [withFamily], [{ ...current[0], sourceFingerprint: hash }]).ready[0].family, null);
assert.deepEqual(resolveDetectiveForSelectedWords([{ ...selected[0], assignmentStatus: "deassigned" }], [withFamily], current).blockers,
  [{ canonicalWordId: "dinner-id", reason: "not_assigned" }]);
assert.deepEqual(resolveDetectiveForSelectedWords([{ ...selected[0], sourceFingerprint: "d".repeat(64) }], [withFamily], current).blockers,
  [{ canonicalWordId: "dinner-id", reason: "detective_source_changed" }]);
assert.equal(resolveDetectiveForSelectedWords(selected, [withFamily, withFamily], current).blockers[0].reason, "ambiguous_detective_content");

const prepared = prepareDetectiveForComposerSlots({
  microSkillKey: base.microSkillKey,
  slots: [
    { canonicalWordId: "dinner-id", provenance: "learning_item", learningItemId: "demand-1", complexityLevel: 2 },
    { canonicalWordId: "new-demand-id", provenance: "learning_item", learningItemId: "demand-2", complexityLevel: 2 },
  ],
  currentAssignments: [...selected, { ...selected[0], canonicalWordId: "new-demand-id" }],
  publishedAnnotations: [withFamily], currentFamilyAuthorities: current,
});
assert.equal(prepared.config, null); // An incomplete demanded word cannot disappear from the activity.
assert.deepEqual(prepared.readyWordIds, ["dinner-id"]);
assert.deepEqual(prepared.blockers, [{ canonicalWordId: "new-demand-id", reason: "detective_content_not_approved" }]);

const spellings = ["dinner", "teacher", "player", "baker", "better"];
const rounds = spellings.map((spelling, index) => ({
  ...base, canonicalWordId: `word-${index}`, spelling,
  target: { start: spelling.length - 2, end: spelling.length, text: "er", soundType: "schwa" as const },
}));
const slots = rounds.map((round, index) => ({ canonicalWordId: round.canonicalWordId,
  provenance: "learning_item" as const, learningItemId: `demand-${index}`, complexityLevel: 2 }));
const selectedWords = rounds.map((round, index) => ({
  canonicalWordId: round.canonicalWordId, displayWord: round.spelling,
  roles: [index === 0 ? "authentic_target" as const : "practice" as const], learningItemId: `demand-${index}`,
  complexityBand: "2", contentRef: { sourceKey: "dictionary", sourceVersion: "v1" }, coverage: {},
}));
const compiled = compileWeakVowelDetectiveCandidate({
  assignmentId: "assignment-1", childId: "child-1", assignmentDate: "2026-10-20", compiledAt: "2026-10-20T12:00:00Z",
  familyKey: "D4_SCHWA", clusterKey: "D4_SCHWA_FINAL", microSkillKey: base.microSkillKey,
  slots, selectedWords, currentAssignments: rounds.map((round) => ({ ...selected[0], canonicalWordId: round.canonicalWordId, spelling: round.spelling })),
  publishedAnnotations: rounds, currentFamilyAuthorities: [], dictionaryReleaseIds: ["dictionary-v1"],
  selectionPolicyVersion: "demand-first-v1", evidencePolicyVersion: "guided-v1", assignmentItemId: "guided-1",
});
assert.ok(compiled.snapshot, JSON.stringify(compiled.blockers));
assert.equal(compiled.snapshot!.words.length, 5);
assert.equal(compiled.snapshot!.activities[0].evidenceMode, "guided_recognition");
assert.equal(compiled.snapshot!.activities[0].config.schemaVersion, "family_tree_detective_activity_v1");

console.log("Family Tree Detective regression passed.");
