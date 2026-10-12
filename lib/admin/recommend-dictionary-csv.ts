import type { DictionaryRecommendation } from "./recommend-dictionary-entries";

export const RECOMMENDATION_CSV_COLUMNS = [
  "normalised_word", "display_word", "source_category", "source_name", "source_use_note", "confidence",
  "verified_uses", "children_count", "adle_uses", "other_writing_uses", "first_seen_at", "last_seen_at",
] as const;

export function isImportableRecommendation(word: string): boolean {
  return word.length <= 100 && /^\p{L}[\p{L}' -]*$/u.test(word);
}

function csvCell(value: string | number): string {
  const raw = String(value);
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function renderRecommendationCsv(rows: DictionaryRecommendation[]): string {
  const header = RECOMMENDATION_CSV_COLUMNS.map(csvCell).join(",");
  const body = rows.map((row) => [
    row.word_key,
    row.word_key,
    "reference_only",
    "Parent-verified learner writing",
    "Candidate from learner writing. Check spelling and add independent teaching evidence before publication.",
    "low",
    row.verified_uses,
    row.children_count,
    row.adle_uses,
    row.other_writing_uses,
    row.first_seen_at,
    row.last_seen_at,
  ].map(csvCell).join(","));
  return `\uFEFF${[header, ...body].join("\r\n")}\r\n`;
}
