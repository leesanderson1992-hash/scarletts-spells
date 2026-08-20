import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { ADLE_ACTIVITY_CATALOGUE, ADLE_ACTIVITY_CONVERGENCE_BACKLOG, ADLE_ACTIVITY_IMPLEMENTATION_AUDIT } from "../lib/adle/activity-catalogue";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function functionSource(file: string, declaration: string, nextDeclaration: string): string {
  const start = file.indexOf(declaration);
  const end = file.indexOf(nextDeclaration, start + declaration.length);
  assert(start >= 0 && end > start, `unable to isolate ${declaration}`);
  return file.slice(start, end);
}

const split = source("components/adle/activities/shared/split-handle.tsx");
const morphology = source("components/adle/morphology/morphology-guided-lesson.tsx");
const base = source("components/adle/morphology/base-word-family-guided-lesson.tsx");
const reveal = source("components/adle/activities/shared/spelling-transformation-reveal.tsx");
const splitBuild = functionSource(morphology, "export function SplitBuild", "function meaningBins");
const baseCleave = functionSource(base, "function Cleave", "function baseWordDefinitionBuild");

assert(!existsSync("components/adle/activities/shared/base-word-cleaver.tsx"), "independent BaseWordCleaver implementation must not remain");
assert(!existsSync("components/adle/activities/shared/transformation-animation.tsx"), "development-only TransformationAnimation must not remain");
assert(!existsSync("app/dev/adle/base-word-cleaver-y-to-i/page.tsx") && !existsSync("app/dev/adle/base-word-cleaver-y-to-i/preview.tsx"), "old BaseWordCleaver preview must be retired");
assert(split.includes("selectedBoundaries") && split.includes("onSelectedBoundariesChange") && split.includes("isolatedComponentIndex"), "SplitHandle must own controlled restoration and isolation configuration");
assert(split.includes("remainingBoundaries[0]") && split.includes("continueButton.current?.focus()"), "SplitHandle must focus the next governed cut and continuation");
assert(split.includes("playInteractionSound") && split.includes("useReducedMotion"), "SplitHandle must preserve sound and reduced-motion behavior");

assert(splitBuild.includes("<SplitHandle") && !splitBuild.includes("useState") && !splitBuild.includes("useReducer"), "SplitBuild must remain a state-free curriculum adapter");
assert(baseCleave.includes("<SplitHandle") && baseCleave.includes("requiredBoundaries") && !baseCleave.includes("useState") && !baseCleave.includes("useReducer"), "Base Word Cleave must be a state-free adjacent-boundary adapter");
assert(baseCleave.includes("splitComplete && transformation") && baseCleave.includes("<SpellingTransformationReveal"), "Base Word must compose transformation after Split completion");
assert(!baseCleave.includes("remainingWord") && !baseCleave.includes("What word remains?"), "typed post-Split base confirmation must stay retired");
assert(reveal.includes('data-transformation-kind="surface_to_source"') && !reveal.includes("splitPoints") && !reveal.includes("selectedBoundaries"), "transformation reveal must not own or mutate Split answers");
assert(!split.includes("change_final_y_to_i") && !split.includes("drop_e") && !split.includes("double_consonant"), "SplitHandle must not infer transformation rules");

const resume = source("lib/adle/morphology/base-word-family-resume.ts");
assert(resume.includes("cleaveCuts: Record<string, number[]>") && resume.includes("cleaveMisses: Record<string, number>") && resume.includes("cleaveStep: number"), "Base Word resume fields must remain unchanged");
assert(resume.includes("adle:morphology-base-family:${previewId}:1:${contentVersion}"), "Base Word resume key must remain compatible");
assert(!base.includes("completeAdleLessonPartAction"), "Base Word Split must not gain direct evidence writes");
assert(morphology.includes("completeBinding(") && morphology.includes("assignmentBindings[state.splitIndex]"), "Prefix/Affix guided completion binding must remain route-owned");

const cleaver = ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "CLEAVER");
const transformation = ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "TRANSFORMATION");
assert.equal(cleaver?.canonicalComponent, "SplitHandle");
assert(cleaver?.supportedModes.includes("isolate_component"));
assert.deepEqual(cleaver?.duplicateImplementations, []);
assert.equal(transformation?.canonicalComponent, "SpellingTransformationReveal");
assert.deepEqual(transformation?.supportedModes, ["surface_to_source"]);
assert(!ADLE_ACTIVITY_CONVERGENCE_BACKLOG.some((item) => item.title === "Converge the Cleaver family"), "completed Cleaver convergence must leave the active backlog");
assert.equal(ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.find((row) => row.implementationName === "SplitBuild")?.classification, "THIN_ADAPTER");
assert.equal(ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.find((row) => row.implementationName === "Cleave (Base Word adapter)")?.classification, "THIN_ADAPTER");
assert.equal(ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.find((row) => row.implementationName === "MorphemeSequence")?.classification, "DEVELOPMENT_REFERENCE");
assert(!ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.some((row) => ["BaseWordCleaver", "WordSplitView", "TransformationAnimation", "TransformationView"].includes(row.implementationName)), "retired implementations must leave the live audit inventory");

console.log("PASS: Group 4 canonical SplitHandle, thin route adapters, separated source-form reveal, resume/evidence parity, and retired duplicate mechanics");
