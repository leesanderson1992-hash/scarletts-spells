import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  fingerprintAdleCurriculumReleaseManifest,
  teachingDictionaryClosureSemanticProjection,
  validateAdleCurriculumReleaseManifestV2,
  validateAdleTeachingDictionaryClosureManifestV1,
  type AdleCurriculumReleaseManifestV2,
  type AdleTeachingDictionaryClosureManifestV1,
} from "../lib/adle/curriculum-release-authority";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";

const hashes = {
  familyIdentify: "1".repeat(64),
  contentIdentify: "2".repeat(64),
  familyPreserve: "3".repeat(64),
  contentPreserve: "4".repeat(64),
  dictionary: "5".repeat(64),
};
const dependency = (
  authorityType: "family_membership" | "teaching_content" | "teaching_dictionary_closure",
  authorityKey: string,
  semanticFingerprint: string,
) => ({ authorityType, authorityKey, authoritySchemaVersion: 1 as const, semanticFingerprint });
const manifest: AdleCurriculumReleaseManifestV2 = {
  schemaVersion: 2,
  releaseKey: "base-word-release-fixture-v1",
  route: {
    routeId: "base_word_lab",
    routeVersion: "v2",
    activationRouteKey: "base_word_family_v1",
    payloadVersion: 1,
  },
  approvalRefs: ["review:architecture", "review:curriculum"],
  microSkills: [
    {
      microSkillKey: "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
      dependencies: [
        dependency("family_membership", "base-family-identify-v1", hashes.familyIdentify),
        dependency("teaching_content", "base-content-identify-v1", hashes.contentIdentify),
        dependency("teaching_dictionary_closure", "base-dictionary-closure-v1", hashes.dictionary),
      ],
    },
    {
      microSkillKey: "D4_MOR_BASE_WORDS_PRESERVE_BASE",
      dependencies: [
        dependency("family_membership", "base-family-preserve-v1", hashes.familyPreserve),
        dependency("teaching_content", "base-content-preserve-v1", hashes.contentPreserve),
        dependency("teaching_dictionary_closure", "base-dictionary-closure-v1", hashes.dictionary),
      ],
    },
  ],
};

assert.deepEqual(validateAdleCurriculumReleaseManifestV2(manifest), { valid: true, errors: [] });
const fingerprints = fingerprintAdleCurriculumReleaseManifest(manifest);
assert.equal(fingerprints.releaseManifestSha256, "b0923845ef3c08656deeab80cb9db1eca7f73000e8156af7e25da314592650ad");
assert.equal(fingerprints.dependencyFingerprint, "bbaa45b9ebb64748ba2473e98eb3cdd1c2df38017308fe37fd294805f5147d12");
assert.equal(fingerprints.releaseManifestSha256, fingerprintSnapshotValue(manifest));
assert.equal(fingerprints.dependencyFingerprint, fingerprintSnapshotValue(manifest.microSkills));

const reorderedObjectKeys = {
  microSkills: manifest.microSkills,
  approvalRefs: manifest.approvalRefs,
  route: manifest.route,
  releaseKey: manifest.releaseKey,
  schemaVersion: 2,
} as AdleCurriculumReleaseManifestV2;
assert.deepEqual(
  fingerprintAdleCurriculumReleaseManifest(reorderedObjectKeys),
  fingerprints,
  "JSON object key order does not alter canonical release identity",
);
const changedCombination: AdleCurriculumReleaseManifestV2 = {
  ...manifest,
  releaseKey: "base-word-release-fixture-v2",
  microSkills: manifest.microSkills.map((skill, index) => index === 0 ? {
    ...skill,
    dependencies: skill.dependencies.map((entry) => entry.authorityType === "teaching_content"
      ? { ...entry, authorityKey: "base-content-identify-v2", semanticFingerprint: "6".repeat(64) }
      : entry),
  } : skill),
};
const changedFingerprints = fingerprintAdleCurriculumReleaseManifest(changedCombination);
assert.notEqual(changedFingerprints.releaseManifestSha256, fingerprints.releaseManifestSha256);
assert.notEqual(changedFingerprints.dependencyFingerprint, fingerprints.dependencyFingerprint);

assert.equal(validateAdleCurriculumReleaseManifestV2({
  ...manifest,
  microSkills: [{
    ...manifest.microSkills[0],
    dependencies: manifest.microSkills[0].dependencies.slice(0, 2),
  }],
}).valid, false, "all three high-level dependency authorities are mandatory");
assert.equal(validateAdleCurriculumReleaseManifestV2({
  ...manifest,
  microSkills: [...manifest.microSkills].reverse(),
}).valid, false, "micro-skill bindings must have one canonical order");
assert.equal(validateAdleCurriculumReleaseManifestV2({
  ...manifest,
  route: { ...manifest.route, routeId: "dynamic_affix_word_lab", routeVersion: "v3" },
}).valid, false, "existing routes are not silently migrated onto the new authority model");
assert.equal(validateAdleCurriculumReleaseManifestV2({
  ...manifest,
  requestedStatus: "enabled",
}).valid, false, "operational status cannot enter the immutable release manifest");
assert.equal(validateAdleCurriculumReleaseManifestV2({
  ...manifest,
  microSkills: manifest.microSkills.map((skill, skillIndex) => skillIndex === 0 ? {
    ...skill,
    dependencies: skill.dependencies.map(dependency => dependency.authorityType === "teaching_content"
      ? { ...dependency, authoritySchemaVersion: 2 }
      : dependency),
  } : skill),
}).valid, false, "schema-v2 adoption remains restricted to family membership");

