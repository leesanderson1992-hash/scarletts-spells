#!/usr/bin/env node
/** Freeze the owner-reviewed nine-skill teaching templates without publishing or activating them. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { WEAK_VOWEL_MICRO_SKILLS } from "../lib/adle/word-lab/weak-vowel-dinner";
import { buildWeakVowelReleasePackage } from "../lib/adle/weak-vowel/release";

const output = resolve("content/secret-life-of-vowels/schwa-final-et-al-release-package.json");
const pkg = buildWeakVowelReleasePackage({
  releaseKey: "weak-vowel-final-et-al-owner-reviewed-2026-10-28",
  microSkillKeys: WEAK_VOWEL_MICRO_SKILLS.filter(key => key !== "D4_SCHWA_INITIAL_A_INITIAL"),
  approvalRefs: [
    "owner-approved-weak-vowel-content-and-design-2026-10-21",
    "owner-approved-final-et-al-word-facts-and-audio-2026-10-28",
    "owner-approved-final-al-teaching-and-final-et-amendments-2026-10-28",
  ],
});
const keys = pkg.manifest.microSkills.map(({ microSkillKey }) => microSkillKey);
if (keys.length !== 9 || !WEAK_VOWEL_MICRO_SKILLS.filter(key => key !== "D4_SCHWA_INITIAL_A_INITIAL").every(key => keys.includes(key)) || keys.includes("D4_SCHWA_MEDIAL_NATURAL_ACTUAL" as typeof keys[number]))
  throw new Error("SCHWA_FINAL_ET_AL_RELEASE_SKILL_SET_MISMATCH");
writeFileSync(output, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(JSON.stringify({ output, releaseKey: pkg.manifest.releaseKey, packageSha256: pkg.packageSha256, microSkillKeys: keys, activation: pkg.activation }));
