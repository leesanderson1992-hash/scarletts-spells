import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import { selectBaseWordFamilyLesson } from "../lib/adle/base-word-family-selection";
import {
  inspectBaseWordRouteContent,
  inspectBaseWordRouteSelection,
  observeBaseWordRouteActivation,
  type BaseWordFamilyDetailFact,
  type BaseWordFamilyMemberDetailFact,
  type BaseWordRouteFactInput,
} from "../lib/adle/curriculum-readiness/base-word-route-facts";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "../lib/adle/curriculum-readiness/route-registry";
import {
  resolveCurriculumReadinessInventory,
  type CurriculumReadinessFacts,
} from "../lib/adle/curriculum-readiness/resolver";
import type { LearningItemFact } from "../lib/adle/learning-items";

const SKILL = "D4_MOR_BASE_WORDS_PRESERVE_BASE";
const CHILD = "child-a";
const WORD_A = "word-really";
const WORD_B = "word-helpful";
const DEPENDENCY_FINGERPRINT = "a".repeat(64);

function item(id: string, word: string, intakeOn: string): LearningItemFact {
  return {
    learningItemId: id, childId: CHILD, canonicalWordId: word,
    microSkillKey: SKILL, itemStatus: "pending", sourceKind: "verified_misspelling",
    sourceRef: `source:${id}`, sourceAttemptText: null, reteachPriority: false,
    ejectedOn: null, intakeOn, rowStatus: "active",
  };
}

const familyA: BaseWordFamilyDetailFact = {
  familyId: "family-real", baseFamilyKey: "real", microSkillKey: SKILL,
  rowStatus: "active", reviewStatus: "approved_for_first_exposure",
  baseMeaning: "true", etymologyRoute: {},
};
const familyB: BaseWordFamilyDetailFact = {
  familyId: "family-help", baseFamilyKey: "help", microSkillKey: SKILL,
  rowStatus: "active", reviewStatus: "approved_for_first_exposure",
  baseMeaning: "assist", etymologyRoute: {},
};

function member(params: {
  family: BaseWordFamilyDetailFact;
  word: string;
  role: BaseWordFamilyMemberDetailFact["memberRole"];
  authenticSelectionEligible?: boolean;
}): BaseWordFamilyMemberDetailFact {
  return {
    memberId: `member:${params.word}`,
    familyId: params.family.familyId,
    baseFamilyKey: params.family.baseFamilyKey,
    canonicalWordId: params.word,
    memberRole: params.role,
    applicableMicroSkillKeys: [SKILL],
    authenticSelectionEligible: params.authenticSelectionEligible ?? true,
    assignmentEligible: true,
    complexityLevel: 1,
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    wordSum: params.word,
    morphologyParts: [{}],
    morphologyJoins: [],
    morphologyTransformations: [],
    childFriendlyMeaning: `${params.word} meaning`,
  };
}

const familyAMembers = [
  member({ family: familyA, word: WORD_A, role: "authentic_target" }),
  member({ family: familyA, word: "word-real", role: "base" }),
  member({ family: familyA, word: "word-realism", role: "transfer" }),
  member({ family: familyA, word: "word-reality", role: "transfer" }),
];
const familyBMembers = [
  member({ family: familyB, word: WORD_B, role: "authentic_target" }),
  member({ family: familyB, word: "word-help", role: "base" }),
  member({ family: familyB, word: "word-helper", role: "transfer" }),
  member({ family: familyB, word: "word-helping", role: "transfer" }),
];

function input(word = WORD_A): BaseWordRouteFactInput {
  return {
    canonicalWordId: word,
    microSkillKey: SKILL,
    releaseAuthority: {
      activationRevisionId: "activation-1",
      releaseManifestId: "release-1",
      dependencyFingerprint: DEPENDENCY_FINGERPRINT,
      familyAuthorityId: "family-authority-1",
      teachingContentAuthorityId: "teaching-authority-1",
      dictionaryClosureAuthorityId: "closure-authority-1",
    },
    words: [{ canonicalWordId: word, rowStatus: "active", reviewStatus: "approved_for_first_exposure" }],
    teachingContent: [{ id: "teaching-authority-1", microSkillKey: SKILL, contentVersion: "v1", rowStatus: "active", versionStatus: "active", isActive: true, finalReadinessReviewStatus: "signed_off", childFriendlyExplanation: "Keep the base.", ruleExplanation: "Use the base word." }],
    families: [familyA],
    members: familyAMembers,
    dictation: [{ id: `closure:${word}`, canonicalWordId: word, rowStatus: "active", reviewStatus: "approved_for_first_exposure", dictationSentence: `Please spell ${word}.`, dictationTargetTokenIndex: 2, audioText: `Please spell ${word}.` }],
  };
}

