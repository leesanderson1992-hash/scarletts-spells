import assert from "node:assert/strict";
import { calculateShadowProficiency, requiredAgeBands, type ShadowInput } from "../lib/adle/proficiency/shadow-v1";

assert.deepEqual(requiredAgeBands("2016-10-14", "2026-10-13"), ["early_primary", "middle_primary"]);
assert.deepEqual(requiredAgeBands("2016-10-14", "2026-10-14"), ["early_primary", "middle_primary", "upper_primary"]);
assert.equal(requiredAgeBands(null, "2026-10-13"), null);

const base: ShadowInput = {
  learnerId: "learner", dateOfBirth: "2017-10-14", asOf: "2026-10-13",
  words: [
    { id: "one", active: true, reviewEligible: true, frequencyBand: "high", ageBand: "early_primary", complexityLevel: 1, structuralScore: 1, groupIds: ["role-a"] },
    { id: "two", active: true, reviewEligible: true, frequencyBand: "high", ageBand: "middle_primary", complexityLevel: 2, structuralScore: 3, groupIds: ["role-b"] },
    { id: "advanced", active: true, reviewEligible: true, frequencyBand: "low", ageBand: "later_review", complexityLevel: 3, structuralScore: 8, groupIds: ["role-a"] },
  ],
  relationships: ["one", "two", "advanced"].map((wordId) => ({ wordId, skillKey: "D4_HOM_TEST", authorityFingerprint: `relation-${wordId}` })),
  skills: [{ key: "D4_HOM_TEST", label: "Choice test", profile: "CONTEXT_DEPENDENT_CLOSED_SET_V1" }],
  projections: [], evidenceAuthorityComplete: true, recurrenceAuthorityComplete: true, resolvedNegativeEventIds: [],
};
const event = (wordId: string, environment: "CONTROLLED_LESSON" | "CONTEXTUAL_TRANSFER" | "AUTHENTIC_WRITING", occurredAt: string) => ({
  projectionId: `${wordId}-${environment}-${occurredAt}`, eventId: `${wordId}-${environment}-${occurredAt}`,
  learnerId: "learner", canonicalWordId: wordId, microSkillKey: "D4_HOM_TEST", polarity: "positive" as const,
  occurredAt, environment, relationshipAuthorityFingerprint: `relation-${wordId}`,
});
const controlled = [event("one", "CONTROLLED_LESSON", "2026-10-01T12:00:00Z"), event("two", "CONTROLLED_LESSON", "2026-10-01T12:10:00Z")];
const oneContext = event("one", "CONTEXTUAL_TRANSFER", "2026-10-08T12:00:00Z");
const twoContext = event("two", "CONTEXTUAL_TRANSFER", "2026-10-09T12:00:00Z");

const first = calculateShadowProficiency({ ...base, projections: [...controlled, oneContext, event("advanced", "AUTHENTIC_WRITING", "2026-10-09T12:00:00Z")] })[0];
assert.equal(first.requiredPoolSize, 2);
assert.deepEqual(first.outsidePoolObservedWordIds, ["advanced"]);
assert.equal(first.achievedLevel, 2, "one contextual choice can satisfy Level 2 but not Level 3");
assert.equal(first.levels[2].gates.find((gate) => gate.name === "contextual")?.passed, false);

const both = calculateShadowProficiency({ ...base, projections: [...controlled, oneContext, twoContext] })[0];
assert.equal(both.achievedLevel, 3, "both words used in context certify Level 3 after time gates");
assert.equal(both.levels[3].passed, false, "upper levels require authentic and longer-spaced evidence");

const unqualified = calculateShadowProficiency({ ...base, projections: [...controlled, oneContext, twoContext], evidenceAuthorityComplete: false })[0];
assert.equal(unqualified.achievedLevel, null);
assert.equal(unqualified.status, "evidence_unresolved");

const missingAge = calculateShadowProficiency({ ...base, dateOfBirth: null, projections: [...controlled, oneContext, twoContext] })[0];
assert.equal(missingAge.status, "eligibility_unresolved");
assert.equal(missingAge.achievedLevel, null);

const missingGroups = calculateShadowProficiency({ ...base, words: base.words.map((word) => ({ ...word, groupIds: null })), projections: [...controlled, oneContext, twoContext] })[0];
assert.equal(missingGroups.status, "requirement_profile_unresolved");
assert.ok(missingGroups.blockers.includes("context_role_groups_unresolved"));

const oneWord = calculateShadowProficiency({ ...base, words: base.words.filter((word) => word.id === "one"),
  relationships: base.relationships.filter((row) => row.wordId === "one"), projections: [controlled[0], oneContext] })[0];
assert.equal(oneWord.levels[0].certifiable, true);
assert.ok(oneWord.levels[2].blockedReasons.some((reason) => reason.startsWith("allocation_limited")) === false,
  "closed sets cap their required breadth rather than applying productive floors");

const tied = calculateShadowProficiency({ ...base, words: base.words.map((word) => ({ ...word, complexityLevel: 1, structuralScore: 1 })),
  projections: [...controlled, oneContext, twoContext] })[0];
assert.equal(tied.achievedLevel, 3, "tied complexity must not manufacture an extended band");
assert.deepEqual(tied.levels[2].requiredBands, ["FOUNDATION"]);

const negative = { ...oneContext, projectionId: "negative-projection", eventId: "negative-event", polarity: "negative" as const };
const unstable = calculateShadowProficiency({ ...base, projections: [...controlled, oneContext, twoContext, negative, { ...negative, projectionId: "negative-projection-2", eventId: "negative-event-2" }, { ...negative, projectionId: "negative-projection-3", eventId: "negative-event-3" }] })[0];
assert.equal(unstable.levels[1].gates.find((gate) => gate.name === "unresolved_causal_errors")?.passed, false);
assert.equal(unstable.achievedLevel, 1);
const recovered = calculateShadowProficiency({ ...base, projections: [...controlled, oneContext, twoContext, negative], resolvedNegativeEventIds: ["negative-event"] })[0];
assert.equal(recovered.achievedLevel, 3);

console.log("ADLE five-level shadow regression passed");
