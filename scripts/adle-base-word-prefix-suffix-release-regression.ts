#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCanonicalPackage } from "./teaching-dictionary-release-contract";

async function main(): Promise<void> {
const root = resolve(import.meta.dirname, "..");
const source = JSON.parse(readFileSync(resolve(root, "data/adle/approved/d4-mor/v2/base-word-prefix-suffix-family-source-v1.json"), "utf8"));
const projection = JSON.parse(readFileSync(resolve(root, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-11-base-word-prefix-suffix-family-v2/family-v2-source-projection.json"), "utf8"));
const migration = readFileSync(resolve(root, "supabase/migrations/20260811110000_generalise_base_word_teaching_content_authority.sql"), "utf8");

assert.equal(source.approval.reviewedBy, "Katie Sanderson");
assert.equal(source.approval.reviewedAt, "2026-08-11T00:00:00.000Z");
assert.match(source.approval.sourceSha256, /^[a-f0-9]{64}$/);
assert.equal(source.families.length, 9, "exactly nine newly published family sources");
assert.deepEqual(source.existingFamilyExtensions.map((entry: { word: string }) => entry.word), ["untie"]);
for (const family of source.families) assert.equal(family.members.length, 3, `${family.baseFamilyKey} has base plus two practice-capable members`);

const prefix = projection.families.D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX;
const suffix = projection.families.D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX;
assert.equal(prefix.length, 8);
assert.equal(suffix.length, 8);
for (const family of [...prefix, ...suffix]) {
  assert.equal(family.members.filter((member: { structuralRole: string }) => member.structuralRole === "base").length, 1, `${family.baseFamilyKey} has one structural base`);
  assert.ok(family.members.length >= 3, `${family.baseFamilyKey} supports a two-family six-word lesson`);
  assert.ok(family.members.every((member: { structuralRole: string }) => member.structuralRole === "base" || member.structuralRole === "family_member"), "no permanent authentic/transfer member role");
}
for (const family of [...prefix, ...suffix].filter((entry: { sourceFamily: string }) => entry.sourceFamily === "new_release")) {
  assert.equal(family.etymologyRoute.origin_form, family.baseWordKey.replace(/_en_gb$/, ""), `${family.baseFamilyKey} carries its visible free-base form`);
  assert.equal(family.etymologyRoute.evidence.verification_status, "linked_for_human_review", `${family.baseFamilyKey} uses the governed family-source verification label`);
}
assert.ok(prefix.find((family: { baseFamilyKey: string }) => family.baseFamilyKey === "tie_base_family")?.members.some((member: { wordKey: string }) => member.wordKey === "untie_en_gb"));
assert.match(migration, /adle_micro_skill_owns_base_word_lab_v2\(p_manifest->>'microSkillKey'\)/, "teaching content follows canonical cluster ownership");
assert.doesNotMatch(migration, /BASE_PLUS_PREFIX[\s\S]*BASE_PLUS_SUFFIX/, "migration adds no second hard-coded Base Word allowlist");

const pkg = await loadCanonicalPackage(resolve(root, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-11-base-word-prefix-suffix-canonical-v1"));
assert.equal(pkg.manifest.rowCounts.words, 18);
assert.equal(pkg.manifest.workbookSha256, source.approval.sourceSha256);
const dictionaryWords = new Set(pkg.csv["canonical_words.csv"].map(row => row.normalised_word));
for (const word of ["colour", "immigrant", "lock", "misplace", "painter", "replace", "sweetness", "untie", "view", "windy"]) assert.ok(dictionaryWords.has(word));

console.log(JSON.stringify({ status: "passed", dictionaryPackageSha256: pkg.manifest.packageSha256, projectionSha256: createHash("sha256").update(readFileSync(resolve(root, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-11-base-word-prefix-suffix-family-v2/family-v2-source-projection.json"))).digest("hex") }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
