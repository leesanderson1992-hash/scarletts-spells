import type { DictionarySenseSet } from "./senses";

const ipaKey = (ipa: string) => ipa.trim().replace(/^\/|\/$/g, "");

/** Samples are keyed by pronunciation, never by spelling alone. These are
 * references, not editorial approval of a dictionary or lesson recording. */
export function britishPronunciationSample(word: string, ipa: string) {
  if (word.trim().toLowerCase() !== "close" || ipaKey(ipa) !== "kləʊs") return null;
  return {
    src: "/audio/dictionary-pronunciations/close-near-en-gb.mp3",
    author: "Association Shtooka, Judith Franck",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:En-uk-close.ogg",
    licenceUrl: "https://creativecommons.org/licenses/by/3.0/us/",
  };
}

/** An old spelling-level clip cannot safely represent two pronunciations, or
 * an IPA the editor has changed since approval. */
export function wordClipMatchesPronunciation(input: {
  word: string; approvedWord: string | null; ipa: string;
  approvedSenseSet: DictionarySenseSet | null;
}): boolean {
  if (input.word !== input.approvedWord || !input.ipa.trim()) return false;
  const set = input.approvedSenseSet;
  const used = new Set(set?.senses.map(sense => sense.pronunciationId).filter(Boolean));
  const ipas = new Set(set?.pronunciations.filter(row => used.has(row.id)).map(row => ipaKey(row.ipa)));
  return ipas.size === 1 && ipas.has(ipaKey(input.ipa));
}
