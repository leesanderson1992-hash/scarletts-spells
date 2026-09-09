import assert from "node:assert/strict";

import {
  evaluateOrdinaryWritingV3,
  ordinaryEvaluationFingerprint,
  type OrdinaryWritingV3Case,
  type OrdinaryWritingV3Gold,
  type OrdinaryEvaluationDecision,
} from "./lib/whole-writing-v3-ordinary-evaluation";

const family = "YOUR_YOURE" as const;
const cases: OrdinaryWritingV3Case[] = [];
const gold: OrdinaryWritingV3Gold[] = [];
for (let index = 0; index < 400; index += 1) {
  const classification = index < 150 ? "VALID" as const : index < 300 ? "INVALID" as const : "UNCERTAIN" as const;
  const surface = classification === "INVALID" ? "your" : "you're";
  const sourceText = classification === "VALID"
    ? `Passage ${index}: you're ready to read.`
    : classification === "INVALID"
      ? `Passage ${index}: your ready to read.`
      : `Passage ${index}: maybe you're ...`;
  const startUtf16 = sourceText.indexOf(surface);
  const protectedSetTags = classification === "UNCERTAIN"
    ? [["fragment"], ["quotation"], ["gerund"], ["run_on"], ["task_dependent"]][index % 5] as OrdinaryWritingV3Case["protectedSetTags"]
    : [];
  const candidateCore = {
    schemaVersion: 1 as const,
    passageId: `evaluation-passage-${index}`,
    caseId: `evaluation-case-${index}`,
    family,
    sourceText,
    focusSurface: surface,
    startUtf16,
    endUtf16: startUtf16 + surface.length,
    declaredConstruction: "you_are_contraction",
    declaredSubtype: "adjectival_contraction",
    primaryFocus: true,
    protectedSetTags,
    sourceReference: "IN_MEMORY_ENGINEERING_FIXTURE",
    authoredBy: "ENGINEERING_FIXTURE_NOT_HUMAN_HOLDOUT",
  };
  cases.push({ ...candidateCore, candidateFingerprint: ordinaryEvaluationFingerprint(candidateCore) });
  const goldCore = {
    schemaVersion: 1 as const,
    caseId: candidateCore.caseId,
    family,
    classification,
    intendedAlternative: classification === "INVALID" ? "you're" : null,
    supportedConstruction: classification !== "UNCERTAIN",
    primaryLabelId: `primary-${index}`,
    nonGoldReviewId: `review-${index}`,
    adjudicationId: null,
  };
  gold.push({ ...goldCore, goldFingerprint: ordinaryEvaluationFingerprint(goldCore) });
}

const analyser = (input: { fieldText: string; startUtf16: number; endUtf16: number }): OrdinaryEvaluationDecision => {
  const uncertain = input.fieldText.includes("maybe");
  const observed = input.fieldText.slice(input.startUtf16, input.endUtf16);
  return {
    status: uncertain ? "UNCERTAIN" : observed === "your" ? "INVALID" : "VALID",
    familyKey: family,
    observedMember: observed,
    alternativeMember: observed === "your" ? "you're" : null,
    assessedScope: "engineering_fixture",
    reasonCode: "ENGINEERING_FIXTURE",
    ruleId: "ENGINEERING_FIXTURE",
    analyserVersion: "ENGINEERING_FIXTURE",
    manifestFingerprint: "engineering-fixture",
  };
};

const passing = evaluateOrdinaryWritingV3({
  family,
  cases,
  gold,
  analyser,
  releaseFingerprint: "engineering-release",
  corpusFingerprint: ordinaryEvaluationFingerprint(cases),
});
assert.equal(passing.disposition, "PASS_REVIEWABLE_NOT_PUBLISHED");
assert.equal(passing.metrics.precision, 1);
assert.equal(passing.metrics.supportedRecall, 1);
assert.equal(passing.metrics.validRecognition, 1);
assert.equal(passing.metrics.falseValid, 0);
assert.equal(passing.metrics.wrongAlternatives, 0);
assert.equal(passing.metrics.protectedFailures, 0);
assert(passing.metrics.wilsonLower95 >= 0.95);

const unsafe = evaluateOrdinaryWritingV3({
  family,
  cases,
  gold,
  analyser: (input) => input.fieldText.includes("maybe") ? { ...analyser(input), status: "VALID" } : analyser(input),
  releaseFingerprint: "unsafe-release",
  corpusFingerprint: ordinaryEvaluationFingerprint(cases),
});
assert.equal(unsafe.disposition, "BLOCKED");
assert(unsafe.issues.includes("FALSE_VALID_PRESENT"));
assert(unsafe.issues.includes("PROTECTED_FAILURE_PRESENT"));
assert.notEqual(passing.reportFingerprint, unsafe.reportFingerprint);

console.log("S8 V3 ordinary-writing evaluation policy regression passed.");
