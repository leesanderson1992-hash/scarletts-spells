import assert from "node:assert/strict";
/* eslint-disable @typescript-eslint/no-explicit-any -- regression inspects governed JSON artifacts */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import {
  fingerprintAdleCurriculumReleaseManifest,
  validateAdleCurriculumReleaseManifestV2,
} from "../lib/adle/curriculum-release-authority";
import {
  compoundReadingNavigationV2,
  resolveSeparatedHyphenatedReadingIntroductionV2,
} from "../lib/adle/morphology/compound-word-reading-release-v2";

const root = resolve(import.meta.dirname, "..");
const releaseDir = resolve(root, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-12-compound-word-separated-hyphenated-reading-pages-v2");
const oldDir = resolve(root, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-11-compound-word-v2-route-releases");
const approvalPath = resolve(root, "data/adle/review/d4-mor/v2/compound-word-separated-hyphenated-reading-pages-approval.json");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

execFileSync("npx", ["tsx", "scripts/build-adle-compound-word-reading-release.ts"], { cwd: root, stdio: "pipe" });
const approval = json(approvalPath);
const teaching = json(resolve(releaseDir, "teaching-content-separated-hyphenated-reading-pages.json"));
const release = json(resolve(releaseDir, "route-release-separated-hyphenated-reading-pages.json"));
const packageManifest = json(resolve(releaseDir, "package-manifest.json"));

assert.equal(approval.micro_skill_key, "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED");
assert.equal(approval.source_commit, "edce0c69ad1f0171e749ddbc72a7c91b4f999aca");
assert.equal(approval.approval_status, "approved");
assert.equal(approval.pages.length, 3);
assert.deepEqual(approval.pages.map((page: any) => page.page_ordinal), [1, 2, 3]);
assert.deepEqual(approval.pages.map((page: any) => page.teaching_purpose), [
  "Descriptions before/after nouns",
  "Phrasal verbs becoming nouns",
  "Compound nouns and recap rules",
]);
assert.equal(approval.content_hash, fingerprintSnapshotValue(approval.pages.map((page: any) => page.page_content)));
for (const page of approval.pages) assert.equal(page.content_hash, fingerprintSnapshotValue(page.page_content));
assert.equal(packageManifest.approvalArtifactSha256, sha(approvalPath));
assert.equal(packageManifest.sourceFileSha256, sha(resolve(root, packageManifest.sourceFile)));

const introduction = resolveSeparatedHyphenatedReadingIntroductionV2(teaching);
assert(introduction);
assert.deepEqual(introduction.readingPages, approval.pages.map((page: any) => page.page_content));
const publishedProjection = {
  schemaVersion: teaching.schemaVersion,
  microSkillKey: teaching.microSkillKey,
  ...teaching.content,
};
const publishedIntroduction = resolveSeparatedHyphenatedReadingIntroductionV2(publishedProjection);
assert(publishedIntroduction, "the immutable Production authority's flat semantic projection resolves");
assert.deepEqual(publishedIntroduction.readingPages, introduction.readingPages);
assert.deepEqual(compoundReadingNavigationV2(0, 3), { backAvailable: false, nextAvailable: true, workshopAvailable: false });
assert.deepEqual(compoundReadingNavigationV2(1, 3), { backAvailable: true, nextAvailable: true, workshopAvailable: false });
assert.deepEqual(compoundReadingNavigationV2(2, 3), { backAvailable: true, nextAvailable: false, workshopAvailable: true });
assert.equal(compoundReadingNavigationV2(3, 3), null);

assert.equal(validateAdleCurriculumReleaseManifestV2(release).valid, true);
assert.deepEqual(fingerprintAdleCurriculumReleaseManifest(release), packageManifest.releaseFingerprints);
assert.equal(release.route.activationRouteKey, "compound_word_lab:v2");
assert.equal(release.microSkills[0].microSkillKey, approval.micro_skill_key);
assert.deepEqual(release.microSkills[0].dependencies.map((dependency: any) => dependency.authorityType), [
  "compound_structure", "teaching_content", "teaching_dictionary_closure",
]);
assert.equal(release.microSkills[0].dependencies[0].authorityKey, "compound-word-v2-approved-14-2026-08-11");
assert.equal(release.microSkills[0].dependencies[2].authorityKey, "compound-word-v2-dictionary-closure-2026-08-11");
assert.equal(sha(resolve(oldDir, "teaching-content-separated-hyphenated.json")), "487ff3ec2069c313b13c81ff4a37a9f643c651b8a33efc8fdf80a10471838a26");
assert.equal(sha(resolve(oldDir, "route-release-separated-hyphenated.json")), "e5920a4a35bbb6c2beb278dc55b7c4aa6b2f7d50cf4b426c9930c55bbc8f94d7");

const migration = readFileSync(resolve(root, "supabase/migrations/20260812120000_publish_compound_reading_content_correction.sql"), "utf8");
for (const token of ["publish_adle_reviewed_teaching_content_authority_v1", "newer_release.published_at", "readingPages", "instructionalPurpose"]) assert.match(migration, new RegExp(token));
for (const forbidden of ["insert into public.daily_assignments", "insert into public.adle_learning_items", "insert into public.adle_route_activation_revisions", "insert into public.adle_route_activation_heads"]) assert.equal(migration.toLowerCase().includes(forbidden), false);
const publisher = readFileSync(resolve(root, "scripts/adle-compound-word-reading-production-release.ts"), "utf8");
assert.match(publisher, /publish_adle_curriculum_release_v2/);
assert.match(publisher, /publication changed protected learner\/activation state/);
for (const forbidden of ["publish_adle_route_activation", "insert into public.daily_assignments", "insert into public.adle_learning_items"]) assert.equal(publisher.toLowerCase().includes(forbidden), false);

console.log("Compound Word Separated/Hyphenated reading release regression passed");
