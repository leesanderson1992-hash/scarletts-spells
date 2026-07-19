import { readFileSync } from "node:fs";

import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "../lib/adle/morphology/base-word-family-preview-fixture";
import { normaliseBaseWordFamilyResume } from "../lib/adle/morphology/base-word-family-resume";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const payload = BASE_WORD_FAMILY_PREVIEW_PAYLOAD;
function baseCleavePlan(word: typeof payload.independentWords[number]) {
  const wordParts = word.parts as Array<{ kind: string; surfaceText: string }>;
  const baseIndex = wordParts.findIndex((part) => part.kind === "base");
  return { base: wordParts[baseIndex]?.surfaceText, cuts: [baseIndex > 0 ? "before" : null, baseIndex < wordParts.length - 1 ? "after" : null].filter(Boolean) };
}
assert(payload.familySections.length === 2, "preview keeps the two authentic families separate");
assert(payload.familySections.flatMap((section) => section.guidedWords).length === 8, "preview caps guided display at eight reviewed words");
assert(payload.independentWords.length === 6, "preview retains exactly six independent targets");
assert(payload.independentWords.every((word) => payload.familySections.flatMap((section) => section.guidedWords).some((guided) => guided.canonicalWordId === word.canonicalWordId)), "independent words come only from the two displayed families");
assert(JSON.stringify(baseCleavePlan(payload.familySections.flatMap((section) => section.guidedWords).find((word) => word.displayWord === "replayed")!)) === JSON.stringify({ base: "play", cuts: ["before", "after"] }), "replayed requires two reviewed cuts to isolate play");
assert(JSON.stringify(baseCleavePlan(payload.familySections.flatMap((section) => section.guidedWords).find((word) => word.displayWord === "government")!)) === JSON.stringify({ base: "govern", cuts: ["after"] }), "government requires one reviewed cut to isolate govern");
assert(normaliseBaseWordFamilyResume({ stage: "controlled", familyIndex: 1, cleaveIndex: 0, cleaveStep: 0, cleaveMisses: {}, buildIndex: 0, controlledIndex: 5, dictationIndex: 0, controlledAttempts: {}, controlledChecked: {}, sentenceAttempts: {}, sentenceChecked: false, reflectionText: "" }, payload)?.controlledIndex === 5, "dedicated base-word resume accepts six-word practice");
assert(normaliseBaseWordFamilyResume({ stage: "controlled", familyIndex: 2, controlledIndex: 0, dictationIndex: 0, controlledAttempts: {}, controlledChecked: {}, sentenceAttempts: {}, sentenceChecked: false, reflectionText: "" }, payload) === null, "resume rejects an out-of-range family section");

const preview = readFileSync("app/dev/adle/base-word-family/preview.tsx", "utf8");
const page = readFileSync("app/dev/adle/base-word-family/page.tsx", "utf8");
const renderer = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");
assert(page.includes('process.env.NODE_ENV === "production"') && page.includes("notFound()"), "base-word preview stays unavailable in production");
assert(preview.includes("ssr: false") && preview.includes("did not submit, score, schedule, or save learning evidence"), "preview is lazy and local-only");
assert(!renderer.includes("completeAdleLessonPartAction") && renderer.includes("CoverShutter") && renderer.includes("DiffReveal") && renderer.includes("BaseWordCleaver") && renderer.includes("SnapRail"), "renderer uses independent and interactive morphology primitives without completion writes");
assert(renderer.includes('part.kind === "base"') && renderer.includes("completedCuts={props.step}") && renderer.includes("different way to explore its parts"), "base-word cleaver isolates one reviewed base and fails safely for malformed parts");
assert(readFileSync("components/adle/activities/shared/split-handle.tsx", "utf8").includes("un- is the first two letters"), "the existing un- cleaver remains unchanged");
assert(renderer.includes("raw misspelling") === false && renderer.includes("A word from your writing"), "renderer preserves authentic provenance without showing raw attempts");
assert(renderer.includes('guideName="Word Builder"') && renderer.includes("function guideBeat") && renderer.includes("function clueFor"), "base-word lessons use the shared Word Lab guide, sound, and clue model rather than a silent generic shell");
assert(renderer.includes('key={props.payload.familySections[state.familyIndex].baseFamilyKey}') && renderer.includes("Tap it and its word family will jump out."), "each authentic family has its own repeatable interactive reveal");

console.log("adle-base-word-family-preview-regression: ok");
