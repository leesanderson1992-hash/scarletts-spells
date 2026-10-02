#!/usr/bin/env node
/** Read-only, exact-ID check after the comparative canonical-word release. */
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseCsv } from "./teaching-dictionary-release-contract";

const target = process.argv[2];
if (target !== "staging" && target !== "production") throw new Error("Usage: tsx verify-adle-comparative-dictionary-live.ts staging|production");
const url = process.env[target === "staging" ? "SUPABASE_STAGING_DB_URL" : "SUPABASE_PRODUCTION_DB_URL"];
if (!url) throw new Error(`${target} database URL is missing`);
const audit = parseCsv(readFileSync("outputs/comparative-superlative-2026-09-29/dictionary-gap-audit.csv", "utf8"));
const expected = new Map(audit.map(row => [row.candidate_word, row]));
if (audit.length !== 72 || expected.size !== 72) throw new Error("Comparative audit must contain 72 distinct forms");
async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
  try {
  await client.connect();
  await client.query("begin read only");
  const result = await client.query<{ id: string; normalised_word: string; row_status: string; review_status: string }>(
    `select id, normalised_word, row_status, review_status
       from public.canonical_teaching_dictionary_words
      where dialect_code = 'en-GB' and normalised_word = any($1::text[])`,
    [[...expected.keys()]],
  );
  const found = new Map<string, string>();
  for (const row of result.rows) {
    if (found.has(row.normalised_word)) throw new Error(`${target}: duplicate canonical form ${row.normalised_word}`);
    if (row.row_status !== "active" || row.review_status !== "approved_for_first_exposure") throw new Error(`${target}: inactive or unapproved ${row.normalised_word}`);
    found.set(row.normalised_word, row.id);
  }
  if (found.size !== 72) throw new Error(`${target}: found ${found.size}/72 canonical forms`);
  for (const [word, row] of expected) {
    if (row.teaching_dictionary_present === "yes" && found.get(word) !== row.canonical_word_id) throw new Error(`${target}: existing ID changed for ${word}`);
  }
  const newIds = audit.filter(row => row.teaching_dictionary_present === "no").map(row => found.get(row.candidate_word));
  if (newIds.length !== 25 || newIds.some(id => !id)) throw new Error(`${target}: expected 25 new identities`);
  const counts: Record<string, number> = {};
  for (const table of ["canonical_teaching_dictionary_word_metadata", "canonical_teaching_dictionary_word_morphology", "canonical_teaching_dictionary_dictation_sentences"]) {
    const rows = await client.query<{ count: string }>(
      `select count(distinct canonical_word_id)::text as count from public.${table} where row_status = 'active' and canonical_word_id = any($1::uuid[])`,
      [newIds],
    );
    counts[table] = Number(rows.rows[0].count);
    if (counts[table] !== 25) throw new Error(`${target}: ${table} covers ${counts[table]}/25 new forms`);
  }
  await client.query("rollback");
  console.log(JSON.stringify({ target, status: "verified", forms: 72, existingIdsPreserved: 47, newWords: 25, newWordFacts: counts }));
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
