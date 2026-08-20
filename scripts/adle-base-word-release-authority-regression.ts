import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActivatedBaseWordReleaseAuthority } from "../lib/adle/curriculum-release-activation";
import { persistedReleaseAuthority } from "../lib/adle/curriculum-release-activation";
import { createPersistedRouteMetadataV2, parsePersistedLessonRouteMetadata } from "../lib/adle/composable-lesson/persisted-route-metadata";
import { loadBaseWordFamilyLessonReadModel } from "../lib/adle/loaders/base-word-family-lesson-read-model";
import { compileBaseWordFamilyLessonSnapshot } from "../lib/adle/morphology/base-word-family-payload";
import { buildBaseWordFamilyPilotItems } from "../lib/adle/morphology/base-word-family-pilot-plan";

const SKILL = "D4_MOR_BASE_WORDS_PRESERVE_BASE";
const UUIDS = Array.from({ length: 32 }, (_, index) => `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`);
const familyDefinitions = [
  { key: "PLAY", base: "play", target: "playing", transfers: ["playful", "replay"] },
  { key: "GOVERN", base: "govern", target: "government", transfers: ["governor", "governing"] },
] as const;
const words = familyDefinitions.flatMap((family) => [family.base, family.target, ...family.transfers]);
const wordIds = new Map(words.map((word, index) => [word, UUIDS[10 + index]]));
const authority: ActivatedBaseWordReleaseAuthority = {
  activationRevisionId: UUIDS[0], environmentKey: "production", microSkillKey: SKILL,
  releaseManifestId: UUIDS[1], releaseKey: "base-word-release-regression-v1",
  releaseManifestSha256: "a".repeat(64), dependencyFingerprint: "b".repeat(64),
  familyAuthorityId: UUIDS[2], familyAuthorityFingerprint: "c".repeat(64),
  family: { schemaVersion: 1, microSkillKey: SKILL, importBatchId: UUIDS[3], families: familyDefinitions.map((family, familyIndex) => ({
    familyId: UUIDS[4 + familyIndex], baseFamilyKey: family.key, baseWordId: wordIds.get(family.base)!, baseMeaning: `${family.base} meaning`,
    etymologyRoute: { kind: "base_word" },
    members: [family.base, family.target, ...family.transfers].map((word, memberIndex) => ({
      memberId: UUIDS[20 + familyIndex * 4 + memberIndex], canonicalWordId: wordIds.get(word)!,
      memberRole: memberIndex === 0 ? "base" : memberIndex === 1 ? "authentic_target" : "transfer",
      assignmentEligible: true, complexityLevel: null, wordSum: word,
      morphologyParts: [{ id: `part-${word}`, kind: "base", sourceText: word, surfaceText: word }], morphologyJoins: [], morphologyTransformations: [],
      transformationNotes: "", childFriendlyMeaning: `${word} meaning`,
    })),
  })) },
  teachingContentAuthorityId: UUIDS[6], teachingContentAuthorityFingerprint: "d".repeat(64),
  teachingContent: { schemaVersion: 1, microSkillKey: SKILL, contentVersionId: UUIDS[7], contentVersion: "base-word-content-v1", teachingObjective: "Find and preserve the base.", childFriendlyExplanation: "Keep the base visible.", ruleExplanation: "A base carries meaning.", memoryTip: "", commonMisconceptions: "", firstExposureProgression: [], guidedPracticeProgression: [], reviewProofreadingProgression: [], exampleSelectionGuidance: "", contrastPolicyGuidance: "" },
  dictionaryClosureAuthorityId: "99999999-1111-4111-8111-111111111111", dictionaryClosureAuthorityFingerprint: "e".repeat(64),
  dictionaryWords: words.map((word) => ({ canonicalWordId: wordIds.get(word)!, wordKey: `${word}_en_gb`, normalisedWord: word, displayWord: word, dialectCode: "en-GB", dictationSentence: `Write ${word} now.`, dictationTargetTokenIndex: 1, audioText: `Write ${word} now.` })),
};

