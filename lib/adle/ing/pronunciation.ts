import type { IngLessonWordV1 } from "./contracts";

const SPOKEN_WORD_OVERRIDES: Readonly<Record<string, string>> = {
  // Content-owner approved: retying is pronounced ree-TIE-ing.
  retying: "re-tying",
};

export function ingDictationAudioText(word: Pick<IngLessonWordV1, "word" | "audioText">): string {
  const spoken = SPOKEN_WORD_OVERRIDES[word.word];
  if (!spoken) return word.audioText;
  return word.audioText.replace(new RegExp(`\\b${word.word}\\b`, "giu"), spoken);
}
