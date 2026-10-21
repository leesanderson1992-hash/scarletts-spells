#!/usr/bin/env node
// Read-only export of the existing published dictionary definitions for the
// current weak-vowel authority. No child or learner records are accessed.
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const [sheetPath, envPath, outputPath] = process.argv.slice(2);
if (!sheetPath || !envPath || !outputPath) throw new Error("Usage: export-weak-vowel-shared-definitions.mjs SHEET ENV OUTPUT");
process.loadEnvFile(envPath);
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url) throw new Error("Production database URL is unavailable");
const projectRef = "wwohrqtunajrbwxyssjf";
const parsed = new URL(url);
if (!parsed.hostname.includes(projectRef) && !decodeURIComponent(parsed.username).includes(projectRef)) {
  throw new Error("Database URL is not the expected production project");
}
const sheet = JSON.parse(readFileSync(sheetPath, "utf8"));
const assigned = sheet.rows.filter((row) => row.assignment_status === "assigned");
const ids = [...new Set(assigned.map((row) => row.canonical_word_id))];
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  const { rows } = await client.query(`
    select distinct on (canonical_word_id) canonical_word_id, definition, published_at
    from public.teaching_dictionary_definition_versions
    where route_id is null and canonical_word_id = any($1::uuid[])
    order by canonical_word_id, published_at desc
  `, [ids]);
  const found = new Map(rows.map((row) => [row.canonical_word_id, row]));
  const missing = ids.filter((id) => !found.get(id)?.definition?.trim());
  if (missing.length) throw new Error(`${missing.length} assigned words lack a published shared definition`);
  const output = { schemaVersion: "weak_vowel_shared_definitions_v1", environment: "production",
    wordCount: ids.length, rows: ids.sort().map((id) => ({ canonicalWordId: id,
      definition: found.get(id).definition, publishedAt: found.get(id).published_at })) };
  writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify({ wordCount: ids.length, output: outputPath }));
} finally {
  await client.end();
}
