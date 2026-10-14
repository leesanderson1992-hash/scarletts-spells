import assert from "node:assert/strict";
import { filterBulkWords, isolatedPhonemeSymbols, morphemeParts, nextBulkReviewDraft, nextBulkSelection, syllableCount, type BulkWord } from "../lib/teaching-dictionary-manager/bulk-skill-assignment";
import { managerAssignedPairs } from "../lib/teaching-dictionary-manager/bulk-review";
import type { CanonicalWordSkillRelationship } from "../lib/adle/word-skill-relationships/contracts";

assert.equal(syllableCount("2"), 2);
assert.equal(syllableCount("ac-tiv-i-ty"), 4);
assert.equal(syllableCount("re·new"), 2);
assert.equal(syllableCount(""), null);
assert.equal(syllableCount("unreviewed"), null);
assert.deepEqual(morphemeParts([
  { sourceText: "re", surfaceText: "re", kind: "prefix" },
  { sourceText: "able", surfaceText: "abil", kind: "base" },
  { sourceText: "", surfaceText: "ity", kind: "suffix" },
]), ["re-", "able", "-ity"]);

const words: BulkWord[] = [
  { id: "1", displayWord: "renew", normalisedWord: "renew", approvable: true,
    hasSchwa: false, syllableCount: 2, morphemeParts: ["re-", "new"], phonemeHint: "/rɪˈnjuː/", phonemeSymbols: isolatedPhonemeSymbols("/rɪˈnjuː/") },
  { id: "2", displayWord: "activity", normalisedWord: "activity", approvable: true,
    hasSchwa: true, syllableCount: 4, morphemeParts: ["act", "-ity"], phonemeHint: "/ækˈtɪvɪti/", phonemeSymbols: isolatedPhonemeSymbols("/ækˈtɪvɪti/") },
  { id: "3", displayWord: "ready", normalisedWord: "ready", approvable: false,
    hasSchwa: null, syllableCount: null, morphemeParts: [], phonemeHint: null, phonemeSymbols: [] },
];
const all = { search: "", schwa: "all" as const, morpheme: "", syllables: "", phoneme: "" };
assert.deepEqual(filterBulkWords(words, { ...all, search: "TI" }).map((word) => word.id), ["2"]);
assert.deepEqual(filterBulkWords(words, { ...all, schwa: "yes", morpheme: "-ity", syllables: "4" })
  .map((word) => word.id), ["2"]);
assert.deepEqual(filterBulkWords(words, { ...all, schwa: "unknown", syllables: "unknown" })
  .map((word) => word.id), ["3"]);
assert.deepEqual(isolatedPhonemeSymbols("/ˈtʃeɪndʒ/"), ["tʃ", "eɪ", "n", "dʒ"]);
assert.deepEqual(isolatedPhonemeSymbols(null), []);
assert.deepEqual(filterBulkWords(words, { ...all, phoneme: "uː" }).map((word) => word.id), ["1"]);
assert.deepEqual(filterBulkWords(words, { ...all, phoneme: "ə" }).map((word) => word.id), []);
const relationship = (sourceReference: string): CanonicalWordSkillRelationship => ({
  canonicalWordId: "1", microSkillKey: "skill", relationshipRole: "demonstrates",
  positiveEvidenceEligible: true, authorityInterpretationVersion: "ADLE_PROFICIENCY_MODEL_V1",
  authorityFingerprint: "fixture", sourceProvenance: [{ sourceAuthority: "explicit_reviewed_association",
    provenanceId: "release", sourceAuthorityVersion: "fixture", relationshipRole: "demonstrates",
    exactPairApproval: "approved", reviewState: "approved", releaseState: "released",
    occurrenceCount: 1, metadata: { sourceReference } }],
});
assert.equal(managerAssignedPairs([relationship("Teaching Dictionary Manager human bulk approval: 1:skill")])[0].removable, true);
assert.equal(managerAssignedPairs([relationship("External reviewed source")])[0].removable, false);
const firstPage = nextBulkSelection(new Set<string>(), ["1"], true)!;
const secondPage = nextBulkSelection(firstPage, ["2"], true)!;
assert.deepEqual([...secondPage], ["1", "2"]);
assert.deepEqual([...nextBulkSelection(secondPage, ["1"], false)!], ["2"]);
assert.equal(nextBulkSelection(secondPage, ["3"], true, 2), null);
const savedExcluded = new Set(["skill:3", "other:2"]);
const applyDraft = nextBulkReviewDraft(new Map(), ["1"], "apply", true, savedExcluded, "skill")!;
assert.deepEqual([...applyDraft], [["1", "apply"]]);
const switchedDraft = nextBulkReviewDraft(applyDraft, ["1"], "exclude", true, savedExcluded, "skill")!;
assert.deepEqual([...switchedDraft], [["1", "exclude"]]);
assert.deepEqual([...nextBulkReviewDraft(switchedDraft, ["1"], "exclude", false, savedExcluded, "skill")!], []);
const changedSaved = nextBulkReviewDraft(new Map(), ["3"], "apply", true, savedExcluded, "skill")!;
assert.deepEqual([...changedSaved], [["3", "apply"]]);
assert.deepEqual([...nextBulkReviewDraft(changedSaved, ["3"], "apply", false, savedExcluded, "skill")!], [["3", "clear"]]);
assert.deepEqual([...nextBulkReviewDraft(new Map(), ["2"], "exclude", true, savedExcluded, "skill")!], [["2", "exclude"]]);
assert.equal(nextBulkReviewDraft(applyDraft, ["2", "4"], "exclude", true, savedExcluded, "skill", 2), null);
console.log("Teaching dictionary bulk assignment filters passed.");
