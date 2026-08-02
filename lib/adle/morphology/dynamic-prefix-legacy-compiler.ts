import { extractAuthoredTargetToken } from "./payload";
import {
  DYNAMIC_PREFIX_WORD_LAB_CONTENT_VERSION,
  DYNAMIC_PREFIX_WORD_LAB_PROFILE,
  DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT,
  resolveDynamicPrefixFacts,
  type DynamicPrefixLessonPayloadV2,
  type DynamicPrefixSelection,
} from "./dynamic-prefix-contracts";

/**
 * Released Prefix V2 compiler retained as the parity oracle and as the
 * explicitly declared authority for profiles that have not migrated yet.
 */
export function compileDynamicPrefixWordLabPayloadLegacy(
  selection: DynamicPrefixSelection,
): DynamicPrefixLessonPayloadV2 | null {
  const selected = [
    ...selection.authenticTargets.map((item) => ({ item, source: "authentic" as const })),
    ...selection.transfers.map((word) => ({ word, source: "transfer" as const })),
  ];
  if (
    selected.length !== DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT
    || !selection.profile.reflection.promptKey
    || !selection.profile.reflection.promptText
    || selection.profile.meaningBins.length < 2
    || new Set(selection.profile.meaningBins.map((bin) => bin.id)).size !== selection.profile.meaningBins.length
  ) return null;
  const words = selected.map((entry) => {
    const word = "item" in entry
      ? selection.profile.wordsByCanonicalId.get(entry.item.canonicalWordId)
      : entry.word;
    const prefix = word && resolveDynamicPrefixFacts(word, selection.profile);
    const teachingBuildText = word?.teachingBuildText
      ?? word?.parts.filter((part) => part.role !== "prefix").map((part) => part.text).join("");
    if (
      !word
      || !prefix
      || !word.displayWord
      || !word.baseWord
      || !teachingBuildText
      || `${prefix.text}${teachingBuildText}` !== word.displayWord
      || !word.baseMeaning
      || !word.derivedMeaning
      || word.parts.length < 2
      || word.joins.length !== word.parts.length - 1
      || word.parts.map((part) => part.text).join("") !== word.displayWord
      || word.splitPoints.length !== 1
      || !Number.isInteger(word.splitPoints[0])
      || word.splitPoints[0] <= 0
      || word.splitPoints[0] >= word.displayWord.length
      || !word.dictationSentence
      || word.audioText !== word.dictationSentence
      || extractAuthoredTargetToken(
        word.dictationSentence,
        word.dictationTargetTokenIndex,
      ) !== word.displayWord
    ) return null;
    return {
      canonicalWordId: word.canonicalWordId,
      displayWord: word.displayWord,
      audioText: word.audioText,
      baseMeaning: word.baseMeaning,
      derivedMeaning: word.derivedMeaning,
      effect: word.effect,
      parts: word.parts,
      joins: word.joins,
      splitPoints: word.splitPoints,
      baseWord: word.baseWord,
      prefixText: prefix.text,
      prefixLabel: prefix.label,
      source: entry.source,
    };
  });
  if (
    words.some((word) => word === null)
    || new Set(words.map((word) => word!.canonicalWordId)).size !== DYNAMIC_PREFIX_WORD_LAB_WORD_COUNT
    || words.some((word) =>
      !selection.profile.meaningBins.some((bin) => bin.id === word!.effect),
    )
  ) return null;
  const completeWords = words as DynamicPrefixLessonPayloadV2["words"]["lesson"];
  const cleaverWord = completeWords[0];
  const buildWord = completeWords.find(
    (word) => word.prefixText !== cleaverWord.prefixText,
  ) ?? cleaverWord;
  const buildChoices = selection.profile.prefixChoices.map((choice) =>
    choice.text === buildWord.prefixText
      ? { ...choice, status: "target" as const }
      : choice.status === "target"
        ? { ...choice, status: "valid_alternative" as const }
        : choice,
  );
  if (buildChoices.filter((choice) => choice.status === "target").length !== 1) return null;
  const isInFamily = selection.profile.microSkillKey === "D4_MOR_PREFIXES_IN_IM_IL_IR";
  const isSubInterSuperFamily = selection.profile.microSkillKey === "D4_MOR_PREFIXES_SUB_INTER_SUPER";
  const teachingBuildTextFor = (word: (typeof completeWords)[number]) =>
    selection.profile.wordsByCanonicalId.get(word.canonicalWordId)?.teachingBuildText
    ?? word.parts.filter((part) => part.role !== "prefix").map((part) => part.text).join("");
  const buildFor = (word: (typeof completeWords)[number]) => {
    const choices = selection.profile.prefixChoices.map((choice) =>
      choice.text === word.prefixText
        ? { ...choice, status: "target" as const }
        : choice.status === "target"
          ? { ...choice, status: "valid_alternative" as const }
          : choice,
    );
    return {
      canonicalWordId: word.canonicalWordId,
      baseWord: teachingBuildTextFor(word),
      targetMeaning: word.derivedMeaning,
      choices,
    };
  };
  const inFamilyBuilds = isInFamily
    ? ["in", "im", "il", "ir"]
      .map((form) => completeWords.find((word) => word.prefixText === form))
      .filter((word): word is (typeof completeWords)[number] => Boolean(word))
      .map(buildFor)
    : [];
  const subInterSuperSplits = (() => {
    if (!isSubInterSuperFamily) return [] as (typeof completeWords)[number][];
    const forms = new Set<string>();
    const selectedByForm = completeWords.filter((word) =>
      forms.has(word.prefixText ?? "")
        ? false
        : (forms.add(word.prefixText ?? ""), true),
    );
    const fill = completeWords.filter((word) =>
      !selectedByForm.some((selectedWord) =>
        selectedWord.canonicalWordId === word.canonicalWordId,
      ),
    );
    return [...selectedByForm, ...fill].slice(0, 3);
  })();
  return {
    schemaVersion: 2,
    experience: "D4_MOR_GUIDED",
    contentVersion: DYNAMIC_PREFIX_WORD_LAB_CONTENT_VERSION,
    microSkillId: selection.profile.microSkillKey,
    experienceProfile: DYNAMIC_PREFIX_WORD_LAB_PROFILE,
    prefix: {
      text: buildWord.prefixText!,
      label: buildWord.prefixLabel!,
      meaning: resolveDynamicPrefixFacts(
        selection.profile.wordsByCanonicalId.get(buildWord.canonicalWordId)!,
        selection.profile,
      )!.meaning,
    },
    authenticCanonicalWordIds: selection.authenticTargets.map((item) => item.canonicalWordId),
    words: { lesson: completeWords },
    activities: {
      introduction: selection.profile.introduction
        ? {
            title: "What is a prefix?",
            paragraphs: [
              "A prefix is a group of letters added to the beginning of a word. It can help to make a new word and change its meaning.",
            ],
            profileTitle: selection.profile.introduction.title,
            profileParagraphs: selection.profile.introduction.paragraphs,
            profileExamples: selection.profile.introduction.examples,
          }
        : isInFamily
          ? {
              title: "What is a prefix?",
              paragraphs: [
                "A prefix is a group of letters added to the beginning of a word. It can help to make a new word and change its meaning.",
              ],
              profileTitle: "Meet the in- prefix family",
              profileParagraphs: [
                "In this lesson, in-, im-, il- and ir- are different forms of the same prefix family. They can make a word mean not.",
                "Use im- before b, m or p; il- before l; and ir- before r. Use in- before the other letters.",
              ],
            }
          : {
              title: "Today’s prefix choices",
              paragraphs: [
                "A prefix goes at the beginning of a word. Different prefix forms can change what a word means.",
              ],
            },
      discovery: completeWords.map((word) => ({
        canonicalWordId: word.canonicalWordId,
        word: word.displayWord,
        baseWord: word.baseWord,
        baseMeaning: word.baseMeaning,
        derivedMeaning: word.derivedMeaning,
        distractorMeaning: word.baseMeaning,
        prefixLabel: word.prefixLabel!,
      })),
      meaningBins: selection.profile.meaningBins,
      build: {
        canonicalWordId: buildWord.canonicalWordId,
        baseWord: teachingBuildTextFor(buildWord),
        targetMeaning: buildWord.derivedMeaning,
        choices: buildChoices,
      },
      guided: isInFamily
        ? {
            splitCanonicalWordIds: completeWords
              .slice(0, 6 - inFamilyBuilds.length)
              .map((word) => word.canonicalWordId),
            builds: inFamilyBuilds,
            includeMeaningSort: false,
          }
        : isSubInterSuperFamily
          ? {
              splitCanonicalWordIds: subInterSuperSplits.map((word) => word.canonicalWordId),
              builds: [buildFor(buildWord)],
              includeMeaningSort: true,
            }
          : undefined,
      dictation: completeWords.map((word) => {
        const source = selection.profile.wordsByCanonicalId.get(word.canonicalWordId)!;
        return {
          canonicalWordId: word.canonicalWordId,
          targetWord: word.displayWord,
          sentence: source.dictationSentence,
          targetTokenIndex: source.dictationTargetTokenIndex,
        };
      }),
      reflection: selection.profile.reflection,
    },
  };
}
