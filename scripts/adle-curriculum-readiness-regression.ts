import {
  resolveCurriculumReadinessInventory,
  type CurriculumReadinessFacts,
} from "../lib/adle/curriculum-readiness/resolver";
import { readFileSync } from "node:fs";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "../lib/adle/curriculum-readiness/route-registry";
import type { LearningItemFact } from "../lib/adle/learning-items";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const CHILD = "child-a";
const WORD = "word-playing";
const SKILL_A = "D4_MOR_BASE_WORDS_PRESERVE_BASE";
const SKILL_B = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const SHARED_KEY = `${CHILD}\u0000${WORD}`;

function item(id: string, skill: string, status: LearningItemFact["itemStatus"] = "pending"): LearningItemFact {
  return {
    learningItemId: id,
    childId: CHILD,
    canonicalWordId: WORD,
    microSkillKey: skill,
    itemStatus: status,
    sourceKind: "verified_misspelling",
    sourceRef: `verified:${id}`,
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: "2026-07-23",
    rowStatus: "active",
  };
}

const routes = [
  ...ADLE_CURRICULUM_ROUTE_REGISTRY,
  {
    routeId: "alternate_base_lab",
    routeVersion: "v1",
    supportedMicroSkillKeys: [SKILL_A],
    implementationState: "registered" as const,
    newAssignmentCapable: true,
    requiresAuthenticSelectableItem: false,
  },
];

function activation(microSkillKey: string, routeId: string, enabled = true, childId: string | null = null) {
  const route = routes.find((candidate) => candidate.routeId === routeId);
  if (!route) throw new Error(`Unknown route ${routeId}`);
  return {
    childId,
    microSkillKey,
    routeId,
    routeVersion: route.routeVersion,
    environmentKey: "production" as const,
    environmentEnabled: enabled,
    profileOrFamilyEnabled: enabled,
    childEnabled: enabled,
  };
}

