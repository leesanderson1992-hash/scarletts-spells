import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  formatGovernedLessonValues,
  governedAffixForms,
  lessonReflectionSentenceComparison,
  lessonReflectionPrompt,
} from "../lib/adle/lesson-reflection";

assert.equal(lessonReflectionPrompt({ kind: "prefix", values: ["un-"] }), "What did you learn about spelling with the prefix un-?");
assert.equal(lessonReflectionPrompt({ kind: "suffix", values: ["-ness"] }), "What did you learn about spelling with the suffix -ness?");
assert.equal(lessonReflectionPrompt({ kind: "base_word", values: ["help"] }), "What did you learn about spelling with the base word help?");
assert.equal(lessonReflectionPrompt({ kind: "compound" }), "What did you learn about spelling compound words?");
assert.equal(formatGovernedLessonValues(["in-", "im-", "il-", "ir-"]), "in-, im-, il-, and ir-");
assert.equal(lessonReflectionPrompt({ kind: "prefix", values: ["dis-", "mis-"] }), "What did you learn about spelling with the prefixes dis- and mis-?");
assert.equal(lessonReflectionPrompt({ kind: "suffix", values: ["-ful", "-less"] }), "What did you learn about spelling with the suffixes -ful and -less?");
assert.deepEqual(governedAffixForms(["ness", "-ness", "ful"], "after"), ["-ness", "-ful"]);
assert(lessonReflectionSentenceComparison({ id: "capital", attempt: "the dog was unhappy.", correct: "The dog was unhappy." }), "capital-only differences remain visible feedback");
assert(lessonReflectionSentenceComparison({ id: "punctuation", attempt: "The dog was unhappy", correct: "The dog was unhappy." }), "terminal punctuation differences remain visible feedback");
assert.equal(lessonReflectionSentenceComparison({ id: "same", attempt: "The dog was unhappy. ", correct: "The dog was unhappy." }), null);

const shared = readFileSync("components/adle/activities/lesson-reflection.tsx", "utf8");
const morphology = readFileSync("components/adle/morphology/morphology-guided-lesson.tsx", "utf8");
const base = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");
const compound = readFileSync("components/adle/morphology/closed-compound-guided-lesson.tsx", "utf8");
const resolvedCompound = readFileSync("lib/adle/morphology/resolved-compound-word-lesson-v2.ts", "utf8");
const actions = readFileSync("app/learn/week/adle/actions.ts", "utf8");
const errorRepair = readFileSync("components/adle/activities/reflection-activity.tsx", "utf8");
const gallery = readFileSync("app/admin/adle/activity-catalogue/visual-convergence-candidates.tsx", "utf8");

for (const copy of ["What went wrong", "You wrote", "Correct spelling", "Correct sentence:", "I learned that..."]) {
  assert(shared.includes(copy), `LessonReflection must retain selected visual/copy baseline: ${copy}`);
}
for (const contract of [
  "NormalizedLessonReflectionMistake", "LessonReflectionContextRecap", "specialistRecaps",
  "NormalizedLessonReflectionSentenceComparison", "sentenceComparisons", 'data-reflection-sentence-comparisons="feedback-only"',
  "maxLength={LESSON_REFLECTION_MAX_RESPONSE_LENGTH}", "autoFocus={props.autoFocus ?? true}",
  "value={props.response}", "props.onResponseChange", "onClick={props.onComplete}",
  'aria-live="polite"', "aria-describedby", "htmlFor={responseId}",
]) assert(shared.includes(contract), `LessonReflection contract missing ${contract}`);
assert(!shared.includes("onKeyDown"), "plain Enter remains native multiline input and cannot complete LessonReflection");
for (const forbidden of ["completeAdleLessonPartAction", "completeBaseWordFamilyLessonAction", "assignmentId", "Supabase", "fetch(", ".from("]) {
  assert(!shared.includes(forbidden), `LessonReflection must not own route/persistence capability: ${forbidden}`);
}