const closure: AdleTeachingDictionaryClosureManifestV1 = {
  schemaVersion: 1,
  authorityKey: "base-word-dictionary-closure-fixture-v1",
  approvalRefs: ["review:dictionary"],
  capabilities: ["canonical_word_identity_display", "canonical_dictation"],
  words: [{
    wordKey: "jumped_en_gb",
    normalisedWord: "jumped",
    displayWord: "jumped",
    dialectCode: "en-GB",
    dictationSentence: "The rabbit jumped over the log.",
    dictationTargetTokenIndex: 2,
    audioText: "The rabbit jumped over the log.",
  }],
};
assert.deepEqual(validateAdleTeachingDictionaryClosureManifestV1(closure), { valid: true, errors: [] });
const projection = teachingDictionaryClosureSemanticProjection(closure) as Record<string, unknown>;
assert.equal("approvalRefs" in projection, false, "approval workflow does not alter semantic closure identity");
assert.deepEqual(Object.keys(projection).sort(), ["capabilities", "schemaVersion", "words"]);
assert.equal(fingerprintSnapshotValue(projection), "7704cd5a4f5a83e942eebd2a92c4548f6d418b98f97356befaeb12f21bad78e6");

const foundationMigration = readFileSync(
  "supabase/migrations/20260809140000_add_adle_release_authority_foundation.sql",
  "utf8",
);
const metadataMigration = readFileSync(
  "supabase/migrations/20260809141000_add_adle_lesson_route_metadata_v2.sql",
  "utf8",
);
const compositeClosureMigration = readFileSync(
  "supabase/migrations/20260811120000_allow_composite_teaching_dictionary_closures.sql",
  "utf8",
);
for (const table of [
  "adle_curriculum_dependency_authorities",
  "adle_teaching_dictionary_closure_words",
  "adle_curriculum_release_manifests",
  "adle_curriculum_release_dependencies",
  "adle_route_activation_revisions",
  "adle_route_activation_heads",
]) assert.match(foundationMigration, new RegExp(`create table public\\.${table}`));
assert.match(foundationMigration, /legacy_pre_release_ledger_projection/);
assert.match(foundationMigration, /2026-07-26 00:00:00\+00/);
assert.match(foundationMigration, /release_ledger/);
assert.match(foundationMigration, /semantic_projection/);
assert.match(foundationMigration, /canonical_word_identity_display/);
assert.match(foundationMigration, /canonical_dictation/);
assert.doesNotMatch(foundationMigration, /word_metadata|canonical_teaching_dictionary_morphology/,
  "the closure does not invent Base Word dictionary dependencies");
assert.match(foundationMigration, /activation_status in \('enabled', 'paused', 'safety_revoked'\)/);
assert.match(foundationMigration, /block_incomplete/);
assert.match(foundationMigration, /p_expected_current_revision_id/);
assert.match(foundationMigration, /adle_route_activation_revision_is_current_v2/);
assert.match(foundationMigration, /route is not yet governed by ADLE release authority v2/);
assert.doesNotMatch(foundationMigration, /alter table public\.adle_lesson_route_activations/,
  "the legacy activation consumer is not migrated in BW-2A-1");
assert.doesNotMatch(foundationMigration, /insert into public\.adle_lesson_route_activations/,
  "BW-2A-1 creates no Base Word activation");
assert.match(metadataMigration, /adle_lesson_route_metadata_is_valid_v1\(lesson_route_metadata\)/);
assert.match(metadataMigration, /adle_lesson_route_metadata_is_valid_v2\(lesson_route_metadata\)/);
assert.doesNotMatch(metadataMigration, /update public\.daily_assignments/i,
  "existing immutable assignments are never rewritten");
assert.match(compositeClosureMigration, /composite_release_and_legacy_projection/);
assert.match(compositeClosureMigration, /v_word_batch\.release_id is not null[\s\S]*v_word_batch\.package_sha256 is not null[\s\S]*v_word_batch\.verified_at is not null/);
assert.match(compositeClosureMigration, /v_word_batch\.release_id is null and v_word_batch\.created_at < v_legacy_cutoff/);
assert.match(compositeClosureMigration, /v_dictation_batch\.release_id is not null[\s\S]*v_dictation_batch\.package_sha256 is not null[\s\S]*v_dictation_batch\.verified_at is not null/);
assert.match(compositeClosureMigration, /v_dictation_batch\.release_id is null and v_dictation_batch\.created_at < v_legacy_cutoff/);
assert.match(compositeClosureMigration, /Teaching Dictionary closure publisher predecessor differs from the reviewed contract/);
assert.doesNotMatch(compositeClosureMigration, /insert into public\.canonical_teaching_dictionary_/i,
  "composite closure support never repackages or copies Teaching Dictionary rows");
assert.doesNotMatch(compositeClosureMigration, /update public\.canonical_teaching_dictionary_/i,
  "composite closure support never mutates Teaching Dictionary source rows");

console.log(JSON.stringify({
  status: "ADLE release authority foundation regression passed",
  releaseManifestSha256: fingerprints.releaseManifestSha256,
  dependencyFingerprint: fingerprints.dependencyFingerprint,
  closureSemanticFingerprint: fingerprintSnapshotValue(projection),
}));
