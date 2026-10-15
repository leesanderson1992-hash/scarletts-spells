/** Learner copy shared by the runtime and editorial activity preview. */
export const LESSON_ACTIVITY_COPY = {
  suffixCleaver: "Find where the base/root ends and the suffix begins at the end of the word.",
  baseCleaver: "Choose where to chop the word.",
  boundaryCleaver: "Find the word-part boundary.",
  suffixMeaning: "Read the word. Decide what the suffix means. Then choose the meaning label that fits.",
  prefixForm: "Read the base word. Choose the prefix form that belongs before its first letter.",
  prefixMeaning: "Read the word. Think about what the prefix means. Then choose the meaning label that fits.",
  sentenceDictation: "Write the whole sentence",
  actionDictation: "Listen, then spell the missing action word",
  pairedDictation: "Listen to two words. Decide where each belongs.",
  passageDictation: "Listen to the story. Fill in two words.",
} as const;
export const definitionBuildQuestion = (definition: string) => `Which word means “${definition}”?`;
export const discoveryQuestion = (word: string) => `What does ${word} mean?`;
export const ingChangeQuestion = (base: string, word: string) => `What changed when ${base} became ${word}?`;
