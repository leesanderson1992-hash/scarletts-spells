import assert from "node:assert/strict";
import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import { planAssignmentPersistence } from "../lib/adle/assignment-persistence";
import { compileDynamicAffixSpecialistSnapshotV3 } from "../lib/adle/composable-lesson/specialist-snapshot-v3-compiler";
import { validateCompiledSpecialistSnapshotV3 } from "../lib/adle/composable-lesson/specialist-snapshot-v3-validator";
import { activityVariantsForRoute } from "../lib/adle/composable-lesson/activity-variants";
import { buildDynamicAffixAssignmentPlan } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import { compileDynamicAffixWordLabDecision } from "../lib/adle/morphology/dynamic-affix-compiler-rollout";
import { deriveReviewedSuffixCandidate } from "../lib/adle/morphology/derived-suffix-candidate";
import { compareItyDerivedSelection } from "../lib/adle/morphology/ity-derived-shadow-comparison";
import { ityDerivedBlockerAction } from "../lib/adle/morphology/ity-derived-blockers";
import { resolveDynamicAffixLessonAuthorityV3 } from "../lib/adle/morphology/dynamic-affix-runtime";
import { selectDynamicAffixWordLab } from "../lib/adle/morphology/affix-word-lab";
import { compileDynamicAffixSelectionThroughSharedCompiler } from "../lib/adle/morphology/shared-affix-compatibility";
import { loadReviewedAffixPackageFixture } from "./lib/adle-reviewed-affix-package-fixture";

