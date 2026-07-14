import { readFileSync } from "node:fs";
import { buildLessonAttemptEvents } from "../lib/adle/assignment-attempt-events";
import { compileMorphologyUnPilotPayload, extractAuthoredTargetToken, morphologyPilotBindingSpecs, resolveMorphologyPilotRuntime, validateMorphologyLessonPayload } from "../lib/adle/morphology/payload";
import { MORPHOLOGY_RESUME_TTL_MS, clearMorphologyResume, normaliseMorphologyLessonResume, parseMorphologyResume, readMorphologyResume, serialiseMorphologyResume, writeMorphologyResume } from "../lib/adle/morphology/resume";
import type { AdleSessionItem } from "../lib/adle/loaders/daily-plan-surface";
import { isAttemptCorrect } from "../lib/adle/session-correctness";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`FAIL: ${message}`); }
const words = ["unhappy", "unfair", "unkind", "unlock", "untidy", "unnatural", "unnecessary"];
const ids = Object.fromEntries(words.map((word) => [word, `id-${word}`]));
const payload = compileMorphologyUnPilotPayload(ids);
assert(validateMorphologyLessonPayload(payload) !== null, "compiled payload validates");
assert(payload.words.lesson.map((word) => word.displayWord).join("|") === "unfair|unkind|unlock|untidy", "fixed lesson word order");
assert(payload.activities.find((activity) => activity.type === "prefix_choice")?.prefixChoices?.map((choice) => choice.text).join("|") === "un|re|pre", "fixed tidy prefix choices");
const dictation = payload.activities.find((activity) => activity.type === "sentence_dictation")?.sentences ?? [];
assert(dictation.length === 4 && dictation.every((entry) => extractAuthoredTargetToken(entry.sentence, entry.targetTokenIndex) === entry.targetWord), "authored sentence targets resolve");
const reflection = payload.activities.find((activity) => activity.type === "reflection");
assert(reflection?.evidenceMode === "none" && reflection.assignmentBindings.length === 0 && reflection.promptKey === "word-lab-un-observation-v1", "private reflection is authored and excluded from assessment bindings");

const invalid = structuredClone(payload) as unknown as Record<string, unknown>;
invalid.schemaVersion = 2;
assert(validateMorphologyLessonPayload(invalid) === null, "unsupported payload version fails closed");
const missingRecall = structuredClone(payload);
missingRecall.activities.find((activity) => activity.type === "sentence_dictation")!.answerVisibility = "teaching";
assert(validateMorphologyLessonPayload(missingRecall) === null, "answer-bearing dictation fails closed");

const specs = morphologyPilotBindingSpecs(payload);
assert(specs.length === 16, "pilot binding contract contains exactly 16 items");
const items: AdleSessionItem[] = specs.map((spec, index) => ({ id: `item-${index}`, sectionKey: spec.sectionKey, templateKey: spec.templateKey, position: index + 1, status: "ready", targetWord: spec.targetWord, canonicalWordId: spec.canonicalWordId, microSkillKey: "D4_MOR_PREFIXES_UN", adleLearningItemRef: null, promptData: { pilotActivityId: spec.binding, ...(spec.binding === "intro-root" ? { morphologyLesson: payload } : {}) } }));
assert(resolveMorphologyPilotRuntime(false, items) === null, "valid payload without gate falls back");
assert(resolveMorphologyPilotRuntime(true, items) !== null, "valid bound payload with gate resolves");
assert(resolveMorphologyPilotRuntime(true, items.slice(0, -1)) === null, "missing assignment binding falls back");
assert(resolveMorphologyPilotRuntime(true, [...items, { ...items[0], id: "duplicate" }]) === null, "duplicate assignment binding falls back");
assert(resolveMorphologyPilotRuntime(true, items.map((item, index) => index === 2 ? { ...item, templateKey: "MOR_MEANING_MATCH" } : item)) === null, "wrong template binding falls back");
assert(resolveMorphologyPilotRuntime(true, items.map((item, index) => index === 3 ? { ...item, canonicalWordId: ids.unkind } : item)) === null, "wrong canonical word binding falls back");

