const NON_LETTER_EDGE_PATTERN = /^[^a-z]+|[^a-z]+$/g;
const INNER_NON_LETTER_PATTERN = /[^a-z]/g;

export function normalizeWord(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(NON_LETTER_EDGE_PATTERN, "")
    .replace(INNER_NON_LETTER_PATTERN, "");
}

export function isNormalisedWord(value: string): boolean {
  return /^[a-z]+$/.test(value);
}