async function main() {
const metadata = createPersistedRouteMetadataV2("base_word_lab", persistedReleaseAuthority(authority));
assert.equal(parsePersistedLessonRouteMetadata(metadata).ok, true);
assert.equal(metadata.metadataSchemaVersion, 2);
assert.equal(metadata.curriculumRelease.activationRevisionId, authority.activationRevisionId);

const readModel = await loadBaseWordFamilyLessonReadModel(null as unknown as SupabaseClient, {
  microSkillKey: SKILL, contentVersion: authority.teachingContent.contentVersion, releaseAuthority: authority,
  authenticTargets: [
    { canonicalWordId: wordIds.get("playing")!, learningItemId: UUIDS[8], sourceRef: "verified:playing" },
    { canonicalWordId: wordIds.get("government")!, learningItemId: UUIDS[9], sourceRef: "verified:government" },
  ],
  sections: familyDefinitions.map((family) => ({
    baseFamilyKey: family.key,
    authenticTargetWordIds: [wordIds.get(family.target)!],
    guidedWordIds: [family.base, family.target, ...family.transfers].map((word) => wordIds.get(word)!),
  })),
  independentSlots: [
    { canonicalWordId: wordIds.get("playing")!, provenance: "authentic_target", baseFamilyKey: "PLAY", learningItemId: UUIDS[8] },
    { canonicalWordId: wordIds.get("government")!, provenance: "authentic_target", baseFamilyKey: "GOVERN", learningItemId: UUIDS[9] },
    { canonicalWordId: wordIds.get("playful")!, provenance: "transfer", baseFamilyKey: "PLAY", learningItemId: null },
    { canonicalWordId: wordIds.get("governor")!, provenance: "transfer", baseFamilyKey: "GOVERN", learningItemId: null },
    { canonicalWordId: wordIds.get("replay")!, provenance: "transfer", baseFamilyKey: "PLAY", learningItemId: null },
    { canonicalWordId: wordIds.get("governing")!, provenance: "transfer", baseFamilyKey: "GOVERN", learningItemId: null },
  ],
  pilotLessonNumber: 1,
});
assert.ok(readModel);
const snapshot = compileBaseWordFamilyLessonSnapshot(readModel);
assert.equal(snapshot.authenticTargets.length, 2);
assert.equal(snapshot.independentSlots.filter((slot) => slot.provenance === "transfer").length, 4);
assert.equal(snapshot.independentWords.length, 6);
assert.equal(buildBaseWordFamilyPilotItems({ payload: snapshot, parentUserId: UUIDS[2], childId: UUIDS[3], planDate: "2026-08-09" }).length, 18);

const mutableSource = { displayWord: "source changed later" };
mutableSource.displayWord = "another current value";
assert.equal(snapshot.independentWords[0].displayWord, authority.dictionaryWords.find((word) => word.canonicalWordId === snapshot.independentWords[0].canonicalWordId)?.displayWord, "compiled assignment uses frozen closure semantics");

const migration = readFileSync("supabase/migrations/20260809150000_integrate_base_word_release_authority.sql", "utf8");
const intake = readFileSync("lib/adle/loaders/canonical-intake-live.ts", "utf8");
const assignment = readFileSync("lib/adle/loaders/base-word-family-pilot-loader.ts", "utf8");
const readModelSource = readFileSync("lib/adle/loaders/base-word-family-lesson-read-model.ts", "utf8");
const runtimePage = readFileSync("app/learn/week/adle/page.tsx", "utf8");
const completion = readFileSync("app/learn/week/adle/actions.ts", "utf8");
const selector = readFileSync("lib/adle/base-word-family-selection.ts", "utf8");
const baseWordIntakeBranch = intake.slice(
  intake.indexOf("if (isBaseWordFamilyPilotEnabledForChild(childId))"),
  intake.indexOf("return {\n    enabled,", intake.indexOf("if (isBaseWordFamilyPilotEnabledForChild(childId))")),
);

assert.match(migration, /publish_adle_base_word_family_membership_authority_v1/);
assert.match(migration, /publish_adle_base_word_teaching_content_authority_v1/);
assert.match(migration, /legacy_pre_release_ledger_projection/);
assert.match(migration, /v_legacy_cutoff constant timestamptz := '2026-07-26/);
assert.match(migration, /adle_route_activation_revision_is_current_v2/);
assert.match(migration, /Base Word release authority changed before assignment persistence/);
assert.match(migration, /adle_lesson_route_metadata_is_valid_v2/);
assert.match(migration, /if v_assignment_id is not null then return v_assignment_id/);
assert.match(intake, /loadEnabledBaseWordReleaseAuthorities/);
assert.match(intake, /p_release_manifest_id: resolution\.curriculumRelease\?\.releaseManifestId/);
assert.match(assignment, /createPersistedRouteMetadataV2/);
assert.match(assignment, /releaseAuthority: activation/);
assert.match(readModelSource, /request\.releaseAuthority/);
assert.match(runtimePage, /databaseActivatedAssignmentRuntimeAllowed/);
assert.match(completion, /baseWordAssignmentRuntimeAllowed/);
assert.doesNotMatch(`${intake}\n${assignment}\n${readModelSource}\n${selector}\n${migration}`, /(?:^|[^a-z])(bed|foot|sun)(?:[^a-z]|$)/i);
assert.doesNotMatch(`${baseWordIntakeBranch}\n${assignment}`, /canonical_teaching_dictionary_word_support/);
assert.match(intake, /canonical_teaching_dictionary_word_support/, "generic-route word_support remains unchanged");
assert.match(selector, /member\.memberRole === "authentic_target"/);
assert.match(selector, /member\.memberRole === "base" \|\| member\.memberRole === "transfer"/);
assert.match(selector, /two_distinct_authentic_families_required/);

console.log("adle-base-word-release-authority-regression: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
