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
assert(normaliseBaseWordFamilyResume({ stage: "controlled", familyIndex: 1, cleaveIndex: 0, cleaveStep: 0, cleaveCuts: {}, cleaveMisses: {}, buildIndex: 0, controlledIndex: 5, dictationIndex: 0, controlledAttempts: {}, controlledChecked: {}, sentenceAttempts: {}, sentenceChecked: false, reflectionText: "" }, payload)?.controlledIndex === 5, "dedicated base-word resume accepts six-word practice");
assert(normaliseBaseWordFamilyResume({ stage: "cleave", familyIndex: 0, cleaveIndex: 0, cleaveStep: 0, cleaveCuts: { replayed_en_gb: [2, 6] }, cleaveMisses: {}, buildIndex: 0, controlledIndex: 0, dictationIndex: 0, controlledAttempts: {}, controlledChecked: {}, sentenceAttempts: {}, sentenceChecked: false, reflectionText: "" }, payload)?.cleaveCuts.replayed_en_gb.join("|") === "2|6", "base-word resume preserves either-order completed chops");
assert(normaliseBaseWordFamilyResume({ stage: "controlled", familyIndex: 2, controlledIndex: 0, dictationIndex: 0, controlledAttempts: {}, controlledChecked: {}, sentenceAttempts: {}, sentenceChecked: false, reflectionText: "" }, payload) === null, "resume rejects an out-of-range family section");

const preview = readFileSync("app/dev/adle/base-word-family/preview.tsx", "utf8");
const page = readFileSync("app/dev/adle/base-word-family/page.tsx", "utf8");
const renderer = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");
assert(page.includes('process.env.NODE_ENV === "production"') && page.includes("notFound()"), "base-word preview stays unavailable in production");
assert(preview.includes("ssr: false") && preview.includes("did not submit, score, schedule, or save learning evidence"), "preview is lazy and local-only");
assert(!renderer.includes("completeAdleLessonPartAction") && renderer.includes("CoverShutter") && renderer.includes("SentenceDictation") && renderer.includes("SplitHandle") && renderer.includes("SpellingTransformationReveal") && renderer.includes("DefinitionWordBuilder"), "renderer uses canonical Split, transformation, independent spelling, sentence dictation, and word assembly without completion writes");
assert(renderer.includes('part.kind === "base"') && renderer.includes("selectedBoundaries={selectedBoundaries}") && renderer.includes("different way to explore its parts"), "Base Word isolates one reviewed governed component and fails safely for malformed parts");
const rail = readFileSync("components/adle/activities/shared/snap-rail.tsx", "utf8");
const definitionBuilder = readFileSync("components/adle/activities/shared/definition-word-builder.tsx", "utf8");
assert(definitionBuilder.includes('checkMode="manual"') && rail.includes("Check my word") && rail.includes("Move ${props.tiles"), "base-word builder uses shared editable manual-check word-part slots");
assert(rail.includes("placed.map((id, index)") && rail.includes("slotRefs.current.findIndex"), "rail has one droppable block slot per governed word part");
const splitHandle = readFileSync("components/adle/activities/shared/split-handle.tsx", "utf8");
assert(splitHandle.includes("The word is split at the reviewed boundary.") && splitHandle.includes('event.key !== "Enter"') && splitHandle.includes('event.key !== " "') && splitHandle.includes("selectedBoundaries"), "the shared SplitHandle preserves keyboard behavior and adds controlled restoration");
assert(renderer.includes("raw misspelling") === false && renderer.includes("A word from your writing"), "renderer preserves authentic provenance without showing raw attempts");
assert(renderer.includes("<FirstImpressionLesson") && renderer.includes('guideName: "Word Builder"') && renderer.includes("function guideBeat") && renderer.includes("function clueFor"), "base-word lessons configure the shared First Impression shell, guide, sound, and clue model");
assert(renderer.includes("<FamilyReveal") && renderer.includes("Tap it and its word family will jump out.") && renderer.includes('type: "WORD_FAMILY_REVEAL"'), "each authentic family remains its own configured interactive reveal, distinct from Meet the Words");

console.log("adle-base-word-family-preview-regression: ok");
