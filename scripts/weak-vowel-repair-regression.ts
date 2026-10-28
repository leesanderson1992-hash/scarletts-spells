import assert from "node:assert/strict";
import {
  WEAK_VOWEL_SKILLS, buildWeakVowelRepairRows, renderWeakVowelRepairCsv, parseWeakVowelRepairCsv,
  repairFingerprint, repairSourceFingerprint, repairRowKey, validateWeakVowelRepairs, type RepairSource,
} from "../lib/teaching-dictionary-manager/weak-vowel-repair";

const skill = "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS";
function source(word: string, overrides: Partial<RepairSource> = {}): RepairSource {
  return {
    word: { id: word, display_word: word, normalised_word: word, row_status: "active", review_status: "approved_for_first_exposure" },
    microSkillKey: skill, assignmentStatus: "assigned", authority: { id: word },
    metadata: [{ id: `metadata:${word}`, syllables: "3", phoneme_hint: "/ˈdɪfrənt/", written_syllable_breakdown: word,
      stress_pattern: "primary-unstressed", has_schwa: true, review_status: "approved_for_first_exposure" }],
    dictations: [{ id: `dictation:${word}`, dictation_sentence: `Say ${word} again.`, dictation_target_token_index: 1, review_status: "approved_for_first_exposure" }],
    morphology: [], routes: [], ...overrides,
  };
}
const when = "2026-10-16T12:00:00.000Z";
const input = [source("different"), source("object", { microSkillKey: "D4_SCHWA_INITIAL_O_INITIAL", assignmentStatus: "deassigned" })];
const rows = buildWeakVowelRepairRows(input, when);
assert.equal(rows.length, 2);
const different = rows.find(row => row.word === "different")!;
assert.match(different.issue_codes, /SPOKEN_COUNT_STRESS_MISMATCH/);
assert.match(different.issue_codes, /TARGET_ALIGNMENT_MISSING/);
assert.equal(different.target_span_json, "", "schwa cannot supply a written target");
assert.equal(different.pronunciation_id, "", "IPA is not an approved variant ID");
assert.equal(different.proposed_ipa, "", "export must not invent repairs");
assert.equal(rows.find(row => row.word === "object")!.memory_lock_status, "Unsuitable");
assert.deepEqual(parseWeakVowelRepairCsv(renderWeakVowelRepairCsv(rows)), rows);
const dangerous = { ...different, reviewer_notes: '=HYPERLINK("https://example.test", "unsafe")\nline, "quote"' };
assert.deepEqual(parseWeakVowelRepairCsv(renderWeakVowelRepairCsv([dangerous])), [dangerous], "formula escaping and embedded CSV delimiters round trip");
assert.equal(validateWeakVowelRepairs(rows, rows, rows).status, "awaiting_human_review");
assert.equal(validateWeakVowelRepairs(rows, rows, rows).publicationReady, false);
assert(validateWeakVowelRepairs([...rows, rows[0]], rows, rows).errors.some(error => error.code === "DUPLICATE_REPAIR_ROW"));
assert(validateWeakVowelRepairs(rows.slice(1), rows, rows).errors.some(error => error.code === "BASELINE_ROW_OMITTED"));
const changedCurrent = rows.map(row => ({ ...row, source_fingerprint: "changed" }));
assert(validateWeakVowelRepairs(rows, rows, changedCurrent).errors.some(error => error.code === "STALE_SOURCE"));
const tampered = rows.map(row => ({ ...row, ipa: "edited original" }));
assert(validateWeakVowelRepairs(tampered, rows, rows).errors.some(error => error.code === "SOURCE_COLUMN_EDITED"));
const newSource = source("futureword", { microSkillKey: "D4_SCHWA_FINAL_A_FINAL" });
const future = buildWeakVowelRepairRows([...input, newSource], when);
assert.equal(future.length, 3, "new assignments enter the export without a word allowlist");
assert(validateWeakVowelRepairs(rows, rows, future).errors.some(error => error.code === "INVENTORY_CHANGED"));
assert.equal(Object.keys(WEAK_VOWEL_SKILLS).length, 9);
const twoSkills = buildWeakVowelRepairRows([source("calendar"), source("calendar", { microSkillKey: "D4_SCHWA_FINAL_AR_FINAL" })], when);
assert.equal(new Set(twoSkills.map(repairRowKey)).size, 2);
const conflicting = twoSkills.map((row, index) => ({ ...row, approval_decision: "approve_changes", proposed_written_breakdown: index ? "ca·len·dar" : "cal·en·dar" }));
assert(validateWeakVowelRepairs(conflicting, twoSkills, twoSkills).errors.some(error => error.code === "SHARED_WORD_REPAIR_CONFLICT"));
const variants = buildWeakVowelRepairRows([source("family", { routes: [{ content: { pronunciations: [
  { id: "expanded", reviewStatus: "approved", ipa: "/ˈfæmɪli/", syllableCount: 3, stressPattern: "primary-unstressed-unstressed" },
  { id: "compressed", reviewStatus: "approved", ipa: "/ˈfæmli/", syllableCount: 2, stressPattern: "primary-unstressed" },
] } }] })], when);
assert.equal(variants.length, 2);
assert.equal(new Set(variants.map(repairRowKey)).size, 2);
const noSchwa = buildWeakVowelRepairRows([source("every", { metadata: [{ id: "every", phoneme_hint: "/ˈevri/", syllables: "2", stress_pattern: "primary-unstressed", has_schwa: false, written_syllable_breakdown: "eve·ry" }] })], when)[0];
assert(!noSchwa.issue_codes.includes("SCHWA_FLAG_NOT_LOCATED"), "compression without schwa is not a schwa-flag error");
for (const [word, ipa] of [["diet", "/dˈaɪət/"], ["quiet", "/kwˈaɪət/"]] as const) {
  const row = buildWeakVowelRepairRows([source(word, { microSkillKey: "D4_SCHWA_FINAL_ET",
    metadata: [{ id: word, phoneme_hint: ipa, syllables: "2", stress_pattern: "primary-unstressed",
      has_schwa: true, written_syllable_breakdown: word }] })], when)[0];
  assert(!row.issue_codes.includes("SCHWA_FLAG_NOT_LOCATED"), `${word} has /ə/ after /aɪ/`);
}
assert.equal(noSchwa.linguistic_review_status, "No inconsistency detected");
assert.equal(noSchwa.blocks_child_presentation, "true", "absence of a contradiction cannot approve a lesson");
assert.equal(repairFingerprint({ b: 2, a: 1 }), repairFingerprint({ a: 1, b: 2 }));
assert.equal(repairSourceFingerprint(source("family")), repairSourceFingerprint(source("family", {
  routes: [{ id: "published-version", content: { weakVowel: { target: "i" } } }],
})), "publishing immutable route content must not stale its own reviewed dictionary source");
assert.notEqual(repairSourceFingerprint(source("family")), repairSourceFingerprint(source("family", {
  metadata: [{ id: "new-metadata", syllables: "2" }],
})), "a shared dictionary edit must stale the reviewed source");
const multiple = buildWeakVowelRepairRows([source("different", { metadata: [...input[0].metadata, ...input[0].metadata] })], when)[0];
assert.match(multiple.issue_codes, /ACTIVE_METADATA_NOT_SINGULAR/);
const exclusion = rows.map(row => ({ ...row, approval_decision: "exclude", proposed_assignment_disposition: "exclude", repair_status: "reviewed",
  reviewer: "Curriculum reviewer", review_date: "2026-10-16", review_source_references: "Reviewed recording", reviewer_notes: "Does not fit the lesson objective." }));
