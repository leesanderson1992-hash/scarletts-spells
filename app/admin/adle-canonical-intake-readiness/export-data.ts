import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { loadReadinessRows, type ReadinessRow, type ReadinessView } from "./read-model";
import type { ReadinessControls } from "./readiness-controls";

export function csv(rows: Array<Record<string, unknown>>, columns: readonly string[]): string {
  const cell = (value: unknown) => {
    const raw = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
    // Treat downloaded CSV as an editing surface, never as spreadsheet commands.
    const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${columns.map(cell).join(",")}\r\n${rows.map((row) => columns.map((key) => cell(row[key])).join(",")).join("\r\n")}\r\n`;
}

export async function allUnresolvedReadinessRows(): Promise<ReadinessRow[]> {
  const controls: ReadinessControls = { microSkill: "", without: "all", sort: "word", direction: "asc" };
  const views: ReadinessView[] = ["current", "other", "archived"];
  const pages = await Promise.all(views.map((view) => loadReadinessRows({ view, search: "", page: 1, controls, all: true })));
  const rows = new Map<string, ReadinessRow>();
  for (const page of pages) for (const row of page.rows) rows.set(row.key, row);
  return [...rows.values()].sort((a, b) => a.word.localeCompare(b.word) || a.microSkillKey.localeCompare(b.microSkillKey));
}

export const READINESS_CSV_COLUMNS = ["word", "micro_skill_key", "route_id", "occurrences", "users_waiting",
  "resolver", "teaching_content", "dictionary", "metadata", "adle_lesson", "last_evaluated_at"] as const;

export function readinessCsvRows(rows: ReadinessRow[]): Array<Record<string, unknown>> {
  return rows.map((row) => ({ word: row.word, micro_skill_key: row.microSkillKey, route_id: row.routeId,
    occurrences: row.occurrences, users_waiting: row.usersWaiting, resolver: row.facets.resolver.state,
    teaching_content: row.facets.teaching.state, dictionary: row.facets.dictionary.state,
    metadata: row.facets.metadata.state, adle_lesson: row.facets.lesson.state,
    last_evaluated_at: row.lastEvaluatedAt }));
}

export const DICTIONARY_CSV_COLUMNS = ["normalised_word", "affected_micro_skills", "word_key", "display_word",
  "dialect_code", "frequency_band", "age_band", "complexity_band", "syllables", "phoneme_hint",
  "grapheme_notes", "stress_pattern", "has_schwa", "morphemes", "morphology_notes", "irregularity_notes",
  "source_category", "source_name", "source_url", "source_licence", "source_use_note", "confidence",
  "row_status", "review_status", "missing_reason"] as const;

export async function missingDictionaryCsvRows(): Promise<Array<Record<string, unknown>>> {
  const needs = await allUnresolvedReadinessRows();
  const byWord = new Map<string, ReadinessRow[]>();
  for (const row of needs) byWord.set(row.word, [...(byWord.get(row.word) ?? []), row]);
  if (!byWord.size) return [];
  const db = createServiceRoleClient();
  const words = await db.from("canonical_teaching_dictionary_words")
    .select("id,normalised_word,word_key,display_word,dialect_code,frequency_band,age_band,complexity_band,source_category,source_name,source_url,source_licence,source_use_note,confidence,row_status,review_status,created_at")
    .in("normalised_word", [...byWord.keys()]).order("created_at", { ascending: false });
  if (words.error) throw new Error(words.error.message);
  const wordIds = (words.data ?? []).map((row) => row.id);
  const metadata = wordIds.length ? await db.from("canonical_teaching_dictionary_word_metadata")
    .select("canonical_word_id,syllables,phoneme_hint,grapheme_notes,stress_pattern,has_schwa,morphemes,morphology_notes,irregularity_notes")
    .in("canonical_word_id", wordIds) : { data: [], error: null };
  if (metadata.error) throw new Error(metadata.error.message);
  return [...byWord].flatMap(([word, rows]) => {
    const candidates = (words.data ?? []).filter((candidate) => candidate.normalised_word === word);
    const active = candidates.filter((candidate) => candidate.row_status === "active");
    const approved = active.filter((candidate) => candidate.review_status === "approved_for_first_exposure");
    if (active.length === 1 && approved.length === 1) return [];
    const existing = active[0] ?? candidates[0];
    const meta = (metadata.data ?? []).find((candidate) => candidate.canonical_word_id === existing?.id);
    return [{ ...existing, ...meta, normalised_word: word,
      affected_micro_skills: [...new Set(rows.map((row) => row.microSkillKey))].sort().join("; "),
      missing_reason: !candidates.length ? "No canonical word exists" : active.length !== 1
        ? `Expected one active canonical word; found ${active.length}` :
          `Dictionary review is ${active[0].review_status}; approval for first exposure is required` }];
  });
}
