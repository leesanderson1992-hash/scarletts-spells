import {
  compileCompoundWordLessonV2,
  type CompoundWordDictationSourceV2,
  type CompoundWordLessonPayloadV2,
  type CompoundWordLessonRecipeV2,
} from "./compound-word-lesson-v2";
import { DICTATION_TARGET_SPAN_SCHEMA_VERSION } from "./dictation-target-span";
import type { CompoundWordStructureV2 } from "./compound-word-structure-v2";
import type { LearningItemFact } from "../learning-items";

const MICRO_SKILL = "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS" as const;

type PreviewWord = {
  id: string;
  word: string;
  parts: readonly string[];
  sentence: string;
  meaning: string;
};

const WORDS: readonly PreviewWord[] = [
  { id: "a6a30d2e-cd03-543e-b7cf-f8020bf9dbd9", word: "rainbow", parts: ["rain", "bow"], sentence: "A rainbow appeared after the rain.", meaning: "a curved band of colours seen in the sky after rain" },
  { id: "471b01bb-6a54-595d-95e2-b1a06edcbc8a", word: "bedroom", parts: ["bed", "room"], sentence: "The baby slept in the bedroom.", meaning: "a room where someone sleeps" },
  { id: "2c8be08f-1205-5422-9799-f95b43a455f8", word: "football", parts: ["foot", "ball"], sentence: "Children play football in the playground.", meaning: "a game where players kick a ball into goals" },
  { id: "c4566186-8c4b-5c33-9755-5db34d1f110e", word: "playground", parts: ["play", "ground"], sentence: "The children played in the playground.", meaning: "an outdoor place where children play" },
];

function structure(entry: PreviewWord): CompoundWordStructureV2 {
  return {
    schemaVersion: 2,
    wholeCanonicalWordId: entry.id,
    microSkillKey: MICRO_SKILL,
    wholeWord: entry.word,
    components: entry.parts.map((displaySurface, index) => ({
      ordinal: index + 1,
      canonicalWordId: `10000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
      displaySurface,
      meaning: `the word part ${displaySurface}`,
      sense: `preview-${entry.word}-${index + 1}`,
    })),
    joins: [{ ordinal: 1, kind: "none" }],
    childFriendlyMeaning: entry.meaning,
    componentToWholeRelationship: `${entry.parts.join(" + ")} join to make ${entry.word}.`,
    morphologyProvenance: { source: "development-only compound-word preview fixture" },
    assignmentEligible: true,
    transferEligible: true,
    review: { status: "approved_for_first_exposure", reviewedBy: "Preview fixture", reviewedAt: "2026-09-29T00:00:00.000Z" },
    source: { artifact: "compound-word-preview-fixture", sourceRowHash: `preview-${entry.word}`, sheet: "preview", row: 1 },
  };
}

function dictation(entry: PreviewWord): CompoundWordDictationSourceV2 {
  const targetTokenIndex = entry.sentence.toLocaleLowerCase("en-GB").split(/\s+/u).findIndex((token) => token.replace(/[^a-z]/gu, "") === entry.word);
  return {
    canonicalWordId: entry.id,
    sentence: entry.sentence,
    audioText: entry.sentence,
    targetSpan: { schemaVersion: DICTATION_TARGET_SPAN_SCHEMA_VERSION, startTokenIndex: targetTokenIndex, endTokenIndexExclusive: targetTokenIndex + 1, exactAnswer: entry.word },
    review: { status: "approved_for_first_exposure", reviewedBy: "Preview fixture", reviewedAt: "2026-09-29T00:00:00.000Z" },
    source: { artifact: "compound-word-preview-fixture", sourceRowHash: `dictation-${entry.word}` },
  };
}

const recipe: CompoundWordLessonRecipeV2 = {
  recipeKey: "compound_word_lab",
  recipeVersion: "v2",
  contentVersion: "closed-compound-word-preview-v1",
  microSkillKey: MICRO_SKILL,
  introduction: {
    title: "Closed compound words",
    childFriendlyExplanation: "A compound word is made when two whole words join together. In a closed compound word, the parts are written together with no space or hyphen.",
    summary: "Spot the two words, then join them carefully.",
  },
  reflection: { promptKey: "compound-word-preview-reflection", promptText: "What did you learn about spelling compound words?" },
};

const first = WORDS[0];
const learningItems: readonly LearningItemFact[] = [{
  learningItemId: "10000000-0000-4000-8000-000000000100",
  childId: "preview-child",
  canonicalWordId: first.id,
  microSkillKey: MICRO_SKILL,
  itemStatus: "pending",
  sourceKind: "verified_misspelling",
  sourceRef: "development-only preview",
  sourceAttemptText: "rainbo",
  reteachPriority: false,
  ejectedOn: null,
  intakeOn: "2026-09-29",
  rowStatus: "active",
}];

/** Development-only fixture. It is never part of assignment selection or release content. */
export const COMPOUND_WORD_PREVIEW_PAYLOAD: CompoundWordLessonPayloadV2 = (() => {
  const payload = compileCompoundWordLessonV2({
    recipe,
    structures: WORDS.map(structure),
    dictationByCanonicalId: new Map(WORDS.map((entry) => [entry.id, dictation(entry)])),
    learningItems,
    selectionSeed: "closed-compound-word-preview",
  });
  if (!payload) throw new Error("Compound-word preview fixture did not compile.");
  return payload;
})();
