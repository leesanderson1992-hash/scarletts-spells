import { spawnSync } from "node:child_process";
/* eslint-disable @typescript-eslint/no-explicit-any -- reviewed JSON release artifacts are runtime-asserted below */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { selectBaseWordFamilyLesson } from "../lib/adle/base-word-family-selection";
import { compileBaseWordFamilyLessonSnapshot, validateBaseWordFamilyLessonSnapshot } from "../lib/adle/morphology/base-word-family-payload";
import { BASE_WORD_FAMILY_ASSIGNMENT_ITEM_COUNT, baseWordFamilyPilotBindingSpecs } from "../lib/adle/morphology/base-word-family-pilot-contract";
import { ACCEPTED_PACKAGE_SHA256, IMPORT_BATCH_ID, RELEASE_ID, loadAcceptedPackage } from "./adle-base-word-family-meaning-production-release";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const root = resolve(process.cwd());
const auditRun = spawnSync("python3", [resolve(root, "scripts/audit-base-word-family-meaning-release.py")], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
assert(auditRun.status === 0, auditRun.stderr || "family-meaning audit failed");
const audit = JSON.parse(auditRun.stdout);
const loaded = loadAcceptedPackage();

assert(loaded.manifest.releaseId === RELEASE_ID && loaded.manifest.importBatchId === IMPORT_BATCH_ID && loaded.manifest.packageSha256 === ACCEPTED_PACKAGE_SHA256, "release identity must be immutable");
assert(audit.counts.families === 87 && audit.counts.members === 227 && audit.counts.missingOrUnreviewed === 0, "all 87/227 reviewed rows must resolve");
assert(JSON.stringify(audit.counts.classifications) === JSON.stringify({ generated_and_reviewed: 32, reviewed_override: 43, reviewed_source: 152 }), "meaning provenance counts must remain exact");
assert(JSON.stringify(audit.counts.roles) === JSON.stringify({ authentic_target: 119, base: 87, transfer: 21 }), "family roles must remain exact");
for (const word of ["bed_en_gb", "foot_en_gb", "sun_en_gb"]) {
  const member = audit.members.find((row: any) => row.wordKey === word);
  assert(member?.memberRole === "base", `${word} must remain a legitimate base member`);
}

const skill = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const members = audit.members.filter((row: any) => row.microSkillKey === skill);
const families = audit.families.filter((row: any) => row.microSkillKey === skill);
const targetWords = ["action_en_gb", "happiness_en_gb"];
const selection = selectBaseWordFamilyLesson("release-proof-child", skill, {
  learningItems: targetWords.map((canonicalWordId, index) => ({
    learningItemId: `release-proof-${index + 1}`, childId: "release-proof-child", canonicalWordId, microSkillKey: skill,
    itemStatus: "pending" as const, sourceKind: "verified_misspelling" as const, sourceRef: `proof-${index + 1}`,
    sourceAttemptText: "controlled proof", reteachPriority: false, ejectedOn: null, intakeOn: `2026-08-0${index + 1}`, rowStatus: "active" as const,
  })),
  families: families.map((row: any) => ({ baseFamilyKey: row.baseFamilyKey, microSkillKey: row.microSkillKey, rowStatus: "active" as const, reviewStatus: row.reviewStatus })),
  members: members.map((row: any) => ({ baseFamilyKey: row.baseFamilyKey, canonicalWordId: row.wordKey, memberRole: row.memberRole, assignmentEligible: row.assignmentEligible, complexityLevel: null, rowStatus: "active" as const, reviewStatus: row.reviewStatus })),
});
assert(selection.skipReasons.length === 0, `reviewed release pool must select: ${selection.skipReasons.join(",")}`);
assert(selection.baseFamilyKeys.length === 2 && new Set(selection.baseFamilyKeys).size === 2, "authentic targets must come from two distinct families");
assert(selection.slots.length === 6 && selection.slots.filter((slot) => slot.provenance === "authentic_target").length === 2 && selection.slots.filter((slot) => slot.provenance === "transfer").length === 4, "release pool must preserve 2 authentic + 4 transfers / 6 independent words");

const memberByWord = new Map(members.map((row: any) => [row.wordKey, row]));
const familyByKey = new Map(families.map((row: any) => [row.baseFamilyKey, row]));
const snapshotWord = (wordKey: string) => {
  const row: any = memberByWord.get(wordKey);
  assert(row, `missing reviewed member ${wordKey}`);
  return { canonicalWordId: wordKey, displayWord: row.displayWord, wordSum: row.wordSum, parts: row.morphologyParts, joins: row.morphologyJoins, transformations: row.morphologyTransformations, transformationNotes: row.transformationNotes, childFriendlyMeaning: row.childFriendlyMeaning, dictationSentence: row.dictationSentence, dictationTargetTokenIndex: row.dictationTargetTokenIndex, audioText: row.audioText };
};
const snapshot = compileBaseWordFamilyLessonSnapshot({
  microSkillKey: skill,
  contentVersion: "release-pool-proof-v1",
  authenticTargets: targetWords.map((canonicalWordId, index) => ({ canonicalWordId, learningItemId: `release-proof-${index + 1}`, sourceRef: `proof-${index + 1}` })),
  familySections: selection.guidedFamilySections.map((section) => {
    const family: any = familyByKey.get(section.baseFamilyKey);
    assert(family, `missing reviewed family ${section.baseFamilyKey}`);
    const baseMember: any = members.find((row: any) => row.baseFamilyKey === section.baseFamilyKey && row.memberRole === "base");
    assert(baseMember, `missing base member ${section.baseFamilyKey}`);
    return { baseFamilyKey: section.baseFamilyKey, baseWord: snapshotWord(baseMember.wordKey), baseMeaning: family.baseMeaning, etymologyRoute: family.etymologyRoute, authenticTargetWordIds: [...section.authenticTargetWordIds], guidedWords: section.guidedWordIds.map(snapshotWord) };
  }),
  independentSlots: selection.slots.map((slot) => ({ ...slot })),
  pilotLessonNumber: 1,
});
assert(validateBaseWordFamilyLessonSnapshot(snapshot), "the reviewed release pool must compile to the governed snapshot");
assert(baseWordFamilyPilotBindingSpecs(snapshot).length === BASE_WORD_FAMILY_ASSIGNMENT_ITEM_COUNT && BASE_WORD_FAMILY_ASSIGNMENT_ITEM_COUNT === 18, "the release pool must preserve exactly 18 immutable bindings");

const migration = readFileSync(resolve(root, "supabase/migrations/20260809160000_allow_base_word_family_release_ledger.sql"), "utf8");
const publisher = readFileSync(resolve(root, "scripts/adle-base-word-family-meaning-production-release.ts"), "utf8");
assert(migration.includes("base_word_family_batch_v1") && migration.includes("prevent_applied_base_word_family_release_mutation"), "release-ledger package and append-only protection must be migrated together");
assert(publisher.includes("publish_adle_base_word_family_membership_authority_v1") && publisher.includes("reset role"), "guarded publisher must use the existing authority publisher outside the restricted insert role");
assert(!/(?:^|[^a-z])(bed|foot|sun)(?:[^a-z]|$)/i.test(readFileSync(resolve(root, "lib/adle/base-word-family-selection.ts"), "utf8")), "production selection must contain no word blacklist");
assert(!publisher.includes("adle_curriculum_release_manifests(") && !publisher.includes("adle_route_activation_revisions("), "family publication must not create route releases or activations");

console.log("adle-base-word-family-meaning-release-regression: ok");