const ready = inspectBaseWordRouteContent(input());
assert.equal(ready.ready, true, "exact release family/content/closure authority is sufficient without word_support");
assert.equal(ready.routeId, "base_word_lab");
assert.equal(ready.dependencyFingerprint, DEPENDENCY_FINGERPRINT, "readiness retains the exact release dependency fingerprint");

const missingRelease = inspectBaseWordRouteContent({ ...input(), releaseAuthority: null });
assert(missingRelease.blockers.includes("BASE_WORD_RELEASE_AUTHORITY_MISSING"), "missing exact release authority fails closed");
const missingFamily = inspectBaseWordRouteContent({ ...input(), families: [], members: [] });
assert(missingFamily.blockers.includes("BASE_WORD_TARGET_FAMILY_MEMBER_MISSING"), "missing family authority projection fails closed");
const missingTeaching = inspectBaseWordRouteContent({ ...input(), teachingContent: [] });
assert(missingTeaching.blockers.includes("BASE_WORD_SIGNED_OFF_TEACHING_CONTENT_MISSING"), "missing teaching-content authority fails closed");
const missingClosure = inspectBaseWordRouteContent({ ...input(), words: [], dictation: [] });
assert(missingClosure.blockers.includes("BASE_WORD_DICTIONARY_CLOSURE_MISSING") && missingClosure.blockers.includes("BASE_WORD_DICTATION_MISSING"), "missing Teaching Dictionary closure fails closed");

for (const role of ["base", "transfer"] as const) {
  const historicalV1WrongRole = inspectBaseWordRouteContent({
    ...input(),
    releaseAuthority: { ...input().releaseAuthority!, familyAuthoritySchemaVersion: 1 },
    members: familyAMembers.map((entry) => entry.canonicalWordId === WORD_A
      ? { ...entry, memberRole: role, authenticSelectionEligible: false }
      : entry),
  });
  assert(historicalV1WrongRole.blockers.includes("BASE_WORD_TARGET_MEMBER_NOT_ASSIGNMENT_ELIGIBLE"), `historical v1 ${role} role remains replay-compatible`);
  const baseLedV2 = inspectBaseWordRouteContent({
    ...input(),
    releaseAuthority: { ...input().releaseAuthority!, familyAuthoritySchemaVersion: 2 },
    members: familyAMembers.map((entry) => entry.canonicalWordId === WORD_A
      ? { ...entry, memberRole: role, authenticSelectionEligible: true }
      : entry),
  });
  assert.equal(baseLedV2.ready, true, `v2 ${role} compatibility projection does not override genuine learner evidence`);
}

const learningItems = [
  item("item-a", WORD_A, "2026-07-23"),
  item("item-b", WORD_B, "2026-07-24"),
];
const learningItemsBefore = structuredClone(learningItems);
const sameFamily = inspectBaseWordRouteSelection({
  childId: CHILD, canonicalWordId: WORD_A, microSkillKey: SKILL,
  learningItems,
  families: [familyA],
  members: [
    ...familyAMembers,
    member({ family: familyA, word: WORD_B, role: "authentic_target" }),
  ],
  payloadCompilable: null,
});
assert(sameFamily.selectorBlockers.includes("two_distinct_authentic_families_required"), "same-family authentic targets fail with the canonical selector reason");
assert.deepEqual(learningItems, learningItemsBefore, "failed same-family readiness does not mutate or invalidate learning items");

const exactFamilies = [familyA, familyB];
const exactMembers = [...familyAMembers, ...familyBMembers];
const twoFamilies = inspectBaseWordRouteSelection({
  childId: CHILD, canonicalWordId: WORD_A, microSkillKey: SKILL,
  learningItems, families: exactFamilies, members: exactMembers, payloadCompilable: true,
});
assert.equal(twoFamilies.ready, true, "two authentic targets from two governed families are ready");
const selection = selectBaseWordFamilyLesson(CHILD, SKILL, { learningItems, families: exactFamilies, members: exactMembers });
assert.equal(selection.baseFamilyKeys.length, 2);
assert.equal(selection.slots.filter((slot) => slot.assignmentRole === "primary_authentic_target").length, 2);
assert.equal(selection.slots.filter((slot) => slot.assignmentRole !== "primary_authentic_target").length, 4);
assert.equal(selection.slots.length, 6);

const activation = observeBaseWordRouteActivation({
  childId: CHILD, microSkillKey: SKILL, environmentKey: "production",
  environmentEnabled: true, releaseAuthorityEnabled: true, childEnabled: false,
});
assert.equal(activation.profileOrFamilyEnabled, true, "activation reports exact release authority availability");
assert.equal(activation.childEnabled, false, "observed activation remains child-gated");

