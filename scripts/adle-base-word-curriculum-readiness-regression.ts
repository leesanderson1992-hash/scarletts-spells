import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import {
  inspectBaseWordRouteContent,
  inspectBaseWordRouteSelection,
  observeBaseWordRouteActivation,
  type BaseWordRouteFactInput,
} from "../lib/adle/curriculum-readiness/base-word-route-facts";
import type { LearningItemFact } from "../lib/adle/learning-items";

const SKILL = "D4_MOR_BASE_WORDS_PRESERVE_BASE";
const CHILD = "child-a";
const WORD_A = "word-really";
const WORD_B = "word-helpful";

function item(id: string, word: string): LearningItemFact {
  return {
    learningItemId: id, childId: CHILD, canonicalWordId: word,
    microSkillKey: SKILL, itemStatus: "pending", sourceKind: "verified_misspelling",
    sourceRef: `source:${id}`, sourceAttemptText: null, reteachPriority: false,
    ejectedOn: null, intakeOn: "2026-07-23", rowStatus: "active",
  };
}

function input(word = WORD_A): BaseWordRouteFactInput {
  return {
    canonicalWordId: word,
    microSkillKey: SKILL,
    words: [{ canonicalWordId: word, rowStatus: "active", reviewStatus: "approved_for_first_exposure" }],
    supports: [{ id: `support:${word}`, canonicalWordId: word, microSkillKey: SKILL, supportRole: "support_example", rowStatus: "active", reviewStatus: "approved_for_first_exposure" }],
    teachingContent: [{ id: "content-1", microSkillKey: SKILL, contentVersion: "v1", rowStatus: "active", versionStatus: "active", isActive: true, finalReadinessReviewStatus: "signed_off", childFriendlyExplanation: "Keep the base.", ruleExplanation: "Use the base word." }],
    families: [{ familyId: "family-real", baseFamilyKey: "real", microSkillKey: SKILL, rowStatus: "active", reviewStatus: "approved_for_first_exposure", baseMeaning: "true", etymologyRoute: {} }],
    members: [
      { memberId: `member:${word}`, familyId: "family-real", baseFamilyKey: "real", canonicalWordId: word, memberRole: "authentic_target", assignmentEligible: true, complexityLevel: 1, rowStatus: "active", reviewStatus: "approved_for_first_exposure", wordSum: "real + ly", morphologyParts: [{}], morphologyJoins: [], morphologyTransformations: [], childFriendlyMeaning: "in a real way" },
      { memberId: "member:base", familyId: "family-real", baseFamilyKey: "real", canonicalWordId: "word-real", memberRole: "base", assignmentEligible: true, complexityLevel: 1, rowStatus: "active", reviewStatus: "approved_for_first_exposure", wordSum: "real", morphologyParts: [{}], morphologyJoins: [], morphologyTransformations: [], childFriendlyMeaning: "true" },
      { memberId: "member:transfer-1", familyId: "family-real", baseFamilyKey: "real", canonicalWordId: "word-realism", memberRole: "transfer", assignmentEligible: true, complexityLevel: 1, rowStatus: "active", reviewStatus: "approved_for_first_exposure", wordSum: "real + ism", morphologyParts: [{}], morphologyJoins: [], morphologyTransformations: [], childFriendlyMeaning: "belief in real things" },
      { memberId: "member:transfer-2", familyId: "family-real", baseFamilyKey: "real", canonicalWordId: "word-reality", memberRole: "transfer", assignmentEligible: true, complexityLevel: 1, rowStatus: "active", reviewStatus: "approved_for_first_exposure", wordSum: "real + ity", morphologyParts: [{}], morphologyJoins: [], morphologyTransformations: [], childFriendlyMeaning: "what is real" },
      { memberId: "member:transfer-3", familyId: "family-real", baseFamilyKey: "real", canonicalWordId: "word-realise", memberRole: "transfer", assignmentEligible: true, complexityLevel: 1, rowStatus: "active", reviewStatus: "approved_for_first_exposure", wordSum: "real + ise", morphologyParts: [{}], morphologyJoins: [], morphologyTransformations: [], childFriendlyMeaning: "come to know" },
    ],
    dictation: [{ id: `dictation:${word}`, canonicalWordId: word, rowStatus: "active", reviewStatus: "approved_for_first_exposure", dictationSentence: `Please spell ${word}.`, dictationTargetTokenIndex: 2, audioText: `Please spell ${word}.` }],
  };
}

const ready = inspectBaseWordRouteContent(input());
assert.equal(ready.ready, true, "complete exact Base Word content is ready");
assert.equal(ready.routeId, "base_word_lab");

const missingDictation = inspectBaseWordRouteContent({ ...input(), dictation: [] });
assert(missingDictation.blockers.includes("BASE_WORD_DICTATION_MISSING"), "missing dictation blocks only the exact route");

const playing = inspectBaseWordRouteContent({ ...input("word-playing"), supports: [] });
assert(playing.blockers.includes("BASE_WORD_EXACT_SUPPORT_MISSING"), "playing cannot borrow another word's support");

const oneTarget = inspectBaseWordRouteSelection({
  childId: CHILD, canonicalWordId: WORD_A, microSkillKey: SKILL,
  learningItems: [item("item-a", WORD_A)], families: input().families, members: input().members,
  payloadCompilable: null,
});
assert(oneTarget.selectorBlockers.includes("insufficient_verified_authentic_targets"), "one authentic target is selector-blocked, not content-blocked");

const twoTargets = inspectBaseWordRouteSelection({
  childId: CHILD, canonicalWordId: WORD_A, microSkillKey: SKILL,
  learningItems: [item("item-a", WORD_A), item("item-b", WORD_B)],
  families: input().families,
  members: [
    ...input().members,
    { ...input().members[0], memberId: "member:helpful", canonicalWordId: WORD_B },
  ],
  payloadCompilable: true,
});
assert.equal(twoTargets.ready, true, "two authentic targets and the approved pool can select a Base Word lesson");

const activation = observeBaseWordRouteActivation({
  childId: CHILD, microSkillKey: SKILL, environmentKey: "production", environmentEnabled: true, childEnabled: false,
});
assert.equal(activation.childEnabled, false, "observed pilot activation remains child and micro-skill scoped");
assert.equal(activation.childId, CHILD, "observed activation retains its child scope");

const again = inspectBaseWordRouteContent({ ...input(), members: [...input().members].reverse() });
assert.equal(ready.dependencyFingerprint, again.dependencyFingerprint, "dependency fingerprints are deterministic under reordered facts");

const adapterSource = readFileSync("lib/adle/curriculum-readiness/base-word-route-facts.ts", "utf8");
const loaderSource = readFileSync("lib/adle/loaders/base-word-curriculum-readiness.ts", "utf8");
const inventorySource = readFileSync("scripts/adle-base-word-curriculum-readiness-inventory.ts", "utf8");
assert(!/\.from\([^\n]+\)\.(?:rpc|insert|update|upsert|delete)\(/.test(adapterSource), "the Base Word adapter is pure and write-free");
assert(!/\.(?:rpc|insert|upsert|delete)\(/.test(loaderSource), "the Base Word loader has no write or RPC boundary");
assert(!/\.(?:rpc|insert|upsert|delete)\(/.test(inventorySource), "the Base Word inventory has no write or RPC boundary");

console.log("adle-base-word-curriculum-readiness-regression: all checks passed");