const facts: CurriculumReadinessFacts = {
  environmentKey: "production",
  mappings: [
    {
      mappingId: "mapping-plaiing",
      authority: "parent_local",
      parentUserId: "parent-a",
      childId: CHILD,
      misspellingNormalized: "plaiing",
      correctSpellingNormalized: "playing",
      microSkillKey: SKILL_A,
      status: "parent_local_promoted",
      mappingStatus: null,
      resolverVisibilityStatus: null,
      hasVisibilityEnableEvent: false,
      verifiedOn: "2026-07-23",
      sourceRef: "verified:mapping-plaiing",
    },
    {
      mappingId: "mapping-plaing",
      authority: "parent_local",
      parentUserId: "parent-a",
      childId: CHILD,
      misspellingNormalized: "plaing",
      correctSpellingNormalized: "playing",
      microSkillKey: SKILL_B,
      status: "parent_local_promoted",
      mappingStatus: null,
      resolverVisibilityStatus: null,
      hasVisibilityEnableEvent: false,
      verifiedOn: "2026-07-23",
      sourceRef: "verified:mapping-plaing",
    },
  ],
  learningItems: [item("item-a", SKILL_A), item("item-b", SKILL_B), item("item-resolved", SKILL_A, "resolved")],
  learningItemLineage: [
    { learningItemId: "item-a", sourceRef: "verified:item-a", candidateMappingId: "mapping-plaiing", canonicalMappingId: null, misspellingNormalized: "plaiing", correctSpellingNormalized: "playing", microSkillKey: SKILL_A },
    { learningItemId: "item-b", sourceRef: "verified:item-b", candidateMappingId: "mapping-plaing", canonicalMappingId: null, misspellingNormalized: "plaing", correctSpellingNormalized: "playing", microSkillKey: SKILL_B },
    { learningItemId: "item-resolved", sourceRef: "verified:item-resolved", candidateMappingId: "mapping-plaiing", canonicalMappingId: null, misspellingNormalized: "plaiing", correctSpellingNormalized: "playing", microSkillKey: SKILL_A },
  ],
  words: [{ canonicalWordId: WORD, normalisedWord: "playing", rowStatus: "active", reviewStatus: "approved_for_first_exposure", frequencyBand: "high", ageBand: "middle_primary" }],
  microSkills: [
    { microSkillKey: SKILL_A, masteryDomainKey: "D4", isActive: true, isAssignable: true },
    { microSkillKey: SKILL_B, masteryDomainKey: "D4", isActive: true, isAssignable: true },
  ],
  supports: [
    { canonicalWordId: WORD, microSkillKey: SKILL_A, supportRole: "support_example", rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
    { canonicalWordId: WORD, microSkillKey: SKILL_B, supportRole: "support_example", rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
  ],
  routes,
  routeActivation: [
    activation(SKILL_A, "base_word_lab"),
    activation(SKILL_B, "base_word_lab"),
    activation(SKILL_A, "alternate_base_lab"),
  ],
  routeSelections: [
    { childId: CHILD, canonicalWordId: WORD, microSkillKey: SKILL_A, routeId: "base_word_lab", routeVersion: "v2", ready: true, selectorBlockers: [], evidence: [] },
    { childId: CHILD, canonicalWordId: WORD, microSkillKey: SKILL_B, routeId: "base_word_lab", routeVersion: "v2", ready: true, selectorBlockers: [], evidence: [] },
  ],
  routeContent: [
    { canonicalWordId: WORD, microSkillKey: SKILL_A, routeId: "base_word_lab", routeVersion: "v2", dependencyFingerprint: "base-a-v1", ready: true, blockers: [], evidence: [] },
    { canonicalWordId: WORD, microSkillKey: SKILL_B, routeId: "base_word_lab", routeVersion: "v2", dependencyFingerprint: "base-b-v1", ready: true, blockers: [], evidence: [] },
  ],
  sharedRoutes: new Map(),
  scheduledSharedWordKeys: new Set(),
};

const result = resolveCurriculumReadinessInventory(facts);
assert(result.integrity.status === "READY", "the checked-in registry must validate");
assert(result.mappingInspections.length === 2, "every approved mapping is inspected");
assert(result.mappingInspections.every((entry) => entry.mappingTruthValidity.status === "READY"), "approved mapping truth is independent from curriculum readiness");
assert(result.mappingInspections.every((entry) => entry.wordSkillSupportCompleteness.status === "READY"), "exact support is independently ready when present");
assert(result.learningItemInspections.length === 3, "every active row is inspected, including resolved items");
assert(result.targets.length === 2, "same word with two micro-skills remains two curriculum targets");
assert(result.learningItemInspections.find((entry) => entry.learningItemId === "item-resolved")?.selectability.status === "BLOCKED", "resolved item remains visible but is not selectable");
assert(result.sharedWords[0]?.decision.status === "READY", "unscheduled shared words remain eligible for their first exposure");
assert(result.targets.every((target) => target.assignmentReadinessByChild[0]?.decision.status === "READY"), "two pending first-exposure routes can be ready before review linkage exists");
const alternate = result.targets.find((target) => target.microSkillKey === SKILL_A)?.routes.find((route) => route.routeId === "alternate_base_lab");
assert(alternate?.assignmentReadiness.blockers.some((entry) => entry.code === "TARGET_ROUTE_CONTENT_INCOMPLETE"), "content for Base Word Lab cannot leak into another compatible route");

const missingExactSupport = resolveCurriculumReadinessInventory({
  ...facts,
  supports: facts.supports.filter((support) => support.microSkillKey !== SKILL_B),
});
const unsupportedMapping = missingExactSupport.mappingInspections.find(
  (entry) => entry.mappingId === "mapping-plaing",
);
assert(unsupportedMapping?.mappingTruthValidity.status === "READY", "missing exact support does not invalidate the approved correction relationship");
assert(unsupportedMapping?.wordSkillSupportCompleteness.blockers.some((entry) => entry.code === "TARGET_SKILL_SUPPORT_MISSING"), "missing exact support is reported as its own curriculum dependency");
assert(unsupportedMapping?.runtimeIntakeUsability.status === "BLOCKED", "missing exact support blocks the current intake projection");
assert(missingExactSupport.targets.find((target) => target.microSkillKey === SKILL_B)?.assignmentReadinessByChild[0]?.decision.status === "BLOCKED", "missing exact support blocks assignment readiness without substituting another word");

const sameSkillDifferentWord = resolveCurriculumReadinessInventory({
  ...facts,
  supports: [
    { canonicalWordId: "other-word", microSkillKey: SKILL_A, supportRole: "support_example", rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
    facts.supports[1],
  ],
});
assert(sameSkillDifferentWord.mappingInspections.find((entry) => entry.mappingId === "mapping-plaiing")?.wordSkillSupportCompleteness.status === "BLOCKED", "same-skill support for another word cannot satisfy exact target support");

const missingCanonical = resolveCurriculumReadinessInventory({
  ...facts,
  mappings: [{ ...facts.mappings[0], mappingId: "mapping-missing-word", correctSpellingNormalized: "not-in-dictionary" }],
});
assert(missingCanonical.mappingInspections[0]?.mappingTruthValidity.blockers.some((entry) => entry.code === "APPROVED_MAPPING_TARGET_NOT_FOUND"), "an unresolved correction blocks mapping truth");

const ambiguousCanonical = resolveCurriculumReadinessInventory({
  ...facts,
  mappings: [facts.mappings[0]],
  words: [
    ...facts.words,
    { ...facts.words[0], canonicalWordId: "word-playing-duplicate" },
  ],
});
assert(ambiguousCanonical.mappingInspections[0]?.mappingTruthValidity.blockers.some((entry) => entry.code === "APPROVED_MAPPING_TARGET_AMBIGUOUS"), "ambiguous canonical identity blocks mapping truth");

const invalidScope = resolveCurriculumReadinessInventory({
  ...facts,
  mappings: [{ ...facts.mappings[0], parentUserId: null, sourceRef: "" }],
});
assert(invalidScope.mappingInspections[0]?.mappingTruthValidity.blockers.some((entry) => entry.code === "MAPPING_AUTHORITY_SCOPE_INVALID"), "invalid parent-local authority scope blocks mapping truth");
assert(invalidScope.mappingInspections[0]?.mappingTruthValidity.blockers.some((entry) => entry.code === "MAPPING_SOURCE_LINEAGE_MISSING"), "missing mapping lineage blocks mapping truth");

const conflictingScope = resolveCurriculumReadinessInventory({
  ...facts,
  mappings: [
    facts.mappings[0],
    { ...facts.mappings[0], mappingId: "mapping-conflict", correctSpellingNormalized: "played" },
  ],
});
assert(conflictingScope.mappingInspections.every((entry) => entry.mappingTruthValidity.blockers.some((blocker) => blocker.code === "MAPPING_AUTHORITY_PAIR_CONFLICT")), "conflicting approved corrections in one authority scope block mapping truth");

const hiddenGlobal = resolveCurriculumReadinessInventory({
  ...facts,
  mappings: [{
    ...facts.mappings[0],
    mappingId: "mapping-hidden-global",
    authority: "global_canonical",
    parentUserId: null,
    childId: null,
    status: "global_canonical_promoted",
    mappingStatus: "active",
    resolverVisibilityStatus: "hidden",
    hasVisibilityEnableEvent: false,
  }],
});
assert(hiddenGlobal.mappingInspections[0]?.mappingTruthValidity.status === "READY", "a hidden active global mapping remains coherent curriculum truth");
assert(hiddenGlobal.mappingInspections[0]?.runtimeIntakeUsability.blockers.some((entry) => entry.code === "CANONICAL_MAPPING_NOT_RESOLVER_VISIBLE"), "hidden global mapping is blocked for current intake consumption");

const skillScopedActivation = resolveCurriculumReadinessInventory({
  ...facts,
  routeActivation: [activation(SKILL_A, "base_word_lab"), activation(SKILL_B, "base_word_lab", false), activation(SKILL_A, "alternate_base_lab")],
});
const disabledSkill = skillScopedActivation.targets.find((target) => target.microSkillKey === SKILL_B)?.routes.find((route) => route.routeId === "base_word_lab");
assert(disabledSkill?.assignmentReadiness.blockers.some((entry) => entry.code === "ROUTE_ENVIRONMENT_GATE_CLOSED"), "activation is scoped to the exact micro-skill and route");

const childScopedActivation = resolveCurriculumReadinessInventory({
  ...facts,
  routeActivation: [
    activation(SKILL_A, "base_word_lab", false),
    activation(SKILL_A, "base_word_lab", true, CHILD),
    activation(SKILL_B, "base_word_lab"),
    activation(SKILL_A, "alternate_base_lab"),
  ],
});
const childOverride = childScopedActivation.targets.find((target) => target.microSkillKey === SKILL_A)?.assignmentReadinessByChild[0];
assert(childOverride?.decision.status === "READY", "a child-scoped observed gate takes precedence over the route-wide fallback");

const incompleteReview = resolveCurriculumReadinessInventory({
  ...facts,
  scheduledSharedWordKeys: new Set([SHARED_KEY]),
  sharedRoutes: new Map([
    [SHARED_KEY, [
      { learningItemId: "item-a", microSkillKey: SKILL_A, attachedOn: "2026-07-23", attachmentOrdinal: 1, requiresSentenceContext: false, rowStatus: "active" as const },
    ]],
  ]),
});
assert(incompleteReview.sharedWords[0]?.decision.blockers.some((entry) => entry.code === "SHARED_ROUTE_LINKAGE_MISSING"), "an existing multi-route review schedule fails closed until every active route is linked");
assert(incompleteReview.targets.every((target) => target.assignmentReadinessByChild[0]?.decision.status === "READY"), "incomplete review linkage does not block the next first-exposure lesson");

const linked = resolveCurriculumReadinessInventory({
  ...facts,
  scheduledSharedWordKeys: new Set([SHARED_KEY]),
  sharedRoutes: new Map([
    [SHARED_KEY, [
      { learningItemId: "item-a", microSkillKey: SKILL_A, attachedOn: "2026-07-23", attachmentOrdinal: 1, requiresSentenceContext: false, rowStatus: "active" as const },
      { learningItemId: "item-b", microSkillKey: SKILL_B, attachedOn: "2026-07-24", attachmentOrdinal: 2, requiresSentenceContext: true, rowStatus: "active" as const },
    ]],
  ]),
});
assert(linked.sharedWords[0]?.decision.status === "READY", "complete explicit links restore shared review readiness");
assert(linked.sharedWords[0]?.activationMicroSkillKey === SKILL_B && linked.sharedWords[0]?.requiresSentenceContext, "shared linkage retains newest activation route and strictest sentence requirement");

const again = resolveCurriculumReadinessInventory({ ...facts, mappings: [...facts.mappings].reverse(), learningItems: [...facts.learningItems].reverse() });
assert(JSON.stringify(result) === JSON.stringify(again), "permuted input must produce byte-identical inventory output");

const loaderSource = readFileSync("lib/adle/loaders/curriculum-readiness-live.ts", "utf8");
assert(loaderSource.includes(".select("), "the readiness loader remains select-only");
assert(!/\.(?:rpc|insert|update|upsert|delete)\(/.test(loaderSource), "the readiness loader must not call a write or RPC boundary");

console.log("adle-curriculum-readiness-regression: all checks passed");