const genericFacts: CurriculumReadinessFacts = {
  environmentKey: "local",
  mappings: [{ mappingId: "mapping-generic", authority: "parent_local", parentUserId: "parent", childId: CHILD, misspellingNormalized: "kat", correctSpellingNormalized: "cat", microSkillKey: "D1_GENERIC", status: "parent_local_promoted", mappingStatus: null, resolverVisibilityStatus: null, hasVisibilityEnableEvent: false, verifiedOn: "2026-08-10", sourceRef: "candidate:mapping-generic" }],
  learningItems: [], learningItemLineage: [],
  words: [{ canonicalWordId: "word-cat", normalisedWord: "cat", rowStatus: "active", reviewStatus: "approved_for_first_exposure", frequencyBand: "high", ageBand: "early_primary" }],
  microSkills: [{ microSkillKey: "D1_GENERIC", masteryDomainKey: "D4", isActive: true, isAssignable: true }],
  supports: [], routes: ADLE_CURRICULUM_ROUTE_REGISTRY,
  routeActivation: [], routeSelections: [], routeContent: [], sharedRoutes: new Map(), scheduledSharedWordKeys: new Set(),
};
const genericWithoutSupport = resolveCurriculumReadinessInventory(genericFacts).mappingInspections[0];
assert.equal(genericWithoutSupport.wordSkillSupportCompleteness.status, "BLOCKED", "generic route still requires canonical word_support");
assert(genericWithoutSupport.wordSkillSupportCompleteness.blockers.some((entry) => entry.code === "TARGET_SKILL_SUPPORT_MISSING"));
const genericWithSupport = resolveCurriculumReadinessInventory({
  ...genericFacts,
  supports: [{ canonicalWordId: "word-cat", microSkillKey: "D1_GENERIC", supportRole: "support_example", rowStatus: "active", reviewStatus: "approved_for_first_exposure" }],
}).mappingInspections[0];
assert.equal(genericWithSupport.wordSkillSupportCompleteness.status, "READY", "generic word_support success semantics remain unchanged");

const baseWordFacts: CurriculumReadinessFacts = {
  ...genericFacts,
  mappings: [{ ...genericFacts.mappings[0], mappingId: "mapping-base", correctSpellingNormalized: "really", microSkillKey: SKILL }],
  words: [{ canonicalWordId: WORD_A, normalisedWord: "really", rowStatus: "active", reviewStatus: "approved_for_first_exposure", frequencyBand: null, ageBand: null }],
  microSkills: [{ microSkillKey: SKILL, masteryDomainKey: "D4", isActive: true, isAssignable: true }],
  routeContent: [ready],
};
const baseWithoutSupport = resolveCurriculumReadinessInventory(baseWordFacts).mappingInspections[0];
assert.equal(baseWithoutSupport.wordSkillSupportCompleteness.status, "READY", "exact Base Word route authority replaces generic word_support");
assert(baseWithoutSupport.wordSkillSupportCompleteness.evidence.some((entry) => entry.source === "route_content_authority"));
assert.equal(baseWithoutSupport.canonicalContentCompleteness.status, "READY", "exact closure authority replaces unused generic banding requirements");

const genericMissingMetadata = resolveCurriculumReadinessInventory({
  ...genericFacts,
  words: genericFacts.words.map((word) => ({ ...word, frequencyBand: null, ageBand: null })),
}).mappingInspections[0];
assert.equal(genericMissingMetadata.canonicalContentCompleteness.status, "BLOCKED", "generic canonical metadata requirements remain unchanged");

const again = inspectBaseWordRouteContent({ ...input(), members: [...input().members].reverse() });
assert.equal(ready.dependencyFingerprint, again.dependencyFingerprint, "exact release dependency fingerprint remains deterministic");

const adapterSource = readFileSync("lib/adle/curriculum-readiness/base-word-route-facts.ts", "utf8");
const loaderSource = readFileSync("lib/adle/loaders/base-word-curriculum-readiness.ts", "utf8");
const inventorySource = readFileSync("scripts/adle-base-word-curriculum-readiness-inventory.ts", "utf8");
assert.doesNotMatch(`${adapterSource}\n${loaderSource}`, /canonical_teaching_dictionary_word_support|BASE_WORD_EXACT_SUPPORT_MISSING/, "Base Word specialist readiness has no word_support dependency");
assert.match(loaderSource, /loadEnabledBaseWordReleaseAuthorities/, "legacy readiness consumes the exact activated release loader");
assert.match(loaderSource, /releaseAuthority: activated\.authority/, "payload compilation uses the same exact authority");
assert(!/\.from\([^\n]+\)\.(?:rpc|insert|update|upsert|delete)\(/.test(adapterSource), "the Base Word adapter is pure and write-free");
assert(!/\.(?:insert|upsert|delete)\(/.test(loaderSource), "the Base Word loader has no mutation boundary");
assert(!/\.(?:rpc|insert|upsert|delete)\(/.test(inventorySource), "the Base Word inventory has no write or RPC boundary");

console.log("adle-base-word-curriculum-readiness-regression: all checks passed");
