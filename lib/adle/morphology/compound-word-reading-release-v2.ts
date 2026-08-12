import {
  validateCompoundWordLessonReadingPagesV2,
  type CompoundWordLessonIntroductionV2,
} from "./compound-word-lesson-v2";

export const SEPARATED_HYPHENATED_MICRO_SKILL_KEY =
  "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED" as const;

type TeachingContentAuthority = {
  schemaVersion: 1;
  microSkillKey: typeof SEPARATED_HYPHENATED_MICRO_SKILL_KEY;
  content: {
    childFriendlyExplanation: string;
    ruleExplanation: string;
    readingPages: unknown;
  };
};

type PublishedTeachingContentProjection = Omit<TeachingContentAuthority, "content"> &
  TeachingContentAuthority["content"];

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveSeparatedHyphenatedReadingIntroductionV2(
  value: unknown,
): CompoundWordLessonIntroductionV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const authority = value as Partial<TeachingContentAuthority & PublishedTeachingContentProjection>;
  const content = authority.content ?? authority;
  if (
    authority.schemaVersion !== 1 ||
    authority.microSkillKey !== SEPARATED_HYPHENATED_MICRO_SKILL_KEY ||
    !nonEmpty(content.childFriendlyExplanation) ||
    !nonEmpty(content.ruleExplanation) ||
    !validateCompoundWordLessonReadingPagesV2(content.readingPages)
  ) return null;
  return {
    title: content.readingPages[0].title,
    childFriendlyExplanation: content.childFriendlyExplanation,
    summary: content.ruleExplanation,
    readingPages: content.readingPages,
  };
}

export type CompoundReadingNavigationV2 = {
  backAvailable: boolean;
  nextAvailable: boolean;
  workshopAvailable: boolean;
};

export function compoundReadingNavigationV2(
  pageIndex: number,
  pageCount: number,
): CompoundReadingNavigationV2 | null {
  if (!Number.isInteger(pageIndex) || pageCount !== 3 || pageIndex < 0 || pageIndex >= pageCount) {
    return null;
  }
  return {
    backAvailable: pageIndex > 0,
    nextAvailable: pageIndex < pageCount - 1,
    workshopAvailable: pageIndex === pageCount - 1,
  };
}
