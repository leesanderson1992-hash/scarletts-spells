#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  fingerprintAdleCurriculumReleaseManifest,
  validateAdleCurriculumReleaseManifestV2,
  validateAdleTeachingDictionaryClosureManifestV1,
} from "../lib/adle/curriculum-release-authority";

const root = process.cwd();
const directory = `${root}/docs/implementation/seed-data/teaching-dictionary/releases/2026-08-10-base-word-lab-v2`;
const read = (name: string) => readFileSync(`${directory}/${name}`, "utf8");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
};

const packageManifest = JSON.parse(read("manifest.json"));
const { packageSha256, ...packageProjection } = packageManifest;
assert.equal(packageSha256, "3cf19a6d14cb3873d4129a0fd099903969a2d839d0a4ccb7d2a67a3f27b5dac1");
assert.equal(sha256(canonical(packageProjection)), packageSha256);
for (const [path, receipt] of Object.entries(packageManifest.sourceFiles) as Array<[string, { sha256: string }]>) {
  assert.equal(sha256(read(path)), receipt.sha256, `${path} hash drift`);
}

const closure = JSON.parse(read("teaching-dictionary-closure.json"));
const bindings = JSON.parse(read("teaching-dictionary-source-bindings.json"));
const release = JSON.parse(read("route-release.json"));
assert.deepEqual(validateAdleTeachingDictionaryClosureManifestV1(closure), { valid: true, errors: [] });
assert.deepEqual(validateAdleCurriculumReleaseManifestV2(release), { valid: true, errors: [] });
assert.equal(closure.words.length, 225);
assert.equal(bindings.length, 225);
assert.equal(new Set(closure.words.map((word: { wordKey: string }) => word.wordKey)).size, 225);
assert.deepEqual(closure.words.map((word: { wordKey: string }) => word.wordKey), bindings.map((binding: { wordKey: string }) => binding.wordKey));
assert.equal(release.route.routeId, "base_word_lab");
assert.equal(release.route.routeVersion, "v2");
assert.equal(release.route.activationRouteKey, "base_word_family_v1");
assert.equal(release.route.payloadVersion, 1);
assert.equal(release.microSkills.length, 2);
assert.ok(release.microSkills.every((skill: { dependencies: unknown[] }) => skill.dependencies.length === 3));
assert.equal(fingerprintAdleCurriculumReleaseManifest(release).releaseManifestSha256, "84e7fde227808806ef3852be1adaac2e9bbf78d8c691007233470464464f796c");
assert.equal(fingerprintAdleCurriculumReleaseManifest(release).dependencyFingerprint, "cdfe674fa41b6b427637cdbce4fabb6d38042bce670abf248aa3392be606847c");

const source = readFileSync(`${root}/scripts/adle-base-word-route-production-release.ts`, "utf8");
assert.match(source, /production-dark/);
assert.match(source, /assertMergedMain/);
assert.match(source, /transaction isolation level serializable/);
assert.match(source, /confirm-plan-sha256/);
assert.match(source, /publish_adle_base_word_teaching_content_authority_v1/);
assert.match(source, /publish_adle_teaching_dictionary_closure_v1/);
assert.match(source, /publish_adle_curriculum_release_v2/);
assert.match(source, /set_adle_route_activation_revision_v2/);
assert.match(source, /allowlist:emergency-disabled/);
assert.match(source, /safety-revoke/);
assert.doesNotMatch(source, /all_eligible/);
assert.doesNotMatch(source, /insert into public\.adle_learning_items/);
assert.doesNotMatch(source, /insert into public\.daily_assignments/);

console.log("Base Word Production route-release regression passed.");
