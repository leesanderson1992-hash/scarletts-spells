/* Reviewed fixture objects are deliberately asserted at runtime. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLOSED_COMPOUND_CONTENT_VERSION, CLOSED_COMPOUND_MICRO_SKILL, compileClosedCompoundLesson, isClosedCompoundAnswerCorrect, validateClosedCompoundLessonPayload } from "../lib/adle/morphology/closed-compound-word-lab";
import { normaliseClosedCompoundResume } from "../lib/adle/morphology/closed-compound-resume";
import { isClosedCompoundRouteEnabled } from "../lib/adle/morphology/closed-compound-route-gate";
import { buildClosedCompoundAssignmentPlan } from "../lib/adle/morphology/closed-compound-assignment-plan";
import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import { resolvePersistedLessonRoute } from "../lib/adle/composable-lesson/route-resolution";
import { createLegacyPersistedRouteMetadata } from "../lib/adle/composable-lesson/persisted-route-metadata";

assert(isClosedCompoundAnswerCorrect("Football", "football"));
assert(!isClosedCompoundAnswerCorrect("foot ball", "football"));
assert(!isClosedCompoundAnswerCorrect("foot-ball", "football"));
assert(!isClosedCompoundAnswerCorrect("ballfoot", "football"));
const word = { canonicalWordId: "football", displayWord: "football", firstWord: "foot", secondWord: "ball", firstWordMeaning: "a body part", secondWordMeaning: "a round object", childFriendlyDefinition: "a game played by kicking a ball", audioText: "The children kicked the football.", dictationSentence: "The children kicked the football.", dictationTargetTokenIndex: 4, parts: [{ id: "a", text: "foot" }, { id: "b", text: "ball" }], joins: [{ afterPartId: "a", beforePartId: "b", joinType: "none" }], trueMorphology: { parts: [{ id: "a", text: "foot" }, { id: "b", text: "ball" }], joins: [{ afterPartId: "a", beforePartId: "b", joinType: "none" }], transformations: [], notes: "", provenance: { source: "test" } }, approvedTransfer: true } as any;
const payload: any = { schemaVersion: 1, experience: "D4_MOR_CLOSED_COMPOUND", contentVersion: CLOSED_COMPOUND_CONTENT_VERSION, microSkillId: CLOSED_COMPOUND_MICRO_SKILL, experienceProfile: "closed_compound_word_lab_v1", words: { lesson: [word, { ...word, canonicalWordId: "bedroom", displayWord: "bedroom", firstWord: "bed", secondWord: "room" }, { ...word, canonicalWordId: "playground", displayWord: "playground", firstWord: "play", secondWord: "ground" }, { ...word, canonicalWordId: "rainbow", displayWord: "rainbow", firstWord: "rain", secondWord: "bow" }] }, activities: { introduction: {}, reflection: { promptKey: "closed-compounds-no-space-v1", promptText: "What happens to the space?" }, dictation: [] } };
assert(!validateClosedCompoundLessonPayload(payload), "dictation must fail closed");
const pool = [["bedroom", "bed", "room"], ["breakthrough", "break", "through"], ["football", "foot", "ball"], ["playground", "play", "ground"], ["rainbow", "rain", "bow"], ["sunshine", "sun", "shine"], ["weekend", "week", "end"]].map(([displayWord, firstWord, secondWord]) => ({ ...word, canonicalWordId: displayWord, displayWord, firstWord, secondWord, audioText: displayWord, dictationSentence: displayWord, dictationTargetTokenIndex: 0, parts: [{ id: "a", text: firstWord }, { id: "b", text: secondWord }], trueMorphology: { ...word.trueMorphology, parts: [{ id: "a", text: firstWord }, { id: "b", text: secondWord }] } }));
const profile: any = { microSkillKey: CLOSED_COMPOUND_MICRO_SKILL, productionEnabled: true, introduction: { title: "Two words join", childFriendlyExplanation: "Words join.", summary: "No space.", examples: [] }, reflection: { promptKey: "closed", promptText: "What happened?" }, wordsByCanonicalId: new Map(pool.map((entry) => [entry.canonicalWordId, entry])) };
const selected = compileClosedCompoundLesson(profile, [{ childId: "child-a", learningItemId: "item", canonicalWordId: "rainbow", microSkillKey: CLOSED_COMPOUND_MICRO_SKILL, sourceKind: "verified_misspelling", sourceRef: "test", sourceAttemptText: "rain bow", reteachPriority: false, itemStatus: "pending", ejectedOn: null, intakeOn: "2026-07-29", rowStatus: "active" }]);
assert(selected?.words.lesson[0]?.displayWord === "rainbow", "targets are selected before the rotating pool");
assert(selected?.words.lesson.length === 4, "the seven-word pool composes a four-word snapshot");
const compoundBase = { childId: "child-a", planDate: "2026-07-29", composerPolicyVersion: "test", schedulePolicyVersion: "test", throttle: {}, partOne: {}, partTwo: {}, budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] } } as unknown as ComposedDailyPlan;
const compoundPlan = buildClosedCompoundAssignmentPlan(compoundBase, selected!);
assert.equal(compoundPlan.lessonRouteMetadata?.route.routeId, "closed_compound_word_lab");
const resolvedCompound = resolvePersistedLessonRoute({
  lessonRouteMetadata: createLegacyPersistedRouteMetadata("closed_compound_word_lab"),
  items: compoundPlan.partTwo.sections.flatMap((section) => section.items).map((entry, index) => ({ id: `compound-${index}`, sectionKey: entry.sectionKey, templateKey: entry.templateKey, canonicalWordId: entry.canonicalWordId, targetWord: entry.targetWord, promptData: entry.payload })),
  runtimeContext: { morphologyUnEnabled: true, dynamicPrefixEnabled: true, dynamicAffixEnabled: true, baseWordFamilyEnabled: true },
});
assert.equal(resolvedCompound.status, "resolved_explicit");
assert(resolvedCompound.runtime.adapterKey === "closed_compound_v1");
const duplicatedDictationProfile = { ...profile, wordsByCanonicalId: new Map(pool.map((entry) => [entry.canonicalWordId, { ...entry, audioText: "A shared sentence.", dictationSentence: "A shared sentence." }])) };
assert(compileClosedCompoundLesson(duplicatedDictationProfile, []) === null, "duplicate dictation sentences fail closed instead of repeating a sentence in one lesson");
const selectedIds = selected!.words.lesson.map((entry) => entry.canonicalWordId);
const resumed = normaliseClosedCompoundResume({
  stage: "meaning",
  index: 0,
  muted: true,
  attempts: {},
  sentences: {},
  sentenceChecked: false,
  reflection: "",
  jigsawLocked: selectedIds,
  jigsawMisses: { [selectedIds[0]]: 1 },
  meaningConnected: [selectedIds[0]],
  meaningMisses: { [selectedIds[1]]: 2 },
}, selectedIds);
assert.deepEqual(resumed?.jigsawLocked, selectedIds, "reload preserves completed jigsaw pieces");
assert.deepEqual(resumed?.meaningConnected, [selectedIds[0]], "reload preserves completed meaning links");
assert.equal(normaliseClosedCompoundResume({ ...resumed, meaningConnected: ["not-in-snapshot"] }, selectedIds), null, "resume rejects IDs outside the immutable snapshot");
const previousActivation = process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT;
const previousVercelEnvironment = process.env.VERCEL_ENV;
const previousProductionGate = process.env.ADLE_CLOSED_COMPOUND_PRODUCTION_ENABLED;
process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "staging";
assert(isClosedCompoundRouteEnabled(), "the explicitly marked staging project enables the compound route");
process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "production";
process.env.VERCEL_ENV = "production";
delete process.env.ADLE_CLOSED_COMPOUND_PRODUCTION_ENABLED;
assert(!isClosedCompoundRouteEnabled(), "the actual production project remains closed without its explicit marker");
process.env.ADLE_CLOSED_COMPOUND_PRODUCTION_ENABLED = "enabled";
assert(isClosedCompoundRouteEnabled(), "the separately authorised production marker enables the compound route");
if (previousActivation === undefined) delete process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT;
else process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = previousActivation;
if (previousVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
else process.env.VERCEL_ENV = previousVercelEnvironment;
if (previousProductionGate === undefined) delete process.env.ADLE_CLOSED_COMPOUND_PRODUCTION_ENABLED;
else process.env.ADLE_CLOSED_COMPOUND_PRODUCTION_ENABLED = previousProductionGate;
const jigsawSource = readFileSync("components/adle/morphology/compound-jigsaw-activity.tsx", "utf8");
const lessonSource = readFileSync("components/adle/morphology/closed-compound-guided-lesson.tsx", "utf8");
const meaningSource = readFileSync("components/adle/morphology/meaning-connection-activity.tsx", "utf8");
const loaderSource = readFileSync("lib/adle/morphology/closed-compound-profile-loader.ts", "utf8");
const reflectionSource = readFileSync("lib/adle/morphology/reflections.ts", "utf8");
assert(jigsawSource.includes("Muddled draggable jigsaw word pieces") && jigsawSource.includes("onPointerMove") && jigsawSource.includes("getBoundingClientRect"), "smoke gate: the board must retain all pieces, real pointer dragging, and proximity snap checks");
assert(jigsawSource.includes("drag this piece to its matching right-hand piece") && jigsawSource.includes("M4 4H104V25") && jigsawSource.includes("M128 4H4v21"), "smoke gate: first and second pieces must expose complementary outward/indented jigsaw geometry");
assert(meaningSource.includes("Your arrow follows your cursor") && meaningSource.includes("markerEnd=\"url(#compound-arrow)\"") && meaningSource.includes("onPointerMove={pointer}"), "smoke gate: the meaning board must show a live cursor-following arrow and a snapped arrow head");
assert(lessonSource.includes("Write the whole sentence") && lessonSource.includes("Check sentence") && lessonSource.includes("autoFocus") && lessonSource.includes("mode=\"sentence\""), "smoke gate: sentence dictation must provide a visible editable input and existing check/reveal flow");
assert(!lessonSource.includes("<><DiffReveal attempt={attempts[word.canonicalWordId]}"), "smoke gate: CoverShutter owns the one and only word comparison reveal");
assert(lessonSource.includes("Think about your compound words") && lessonSource.includes("The word is") && lessonSource.includes("bg-white p-4 text-lg font-semibold text-slate-950"), "smoke gate: reflection shows missed independent work and provides a high-contrast writing area");
assert(loaderSource.includes('canonical_teaching_dictionary_dictation_sentences")') && loaderSource.includes('.eq("row_status", "active").eq("review_status", "approved_for_first_exposure")'), "the loader must exclude superseded dictation rows before keying by canonical word");
assert(lessonSource.includes('item.sectionKey === "lesson_intro"') && lessonSource.includes("incorrectAttempts"), "all ten guided/read-only snapshot items emit non-mastery activity evidence");
assert(!reflectionSource.includes('.in("prompt_key"'), "completed routes show the assignment-owned reflection for every reviewed Word Lab profile");
console.log("closed compound regression passed");
