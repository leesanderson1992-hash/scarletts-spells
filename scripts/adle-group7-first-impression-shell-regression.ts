import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ADLE_ACTIVITY_CATALOGUE, ADLE_ACTIVITY_IMPLEMENTATION_AUDIT } from "../lib/adle/activity-catalogue";
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "../lib/adle/morphology/base-word-family-preview-fixture";
import { normaliseBaseWordFamilyResume } from "../lib/adle/morphology/base-word-family-resume";
import { normaliseClosedCompoundResume } from "../lib/adle/morphology/closed-compound-resume";
import { normaliseMorphologyLessonResume } from "../lib/adle/morphology/resume";

const read = (path: string) => readFileSync(path, "utf8");
const teaching = read("components/adle/first-impression/teaching-pages.tsx");
const shell = read("components/adle/first-impression/first-impression-lesson.tsx");
const morphology = read("components/adle/morphology/morphology-guided-lesson.tsx");
const base = read("components/adle/morphology/base-word-family-guided-lesson.tsx");
const compound = read("components/adle/morphology/closed-compound-guided-lesson.tsx");
const sessionPage = read("app/learn/week/adle/page.tsx");

for (const contract of ["TeachingPageConfig", 'type: "teaching"', "MeetWordConfig", "Meet the Words", "Back", "Next page", "onPageChange", "focusRef.current?.focus", "sm:grid-cols-2"]) {
  assert(teaching.includes(contract), `TeachingPages contract missing ${contract}`);
}
assert(teaching.includes("props.config.pages.length + 1") && teaching.includes("pageIndex === total - 1"), "Meet the Words is structurally the required final page");
assert(!teaching.includes("audio") && !teaching.includes("attempt") && !teaching.includes("evidence"), "Meet the Words introduces governed words without audio or evidence");

for (const contract of ['"teaching"', '"cover"', '"dictation"', '"reflection"', "props.activities.map", "Reread lesson pages", "returnStageId", "WordLabScene"]) {
  assert(shell.includes(contract), `FirstImpressionLesson contract missing ${contract}`);
}
assert(shell.indexOf('"teaching"') < shell.indexOf('"cover"') && shell.indexOf('"cover"') < shell.indexOf('"dictation"') && shell.indexOf('"dictation"') < shell.indexOf('"reflection"'), "fixed stage order is Teaching → configured activities → Cover → Dictation → Reflection");
for (const forbidden of ["completeAdleLessonPartAction", "Supabase", ".from(", "fetch(", "isAttemptCorrect", "correctSentence", "assignmentId", "dynamic branching", "conditionGraph"]) {
  assert(!shell.includes(forbidden), `shared shell must not own persistence, correctness, route identity or branching: ${forbidden}`);
}

for (const [family, source] of [["Prefix/Affix", morphology], ["Base Word", base], ["Compound", compound]] as const) {
  assert(source.includes("<FirstImpressionLesson"), `${family} consumes the canonical shell`);
  assert(!source.includes("<WordLabScene"), `${family} no longer owns a specialist scene/navigation shell`);
  const directCanonicalEnding = source.includes("<CoverShutter") && source.includes("<SentenceDictation") && source.includes("LessonReflection");
  const registeredCanonicalEnding = source.includes('concept: "COVER_CHECK"') && source.includes('concept: "DICTATION"') && source.includes('concept: "LESSON_REFLECTION"');
  assert(directCanonicalEnding || registeredCanonicalEnding, `${family} keeps the fixed canonical ending`);
}
assert(morphology.includes('type: "DISCOVER"') && morphology.includes('type: "SPLIT"') && morphology.includes('type: "BUILD"'), "Prefix/Affix middle sequence is configured");
assert(base.includes('type: "WORD_FAMILY_REVEAL"') && base.includes('type: "SPLIT"') && base.includes('type: "BUILD"'), "Base Word configures FamilyReveal distinctly in its middle sequence");
assert(compound.includes('type: "COMPOUND_JIGSAW"') && compound.includes('type: "MEANING_MATCH"'), "Compound middle sequence is configured");
assert.equal(ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "WORD_FAMILY_REVEAL")?.canonicalComponent, "FamilyReveal", "Meet the Words and FamilyReveal remain separate learner concepts");

const baseResume = normaliseBaseWordFamilyResume({ stage: "intro", familyIndex: 0, cleaveIndex: 0, cleaveStep: 0, cleaveCuts: {}, cleaveMisses: {}, buildIndex: 0, controlledIndex: 0, dictationIndex: 0, controlledAttempts: {}, controlledChecked: {}, sentenceAttempts: {}, sentenceChecked: false, reflectionText: "" }, BASE_WORD_FAMILY_PREVIEW_PAYLOAD);
assert.equal(baseResume?.teachingPageIndex, 0, "historical Base Word resume normalizes to the first canonical teaching page");
const compoundResume = normaliseClosedCompoundResume({ stage: "intro", index: 0, muted: false, attempts: {}, sentences: {}, sentenceChecked: false, reflection: "", jigsawLocked: [], jigsawMisses: {}, jigsawPlacements: {}, meaningConnected: [], meaningMisses: {} }, ["one"]);
assert.equal(compoundResume?.teachingPageIndex, 0, "historical Compound resume normalizes without migration");
const morphologyResume = normaliseMorphologyLessonResume({ stage: "learn", introIndex: 3, discoverIndex: 0, discoverAddedPrefix: false, splitMisses: 0, splitCorrect: false, splitIndex: 0, matchComplete: false, buildIndex: 0, controlledIndex: 0, dictationIndex: 0, controlledAttempts: {}, controlledChecked: {}, sentenceAttempts: {}, checkedSentence: false, guidedBindings: [], muted: false, helpLevel: 0, reflectionText: "" }, ["one"], [], { introScreenCount: 3 });
assert.equal(morphologyResume?.introIndex, 3, "Prefix/Affix resume accepts the required final Meet the Words page");

assert(sessionPage.includes("AdleSessionCelebration") && sessionPage.includes('readModel.state === "completed"'), "specialist completion still resolves to the canonical ADLE celebration");
assert.equal(ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "INTRODUCTION")?.canonicalComponent, "TeachingPages");
assert.equal(ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "READING_PAGE")?.canonicalComponent, "TeachingPages");
for (const canonical of ["TeachingPages", "MeetWords presentation", "FirstImpressionLesson"]) {
  assert(ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.some((row) => row.implementationName === canonical && ["CANONICAL", "CANONICAL_MODE"].includes(row.classification)), `${canonical} is governed as canonical`);
}
assert(ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.filter((row) => row.activityConcept === "SPECIALIST_LESSON_SHELL").length === 0, "no specialist lesson shell remains governed as forward architecture");

console.log("PASS: Group 7 TeachingPages and deterministic FirstImpressionLesson convergence, resume normalization, evidence-safe reread, and canonical completion");
