export const PART_OF_SPEECH_OPTIONS = [
  { value: "noun", label: "Noun" },
  { value: "verb", label: "Verb" },
  { value: "adjective", label: "Adjective" },
  { value: "adverb", label: "Adverb" },
  { value: "pronoun", label: "Pronoun" },
  { value: "determiner", label: "Determiner" },
  { value: "preposition", label: "Preposition" },
  { value: "conjunction", label: "Conjunction" },
  { value: "interjection", label: "Interjection" },
  { value: "number", label: "Number" },
  { value: "contraction", label: "Contraction" },
  { value: "verb past tense", label: "Verb, past tense" },
  { value: "verb past participle", label: "Verb, past participle" },
] as const;

/** Keep existing imported labels selectable until a reviewer chooses a standard label. */
export function partOfSpeechOptions(current: string) {
  return PART_OF_SPEECH_OPTIONS.some((option) => option.value === current) || !current
    ? [...PART_OF_SPEECH_OPTIONS]
    : [{ value: current, label: `Current: ${current}` }, ...PART_OF_SPEECH_OPTIONS];
}
