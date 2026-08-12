#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any -- governed JSON artifacts are validated below */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import {
  fingerprintAdleCurriculumReleaseManifest,
  validateAdleCurriculumReleaseManifestV2,
  type AdleCurriculumReleaseManifestV2,
} from "../lib/adle/curriculum-release-authority";
import { SEPARATED_HYPHENATED_READING_PAGES_V2 } from "../lib/adle/morphology/compound-word-reading-content-v2";
import { SEPARATED_HYPHENATED_MICRO_SKILL_KEY } from "../lib/adle/morphology/compound-word-reading-release-v2";
import { stableUuid } from "./teaching-dictionary-release";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE_FILE = "lib/adle/morphology/compound-word-reading-content-v2.ts";
const SOURCE_COMMIT = "edce0c69ad1f0171e749ddbc72a7c91b4f999aca";
const REVIEWER = "Katie Sanderson";
const APPROVAL_DATE = "2026-08-12";
const APPROVAL_PATH = "data/adle/review/d4-mor/v2/compound-word-separated-hyphenated-reading-pages-approval.json";
const RELEASE_DIR = resolve(ROOT, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-12-compound-word-separated-hyphenated-reading-pages-v2");
const OLD_DIR = resolve(ROOT, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-11-compound-word-v2-route-releases");
const AUTHORITY_KEY = "compound-word-v2-separated-hyphenated-teaching-content-reading-pages-2026-08-12";
const RELEASE_KEY = "compound-word-v2-d4_mor_compound_words_separated_hyphenated-reading-pages-2026-08-12";
const PURPOSES = [
  "Descriptions before/after nouns",
  "Phrasal verbs becoming nouns",
  "Compound nouns and recap rules",
] as const;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

const committedSource = execFileSync("git", ["show", `${SOURCE_COMMIT}:${SOURCE_FILE}`], {
  cwd: ROOT,
  encoding: "utf8",
});
const currentSource = readFileSync(resolve(ROOT, SOURCE_FILE), "utf8");
if (currentSource !== committedSource) {
  throw new Error("reviewed reading source differs from the product-owner implementation commit");
}

const pages = structuredClone(SEPARATED_HYPHENATED_READING_PAGES_V2);
const contentHash = fingerprintSnapshotValue(pages);
const sourceFileSha256 = sha256(committedSource);
const approval = {
  schema_version: 1,
  micro_skill_key: SEPARATED_HYPHENATED_MICRO_SKILL_KEY,
  source_file: SOURCE_FILE,
  source_commit: SOURCE_COMMIT,
  source_file_sha256: sourceFileSha256,
  content_hash: contentHash,
  reviewer: REVIEWER,
  approval_date: APPROVAL_DATE,
  approval_status: "approved",
  pages: pages.map((page, index) => ({
    micro_skill_key: SEPARATED_HYPHENATED_MICRO_SKILL_KEY,
    page_ordinal: index + 1,
    page_title: page.title,
    page_content: page,
    teaching_purpose: PURPOSES[index],
    source_file: SOURCE_FILE,
    source_commit: SOURCE_COMMIT,
    content_hash: fingerprintSnapshotValue(page),
    reviewer: REVIEWER,
    approval_date: APPROVAL_DATE,
    approval_status: "approved",
  })),
};
mkdirSync(resolve(ROOT, "data/adle/review/d4-mor/v2"), { recursive: true });
mkdirSync(RELEASE_DIR, { recursive: true });
writeJson(resolve(ROOT, APPROVAL_PATH), approval);
const approvalFileSha256 = sha256(readFileSync(resolve(ROOT, APPROVAL_PATH)));

const oldTeachingContent = readJson(resolve(OLD_DIR, "teaching-content-separated-hyphenated.json"));
const contentVersionId = stableUuid("content_version", `${SEPARATED_HYPHENATED_MICRO_SKILL_KEY}:${SOURCE_COMMIT}:${contentHash}`);
const teachingContent = {
  schemaVersion: 1,
  microSkillKey: SEPARATED_HYPHENATED_MICRO_SKILL_KEY,
  authorityKey: AUTHORITY_KEY,
  content: {
    ...oldTeachingContent.content,
    contentVersionId,
    contentVersion: "human_reviewed_reading_pages_v2",
    instructionalPurpose: [...PURPOSES],
    readingPages: pages,
  },
  approvalRefs: [APPROVAL_PATH, `sha256:${approvalFileSha256}`].sort(),
};
writeJson(resolve(RELEASE_DIR, "teaching-content-separated-hyphenated-reading-pages.json"), teachingContent);

const oldRelease = readJson(resolve(OLD_DIR, "route-release-separated-hyphenated.json")) as AdleCurriculumReleaseManifestV2;
const oldDependencies = oldRelease.microSkills[0].dependencies;
const release: AdleCurriculumReleaseManifestV2 = {
  schemaVersion: 2,
  releaseKey: RELEASE_KEY,
  route: oldRelease.route,
  approvalRefs: teachingContent.approvalRefs,
  microSkills: [{
    microSkillKey: SEPARATED_HYPHENATED_MICRO_SKILL_KEY,
    dependencies: oldDependencies.map((dependency) => dependency.authorityType === "teaching_content"
      ? {
          authorityType: "teaching_content",
          authorityKey: AUTHORITY_KEY,
          authoritySchemaVersion: 1,
          semanticFingerprint: fingerprintSnapshotValue({
            schemaVersion: 1,
            microSkillKey: SEPARATED_HYPHENATED_MICRO_SKILL_KEY,
            ...teachingContent.content,
          }),
        }
      : dependency),
  }],
};
const releaseValidation = validateAdleCurriculumReleaseManifestV2(release);
if (!releaseValidation.valid) throw new Error(releaseValidation.errors.join(","));
writeJson(resolve(RELEASE_DIR, "route-release-separated-hyphenated-reading-pages.json"), release);

const packageManifest = {
  schemaVersion: 1,
  packageKey: "compound-word-separated-hyphenated-reading-pages-2026-08-12",
  microSkillKey: SEPARATED_HYPHENATED_MICRO_SKILL_KEY,
  sourceFile: SOURCE_FILE,
  sourceCommit: SOURCE_COMMIT,
  sourceFileSha256,
  contentHash,
  approvalArtifact: APPROVAL_PATH,
  approvalArtifactSha256: approvalFileSha256,
  teachingContentAuthorityKey: AUTHORITY_KEY,
  teachingContentManifestSha256: sha256(readFileSync(resolve(RELEASE_DIR, "teaching-content-separated-hyphenated-reading-pages.json"))),
  releaseKey: RELEASE_KEY,
  releaseFileSha256: sha256(readFileSync(resolve(RELEASE_DIR, "route-release-separated-hyphenated-reading-pages.json"))),
  releaseFingerprints: fingerprintAdleCurriculumReleaseManifest(release),
  historicalAuthorityId: "120595ba-98e6-4b2c-b11e-fb23edc98be1",
  historicalReleaseId: "8bcae678-a1d2-4572-a1e9-9aacb378cf9f",
  productionDark: true,
};
writeJson(resolve(RELEASE_DIR, "package-manifest.json"), packageManifest);

console.log(JSON.stringify(packageManifest, null, 2));
