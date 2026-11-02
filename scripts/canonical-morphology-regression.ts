import assert from "node:assert/strict";
import { auditCanonicalMorphology, canonicalPartsStatus } from "../lib/teaching-dictionary-manager/canonical-morphology";
import { emptyMorphology } from "../lib/teaching-dictionary-manager/contracts";
import { changesMorphologyForPublication } from "../lib/teaching-dictionary-manager/morphology-publication";
import { asParts } from "../app/(authenticated)/admin/teaching-dictionary/part-sequence-editor";
import { morphologyReviewGuidance } from "../lib/teaching-dictionary-manager/morphology-review-guidance";

const parts = [
  { id: "base", kind: "base", sourceText: "scroll", surfaceText: "scroll", gloss: "move across a screen" },
  { id: "suffix", kind: "suffix", sourceText: "ing", surfaceText: "ing", gloss: "an action in progress" },
];
const joins = [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }];
const input = { parts, joins, displayWord: "scrolling", linkedToFamily: false };
const safe = auditCanonicalMorphology(input);
assert.equal(safe.status, "safe_range_conversion");
assert.equal(safe.convertedParts?.[1]?.displayRange.start, 6);
assert.equal(canonicalPartsStatus(safe.convertedParts), "canonical");
assert.equal(auditCanonicalMorphology({ ...input, linkedToFamily: true }).reason, "immutable_family_evidence");
assert.equal(auditCanonicalMorphology({ ...input, parts: parts.map((part) => ({ ...part, text: part.surfaceText })) }).reason, "legacy_aliases");
assert.equal(auditCanonicalMorphology({ ...input, parts: [{ ...parts[0], meaning: parts[0].gloss }, parts[1]] }).reason, "legacy_aliases");
assert.equal(auditCanonicalMorphology({ ...input, parts: [{ ...parts[0], gloss: "" }, parts[1]] }).reason, "unreviewed_part_fact");
assert.equal(auditCanonicalMorphology({ ...input, joins: [] }).reason, "join_count");
assert.equal(auditCanonicalMorphology({ ...input, displayWord: "scrolls" }).reason, "surface_spelling");
assert.equal(auditCanonicalMorphology({ ...input, joins: [{ ...joins[0], beforePartId: "other" }] }).reason, "join_identity");
assert.equal(auditCanonicalMorphology({ ...input, parts: safe.convertedParts }).status, "canonical");
assert.equal(auditCanonicalMorphology({ ...input, parts: safe.convertedParts?.map((part) => ({
  ...part, displayRange: { end: part.displayRange.end, start: part.displayRange.start },
})) }).status, "canonical", "stored JSON key order does not invalidate display positions");
assert.equal(auditCanonicalMorphology({ ...input, parts: [
  { ...safe.convertedParts![0], displayRange: { start: 1, end: 7 } }, safe.convertedParts![1],
] }).reason, "display_range");
const historical = { ...emptyMorphology(), analysisStatus: "approved" as const,
  parts: [{ id: "old", text: "scroll", type: "base", sourceText: "scroll" }],
  wordSum: "scroll → scroll" };
const active = { raw_morpholex_segmentation: null, raw_morpholex_pos: null,
  morphology_parts: historical.parts, feature_keys: [], morphology_joins: [], morphology_transformations: [],
  transformation_notes: null, word_sum: historical.wordSum,
  analysis_status: "approved", review_notes: null };
assert.equal(changesMorphologyForPublication(historical, active), false);
assert.equal(changesMorphologyForPublication(historical, null), true);
assert.equal(changesMorphologyForPublication({ ...historical, parts: [{ ...historical.parts[0], gloss: "move" }] }, active), true);
assert.equal(changesMorphologyForPublication({ ...historical, wordSum: "changed" }, active), true);
assert.equal(changesMorphologyForPublication({ ...historical, analysisStatus: "in_review" }, active), true);
assert.deepEqual(asParts([
  { id: "root", text: "act", partType: "bound_root", meaning: "to do" },
  { id: "suffix", text: "ion", role: "suffix", meaning: "an action" },
]).map(({ kind, surfaceText, sourceText, gloss }) => ({ kind, surfaceText, sourceText, gloss })), [
  { kind: "root", surfaceText: "act", sourceText: "act", gloss: "to do" },
  { kind: "suffix", surfaceText: "ion", sourceText: "ion", gloss: "an action" },
], "historical partType and bound-root values remain editable in the visual control");
const ability = { ...emptyMorphology(), analysisStatus: "approved" as const,
  parts: [
    { id: "part_1", kind: "base", role: "base", text: "abil", type: "base", sourceText: "able", surfaceText: "abil", gloss: "capable of doing something", displayRange: { start: 0, end: 4 } },
    { id: "part_2", kind: "suffix", role: "suffix", text: "ity", type: "suffix", sourceText: "", surfaceText: "ity", gloss: "the state, quality or power of", displayRange: { start: 4, end: 7 } },
  ], joins: [], transformations: [] };
const abilityIssues = morphologyReviewGuidance(ability, "ability", { ity: ["the state or quality of being"] }, false);
assert.ok(abilityIssues.some((item) => item.includes("Older duplicate part fields")));
assert.ok(abilityIssues.some((item) => item.includes("Part 2 needs its underlying form")));
assert.ok(abilityIssues.some((item) => item.includes("older affix meaning")));
assert.ok(abilityIssues.some((item) => item.includes("able → abil")));
assert.ok(abilityIssues.some((item) => item.includes("joins must connect")));
const reviewedAbility = { ...ability, parts: [
  { id: "part_1", kind: "base", sourceText: "able", surfaceText: "abil", gloss: "capable of doing something", displayRange: { start: 0, end: 4 } },
  { id: "part_2", kind: "suffix", sourceText: "ity", surfaceText: "ity", gloss: "the state or quality of being", displayRange: { start: 4, end: 7 } },
], joins: [{ afterPartId: "part_1", beforePartId: "part_2", joinType: "none" }],
  transformations: [{ type: "base_spelling_change", sourcePartId: "part_1", sourceText: "able", surfaceText: "abil", explanation: "The final e changes to i before -ity." }] };
assert.deepEqual(morphologyReviewGuidance(reviewedAbility, "ability", { ity: ["the state or quality of being"] }, false), []);
console.log("Canonical morphology audit regression passed.");
