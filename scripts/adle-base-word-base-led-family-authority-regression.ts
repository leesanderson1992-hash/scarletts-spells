import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  baseWordFamilyAuthorityAppliesToMicroSkill,
  baseWordFamilyMemberAppliesToMicroSkill,
  baseWordFamilyMemberStructuralRole,
  type BaseWordFamilyAuthorityProjection,
} from "../lib/adle/curriculum-release-activation";

const SKILL = "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX";
const OTHER_SKILL = "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX";
const member = {
  memberId: "member-dislike",
  canonicalWordId: "word-dislike",
  structuralRole: "family_member" as const,
  applicableMicroSkillKeys: [SKILL],
  morphologySource: {
    sourceKind: "approved_repository_analysis" as const,
    sourceId: `${SKILL}::dislike`,
    sourceFingerprint: "a".repeat(64),
    sourceAuthorityKey: "repo:d4-mor-v1-word-analyses",
  },
  assignmentEligible: true,
  complexityLevel: null,
  wordSum: "dis + like",
  morphologyParts: [{ id: "prefix", kind: "prefix", sourceText: "dis", surfaceText: "dis" }, { id: "base", kind: "base", sourceText: "like", surfaceText: "like" }],
  morphologyJoins: [{ afterPartId: "prefix", beforePartId: "base", joinType: "none" }],
  morphologyTransformations: [],
  transformationNotes: "",
  childFriendlyMeaning: "to not like something",
};
const projection: BaseWordFamilyAuthorityProjection = {
  schemaVersion: 2,
  skillClusterKey: "D4_MOR_BASE_WORDS",
  sourceAuthorities: [
    { authorityKey: "batch:base-family", sourceKind: "teaching_dictionary_import_batch", sourceId: "11111111-1111-4111-8111-111111111111", sourceFingerprint: "b".repeat(64) },
    { authorityKey: "repo:d4-mor-v1-word-analyses", sourceKind: "approved_repository_artifact", sourceId: "data/adle/approved/d4-mor/v1/d4-mor-v1-word-analyses.json", sourceFingerprint: "c".repeat(64) },
  ],
  families: [{ familyId: "22222222-2222-4222-8222-222222222222", baseFamilyKey: "like_base_family", baseWordId: "word-like", baseMeaning: "to enjoy or approve of", etymologyRoute: { relation_type: "free_base" }, members: [member] }],
};

assert.equal(baseWordFamilyAuthorityAppliesToMicroSkill(projection, SKILL), true);
assert.equal(baseWordFamilyAuthorityAppliesToMicroSkill(projection, OTHER_SKILL), false);
assert.equal(baseWordFamilyMemberAppliesToMicroSkill(projection, member, SKILL), true);
assert.equal(baseWordFamilyMemberStructuralRole(member), "family_member");
assert.equal("memberRole" in member, false, "family-authority v2 carries no permanent authentic/transfer role");

const authorityMigration = readFileSync("supabase/migrations/20260810200000_add_base_led_family_authority_v2.sql", "utf8");
const bindingMigration = readFileSync("supabase/migrations/20260810201000_bind_base_led_family_selection.sql", "utf8");
const selector = readFileSync("lib/adle/base-word-family-selection.ts", "utf8");
const actions = readFileSync("app/learn/week/adle/actions.ts", "utf8");

assert.match(authorityMigration, /publish_adle_base_word_family_membership_authority_v2/);
assert.match(authorityMigration, /skillClusterKey/);
assert.match(authorityMigration, /approved_repository_analysis/);
assert.match(authorityMigration, /source member does not govern the declared micro-skill applicability/);
assert.match(authorityMigration, /source member names the wrong batch authority/);
assert.match(authorityMigration, /requires one exact structural base member/);
assert.match(authorityMigration, /repository analysis lacks exact artifact\/skill\/word authority/);
assert.match(authorityMigration, /source-batch fingerprint drifted/);
assert.match(authorityMigration, /families must be uniquely sorted/);
assert.match(authorityMigration, /members must be uniquely sorted/);
assert.match(authorityMigration, /legacy source is after the hard cutoff/);
assert.match(authorityMigration, /publish_adle_curriculum_release_v2/);
assert.match(authorityMigration, /authoritySchemaVersion' not in \('1','2'\)/);
assert.doesNotMatch(authorityMigration, /update public\.canonical_teaching_dictionary_(?:base_word|word_morphology)/i, "the forward authority publisher never mutates source batches");
assert.match(bindingMigration, /authority\.schema_version = 1/);
assert.match(bindingMigration, /authority\.schema_version = 2/);
assert.match(bindingMigration, /primary_authentic_target/);
assert.match(bindingMigration, /queued_family_practice/);
assert.match(bindingMigration, /generated_family_practice/);
assert.match(bindingMigration, /not between 2 and 6/);
assert.match(selector, /oldest valid pair/i);
assert.match(selector, /baseLedSemantics \? eligibleAuthenticItems/);
assert.match(actions, /learnerBackedIds/);
assert.match(actions, /producedWords: finalAttempts\.filter\(\(attempt\) => learnerBackedIds\.has/);

console.log("adle-base-word-base-led-family-authority-regression: ok");
