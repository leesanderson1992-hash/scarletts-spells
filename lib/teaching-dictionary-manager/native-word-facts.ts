/* eslint-disable @typescript-eslint/no-explicit-any -- immutable native projections are read as route-specific suggestions */
import type { RouteContentDraft } from "./contracts";

export function nativeWordFacts(
  routeId: string,
  routeVersion: string,
  skill: string,
  wordId: string,
  sources: readonly unknown[],
): RouteContentDraft | null {
  const projections = sources as { authorityType?: string; content?: any }[];
  const get = (kind: string) =>
    projections.find((p) => p.authorityType === kind)?.content;
  let content: Record<string, unknown> = {};
  let wordMeaning = "";
  let wordSum = "";
  if (routeId === "ing_endings_word_lab") {
    const word = get("ing_word_members")?.words?.find(
      (w: any) => w.canonicalWordId === wordId,
    );
    if (!word) return null;
    content = { ...word };
    wordMeaning = word.meaning;
  } else if (routeId === "compound_word_lab") {
    const word = get("compound_structure")?.structures?.find(
      (w: any) => w.wholeCanonicalWordId === wordId,
    );
    if (!word) return null;
    content = { ...word };
    wordMeaning = word.childFriendlyMeaning;
  } else if (routeId === "comparative_superlative_word_lab") {
    const family = get("adjective_degree_families")?.families?.find((f: any) =>
      f.words?.some((w: any) => w.canonicalWordId === wordId),
    );
    if (!family) return null;
    content = {
      familyKey: family.familyKey,
      degreeWords: family.words,
      transformations: family.transformations,
      lexicalVerification: family.lexicalVerification,
      sourceRefs: family.sourceRefs,
      pairedSentence: family.content.pairedSentence,
      pairedSentenceVariants: family.content.pairedSentenceVariants,
    };
    wordMeaning =
      family.words.find((w: any) => w.canonicalWordId === wordId)?.meaning ??
      "";
  } else if (routeId === "homophone_word_lab") {
    const source = get("homophone_lesson_content");
    const binding = source?.canonicalWords?.find(
      (w: any) => w.canonicalWordId === wordId,
    );
    if (!binding) return null;
    const word = source.lesson.words.find((w: any) => w.word === binding.word);
    content = { dictationPassageVariants: source.dictationPassageVariants };
    wordMeaning = word?.memoryCue ?? "";
  } else if (routeId === "base_word_lab") {
    const family = get("family_membership")?.families?.find((f: any) =>
      f.members?.some((w: any) => w.canonicalWordId === wordId),
    );
    const member = family?.members.find(
      (w: any) => w.canonicalWordId === wordId,
    );
    if (!member) return null;
    content = {
      ...member,
      familyKey: family.baseFamilyKey,
      baseWord: family.baseWordId,
      baseMeaning: family.baseMeaning,
    };
    wordMeaning = member.childFriendlyMeaning;
    wordSum = member.wordSum;
  } else return null;
  return {
    routeId,
    routeVersion,
    microSkillKey: skill,
    wordMeaning,
    wordSum,
    content,
  };
}
