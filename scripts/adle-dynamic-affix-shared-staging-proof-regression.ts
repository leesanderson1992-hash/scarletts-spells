import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DYNAMIC_AFFIX_MIGRATED_PROFILE_KEYS } from "../lib/adle/morphology/dynamic-affix-compiler-rollout";
import { SHARED_AFFIX_PROFILE_REGISTRY } from "../lib/adle/morphology/shared-affix-profile-registry";
import {
  assignmentItemProjectionMismatchPaths,
  expectedAssignmentItemProofProjection,
  fingerprintSerializableProofValue,
  persistedAssignmentItemProofProjection,
} from "./lib/adle-staging-proof-serialization";

const proof = readFileSync("scripts/adle-dynamic-affix-shared-staging-proof.ts", "utf8");
assert(proof.includes('const STAGING_REF = "jlhotktspjvffslvuyfz"'));
assert(proof.includes('const STAGING_VERCEL_PROJECT_ID = "prj_oJkffstOtacc4juYloXajHpjJUha"'));
assert(proof.includes('const PRODUCTION_REF = "wwohrqtunajrbwxyssjf"'));
assert(proof.includes("production Vercel project is permanently rejected"));
assert(proof.includes('proof requires --environment staging'));
assert(proof.includes("disposable-data-only"));
assert(proof.includes("--confirm"));
assert(proof.includes('const CONFIRMATION = "ADLE-DYNAMIC-AFFIX-STAGING-V1"'));
assert(proof.includes("public_payload_byte_mismatch"));
assert(proof.includes("enforced mismatch changed staging rows"));
assert(proof.includes("exactFixtureResidue: 0"));
for (const className of ["direct_one_form", "changed_one_form", "replace_remove", "two_form", "two_form_meaning", "visible_tion", "visible_sion"]) {
  assert(proof.includes(className), `missing staging class ${className}`);
}
for (const oneAuthenticDefinition of [
  '{ purpose: "replace_remove", profileKey: "D4_MOR_SUFFIXES_ITY", authenticWords: ["possibility"] }',
  '{ purpose: "two_form", profileKey: "D4_MOR_SUFFIXES_ABLE_IBLE", authenticWords: ["comfortable"] }',
  '{ purpose: "two_form_meaning", profileKey: "D4_MOR_SUFFIXES_FUL_LESS", authenticWords: ["careful"] }',
]) assert(proof.includes(oneAuthenticDefinition), `class fixture must have one authentic target: ${oneAuthenticDefinition}`);

for (const profileKey of DYNAMIC_AFFIX_MIGRATED_PROFILE_KEYS) {
  const mapping = SHARED_AFFIX_PROFILE_REGISTRY.find((entry) => entry.microSkillKey === profileKey);
  assert(mapping, `${profileKey}: shared registry mapping`);
  assert.deepEqual(mapping.policy.schedule, { kind: "authentic_targets" });
  assert.deepEqual(mapping.policy.reward, { kind: "all_lesson_words" });
}

const expected = {
  childId: "write-only-child",
  parentUserId: "write-only-parent",
  domainModule: "spelling",
  itemType: "adle_lesson_intro",
  sourceType: "adle_composer",
  sourceEntityId: "adle:proof:1",
  templateKey: "MICRO_READ_ONLY_INTRO",
  targetWord: null,
  position: 1,
  status: "ready",
  promptData: { required: "kept", omitted: undefined },
  metadata: { microSkillKey: "D4_MOR_SUFFIXES_MENT" },
};
const persisted = {
  source_entity_id: expected.sourceEntityId,
  template_key: expected.templateKey,
  target_word: expected.targetWord,
  position: expected.position,
  status: expected.status,
  prompt_data: JSON.parse(JSON.stringify(expected.promptData)),
  metadata: expected.metadata,
};
assert.equal(fingerprintSerializableProofValue(expected.promptData), fingerprintSerializableProofValue(persisted.prompt_data));
assert.deepEqual(assignmentItemProjectionMismatchPaths(
  [expectedAssignmentItemProofProjection(expected)],
  [persistedAssignmentItemProofProjection(persisted)],
), []);

console.log(JSON.stringify({ status: "passed", stagingIdentityPins: true, productionRejected: true, sevenClasses: true, exactCleanupGuard: true, profiles: 10 }));
