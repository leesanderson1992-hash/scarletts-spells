import { normalizeWord } from "./normalize";

export type Token = {
  raw: string;
  normalized: string;
  index: number;
  start: number;
  end: number;
  isCapitalised: boolean;
};

const TOKEN_PATTERN = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;

export function tokenizeText(text: string): Token[] {
  return Array.from(text.matchAll(TOKEN_PATTERN), (match, index) => {
    const raw = match[0];
    const start = match.index ?? 0;

    return {
      raw,
      normalized: normalizeWord(raw),
      index,
      start,
      end: start + raw.length,
      isCapitalised: /^[A-Z]/.test(raw),
    };
  });
}
