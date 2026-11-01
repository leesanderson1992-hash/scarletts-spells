import assert from "node:assert/strict";
import { mergeBaseWordAuthorityInputs } from "../lib/adle/word-skill-relationships/base-word-merge";
import type { RawWordSkillRelationshipFact } from "../lib/adle/word-skill-relationships/contracts";
import { mergedBaseWordCausalSkills } from "../lib/adle/base-word-skill-merge";

const fact = (skill: string, id: string): RawWordSkillRelationshipFact => ({
  sourceAuthority: "approved_generic_support", provenanceId: id, sourceAuthorityVersion: "reviewed-v1",
  canonicalWordId: "word-1", microSkillKey: skill, relationshipRole: "demonstrates",
  sourceState: "active", exactPairApproval: "approved", reviewState: "approved", releaseState: "not_applicable",
  provenanceMetadata: {},
});
const input = mergeBaseWordAuthorityInputs([
  fact("D4_MOR_BASE_WORDS_IDENTIFY_BASE", "identify"),
  fact("D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX", "prefix"),
  fact("D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX", "suffix"),
  fact("D4_MOR_PREFIXES_UN", "separate-prefix"),
], [
  { id: "approved", canonicalWordId: "word-1", microSkillKey: "D4_MOR_BASE_WORDS_IDENTIFY_BASE", action: "restore" },
  { id: "veto", canonicalWordId: "word-1", microSkillKey: "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX", action: "deassign" },
]);
assert.deepEqual(input.facts.map((row) => row.microSkillKey), [
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE", "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE", "D4_MOR_PREFIXES_UN",
]);
assert.deepEqual(input.facts.slice(0, 3).map((row) => row.provenanceMetadata.originalMicroSkillKey), [
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE", "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX", "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX",
]);
assert.deepEqual(input.decisions, [{ id: "veto", canonicalWordId: "word-1",
  microSkillKey: "D4_MOR_BASE_WORDS_IDENTIFY_BASE", action: "deassign" }]);
assert.deepEqual(mergedBaseWordCausalSkills([
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE", "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX", "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX",
  "D4_MOR_PREFIXES_UN",
]), ["D4_MOR_BASE_WORDS_IDENTIFY_BASE", "D4_MOR_PREFIXES_UN"]);
console.log("Base-word merge authority regression passed");
