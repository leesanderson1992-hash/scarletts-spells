import { readFileSync } from "node:fs";

import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "../lib/adle/morphology/base-word-family-preview-fixture";
import { normaliseBaseWordFamilyResume } from "../lib/adle/morphology/base-word-family-resume";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const payload = BASE_WORD_FAMILY_PREVIEW_PAYLOAD;
assert(payload.familySections.length === 2, "preview keeps the two authentic families separate");
assert(payload.familySections.flatMap((section) => section.guidedWords).length === 8, "preview caps guided display at eight reviewed words");
assert(payload.independentWords.length === 5, "preview retains exactly five independent targets");
assert(payload.independentWords.every((word) => payload.familySections.flatMap((section) => section.guidedWords).some((guided) => guided.canonicalWordId === word.canonicalWordId)), "independent words come only from the two displayed families");
assert(normaliseBaseWordFamilyResume({ stage: "controlled", familyIndex: 1, controlledIndex: 4, dictationIndex: 0, controlledAttempts: {}, controlledChecked: {}, sentenceAttempts: {}, sentenceChecked: false, reflectionText: "" }, payload)?.controlledIndex === 4, "dedicated base-word resume accepts five-word practice");
assert(normaliseBaseWordFamilyResume({ stage: "controlled", familyIndex: 2, controlledIndex: 0, dictationIndex: 0, controlledAttempts: {}, controlledChecked: {}, sentenceAttempts: {}, sentenceChecked: false, reflectionText: "" }, payload) === null, "resume rejects an out-of-range family section");

const preview = readFileSync("app/dev/adle/base-word-family/preview.tsx", "utf8");
const page = readFileSync("app/dev/adle/base-word-family/page.tsx", "utf8");
const renderer = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");
assert(page.includes('process.env.NODE_ENV === "production"') && page.includes("notFound()"), "base-word preview stays unavailable in production");
assert(preview.includes("ssr: false") && preview.includes("did not submit, score, schedule, or save learning evidence"), "preview is lazy and local-only");
assert(!renderer.includes("completeAdleLessonPartAction") && renderer.includes("CoverShutter") && renderer.includes("DiffReveal"), "renderer uses independent practice primitives without completion writes");
assert(renderer.includes("raw misspelling") === false && renderer.includes("A word from your writing"), "renderer preserves authentic provenance without showing raw attempts");

console.log("adle-base-word-family-preview-regression: ok");
