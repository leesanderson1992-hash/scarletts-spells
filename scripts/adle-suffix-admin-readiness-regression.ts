import assert from "node:assert/strict";
import { suffixProfileReadiness } from "../lib/teaching-dictionary-manager/lesson-preflight";

const valid = new Set(["careful", "careless", "hopeful", "hopeless"]);
const active = {
  productionEnabled: true,
  coverageComplete: true,
  validatedMemberIds: valid,
  existingMemberIds: [...valid, "helpful"],
  reviewedCandidateIds: [] as string[],
  minimumLessonWords: 4,
};
assert.deepEqual(suffixProfileReadiness(active), {
  compilerReady: true, wordErrorsBlockRoute: false,
}, "an enabled profile can teach from its four validated members");
assert.deepEqual(suffixProfileReadiness({ ...active, reviewedCandidateIds: ["helpful"] }), {
  compilerReady: false, wordErrorsBlockRoute: true,
}, "an invalid reviewed addition cannot be released");
assert.deepEqual(suffixProfileReadiness({ ...active, productionEnabled: false }), {
  compilerReady: false, wordErrorsBlockRoute: true,
}, "a new profile needs complete reviewed membership");
assert.deepEqual(suffixProfileReadiness({ ...active, validatedMemberIds: new Set([...valid].slice(0, 3)) }), {
  compilerReady: false, wordErrorsBlockRoute: true,
}, "four validated members are required");
assert.equal(suffixProfileReadiness({ ...active, coverageComplete: false }).compilerReady, false,
  "valid data without a compiler witness is not ready");
console.log("suffix admin readiness regression passed");
