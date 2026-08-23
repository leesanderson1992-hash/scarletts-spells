import type { TeachingPagesConfig } from "@/components/adle/first-impression/teaching-pages";
import { lessonReflectionPrompt } from "../lesson-reflection";
import { BASE_WORD_FAMILY_REFLECTION_PROMPT_KEY } from "./reflections";
import { validateBaseWordFamilyLessonSnapshot, type BaseWordFamilyLessonSnapshotV1 } from "./base-word-family-payload";

export type ResolvedBaseWordFamilyLessonV2 = Readonly<{
  sourcePayload: BaseWordFamilyLessonSnapshotV1;
  teaching: TeachingPagesConfig;
  reflection: { promptKey: string; promptText: string; source: { kind: "base_word_runtime_policy"; version: 1 } };
}>;

/** One JSON-stable authority containing the exact code-owned copy rendered by the live lesson. */
export function resolveBaseWordFamilyLessonAuthorityV2(value: unknown): ResolvedBaseWordFamilyLessonV2 | null {
  const validated = validateBaseWordFamilyLessonSnapshot(value);
  if (!validated) return null;
  const sourcePayload = JSON.parse(JSON.stringify(validated)) as BaseWordFamilyLessonSnapshotV1;
  const resolved: ResolvedBaseWordFamilyLessonV2 = {
    sourcePayload,
    teaching: {
      pages: [
        { id: "base-word-strategy", type: "teaching", eyebrow: "Base-word strategy", title: "What is a base word?", paragraphs: ["A base word is a familiar word that can stay inside a longer word.", "Knowing one spelling can help you spell many related words."] },
        { id: "base-word-model", type: "teaching", eyebrow: "Look closely", title: "Keep the base word steady.", paragraphs: ["Look for the familiar base inside each longer word before you spell it."], examples: sourcePayload.familySections.map((section) => ({ text: `${section.baseWord.displayWord} → ${section.guidedWords.find((word) => word.canonicalWordId !== section.baseWord.canonicalWordId)?.displayWord ?? section.baseWord.displayWord}`, explanation: section.baseMeaning })) },
      ],
      meetWords: { words: sourcePayload.independentWords.map((word) => ({ id: word.canonicalWordId, word: word.displayWord, detail: word.childFriendlyMeaning, provenance: sourcePayload.authenticTargets.some((target) => target.canonicalWordId === word.canonicalWordId) ? "A word from your writing" : undefined })) },
    },
    reflection: {
      promptKey: BASE_WORD_FAMILY_REFLECTION_PROMPT_KEY,
      promptText: lessonReflectionPrompt({ kind: "base_word", values: sourcePayload.familySections.map((section) => section.baseWord.displayWord) }),
      source: { kind: "base_word_runtime_policy", version: 1 },
    },
  };
  return JSON.parse(JSON.stringify(resolved)) as ResolvedBaseWordFamilyLessonV2;
}