const now = Date.now();
const resume = serialiseMorphologyResume(payload.contentVersion, { stage: "controlled" }, now);
assert(parseMorphologyResume<{ stage: string }>(resume, payload.contentVersion, now)?.stage === "controlled", "current resume restores");
assert(parseMorphologyResume(resume, "different", now) === null, "different content resume rejected");
assert(parseMorphologyResume(resume, payload.contentVersion, now + MORPHOLOGY_RESUME_TTL_MS + 1) === null, "stale resume rejected");
const resumeWords = payload.words.lesson.map((word) => word.canonicalWordId);
const guidedBindings = ["guided-strip-unhappy", "guided-meaning-unfair", "guided-meaning-unkind", "guided-meaning-unlock", "guided-meaning-untidy", "guided-build-untidy"];
const checkedControlled = normaliseMorphologyLessonResume({ stage: "controlled", discoverIndex: 2, splitDone: true, controlledIndex: 1, dictationIndex: 0, controlledAttempts: { [resumeWords[1]]: "unkind" }, controlledChecked: { [resumeWords[1]]: true }, sentenceAttempts: {}, checkedSentence: false, guidedBindings, muted: false, helpLevel: 0, reflectionText: "" }, resumeWords, guidedBindings);
assert(checkedControlled?.stage === "controlled" && checkedControlled.controlledIndex === 2, "checked controlled answer resumes at next word");
const checkedLastControlled = normaliseMorphologyLessonResume({ ...checkedControlled!, controlledIndex: 3, controlledChecked: { [resumeWords[3]]: true } }, resumeWords, guidedBindings);
assert(checkedLastControlled?.stage === "dictation" && checkedLastControlled.dictationIndex === 0, "final checked controlled answer resumes at dictation");
const checkedSentence = normaliseMorphologyLessonResume({ ...checkedLastControlled!, stage: "dictation", dictationIndex: 3, checkedSentence: true }, resumeWords, guidedBindings);
assert(checkedSentence?.stage === "reflect" && checkedSentence.checkedSentence === false, "final checked sentence resumes at reflection without answer reveal");
const reflectionDraft = normaliseMorphologyLessonResume({ ...checkedSentence!, reflectionText: "un- can mean not" }, resumeWords, guidedBindings);
assert(reflectionDraft?.reflectionText === "un- can mean not", "private reflection draft survives strict resume normalisation");
assert(normaliseMorphologyLessonResume({ ...checkedSentence!, reflectionText: "x".repeat(2001) }, resumeWords, guidedBindings) === null, "oversized reflection draft is rejected");
assert(normaliseMorphologyLessonResume({ ...checkedControlled!, controlledIndex: 7 }, resumeWords, guidedBindings) === null, "out-of-range resume rejected");
assert(normaliseMorphologyLessonResume({ ...checkedControlled!, guidedBindings: ["unknown"] }, resumeWords, guidedBindings) === null, "unknown guided binding resume rejected");
const throwingStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
assert(readMorphologyResume("key", payload.contentVersion, throwingStorage) === null, "storage read failure falls back");
assert(writeMorphologyResume("key", payload.contentVersion, {}, throwingStorage) === false, "storage write failure is non-fatal");
assert(clearMorphologyResume("key", throwingStorage) === false, "storage cleanup failure is non-fatal");

const dictationItem = items.find((item) => item.promptData.pilotActivityId === "dictation-unkind")!;
const events = buildLessonAttemptEvents({ context: { childId: "child", parentUserId: "parent", assignmentId: "assignment", planDate: "2026-07-13" }, sourceRef: "lesson:child:2026-07-13:D4_MOR_PREFIXES_UN", items: [dictationItem], controlledAttempts: new Map(), dictationAttempts: new Map([[ids.unkind, "unkind"]]), dictationRawAttempts: new Map([[ids.unkind, "It was unkind to leave her out."]]), guidedAttempts: new Map(), probeAttempts: new Map() });
assert(events[0].attemptText === "It was unkind to leave her out.", "attempt ledger keeps raw sentence");
assert(events[0].isCorrect === true && events[0].evidenceClass === "first_exposure_lesson_attempt", "word-level correctness and evidence class remain unchanged");
assert(isAttemptCorrect("it was unfair to change the rules.", "unfair") === true, "missing sentence capital does not change target-token assessment correctness");

const previewSource = readFileSync("app/dev/adle/morphology-primitives/morphology-primitives-preview.tsx", "utf8");
const railSource = readFileSync("components/adle/activities/shared/snap-rail.tsx", "utf8");
const diffSource = readFileSync("components/adle/activities/shared/diff-reveal.tsx", "utf8");
const lessonSource = readFileSync("components/adle/morphology/morphology-guided-lesson.tsx", "utf8");
const splitSource = readFileSync("components/adle/activities/shared/split-handle.tsx", "utf8");
const soundSource = readFileSync("components/adle/activities/shared/sound.ts", "utf8");
assert(previewSource.includes("useState(true)") && previewSource.includes("Restart lesson") && previewSource.includes("Open component playground"), "development preview opens the guided lesson and keeps restart/playground controls");
assert(previewSource.includes("onPreviewComplete") && previewSource.includes("This preview stayed local") && previewSource.includes("Try the Word Lab again"), "development preview completes locally and offers a fresh run");
assert(railSource.includes('fixedTilesPosition?: "before" | "after"') && railSource.indexOf("{placedTiles}{fixedTiles}") >= 0, "assembly rail supports a prefix slot before the fixed base");
assert(!diffSource.includes('props.attempt.toLocaleLowerCase') && diffSource.includes("a sentence starts with a capital letter"), "sentence diff preserves authored case and prompts for the initial capital");
assert(lessonSource.includes('autoCapitalize="sentences"') && lessonSource.includes("Remember recap") && lessonSource.includes('name="learningReflection"'), "Remember flows into a private written reflection");
assert(lessonSource.includes("event.preventDefault()") && lessonSource.includes("props.onPreviewComplete ? undefined : completeAdleLessonPartAction"), "preview completion cannot invoke the authenticated lesson action");
assert(!splitSource.includes('type="range"') && !splitSource.includes("Drag the split handle"), "Split removes the range slider");
assert(splitSource.includes("CleaverIcon") && splitSource.includes("onPointerEnter") && splitSource.includes("onFocus") && splitSource.includes('aria-label={`Split after letter ${point}`}'), "cleaver follows pointer and keyboard focus over named boundary buttons");
assert(splitSource.includes('playInteractionSound("cleave"') && splitSource.includes('playInteractionSound("sparkle"') && soundSource.includes('"sparkle"'), "split plays chop and success sparkle sounds");
assert(splitSource.includes("useReducedMotion") && splitSource.includes("reducedMotion ? 0 : STRIKE_MS"), "cleaver strike has a static reduced-motion path");

console.log("ADLE D4_MOR guided pilot regression passed");
