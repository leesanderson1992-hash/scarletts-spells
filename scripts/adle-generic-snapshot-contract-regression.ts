import { deepStrictEqual, equal, notEqual, ok } from "node:assert/strict";

import { listRegisteredActivityTemplateKeys } from "../lib/adle/activity-template-registry";
import { planAssignmentPersistence } from "../lib/adle/assignment-persistence";
import { createPersistedRouteMetadata } from "../lib/adle/composable-lesson/persisted-route-metadata";
import { compileGenericLessonSnapshot } from "../lib/adle/composable-lesson/generic-snapshot-compiler";
import {
  GENERIC_SNAPSHOT_BLOCKER_CODES,
  type CompiledLessonSnapshotV2,
} from "../lib/adle/composable-lesson/generic-snapshot-contracts";
import {
  GENERIC_SNAPSHOT_TEMPLATE_REGISTRY,
  validateGenericSnapshotTemplateRegistry,
} from "../lib/adle/composable-lesson/generic-snapshot-registry";
import { validateGenericSnapshotRequirementRegistry } from "../lib/adle/composable-lesson/generic-snapshot-requirements";
import { validateCompiledGenericLessonSnapshot } from "../lib/adle/composable-lesson/generic-snapshot-validator";
import type {
  ComposedDailyPlan,
  DailyPlanFacts,
  PlanItemCandidate,
} from "../lib/adle/daily-assignment-composer";

const CHILD = "child-snapshot";
const PARENT = "parent-snapshot";
const TODAY = "2026-07-31";

const expectedFamilySequences = {
  D4_PG: ["PG_SOUND_NOTICE", "PG_GRAPHEME_MAP", "CONTROLLED_SPELLING"],
  D4_PAT: ["PAT_PATTERN_SPOT", "PAT_RULE_APPLY", "CONTROLLED_SPELLING"],
  D4_SYL: ["SYL_SPLIT", "SYL_REBUILD", "CONTROLLED_SPELLING"],
  D4_HOM: ["HOM_MEANING_MATCH", "HOM_SENTENCE_CHOICE", "HOM_CORRECTION"],
  D4_IRRE: ["IRRE_TRICKY_PART", "MEMORY_CUE", "HIDE_WRITE"],
  D4_MOR: ["MOR_STRIP_BUILD", "MOR_MEANING_MATCH", "MOR_BUILD_WORD", "CONTROLLED_SPELLING"],
  D4_INF: ["INF_CONTEXT_CHOICE", "INF_RULE_CHOICE", "INF_TRANSFORM", "CONTROLLED_SPELLING"],
  D4_SCHWA: ["SCHWA_STRESS_MARK", "SCHWA_VOWEL_REVEAL", "SCHWA_ANCHOR", "CONTROLLED_SPELLING"],
} as const;

equal(validateGenericSnapshotTemplateRegistry().length, 0, "template registry is internally valid");
equal(validateGenericSnapshotRequirementRegistry().length, 0, "requirement registry covers every mapping");
equal(GENERIC_SNAPSHOT_TEMPLATE_REGISTRY.length, 32, "all 32 generic templates are mapped");
deepStrictEqual(
  GENERIC_SNAPSHOT_TEMPLATE_REGISTRY.map((entry) => entry.templateKey).sort(),
  listRegisteredActivityTemplateKeys(),
  "snapshot and runtime template registries have exactly the same keys",
);
for (const [family, sequence] of Object.entries(expectedFamilySequences)) {
  for (const key of sequence) {
    ok(
      GENERIC_SNAPSHOT_TEMPLATE_REGISTRY.some((entry) => entry.templateKey === key),
      `${family} template ${key} is snapshot-mapped`,
    );
  }
}
deepStrictEqual(
  GENERIC_SNAPSHOT_TEMPLATE_REGISTRY
    .filter((entry) => entry.compileSupport === "registered_legacy_only")
    .map((entry) => entry.templateKey)
    .sort(),
  ["MUST_USE_FREEWRITING", "REVIEW_MUST_USE_WRITING"],
  "only the two unimplemented sentence-writing shapes are blocked",
);

