import assert from "node:assert/strict";
import { profileCompilerReady, profileWordErrorsBlockRoute } from "../lib/teaching-dictionary-manager/lesson-preflight";

const valid = new Set(["careful", "careless", "hopeful", "hopeless"]);
const active = {
  productionEnabled: true,
  coverageComplete: true,
  validatedMemberIds: valid,
  existingMemberIds: [...valid, "helpful"],
  reviewedCandidateIds: [] as string[],
  minimumLessonWords: 4,
};
const readiness = (input: typeof active) => ({
  compilerReady: profileCompilerReady({
    coverageComplete: input.coverageComplete,
    productionEnabled: input.productionEnabled,
    validatedMemberIds: input.validatedMemberIds,
    proposedMemberIds: input.existingMemberIds,
    reviewedCandidateIds: input.reviewedCandidateIds,
  }),
  wordErrorsBlockRoute: profileWordErrorsBlockRoute({
    productionEnabled: input.productionEnabled,
    validatedMemberCount: input.validatedMemberIds.size,
    minimumLessonWords: input.minimumLessonWords,
    unreadyExistingMembers: input.existingMemberIds.filter((id) => !input.validatedMemberIds.has(id)).length,
    unreadyReviewedCandidates: input.reviewedCandidateIds.filter((id) => !input.validatedMemberIds.has(id)).length,
  }),
});
assert.deepEqual(readiness(active), {
  compilerReady: true, wordErrorsBlockRoute: false,
}, "an enabled profile can teach from its four validated members");
assert.deepEqual(readiness({ ...active, reviewedCandidateIds: ["helpful"] }), {
  compilerReady: false, wordErrorsBlockRoute: true,
}, "an invalid reviewed addition cannot be released");
assert.deepEqual(readiness({ ...active, productionEnabled: false }), {
  compilerReady: false, wordErrorsBlockRoute: true,
}, "a new profile needs complete reviewed membership");
assert.deepEqual(readiness({ ...active, coverageComplete: false, validatedMemberIds: new Set([...valid].slice(0, 3)) }), {
  compilerReady: false, wordErrorsBlockRoute: true,
}, "four validated members are required");
assert.equal(readiness({ ...active, coverageComplete: false }).compilerReady, false,
  "valid data without a compiler witness is not ready");
console.log("suffix admin readiness regression passed");
