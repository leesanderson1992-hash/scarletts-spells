export type DictionaryPronunciation = {
  id: string;
  ipa: string;
  spokenSyllableCount: number | null;
  stressPattern: string;
};

export type DictionarySense = {
  id: string;
  partOfSpeech: string;
  definition: string;
  pronunciationId: string | null;
  dictationSentence?: string;
  dictationTargetTokenIndex?: number;
};

export type DictionarySenseSet = {
  pronunciations: DictionaryPronunciation[];
  senses: DictionarySense[];
};