function candidate(
  position: number,
  sectionKey: string,
  templateKey: string,
  canonicalWordId: string | null,
  targetWord: string | null,
  microSkillKey: string | null,
  payload: Record<string, unknown>,
  learningItemId: string | null = null,
): PlanItemCandidate {
  return {
    position,
    sectionKey,
    templateKey,
    canonicalWordId,
    targetWord,
    microSkillKey,
    payload,
    learningItemId,
    expectedEvidenceKind: null,
    provenance: sectionKey.startsWith("review_") ? "review_session" : "lesson_composer",
  };
}

function planWith(templateOverride?: string): ComposedDailyPlan {
  const items = [
    candidate(1, "review_quick_sort", "REVIEW_QUICK_SORT", null, null, null, {
      words: [{ canonicalWordId: "review-word", targetWord: "review" }],
      sortBins: null,
    }),
    candidate(2, "review_production", "REVIEW_DICTATION", "review-word", "review", "SKILL_PAT", {
      bundleId: "bundle-review",
      dueKind: "scheduled",
      requiresSentenceContext: false,
    }),
    candidate(3, "review_reflection", "ERROR_REFLECTION_CUE", "review-word", "review", "SKILL_PAT", {
      conditional: "on_misspelling",
      misconceptionHint: "Look again.",
    }),
    candidate(4, "lesson_intro", "MICRO_READ_ONLY_INTRO", null, null, "SKILL_PG", {}),
    candidate(5, "guided_practice", "PG_SOUND_NOTICE", "lesson-word", "lesson", "SKILL_PG", {}, "learning-1"),
    candidate(6, "lesson_production", templateOverride ?? "CONTROLLED_SPELLING", "lesson-word", "lesson", "SKILL_PG", {}, "learning-1"),
    candidate(7, "lesson_dictation", "DICTATION_NO_IMAGE", "lesson-word", "lesson", "SKILL_PG", {}, "learning-1"),
  ];
  return {
    childId: CHILD,
    planDate: TODAY,
    lessonRouteMetadata: createPersistedRouteMetadata("generic_composer"),
    composerPolicyVersion: "composer-v1",
    schedulePolicyVersion: "schedule-v1",
    throttle: {} as ComposedDailyPlan["throttle"],
    partOne: {
      dueQueue: [],
      presentationOrder: ["review-word"],
      sections: [
        { sectionKey: "review_quick_sort", purpose: "fixture", items: [items[0]] },
        { sectionKey: "review_production", purpose: "fixture", items: [items[1]] },
        { sectionKey: "review_reflection", purpose: "fixture", items: [items[2]] },
      ],
      skips: [],
    },
    partTwo: {
      composed: true,
      microSkillKey: "SKILL_PG",
      selectionAudit: [],
      lessonWords: [{ canonicalWordId: "lesson-word", provenance: "learning_item", learningItemId: "learning-1", complexityLevel: 1 }],
      probePlan: null,
      stretchItemIntakes: [],
      sections: [
        { sectionKey: "lesson_intro", purpose: "fixture", items: [items[3]] },
        { sectionKey: "guided_practice", purpose: "fixture", items: [items[4]] },
        { sectionKey: "lesson_production", purpose: "fixture", items: [items[5]] },
        { sectionKey: "lesson_dictation", purpose: "fixture", items: [items[6]] },
      ],
      skips: [],
    },
    budget: { budgetResponses: 20, estimatedResponses: 3, guidedWordCount: 1, introTrimmed: false, trims: [] },
  };
}

