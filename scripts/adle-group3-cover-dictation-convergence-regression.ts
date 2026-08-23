import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { ADLE_ACTIVITY_CATALOGUE, ADLE_ACTIVITY_IMPLEMENTATION_AUDIT } from "../lib/adle/activity-catalogue";
import { normalizeGenericActivity } from "../lib/adle/generic-activity-compatibility";
import type { AdleSessionItem } from "../lib/adle/loaders/daily-plan-surface";
import { getGenericSnapshotTemplateDefinition } from "../lib/adle/composable-lesson/generic-snapshot-registry";

const read = (path: string) => readFileSync(path, "utf8");
const cover = read("components/adle/activities/shared/cover-shutter.tsx");
const sentence = read("components/adle/activities/shared/sentence-dictation.tsx");
const cold = read("components/adle/activities/shared/cold-word-recall.tsx");
const runner = read("components/adle-session-runner.tsx");
const morphology = read("components/adle/morphology/morphology-guided-lesson.tsx");
const base = read("components/adle/morphology/base-word-family-guided-lesson.tsx");
const compound = read("components/adle/morphology/closed-compound-guided-lesson.tsx");
const actions = read("app/learn/week/adle/actions.ts");
const reflection = read("components/adle/activities/lesson-reflection.tsx");

assert(cover.includes("stepLabel") && cover.includes("onContinue"), "CoverShutter owns the standard progress/continue presentation");
for (const contract of ["look", "cover", "write", "check", "DiffReveal", "onStateChange", "initialAttempt", "initialState"]) {
  assert(cover.includes(contract), `CoverShutter retains ${contract}`);
}
assert(cover.includes('disabled={state !== "look"}') && cover.includes('state === "write"') && cover.includes('state === "check"'), "cover then write then check ordering remains enforced");
assert(cover.includes('event.key === "Enter"') && cover.includes("checkAttempt()") && cover.includes("checkRequested.current"), "CoverShutter Enter shares the guarded Check action");

for (const contract of ["audioText", "correctSentence", "value", "checked", "HearWordButton", "DiffReveal", "Check sentence", "readOnly={props.checked || saving}", 'aria-live="polite"', "useId", "autoFocus"]) {
  assert(sentence.includes(contract), `SentenceDictation contract missing ${contract}`);
}
assert(sentence.indexOf("!props.checked") < sentence.indexOf("expected={props.correctSentence}"), "correct sentence is rendered only by the checked branch");
assert(sentence.includes('event.key === "Enter" && !event.shiftKey') && sentence.includes("checkSentence()") && sentence.includes("checkRequested.current"), "SentenceDictation Enter checks while Shift+Enter remains multiline");
for (const forbidden of ["completeAdleLessonPartAction", "assignmentId", "canonicalWordId", "Supabase", "fetch(", ".from(", "isAttemptCorrect", "extractAuthoredTarget"]) {
  assert(!sentence.includes(forbidden), `SentenceDictation must not own route/evidence policy: ${forbidden}`);
}

for (const contract of ["scheduled_review", "diagnostic_probe", "data-cold-word-recall-state", "readOnly={props.locked}", "onLock", "DiffReveal"]) {
  assert(cold.includes(contract), `ColdWordRecall contract missing ${contract}`);
}
assert(cold.indexOf("!props.locked") < cold.indexOf("expected={props.targetWord}"), "cold target comparison is mounted only after lock");
assert(!cold.includes("GrownUpReveal") && !cold.includes("details"), "cold recall has no premature grown-up answer reveal");
assert(cold.includes('event.key === "Enter"') && cold.includes("lockAttempt()") && cold.includes("lockRequested.current"), "ColdWordRecall Enter shares the guarded lock action");
assert(!reflection.includes("onKeyDown"), "LessonReflection retains native multiline Enter behavior");
assert(!runner.includes("SpellingField") && !runner.includes("GrownUpReveal"), "generic runner uses no retired learner renderer or reveal");
const reviewPart = runner.slice(runner.indexOf("function ReviewPart"), runner.indexOf("function LessonPart"));
assert(!reviewPart.includes(">Back<") && !reviewPart.includes('setPhase("production")}>\n              Back'), "review has no post-feedback back-to-edit control");
assert(runner.includes("dictationSentenceAttempts") && read("lib/adle/generic-activity-compatibility.ts").includes("resolveSentenceDictationContract"), "generic first-impression Dictation requires authored sentence input before canonical rendering");
const genericItem = (templateKey: string, sectionKey: string, promptData: Record<string, unknown> = {}): AdleSessionItem => ({ id: `${templateKey}:${sectionKey}`, sourceEntityId: templateKey, sectionKey, templateKey, position: 0, status: "pending", targetWord: "helpful", canonicalWordId: "word-helpful", microSkillKey: null, adleLearningItemRef: null, promptData });
for (const [templateKey, sectionKey, concept] of [["CONTROLLED_SPELLING", "lesson_production", "COVER_CHECK"], ["HIDE_WRITE", "guided_practice", "COVER_CHECK"], ["DICTATION_SENTENCE_CONTEXT", "review_production", "COLD_WORD_RECALL"], ["REVIEW_DICTATION", "review_production", "COLD_WORD_RECALL"]] as const) {
  const result = normalizeGenericActivity(genericItem(templateKey, sectionKey));
  assert.notEqual(result.status, "blocked");
  assert(result.status !== "blocked" && result.spec.concept === concept, `${templateKey} must normalize to ${concept}`);
}
const governedDictation = normalizeGenericActivity(genericItem("DICTATION_NO_IMAGE", "lesson_dictation", { sentence: "The helpful child smiled.", audioText: "The helpful child smiled.", targetTokenIndex: 1 }));
assert(governedDictation.status !== "blocked" && governedDictation.spec.concept === "DICTATION");
const governedProbe = normalizeGenericActivity(genericItem("DIAGNOSTIC_DICTATION_PROBE", "lesson_probe", { words: [{ canonicalWordId: "probe", targetWord: "brightness" }] }));
assert(governedProbe.status !== "blocked" && governedProbe.spec.concept === "COLD_WORD_RECALL");
assert(!existsSync("components/adle/activities/shared/spelling-field.tsx"), "SpellingField source is deleted");

