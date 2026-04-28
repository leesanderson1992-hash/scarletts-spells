import { BASE_VALID_WORDS } from "./lexicon/baseValidWords";
import { KNOWN_NAMES } from "./lexicon/knownNames";
import { SAFE_WORDS } from "./lexicon/safeWords";
import { TRICKY_WORDS } from "./trickyWords";
import { WORD_FAMILIES } from "./wordFamilies";

export const KNOWN_WORDS = Array.from(
  new Set(
    [
      ...BASE_VALID_WORDS.map((word) => word.toLowerCase()),
      ...SAFE_WORDS.map((word) => word.toLowerCase()),
      ...KNOWN_NAMES.map((word) => word.toLowerCase()),
      ...TRICKY_WORDS,
      ...WORD_FAMILIES.flatMap((family) => family.practiceWords),
    ].sort(),
  ),
);

export const SUGGESTION_WORDS = Array.from(
  new Set(
    [
      ...BASE_VALID_WORDS.map((word) => word.toLowerCase()),
      ...TRICKY_WORDS,
      ...WORD_FAMILIES.flatMap((family) => family.practiceWords),
    ].sort(),
  ),
);

export const KNOWN_WORD_SET = new Set(KNOWN_WORDS);
export const SUGGESTION_WORD_SET = new Set(SUGGESTION_WORDS);
export const SAFE_WORD_SET = new Set<string>(SAFE_WORDS);
export const KNOWN_NAME_SET = new Set<string>(KNOWN_NAMES);

function isConsonant(value: string) {
  return /^[bcdfghjklmnpqrstvwxyz]$/.test(value);
}

function hasConsonantBeforeTrailingY(word: string) {
  return word.length >= 3 && word.endsWith("ys") && isConsonant(word[word.length - 3]);
}

function hasDoubledFinalConsonant(word: string) {
  if (word.length < 2) {
    return false;
  }

  const last = word.at(-1) ?? "";
  const secondLast = word.at(-2) ?? "";

  return last === secondLast && isConsonant(last);
}

function buildPossibleBaseForms(word: string): string[] {
  const bases = new Set<string>();

  // Accept common plurals and third-person singular forms such as makes, plays and boxes.
  if (word.endsWith("ies") && word.length > 3) {
    bases.add(`${word.slice(0, -3)}y`);
  }

  if (word.endsWith("es") && word.length > 2) {
    bases.add(word.slice(0, -2));
  }

  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 1) {
    if (!hasConsonantBeforeTrailingY(word)) {
      bases.add(word.slice(0, -1));
    }
  }

  // Accept regular past tense forms such as jumped, baked and stopped.
  if (word.endsWith("ied") && word.length > 3) {
    bases.add(`${word.slice(0, -3)}y`);
  }

  if (word.endsWith("ed") && word.length > 2) {
    const stem = word.slice(0, -2);
    bases.add(stem);
    bases.add(`${stem}e`);

    if (hasDoubledFinalConsonant(stem)) {
      bases.add(stem.slice(0, -1));
    }
  }

  // Accept regular -ing forms such as making, jumping and stopping.
  if (word.endsWith("ing") && word.length > 3) {
    const stem = word.slice(0, -3);
    bases.add(stem);
    bases.add(`${stem}e`);

    if (hasDoubledFinalConsonant(stem)) {
      bases.add(stem.slice(0, -1));
    }
  }

  return Array.from(bases).filter((base) => base.length > 1);
}

export function isKnownWordLike(word: string): boolean {
  if (KNOWN_WORD_SET.has(word)) {
    return true;
  }

  return buildPossibleBaseForms(word).some((base) => KNOWN_WORD_SET.has(base));
}

export function isSafeWord(word: string): boolean {
  return SAFE_WORD_SET.has(word);
}

export function isKnownName(word: string): boolean {
  return KNOWN_NAME_SET.has(word);
}