function facts(options: { relevantTemplateVersion?: string; addUnrelated?: boolean } = {}): DailyPlanFacts {
  const templateKeys = [
    "REVIEW_QUICK_SORT",
    "REVIEW_DICTATION",
    "ERROR_REFLECTION_CUE",
    "MICRO_READ_ONLY_INTRO",
    "PG_SOUND_NOTICE",
    "CONTROLLED_SPELLING",
    "DICTATION_NO_IMAGE",
    "MUST_USE_FREEWRITING",
  ];
  return {
    childId: CHILD,
    reviewPolicy: { schedulePolicyVersion: "schedule-v1" } as DailyPlanFacts["reviewPolicy"],
    composerPolicy: { composerPolicyVersion: "composer-v1" } as unknown as DailyPlanFacts["composerPolicy"],
    bundles: [],
    scheduleWords: [],
    reviewWordFacts: new Map(),
    familyMethods: [
      { familyKey: "D4_PAT", familyName: "Pattern", guidedQuestionSequence: ["PAT_PATTERN_SPOT"], reviewSortDimension: "REVIEW_QUICK_SORT(pattern)", productionTask: "DICTATION_OR_WRITING", contentVersion: "family-pat-v1", importBatchId: "batch-pat", rowStatus: "active" },
      { familyKey: "D4_PG", familyName: "Sound", guidedQuestionSequence: ["PG_SOUND_NOTICE"], reviewSortDimension: "REVIEW_QUICK_SORT(sound)", productionTask: "DICTATION_OR_WRITING", contentVersion: "family-pg-v1", importBatchId: "batch-pg", rowStatus: "active" },
      ...(options.addUnrelated ? [{ familyKey: "D4_UNUSED", familyName: "Unused", guidedQuestionSequence: ["PG_SOUND_NOTICE"], reviewSortDimension: "REVIEW_QUICK_SORT(unused)", productionTask: "DICTATION_OR_WRITING", contentVersion: "unrelated-v2", importBatchId: "batch-unused", rowStatus: "active" as const }] : []),
    ],
    activityTemplates: templateKeys.map((templateKey) => ({
      templateKey,
      phase: "fixture",
      minWordsRequired: 1,
      requiresSentenceContext: false,
      requiresContrastWords: false,
      evidenceKind: "fixture",
      childFacingCopy: "",
      purpose: "",
      childResponse: "",
      contentVersion: templateKey === "CONTROLLED_SPELLING" ? options.relevantTemplateVersion ?? "template-v1" : "template-v1",
      importBatchId: "batch-template",
      rowStatus: "active" as const,
    })),
    teachingContent: new Map([
      ["SKILL_PAT", { microSkillKey: "SKILL_PAT", teachingObjective: "", childFriendlyExplanation: "", ruleExplanation: "", commonMisconceptions: "", contentVersion: "content-pat-v1", sourceRowHash: "hash-pat", importBatchId: "batch-content" }],
      ["SKILL_PG", { microSkillKey: "SKILL_PG", teachingObjective: "", childFriendlyExplanation: "", ruleExplanation: "", commonMisconceptions: "", contentVersion: "content-pg-v1", sourceRowHash: "hash-pg", importBatchId: "batch-content" }],
    ]),
    skillFamilyKeyBySkill: new Map([["SKILL_PAT", "D4_PAT"], ["SKILL_PG", "D4_PG"]]),
    learningItems: [],
    prerequisiteKeysBySkill: new Map(),
    frequencyBandByWordId: new Map(),
    previousLessonFamilyKey: null,
    dictionary: {
      words: [{ canonicalWordId: "lesson-word", wordKey: "lesson", normalisedWord: "lesson", displayWord: "lesson", rowStatus: "active", reviewStatus: "approved_for_first_exposure", frequencyBand: "high", ageBand: "ks1" }],
      supports: [],
      bandings: [],
      overrides: [],
      activeBandingVersion: { bandingVersion: "banding-v1", isActive: true, levelCount: 3 },
      activeTeachingSkillKeys: new Set(["SKILL_PAT", "SKILL_PG"]),
    },
    childBand: { allowedFrequencyBands: ["high"], allowedAgeBands: ["ks1"] },
    taughtHistory: { wasTaught: () => false },
    probeRuns: [],
    probeMissWordIdsToday: [],
  } as unknown as DailyPlanFacts;
}

