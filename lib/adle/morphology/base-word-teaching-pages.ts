import type { TeachingPagesConfig } from "@/components/adle/first-impression/teaching-pages";
import type { BaseWordFamilyLessonSnapshotV1 } from "./base-word-family-payload";

/** Historical released copy. Keep pinned lesson snapshots stable. */
export function releasedBaseWordTeachingPages(payload: BaseWordFamilyLessonSnapshotV1): TeachingPagesConfig {
  return {
    pages: [
      { id: "base-word-strategy", type: "teaching", eyebrow: "Base-word strategy", title: "What is a base word?", paragraphs: ["A base word is a familiar word that can stay inside a longer word.", "Knowing one spelling can help you spell many related words."] },
      { id: "base-word-model", type: "teaching", eyebrow: "Look closely", title: "Keep the base word steady.", paragraphs: ["Look for the familiar base inside each longer word before you spell it."], examples: payload.familySections.map((section) => ({ text: `${section.baseWord.displayWord} → ${section.guidedWords.find((word) => word.canonicalWordId !== section.baseWord.canonicalWordId)?.displayWord ?? section.baseWord.displayWord}`, explanation: section.baseMeaning })) },
    ],
    meetWords: { words: payload.independentWords.map((word) => ({ id: word.canonicalWordId, word: word.displayWord, detail: word.childFriendlyMeaning, provenance: payload.authenticTargets.some((target) => target.canonicalWordId === word.canonicalWordId) ? "A word from your writing" : undefined })) },
  };
}

/** Owner-approved teaching copy, reviewed against the supplied PDF. */
export const BASE_WORD_MATHS_REVIEW = {
  title: "The Maths & Cheat Coding Spelling",
  introduction: "Imagine learning to spell just 5 small words, and 2 small sounds and being able to spell 20 words! That to me sounds like my kind of maths. If we know the small word we can use it to make the larger version.",
  columns: ["Base word", "+ re-", "+ -ing", "+ re- and -ing"],
  rows: [
    ["play", "replay", "playing", "replaying"],
    ["paint", "repaint", "painting", "repainting"],
    ["read", "reread", "reading", "rereading"],
    ["write", "rewrite", "writing", "rewriting"],
    ["build", "rebuild", "building", "rebuilding"],
  ],
  longWordIntroduction: "Or, you can learn one base word and 5 affixes and spell this ridiculously long word! 😂",
  longWord: "Antidisestablishmentarianism",
  longWordParts: [
    { text: "anti", role: "prefix" },
    { text: "dis", role: "prefix" },
    { text: "establish", role: "base word" },
    { text: "ment", role: "suffix" },
    { text: "arian", role: "suffix" },
    { text: "ism", role: "suffix" },
  ],
} as const;

export const BASE_WORD_TEACHING_REVIEW_PAGES: TeachingPagesConfig = {
  pages: [
    {
      id: "base-word-intro-v1", type: "teaching", eyebrow: "Base-word strategy",
      title: "What is a base word?",
      paragraphs: [
        "A base word is a whole English word that can be extended using prefixes and suffixes to make larger words with different meanings.",
        "The English language is a bit like building Lego. We can take one word and keep building on it to create something new!",
      ],
      model: { first: "re", second: "play", result: "replay" },
    },
    {
      id: "base-word-review-maths", type: "teaching", eyebrow: "Spelling maths",
      title: BASE_WORD_MATHS_REVIEW.title,
      paragraphs: [BASE_WORD_MATHS_REVIEW.introduction],
    },
    {
      id: "base-word-review-long", type: "teaching", eyebrow: "One base, five affixes",
      title: "A ridiculously long word 😂",
      paragraphs: [BASE_WORD_MATHS_REVIEW.longWordIntroduction],
    },
  ],
  meetWords: {
    title: "Meet the family",
    introduction: "Look for the base word in each longer word. Next, the Cleaver helps you separate the added parts.",
    words: [
      { id: "play", word: "play", detail: "replay · playing · replaying" },
      { id: "paint", word: "paint", detail: "repaint · painting · repainting" },
      { id: "read", word: "read", detail: "reread · reading · rereading" },
      { id: "write", word: "write", detail: "rewrite · writing · rewriting" },
      { id: "build", word: "build", detail: "rebuild · building · rebuilding" },
    ],
  },
};

/** Approved three-page teaching sequence followed by Meet today's words. */
export function candidateBaseWordTeachingPages(payload: BaseWordFamilyLessonSnapshotV1): TeachingPagesConfig {
  const previous = releasedBaseWordTeachingPages(payload);
  return {
    pages: [
      BASE_WORD_TEACHING_REVIEW_PAGES.pages[0],
      {
        id: "base-word-maths-v1", type: "teaching", eyebrow: "Spelling maths", title: BASE_WORD_MATHS_REVIEW.title,
        paragraphs: [BASE_WORD_MATHS_REVIEW.introduction],
        baseWordFeature: { kind: "maths_table", columns: BASE_WORD_MATHS_REVIEW.columns, rows: BASE_WORD_MATHS_REVIEW.rows },
      },
      {
        id: "base-word-long-word-v1", type: "teaching", eyebrow: "One base, five affixes", title: "A ridiculously long word 😂",
        paragraphs: [BASE_WORD_MATHS_REVIEW.longWordIntroduction],
        baseWordFeature: { kind: "long_word_tiles", word: BASE_WORD_MATHS_REVIEW.longWord, parts: BASE_WORD_MATHS_REVIEW.longWordParts },
      },
    ],
    meetWords: { ...previous.meetWords, title: "Meet today’s words" },
  };
}