const fixture = loadReviewedAffixPackageFixture(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-ity/reviewed-staging-package.json",
);
const profile = fixture.profile;
const derived = deriveReviewedSuffixCandidate(profile, {
  word: { id: "reviewed-timidity", displayWord: "timidity", sourceRowHash: "a".repeat(64),
    ageBand: "middle_primary", frequencyBand: "medium", complexityBand: "moderate",
    rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
  morphology: { id: "morphology-timidity", parts: [
    { text: "timid", type: "base", gloss: "shy or lacking confidence" },
    { text: "ity", type: "suffix", gloss: "the state or quality of" },
  ], joins: [], wordSum: "timid + ity → timidity", analysisStatus: "approved",
  reviewStatus: "approved_for_first_exposure", sourceRowHash: "b".repeat(64), sourceName: "reviewed fixture" },
  metadata: { syllables: "ti-mid-i-ty", phonemeHint: "tɪˈmɪdɪti", stressPattern: "second", hasSchwa: false,
    rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
  dictation: { id: "dictation-timidity", sourceRowHash: "c".repeat(64),
    sentence: "Her timidity faded.", targetTokenIndex: 1, audioText: "Her timidity faded.",
    rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
  definition: "the state of being timid",
});
assert(derived.word, derived.blockers.join(", "));
const authenticId = fixture.selection.authenticTargets[0]!.canonicalWordId;
const fixtureWords = [...profile.wordsByCanonicalId.values()];
const selectedWords = [fixtureWords.find((word) => word.canonicalWordId === authenticId)!,
  ...fixtureWords.filter((word) => word.canonicalWordId !== authenticId).slice(0, 2), derived.word];
assert.equal(selectedWords.length, 4);
const governedWords = selectedWords.map((word, index) => word.governance ? word : {
  ...word, governance: { memberId: `released-member-${index}`, memberSourceRowHash: "d".repeat(64),
    dictionaryWordSourceRowHash: "e".repeat(64), dictationId: `released-dictation-${index}`,
    dictationSourceRowHash: "f".repeat(64) },
});
const governedProfile = { ...profile,
  governance: { profileId: "ity-profile", importBatchId: "ity-import", sourceRowHash: "1".repeat(64) },
  wordsByCanonicalId: new Map(governedWords.map((word) => [word.canonicalWordId, word])),
};
const childId = "00000000-0000-4000-8000-000000000301";
const releasedProfile = { ...governedProfile, wordsByCanonicalId: new Map(governedWords
  .filter((word) => word.canonicalWordId !== derived.word!.canonicalWordId)
  .map((word) => [word.canonicalWordId, word] as const)) };
const shadowAudit = { profileKey: profile.microSkillKey, scanned: 1,
  newlyEligible: [derived.word], alreadyReleased: [], excluded: [] };
const shadowComparison = compareItyDerivedSelection({ profile: releasedProfile,
  learningItems: [{ ...fixture.selection.authenticTargets[0]!, childId }], audit: shadowAudit });
assert(shadowComparison.compilerReadyForChild, shadowComparison.blockers.join(", "));
assert(shadowComparison.selectedNewWordIds.includes(derived.word.canonicalWordId));
assert(shadowComparison.selectionChanged);
const emptyComparison = compareItyDerivedSelection({ profile: releasedProfile,
  learningItems: [{ ...fixture.selection.authenticTargets[0]!, childId }],
  audit: { ...shadowAudit, newlyEligible: [] } });
assert(emptyComparison.blockers.includes("no_new_reviewed_candidates"));
const noChildGroup = compareItyDerivedSelection({ profile: releasedProfile,
  learningItems: [], audit: shadowAudit });
assert(noChildGroup.blockers.includes("no_selectable_child_group"));
assert.equal(noChildGroup.compilerReadyForChild, false);
assert.equal(ityDerivedBlockerAction("two_part_analysis_required").target,
  "td-route-D4_MOR_SUFFIXES_ITY");
assert.equal(ityDerivedBlockerAction("base_meaning_missing").target,
  "td-canonical-parts");
const selection = selectDynamicAffixWordLab({ profiles: [governedProfile],
  learningItems: [{ ...fixture.selection.authenticTargets[0]!, childId }] });
assert(selection, "four-word -ity group selects");
assert(selection.transfers.some((word) => word.canonicalWordId === derived.word!.canonicalWordId),
  "reviewed dictionary word is selected without an affix member");
const decision = compileDynamicAffixWordLabDecision(selection, {
  mode: "shared_authoritative", sourceKind: "reviewed_fixture", purpose: "writer",
});
assert(decision.ok, decision.ok ? "" : `${decision.blockerCode}: ${JSON.stringify(compileDynamicAffixSelectionThroughSharedCompiler(selection))}`);
const plan = buildDynamicAffixAssignmentPlan({
  basePlan: { childId, planDate: "2026-10-09", composerPolicyVersion: "fixture",
    schedulePolicyVersion: "fixture", throttle: {}, partOne: {}, partTwo: {},
    budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] },
  } as unknown as ComposedDailyPlan,
  selection, payload: decision.payload,
});
const persistence = planAssignmentPersistence(plan, {
  parentUserId: "00000000-0000-4000-8000-000000000302", existingHeaders: [],
});
assert.equal(persistence.action, "insert");
assert(persistence.header);
const resolved = resolveDynamicAffixLessonAuthorityV3(decision.payload);
assert(resolved);
const snapshot = compileDynamicAffixSpecialistSnapshotV3({ payload: resolved, selection,
  compilerDecision: decision, header: persistence.header, items: persistence.items });
assert.deepEqual(activityVariantsForRoute("dynamic_affix_word_lab", "D4_MOR_SUFFIXES_ITY")
  .filter((variant) => variant.enabled).map((variant) => variant.kind),
  ["introduction", "discovery", "cleaver", "word_build", "cover_check", "dictation", "reflection"]);
assert.equal(snapshot.activities.length, 7, "the activity inventory matches the compiled lesson parts");
assert.equal(snapshot.contentVersions.filter((authority) => authority.authorityType === "reviewed_morphology").length, 1);
assert(validateCompiledSpecialistSnapshotV3(snapshot, {
  lessonRouteMetadata: persistence.header.lessonRouteMetadata,
  assignmentGenerationSource: persistence.header.assignmentGenerationSource,
  items: persistence.items.map((item) => ({ ...item, sectionKey: item.metadata.sectionKey,
    canonicalWordId: item.metadata.canonicalWordId })),
}).ok);
console.log("Derived -ity learner selection and frozen snapshot passed");
