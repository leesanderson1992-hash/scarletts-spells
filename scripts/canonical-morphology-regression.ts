import assert from "node:assert/strict";
import { auditCanonicalMorphology, canonicalPartsStatus } from "../lib/teaching-dictionary-manager/canonical-morphology";

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
assert.equal(auditCanonicalMorphology({ ...input, parts: [
  { ...safe.convertedParts![0], displayRange: { start: 1, end: 7 } }, safe.convertedParts![1],
] }).reason, "display_range");
console.log("Canonical morphology audit regression passed.");
