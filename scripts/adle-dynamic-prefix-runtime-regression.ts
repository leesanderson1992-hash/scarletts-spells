import { strict as assert } from "node:assert";
import { compileDynamicPrefixWordLabPayload, selectDynamicPrefixWordLab, type DynamicPrefixProfile, type DynamicPrefixWord } from "../lib/adle/morphology/dynamic-prefix-word-lab";
import { dynamicPrefixRuntime, resolveDynamicPrefixRuntime } from "../lib/adle/morphology/dynamic-prefix-runtime";
import { resolvePersistedLessonRoute } from "../lib/adle/composable-lesson/route-resolution";
import { createPersistedRouteMetadata } from "../lib/adle/composable-lesson/persisted-route-metadata";
import { assertDynamicPrefixSharedParity } from "./lib/adle-shared-affix-parity-fixtures";

const words = new Map<string, DynamicPrefixWord>(["unone", "untwo", "unthree", "unfour"].map((word): [string, DynamicPrefixWord] => { const dictationSentence = `Use ${word}.`; return [word, { canonicalWordId: word, displayWord: word, audioText: dictationSentence, baseWord: word.slice(2), baseMeaning: "a base", derivedMeaning: "a derived meaning", effect: "not", parts: [{ id: `${word}:prefix`, text: "un", sourceText: "un", role: "prefix", start: 0, end: 2 }, { id: `${word}:base`, text: word.slice(2), sourceText: word.slice(2), role: "base", start: 2, end: word.length }], joins: [{ afterPartId: `${word}:prefix`, beforePartId: `${word}:base`, joinType: "none" }], splitPoints: [2], dictationSentence, dictationTargetTokenIndex: 1, approvedTransfer: true }]; }));
const profile: DynamicPrefixProfile = { microSkillKey: "D4_MOR_PREFIXES_UN", productionEnabled: true, prefixText: "un", prefixLabel: "un-", prefixMeaning: "not", meaningBins: [{ id: "not", label: "NOT", description: "not" }, { id: "reverse", label: "REVERSE", description: "reverse" }], wordsByCanonicalId: words, transferCanonicalWordIds: [...words.keys()], prefixChoices: [{ text: "un", label: "un-", outcome: "correct", meaning: "not", status: "target" }], reflection: { promptKey: "test", promptText: "What did you notice?" } };
const selection = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: [{ learningItemId: "one", childId: "child", canonicalWordId: "unone", microSkillKey: profile.microSkillKey, itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: "verified", sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: "2026-07-21", rowStatus: "active" }] });
assert(selection);
const payload = compileDynamicPrefixWordLabPayload(selection);
assert(payload);
assertDynamicPrefixSharedParity(selection, payload, "Prefix runtime fixture");
const runtime = dynamicPrefixRuntime(payload);
assert(runtime && runtime.words.lesson.length === 4 && runtime.activities.find((activity) => activity.type === "sentence_dictation")?.sentences?.length === 4);
assert(runtime?.activities.find((activity) => activity.type === "discovery")?.discoveryCards?.every((card) => card.prefixLabel === "un-"), "runtime retains per-word prefix labels for discovery");
assert(!dynamicPrefixRuntime({ ...payload, schemaVersion: 1 }));
const wordsForItems = payload.words.lesson;
const boundItems = [
  { promptData: { dynamicPrefixActivityId: "intro-root", dynamicPrefixLesson: payload }, sectionKey: "lesson_intro", templateKey: "MICRO_READ_ONLY_INTRO", canonicalWordId: null, targetWord: null },
  { promptData: { dynamicPrefixActivityId: "intro-words" }, sectionKey: "lesson_intro", templateKey: "LESSON_WORDS_INTRO", canonicalWordId: null, targetWord: null },
  { promptData: { dynamicPrefixActivityId: `guided-strip-${wordsForItems[0].canonicalWordId}` }, sectionKey: "guided_practice", templateKey: "MOR_STRIP_BUILD", canonicalWordId: wordsForItems[0].canonicalWordId, targetWord: wordsForItems[0].displayWord },
  ...wordsForItems.map((word) => ({ promptData: { dynamicPrefixActivityId: `guided-meaning-${word.canonicalWordId}` }, sectionKey: "guided_practice", templateKey: "MOR_MEANING_MATCH", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord })),
  { promptData: { dynamicPrefixActivityId: `guided-build-${wordsForItems[0].canonicalWordId}` }, sectionKey: "guided_practice", templateKey: "MOR_BUILD_WORD", canonicalWordId: wordsForItems[0].canonicalWordId, targetWord: wordsForItems[0].displayWord },
  ...wordsForItems.map((word) => ({ promptData: { dynamicPrefixActivityId: `controlled-${word.canonicalWordId}` }, sectionKey: "lesson_production", templateKey: "CONTROLLED_SPELLING", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord })),
  ...wordsForItems.map((word) => ({ promptData: { dynamicPrefixActivityId: `dictation-${word.canonicalWordId}` }, sectionKey: "lesson_dictation", templateKey: "DICTATION_NO_IMAGE", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord })),
];
assert(resolveDynamicPrefixRuntime(true, boundItems));
assert(!resolveDynamicPrefixRuntime(true, boundItems.slice(0, -1)));
const resolved = resolvePersistedLessonRoute({
  lessonRouteMetadata: createPersistedRouteMetadata("dynamic_prefix_word_lab"),
  items: boundItems.map((item, index) => ({ id: `prefix-${index}`, ...item })),
  runtimeContext: { morphologyUnEnabled: true, dynamicPrefixEnabled: true, dynamicAffixEnabled: true, baseWordFamilyEnabled: true },
});
assert(resolved.status === "resolved_explicit" && resolved.runtime.adapterKey === "dynamic_prefix_v2");
const unavailable = resolvePersistedLessonRoute({
  lessonRouteMetadata: createPersistedRouteMetadata("dynamic_prefix_word_lab"),
  items: boundItems.map((item, index) => ({ id: `prefix-${index}`, ...item })),
  runtimeContext: { morphologyUnEnabled: true, dynamicPrefixEnabled: false, dynamicAffixEnabled: true, baseWordFamilyEnabled: true },
});
assert(unavailable.status === "blocked" && unavailable.blockers.some((entry) => entry.code === "route_unavailable"));
const brokenBinding = resolvePersistedLessonRoute({
  lessonRouteMetadata: createPersistedRouteMetadata("dynamic_prefix_word_lab"),
  items: boundItems.slice(0, -1).map((item, index) => ({ id: `prefix-${index}`, ...item })),
  runtimeContext: { morphologyUnEnabled: true, dynamicPrefixEnabled: true, dynamicAffixEnabled: true, baseWordFamilyEnabled: true },
});
assert(brokenBinding.status === "blocked" && brokenBinding.blockers.some((entry) => entry.code === "assignment_binding_mismatch"));
console.log("PASS: v2 Dynamic Prefix snapshot adapts only after validation");