function compile(inputFacts = facts(), inputPlan = planWith()): CompiledLessonSnapshotV2 {
  const persistence = planAssignmentPersistence(inputPlan, { parentUserId: PARENT, existingHeaders: [] });
  ok(persistence.action === "insert" && persistence.header, "fixture creates an insert plan");
  const result = compileGenericLessonSnapshot({
    facts: inputFacts,
    plan: inputPlan,
    persistence: persistence as typeof persistence & { action: "insert"; header: NonNullable<typeof persistence.header> },
  });
  if (!result.ok) throw new Error(`compile failed: ${JSON.stringify(result.blockers)}`);
  return result.snapshot;
}

const snapshot = compile();
equal(snapshot.snapshotSchemaVersion, 2, "compiler emits V2");
equal(snapshot.activities.length, 7, "one snapshot activity per assignment item");
deepStrictEqual(snapshot.words.map((word) => word.role), ["review", "authentic_target"], "role-bound review and lesson words are explicit");
equal(snapshot.activities.find((activity) => activity.templateKey === "CONTROLLED_SPELLING")?.scheduleRole, "lesson_final_if_no_dictation");
equal(snapshot.activities.find((activity) => activity.templateKey === "DICTATION_NO_IMAGE")?.scheduleRole, "lesson_final");
equal(snapshot.activities.find((activity) => activity.templateKey === "ERROR_REFLECTION_CUE")?.condition.kind, "on_misspelling");
equal(validateCompiledGenericLessonSnapshot(snapshot).ok, true, "compiled snapshot validates independently");
deepStrictEqual(compile(), snapshot, "identical inputs produce a byte-deterministic snapshot");
equal(compile(facts({ addUnrelated: true })).provenance.sourceFingerprint, snapshot.provenance.sourceFingerprint, "unrelated content does not alter the fingerprint");
notEqual(compile(facts({ relevantTemplateVersion: "template-v2" })).provenance.sourceFingerprint, snapshot.provenance.sourceFingerprint, "consumed content-version changes alter the fingerprint");

const unknownVersion = structuredClone(snapshot) as unknown as Record<string, unknown>;
unknownVersion.snapshotSchemaVersion = 99;
deepStrictEqual(validateCompiledGenericLessonSnapshot(unknownVersion), { ok: false, blockers: [{ code: "unsupported_snapshot_schema_version" }] });

const duplicateActivity = structuredClone(snapshot);
duplicateActivity.activities = [duplicateActivity.activities[0], duplicateActivity.activities[0], ...duplicateActivity.activities.slice(2)];
ok(!validateCompiledGenericLessonSnapshot(duplicateActivity).ok, "duplicate activities fail closed");

const fingerprintMismatch = structuredClone(snapshot);
fingerprintMismatch.taxonomy.reviewFamilyKeys = ["CHANGED"];
const fingerprintResult = validateCompiledGenericLessonSnapshot(fingerprintMismatch);
ok(!fingerprintResult.ok && fingerprintResult.blockers.some((entry) => entry.code === "fingerprint_mismatch"), "fingerprint mismatch is typed");

const unsupportedPlan = planWith("MUST_USE_FREEWRITING");
const unsupportedPersistence = planAssignmentPersistence(unsupportedPlan, { parentUserId: PARENT, existingHeaders: [] });
ok(unsupportedPersistence.action === "insert" && unsupportedPersistence.header);
const unsupported = compileGenericLessonSnapshot({
  facts: facts(),
  plan: unsupportedPlan,
  persistence: unsupportedPersistence as typeof unsupportedPersistence & { action: "insert"; header: NonNullable<typeof unsupportedPersistence.header> },
});
ok(!unsupported.ok && unsupported.blockers.some((entry) => entry.code === "unsupported_template_shape"), "unsafe must-use shape is blocked");

for (const code of GENERIC_SNAPSHOT_BLOCKER_CODES) ok(typeof code === "string", `blocker ${code} is registered`);

console.log("ADLE generic snapshot contract regression passed.");