for (const route of [morphology, base, compound]) {
  assert(route.includes("<LessonReflection") || route.includes('concept: "LESSON_REFLECTION"'), "every specialist route must resolve LessonReflection directly or through the canonical registry");
  assert(route.includes("sentenceComparisons=") || route.includes("sentenceComparisons:"), "every specialist route supplies feedback-only sentence comparisons");
}
assert(morphology.includes("normaliseSessionWord") && morphology.includes("analyseDictationSentence"), "Prefix/Affix keeps normalized target and Prefix context policies in its adapter");
assert(morphology.includes("contextItems.slice(0, 3)") && morphology.includes("contextRecap"), "Prefix context slips remain optional recap data");
assert(!morphology.includes('heading: "Meaning recap"') && !morphology.includes('id: "meaning-overview"'), "Prefix/Affix reflection does not repeat the completed Meaning Sort overview");
assert(base.includes("extractAuthoredTargetToken") && base.includes("baseWordLessonReflectionMistakes"), "Base Word keeps authored target-token extraction in its adapter");
assert(compound.includes("EXACT_GOVERNED_FORM_ANSWER_POLICY") && compound.includes("extractAuthoredTargetSpan"), "Compound keeps exact governed correctness and span extraction in its adapter");
assert(compound.includes("lessonReflectionSentenceComparison"), "Compound retains its existing whole-sentence comparison through the normalized contract");
assert([morphology, base, compound].every((route) => route.includes("correctSpelling")), "whole-sentence presentation remains separate from governed spelling mistakes");

for (const obsolete of ["function Reflection(", "ClosedCompoundReflectionContent", "ClosedCompoundReflectionPreview", "export function ReflectionForm"]) {
  assert(!`${morphology}\n${base}\n${compound}`.includes(obsolete), `obsolete route-local presentation remains: ${obsolete}`);
}
assert(morphology.includes("completeAdleLessonPartAction") && morphology.includes('name="learningReflection"') && morphology.includes('name="completionTraceId"'), "Morphology completion/persistence envelope remains adapter-owned");
assert(base.includes("props.onComplete?.({ reflection: state.reflectionText, controlledAttempts: state.controlledAttempts, sentenceAttempts: state.sentenceAttempts })"), "Base Word completion callback envelope is unchanged");
assert(compound.includes("completeAdleLessonPartAction") && compound.includes('name="guidedAttempts"') && compound.includes('name="learningReflection"'), "Compound completion/persistence envelope remains adapter-owned");

assert(actions.includes("promptKey: reflection.promptKey") && actions.includes("promptText: reflection.promptText"), "Morphology stored prompt key/text remain payload-owned");
assert(actions.includes("promptKey: lesson.reflection.promptKey") && actions.includes("promptText: lesson.reflection.promptText"), "Compound completion persists the shared resolved learner-visible prompt");
assert(resolvedCompound.includes('lessonReflectionPrompt({ kind: "compound" })') && !actions.includes("payload.activities.reflection.promptText"), "unused route-payload prompt cannot become Compound completion authority");
assert(actions.includes("promptKey: resolvedBaseWordLesson.reflection.promptKey") && actions.includes("promptText: resolvedBaseWordLesson.reflection.promptText"), "Base Word stored prompt key/text remain assignment-resolved and historically compatible");
assert(!actions.includes("persistWordLabCompletion"), "retired Word Lab v1 completion cannot remain a route action");
assert(actions.includes("persistReleaseBoundWordLabCompletion") && actions.includes("persistBaseWordFamilyPilotCompletion"), "current release-bound and Base Word atomic completion boundaries remain in place");

assert(errorRepair.includes("Hide word") || errorRepair.includes("Hide Word"), "ERROR_REPAIR remains a separate reveal-hide-retry component");
assert(!errorRepair.includes("LessonReflection"), "ERROR_REPAIR must not converge into LessonReflection");
assert(!gallery.includes("completeAdleLessonPartAction") && !gallery.includes("<form"), "gallery previews cannot invoke learner writes or production forms");
assert(gallery.includes("<LessonReflection") && gallery.includes("onComplete={noop}"), "gallery mounts the canonical component with local callbacks");

console.log("PASS: Group 2 canonical LessonReflection, governed prompts, route policy boundaries, historical persistence, and preview safety");
