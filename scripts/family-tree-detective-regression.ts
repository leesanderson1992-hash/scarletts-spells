import assert from "node:assert/strict";
import {
  DETECTIVE_ROUND_VERSION, correctVowelTile, maskedDetectiveWord, parseDetectiveRound,
  resolveDetectiveForSelectedWords, toggleDetectiveClue, type DetectiveRoundV1,
} from "../lib/adle/word-lab/family-tree-detective";
import {
  currentDetectiveFamiliesFromAuthority, currentDetectiveFamiliesFromPublishedAuthority,
  detectiveBaseToFinalErRelation, detectiveFamilyFromAuthority, detectiveFamilyFromPublishedAuthority,
  prepareDetectiveForComposerSlots,
  type PublishedDetectiveBaseFamilyAuthority,
} from "../lib/adle/word-lab/weak-vowel-detective";
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

const publishedAuthority: PublishedDetectiveBaseFamilyAuthority = {
  authorityId: "published-v1", schemaVersion: 1, sourceFingerprint: "f".repeat(64),
  families: [{ familyId: "family-id", baseFamilyKey: "dine_base_family", baseWordId: "dine-id",
    members: [{ canonicalWordId: "dinner-id", assignmentEligible: true },
      { canonicalWordId: "dine-id", assignmentEligible: true },
      { canonicalWordId: "old-id", assignmentEligible: false }] }],
};
assert.deepEqual(currentDetectiveFamiliesFromPublishedAuthority(publishedAuthority), [{
  authorityId: "family-id", sourceFingerprint: publishedAuthority.sourceFingerprint,
  memberWordIds: ["dinner-id", "dine-id"],
}]);
const publishedFamilyInput = { authority: publishedAuthority, chosenFamilyKey: "dine_base_family",
  targetWordId: "dinner-id", words: [{ canonicalWordId: "dinner-id", spelling: "dinner" },
    { canonicalWordId: "dine-id", spelling: "dine" }],
  reviewedAudio: [{ canonicalWordId: "dinner-id", recording }] };
const publishedFamily = detectiveFamilyFromPublishedAuthority(publishedFamilyInput);
assert.equal(publishedFamily.reason, null);
assert.equal(publishedFamily.family?.name, "dine");
assert.equal(publishedFamily.family?.members.length, 2);
assert.equal(publishedFamily.family?.members[1].recording, null);
assert.equal(publishedFamily.family?.members[1].alignedVowelSpan, null);
assert.equal(detectiveFamilyFromPublishedAuthority({ ...publishedFamilyInput, targetWordId: "old-id" }).reason,
  "target_not_verified_family_member");
assert.equal(detectiveFamilyFromPublishedAuthority({ ...publishedFamilyInput, chosenFamilyKey: "other_base_family" }).reason,
  "chosen_base_family_missing");
assert.equal(detectiveFamilyFromPublishedAuthority({ ...publishedFamilyInput,
  authority: { ...publishedAuthority, sourceFingerprint: "stale" } }).reason,
"family_authority_fingerprint_missing");
assert.equal(detectiveFamilyFromPublishedAuthority({ ...publishedFamilyInput,
  authority: { ...publishedAuthority, families: [...publishedAuthority.families, publishedAuthority.families[0]] } }).reason,
  "ambiguous_base_family");

const suffixInput = {
  microSkillKey: "D4_SCHWA_FINAL_ER_FINAL",
  target: { canonicalWordId: "photographer-id", spelling: "photographer",
    span: { start: 10, end: 12, text: "er" } },
  base: { canonicalWordId: "photograph-id", spelling: "photograph",
    rowStatus: "active" as const, reviewStatus: "approved_for_first_exposure" as const },
  morphology: { id: "morphology-id", canonicalWordId: "photographer-id", sourceRowHash: "e".repeat(64),
    rowStatus: "active" as const, reviewStatus: "approved_for_first_exposure" as const,
    analysisStatus: "approved" as const,
    wordSum: "photo + graph + er → photographer",
    parts: [{ text: "photo", type: "root" }, { text: "graph", type: "root" },
      { text: "er", type: "suffix" }], transformationNotes: null },
  reviewedAudio: [{ canonicalWordId: "photographer-id", recording }],
};
const suffix = detectiveBaseToFinalErRelation(suffixInput);
assert.equal(suffix.reason, null);
assert.equal(suffix.family?.relationKind, "base_to_derived");
assert.equal(suffix.family?.explanation, "photograph + -er → photographer");
assert.equal(suffix.family?.members[0].alignedVowelSpan, null); // No matching vowel in the base.
const photographerRound = { ...base, canonicalWordId: "photographer-id", spelling: "photographer",
  target: { start: 10, end: 12, text: "er", soundType: "schwa" as const }, family: suffix.family };
assert.ok(parseDetectiveRound(photographerRound));
const photographerSelection = [{ canonicalWordId: "photographer-id", spelling: "photographer",
  microSkillKey: base.microSkillKey, wordSense: null, assignmentStatus: "assigned",
  pronunciationId: base.pronunciationId, sourceFingerprint: base.sourceFingerprint,
  recordingSha256: base.recording.sha256 }];
const morphologyAuthority = [{ authorityId: suffix.family!.authorityId,
  sourceFingerprint: suffix.family!.sourceFingerprint, memberWordIds: ["photograph-id", "photographer-id"] }];
assert.equal(resolveDetectiveForSelectedWords(photographerSelection, [photographerRound], morphologyAuthority)
  .ready[0].family?.relationKind, "base_to_derived");
assert.equal(resolveDetectiveForSelectedWords(photographerSelection, [photographerRound],
  [{ ...morphologyAuthority[0], sourceFingerprint: hash }]).ready[0].family, null);
assert.equal(detectiveBaseToFinalErRelation({ ...suffixInput, target: { ...suffixInput.target,
  spelling: "water", span: { start: 3, end: 5, text: "er" } } }).reason,
  "base_to_derived_not_verified");
assert.equal(detectiveBaseToFinalErRelation({ ...suffixInput, morphology: { ...suffixInput.morphology,
  sourceRowHash: "stale" } }).reason, "morphology_not_current_and_approved");
assert.equal(detectiveBaseToFinalErRelation({ ...suffixInput, microSkillKey: "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS" }).reason,
  "not_final_er_skill");
const baker = detectiveBaseToFinalErRelation({ ...suffixInput,
  target: { canonicalWordId: "baker-id", spelling: "baker", span: { start: 3, end: 5, text: "er" } },
  base: { ...suffixInput.base, canonicalWordId: "bake-id", spelling: "bake" },
  morphology: { ...suffixInput.morphology, canonicalWordId: "baker-id", wordSum: "bake + er → baker",
    parts: [{ text: "bake", type: "base" }, { text: "er", type: "suffix" }],
    transformationNotes: "The final <e> in <bake> is omitted before <er>." },
});
assert.equal(baker.reason, null);
assert.match(baker.family?.explanation ?? "", /final e is omitted/);
const safer = detectiveBaseToFinalErRelation({ ...suffixInput,
  target: { canonicalWordId: "safer-id", spelling: "safer", span: { start: 3, end: 5, text: "er" } },
  base: { ...suffixInput.base, canonicalWordId: "safe-id", spelling: "safe" },
  morphology: { ...suffixInput.morphology, canonicalWordId: "safer-id", wordSum: "safe + r → safer",
    parts: [{ text: "safe", type: "base" }, { text: "r", type: "suffix" }] },
});
assert.equal(safer.family?.explanation, "safe + -r → safer");

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
