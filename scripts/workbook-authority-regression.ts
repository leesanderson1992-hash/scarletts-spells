import assert from "node:assert/strict";
import { reviewedWorkbookAuthority } from "../lib/teaching-dictionary-manager/workbook-authority";
import type { MultiSenseCsvBundle } from "../lib/teaching-dictionary-manager/multi-sense-csv";

const current: MultiSenseCsvBundle = {
  wordId: "fixture", displayWord: "imperfect", sourceSenseReviewedAt: "2026-11-18T10:00:00Z",
  senseSet: { pronunciations: [{ id: "p", ipa: "/test/", spokenSyllableCount: 1, stressPattern: "primary" }],
    senses: [{ id: "s", definition: "Not perfect.", partOfSpeech: "adjective", pronunciationId: "p" }] },
  analyses: [],
};
const old = { ...current, sourceSenseReviewedAt: "2026-11-17T10:00:00Z" };
assert.deepEqual(reviewedWorkbookAuthority(old, current), { bundle: current, replacedFields: [] });
const changed = structuredClone(old);
changed.senseSet.senses[0].definition = "Having faults or flaws.";
const accepted = reviewedWorkbookAuthority(changed, current);
assert.deepEqual(accepted.replacedFields, ["meanings and dictation"]);
assert.equal(accepted.bundle.sourceSenseReviewedAt, current.sourceSenseReviewedAt);
assert.equal(accepted.bundle.senseSet.senses[0].definition, "Having faults or flaws.");
assert.equal(current.senseSet.senses[0].definition, "Not perfect.", "Do not mutate saved facts");
assert.equal(changed.sourceSenseReviewedAt, old.sourceSenseReviewedAt, "Do not mutate the parsed upload");
assert.deepEqual(reviewedWorkbookAuthority(changed).replacedFields, []);
assert.equal(reviewedWorkbookAuthority(changed).bundle, changed);
console.log("PASS: reviewed workbook replaces conflicting facts, refreshes its transaction revision and preserves inputs");
