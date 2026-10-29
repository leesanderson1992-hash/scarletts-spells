#!/usr/bin/env node
/** Freeze all ten reviewed Schwa teaching templates, including Initial A. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { WEAK_VOWEL_MICRO_SKILLS } from "../lib/adle/word-lab/weak-vowel-dinner";
import { buildWeakVowelReleasePackage } from "../lib/adle/weak-vowel/release";

const output = resolve("content/secret-life-of-vowels/schwa-initial-a-medial-natural-release-package.json");
const pkg = buildWeakVowelReleasePackage({
  releaseKey: "weak-vowel-initial-a-medial-natural-owner-reviewed-2026-10-29",
  approvalRefs: [
    "owner-approved-weak-vowel-content-and-design-2026-10-21",
    "owner-approved-final-et-al-word-facts-and-audio-2026-10-28",
    "owner-approved-final-al-teaching-and-final-et-amendments-2026-10-28",
    "owner-approved-initial-a-teaching-and-four-word-facts-2026-10-29",
    "owner-approved-natural-medial-u-target-2026-10-29",
  ],
});
const keys = pkg.manifest.microSkills.map(row => row.microSkillKey);
if (keys.length !== 10 || !WEAK_VOWEL_MICRO_SKILLS.every(key => keys.includes(key)) ||
  keys.includes("D4_SCHWA_MEDIAL_NATURAL_ACTUAL" as typeof keys[number]))
  throw Error("SCHWA_TEN_SKILL_RELEASE_SET_MISMATCH");
writeFileSync(output, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(JSON.stringify({ output, releaseKey: pkg.manifest.releaseKey,
  packageSha256: pkg.packageSha256, microSkillCount: keys.length }));