for (const [name, source] of [["Prefix/Affix", morphology], ["Base Word", base], ["Compound", compound]] as const) {
  assert(source.includes("<CoverShutter") || source.includes('concept: "COVER_CHECK"'), `${name} resolves Cover Check directly or through the canonical registry`);
  assert(source.includes("<SentenceDictation") || source.includes('concept: "DICTATION"'), `${name} resolves whole-sentence Dictation directly or through the canonical registry`);
  assert(!source.includes("function Controlled"), `${name} has no route-local Controlled presentation`);
  assert(!source.includes("function Dictation"), `${name} has no route-local Dictation presentation`);
  assert(!source.includes("<textarea"), `${name} has no route-local sentence response UI`);
  assert(!source.includes("<DiffReveal"), `${name} has no route-local comparison presentation`);
  if (name !== "Prefix/Affix") assert(!source.includes("<HearWordButton"), `${name} has no route-local Dictation audio presentation`);
}
assert(!morphology.includes("<HearWordButton"), "Prefix/Affix route adapters do not duplicate canonical authored-audio controls");
assert(morphology.includes('concept: "DICTATION"') && morphology.includes("audioText: dictationSentence.sentence"), "Prefix/Affix Dictation delegates authored audio through the canonical SentenceDictation contract");

assert(morphology.includes("controlledAttempts") && morphology.includes("controlledChecked") && morphology.includes("sentenceAttempts") && morphology.includes("checkedSentence"), "Prefix/Affix resume fields remain route-owned");
assert(base.includes("controlledAttempts") && base.includes("controlledChecked") && base.includes("sentenceAttempts") && base.includes("sentenceChecked"), "Base Word resume fields remain route-owned");
assert(compound.includes("state.attempts") && compound.includes("state.sentences") && compound.includes("state.sentenceChecked"), "Compound resume fields remain route-owned");

for (const field of ["attempts", "dictationSentenceAttempts", "dictationAttempts", "guidedAttempts", "learningReflection"]) {
  assert(morphology.includes(`name="${field}"`) || compound.includes(`name="${field}"`), `specialist completion envelope retains ${field}`);
}
assert(base.includes("controlledAttempts: state.controlledAttempts") && base.includes("sentenceAttempts: state.sentenceAttempts"), "Base Word completion callback meaning is unchanged");
assert(actions.includes("extractAuthoredTargetSpan") && actions.includes("extractAuthoredTargetToken") && actions.includes("analyseDictationSentence"), "correctness and target extraction remain server/adapter-owned");

const genericModes = [
  ["CONTROLLED_SPELLING", "teaching", "first_exposure_lesson_attempt"],
  ["HIDE_WRITE", "guided", "guided_practice_attempt"],
  ["DICTATION_NO_IMAGE", "recall_neutral", "first_exposure_lesson_attempt"],
  ["DICTATION_SENTENCE_CONTEXT", "recall_neutral", "first_exposure_lesson_attempt"],
  ["DIAGNOSTIC_DICTATION_PROBE", "recall_neutral", "diagnostic_probe_attempt"],
  ["REVIEW_DICTATION", "recall_neutral", "scheduled_review_attempt"],
] as const;
for (const [templateKey, visibility, evidenceClass] of genericModes) {
  const definition = getGenericSnapshotTemplateDefinition(templateKey);
  assert(definition, `${templateKey} remains registered`);
  assert.equal(definition.answerVisibility, visibility, `${templateKey} answer visibility remains ${visibility}`);
  assert.equal(definition.evidence.evidenceClass, evidenceClass, `${templateKey} evidence remains ${evidenceClass}`);
}

const coverEntry = ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "COVER_CHECK");
const controlledEntry = ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "CONTROLLED_SPELLING");
const dictationEntry = ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "DICTATION");
assert.equal(coverEntry?.canonicalComponent, "CoverShutter");
assert.equal(dictationEntry?.canonicalComponent, "SentenceDictation");
assert.equal(controlledEntry?.status, "COMPATIBILITY_ONLY");
assert.deepEqual(controlledEntry?.supportedModes, ["compatibility_to_cover_check"]);
assert.equal(ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "COLD_WORD_RECALL")?.canonicalComponent, "ColdWordRecall");

for (const obsolete of ["Controlled (Morphology)", "Dictation (Morphology)", "Controlled (Base Word)", "Dictation (Base Word)", "Controlled (Compound inline)", "Dictation (Compound inline)"]) {
  assert(!ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.some((row) => row.implementationName === obsolete), `obsolete audit implementation removed: ${obsolete}`);
}
for (const canonical of ["SentenceDictation", "ColdWordRecall", "Morphology Cover Check adapter", "Morphology Sentence Dictation adapter", "Base Word Cover Check adapter", "Base Word Sentence Dictation adapter", "Compound Cover Check adapter", "Compound Sentence Dictation adapter"]) {
  assert(ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.some((row) => row.implementationName === canonical && (row.classification === "CANONICAL" || row.classification === "CANONICAL_MODE")), `canonical audit row present: ${canonical}`);
}

console.log("PASS: Group 3 CoverShutter, SentenceDictation and ColdWordRecall convergence, compatibility keys, locks, resume envelopes and evidence boundaries");
