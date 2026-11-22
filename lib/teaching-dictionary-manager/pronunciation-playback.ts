import type { DictionarySenseSet } from "./senses";
import recordings from "./pronunciation-recordings.json";

const ipaKey = (ipa: string) => ipa.trim().replace(/^\/|\/$/g, "");

/** Owner-authorised Google clips are keyed by pronunciation, never by spelling
 * alone. Playing a clip never approves dictionary facts or lesson content. */
export function britishPronunciationSample(word: string, ipa: string) {
  return recordings.find(row => row.word.toLowerCase() === word.trim().toLowerCase() && ipaKey(row.ipa) === ipaKey(ipa)) ?? null;
}

export const hasBritishPronunciationSample = (word: string) => recordings.some(row => row.word.toLowerCase() === word.trim().toLowerCase());
export const britishRecordingPronunciation = (src: string) => recordings.find(row => row.src === src)?.ipa;

/** An old spelling-level clip cannot safely represent two pronunciations, or
 * an IPA the editor has changed since approval. */
export function wordClipMatchesPronunciation(input: {
  word: string; approvedWord: string | null; ipa: string;
  approvedSenseSet: DictionarySenseSet | null;
  wordRecordingSrc?: string;
}): boolean {
  if (input.word !== input.approvedWord || !input.ipa.trim()) return false;
  const recorded = input.wordRecordingSrc && britishRecordingPronunciation(input.wordRecordingSrc);
  if (recorded && ipaKey(recorded) !== ipaKey(input.ipa)) return false;
  const set = input.approvedSenseSet;
  const used = new Set(set?.senses.map(sense => sense.pronunciationId).filter(Boolean));
  const ipas = new Set(set?.pronunciations.filter(row => used.has(row.id)).map(row => ipaKey(row.ipa)));
  return ipas.size === 1 && ipas.has(ipaKey(input.ipa));
}