const excluded = validateWeakVowelRepairs(exclusion, rows, rows);
assert.equal(excluded.errors.length, 0);
assert.equal(excluded.status, "reviewed_exclusions_only");
assert.equal(excluded.databaseWrites, 0);
const invalidDate = exclusion.map(row => ({ ...row, review_date: "2026-02-31" }));
assert(validateWeakVowelRepairs(invalidDate, rows, rows).errors.some(error => error.code === "HUMAN_REVIEW_INCOMPLETE"));
assert(validateWeakVowelRepairs(tampered, tampered, rows).errors.some(error => error.code === "BASELINE_NO_LONGER_CURRENT"), "changing both CSV and baseline cannot override live facts");
const unresolved = buildWeakVowelRepairRows([source("missingone", { word: { id: "", display_word: "missingone" }, assignmentStatus: "legacy_only" }),
  source("missingtwo", { word: { id: "", display_word: "missingtwo" }, assignmentStatus: "legacy_only" })], when);
assert.equal(new Set(unresolved.map(repairRowKey)).size, 2, "missing canonical IDs retain separate historical source rows");
const attemptedApproval = rows.map(row => ({ ...row, approval_decision: "approve_changes", repair_status: "reviewed", reviewer: "Reviewer",
  review_date: "2026-10-16", review_source_references: "Recording", proposed_annotation_json: '{"approved":true}' }));
assert(validateWeakVowelRepairs(attemptedApproval, rows, rows).errors.some(error => error.code === "ANNOTATION_COMPILER_NOT_RELEASED"));
assert.throws(() => parseWeakVowelRepairCsv('"a"\n"unclosed'), /REPAIR_CSV_UNCLOSED_QUOTE/);
assert.throws(() => parseWeakVowelRepairCsv('"a"extra'), /REPAIR_CSV_MALFORMED_QUOTE/);
console.log("PASS: complete weak-vowel repair inventory, variants, exclusions, no inferred alignment, CSV round trip and stale-source review gate");
