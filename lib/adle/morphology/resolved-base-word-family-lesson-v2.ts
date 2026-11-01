import type { TeachingPagesConfig } from "@/components/adle/first-impression/teaching-pages";
import { lessonReflectionPrompt } from "../lesson-reflection";
import { BASE_WORD_FAMILY_REFLECTION_PROMPT_KEY } from "./reflections";
import { BASE_WORD_TEACHING_PRESENTATION_VERSION, validateBaseWordFamilyLessonSnapshot, type BaseWordFamilyLessonSnapshotV1 } from "./base-word-family-payload";
import { candidateBaseWordTeachingPages, releasedBaseWordTeachingPages } from "./base-word-teaching-pages";

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
    teaching: sourcePayload.teachingPresentationVersion === BASE_WORD_TEACHING_PRESENTATION_VERSION
      ? candidateBaseWordTeachingPages(sourcePayload)
      : releasedBaseWordTeachingPages(sourcePayload),
    reflection: {
      promptKey: BASE_WORD_FAMILY_REFLECTION_PROMPT_KEY,
      promptText: lessonReflectionPrompt({ kind: "base_word", values: sourcePayload.familySections.map((section) => section.baseWord.displayWord) }),
      source: { kind: "base_word_runtime_policy", version: 1 },
    },
  };
  return JSON.parse(JSON.stringify(resolved)) as ResolvedBaseWordFamilyLessonV2;
}
