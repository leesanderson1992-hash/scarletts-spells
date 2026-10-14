#!/usr/bin/env node
/** Apply a human-reviewed written syllable release while retaining metadata history. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { parseCsv } from "./teaching-dictionary-release-contract";

const PROJECT_REF = "wwohrqtunajrbwxyssjf";
const DEFAULT_MANIFEST = resolve("docs/implementation/seed-data/teaching-dictionary/releases/2026-10-14-human-reviewed-syllables/manifest.csv");
const SOURCE_PATH = "human-reviewed-syllables/2026-10-14";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const manifestPath = resolve(option("--manifest") || DEFAULT_MANIFEST);
const confirmation = option("--confirm") || "";

function fail(message: string): never { throw new Error(message); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function letters(value: string): string { return value.toLocaleLowerCase("en-GB").replace(/[^\p{L}]/gu, ""); }

async function databaseUrl(): Promise<string> {
  const text = await readFile(resolve(".env.local"), "utf8");
  const line = text.split(/\r?\n/u).find((item) => item.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
  if (!line) fail("Production database URL is unavailable.");
  const raw = line.slice(line.indexOf("=") + 1).trim();
  const value = raw.replace(/^['"]|['"]$/gu, "");
  const parsed = new URL(value);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)
    || !`${parsed.hostname}|${decodeURIComponent(parsed.username)}`.includes(PROJECT_REF)) {
    fail("Database URL does not identify the expected production project.");
  }
  return value;
}

async function main(): Promise<void> {
const manifestText = await readFile(manifestPath, "utf8");
const rows = parseCsv(manifestText);
if (rows.length !== 1993) fail(`Expected 1993 manifest rows, found ${rows.length}.`);
const digest = sha256(manifestText);
const byId = new Map<string, (typeof rows)[number]>();
for (const row of rows) {
  const id = row.canonical_word_id;
  if (!id || byId.has(id)) fail(`Missing or duplicate canonical word ID: ${id}`);
  byId.set(id, row);
  if (row.status === "ready") {
    if (!row.proposed_written_breakdown || letters(row.proposed_written_breakdown) !== letters(row.word)) {
      fail(`Invalid written breakdown for ${row.word}.`);
    }
    if (!/^\d+$/u.test(row.proposed_syllable_count)) fail(`Invalid syllable count for ${row.word}.`);
  } else if (row.status !== "needs_review" || !["Mr", "Mrs"].includes(row.word)) {
    fail(`Unexpected unresolved row: ${row.word}.`);
  }
}
const ready = rows.filter((row) => row.status === "ready");
if (ready.length !== 1991) fail(`Expected 1991 ready rows, found ${ready.length}.`);
const client = new pg.Client({ connectionString: await databaseUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin isolation level serializable");
  await client.query("select pg_advisory_xact_lock(hashtext('canonical_teaching_dictionary_release'))");
  const previous = await client.query<{ id: string; source_folder_sha256: string; batch_status: string }>(
    "select id,source_folder_sha256,batch_status from public.canonical_teaching_dictionary_import_batches where source_folder_path=$1 and batch_status='applied' order by created_at desc limit 1",
    [SOURCE_PATH],
  );
  if (previous.rows.length) {
    if (previous.rows[0].source_folder_sha256 !== digest) fail("A different release already used this source path.");
    const checked = await client.query<{
      canonical_word_id: string; display_word: string; syllables: string | null;
      phoneme_hint: string | null; source_metadata: Record<string, unknown>; import_batch_id: string;
    }>(`select w.id as canonical_word_id,w.display_word,m.syllables,m.phoneme_hint,
        m.source_metadata,m.import_batch_id
        from public.canonical_teaching_dictionary_words w
        join public.canonical_teaching_dictionary_word_metadata m
          on m.canonical_word_id=w.id and m.row_status='active'
        where w.row_status='active' and w.dialect_code='en-GB'`);
    if (checked.rows.length !== 1993) fail("Post-release active metadata count mismatch.");
    for (const item of checked.rows) {
      const row = byId.get(item.canonical_word_id);
      if (!row || item.display_word !== row.word) fail("Post-release word identity mismatch.");
      if (row.status === "ready") {
        if (item.import_batch_id !== previous.rows[0].id
          || item.syllables !== row.proposed_syllable_count
          || item.phoneme_hint !== row.proposed_phoneme_hint
          || item.source_metadata?.humanApprovedWrittenSyllableBreakdown !== row.proposed_written_breakdown) {
          fail(`Post-release facts do not match the manifest for ${row.word}.`);
        }
      } else if (item.import_batch_id === previous.rows[0].id) {
        fail(`Unresolved abbreviation was unexpectedly replaced: ${row.word}.`);
      }
    }
    await client.query("rollback");
    console.log(JSON.stringify({ status: "verified", target: "production", activeWords: checked.rows.length,
      writtenBreakdowns: 1991, unresolvedAbbreviations: 2, manifestSha256: digest,
      batchId: previous.rows[0].id }));
    return;
  }
  const live = await client.query<{
    canonical_word_id: string; metadata_id: string; display_word: string; syllables: string | null;
    phoneme_hint: string | null; review_status: string;
  }>(`select w.id as canonical_word_id,w.display_word,m.id as metadata_id,m.syllables,m.phoneme_hint,m.review_status
      from public.canonical_teaching_dictionary_words w
      join public.canonical_teaching_dictionary_word_metadata m on m.canonical_word_id=w.id and m.row_status='active'
      where w.row_status='active' and w.dialect_code='en-GB'
      for update of m`, []);
  if (live.rows.length !== 1993) fail(`Production has ${live.rows.length} active metadata rows; expected 1993.`);
  const byLiveId = new Map(live.rows.map((row) => [row.canonical_word_id, row]));
  const releaseRows: Array<Record<string, string | number>> = [];
  for (const [index, row] of rows.entries()) {
    const current = byLiveId.get(row.canonical_word_id);
    if (!current || current.display_word !== row.word
      || (current.syllables ?? "") !== row.current_syllable_count
      || (current.phoneme_hint ?? "") !== row.current_phoneme_hint
      || current.review_status !== "approved_for_first_exposure") {
      fail(`Production metadata changed since review for ${row.word}.`);
    }
    if (row.status === "ready") releaseRows.push({
      canonical_word_id: row.canonical_word_id,
      old_metadata_id: current.metadata_id,
      written_breakdown: row.proposed_written_breakdown,
      syllables: row.proposed_syllable_count,
      phoneme_hint: row.proposed_phoneme_hint,
      source_row_number: index + 2,
      source_row_hash: sha256(JSON.stringify([row.canonical_word_id, row.proposed_written_breakdown, row.proposed_syllable_count, row.proposed_phoneme_hint])),
    });
  }
  const summary = {
    status: apply ? "applied" : "ready",
    target: "production",
    reviewedRows: rows.length,
    writtenBreakdowns: releaseRows.length,
    unresolvedAbbreviations: rows.length - releaseRows.length,
    syllableCountChanges: ready.filter((row) => row.proposed_syllable_count !== row.current_syllable_count).length,
    phonemeChanges: ready.filter((row) => row.proposed_phoneme_hint !== row.current_phoneme_hint).length,
    manifestSha256: digest,
    requiredConfirmation: digest.slice(0, 16),
  };
  if (!apply) {
    await client.query("rollback");
    console.log(JSON.stringify(summary));
    return;
  }
  if (confirmation !== digest.slice(0, 16)) fail("Confirmation does not match the exact reviewed manifest.");
  const batch = await client.query<{ id: string }>(`insert into public.canonical_teaching_dictionary_import_batches
      (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,
       import_mode,batch_status,source_metadata,imported_by,imported_at)
      values ($1,$2,'human_reviewed_written_syllables_v1',$3::jsonb,$4::jsonb,$5::jsonb,
       'admin_import','applied',$6::jsonb,'Katie Sanderson',now()) returning id`, [
    SOURCE_PATH, digest, JSON.stringify({ errors: 0, unresolvedAbbreviations: 2 }),
    JSON.stringify({ metadata: releaseRows.length }), JSON.stringify({ ready: releaseRows.length }),
    JSON.stringify({ reviewedBy: "Katie Sanderson", reviewDate: "2026-10-14", manifestSha256: digest }),
  ]);
  const batchId = batch.rows[0].id;
  const ids = releaseRows.map((row) => String(row.old_metadata_id));
  const superseded = await client.query(
    "update public.canonical_teaching_dictionary_word_metadata set row_status='superseded',updated_at=now() where id=any($1::uuid[]) and row_status='active'",
    [ids],
  );
  if (superseded.rowCount !== releaseRows.length) fail("Metadata supersession count mismatch.");
  const inserted = await client.query(`with release as (
      select * from jsonb_to_recordset($1::jsonb) as r(
        canonical_word_id uuid,old_metadata_id uuid,written_breakdown text,syllables text,
        phoneme_hint text,source_row_number integer,source_row_hash text))
      insert into public.canonical_teaching_dictionary_word_metadata
      (import_batch_id,canonical_word_id,source_id,row_status,source_sheet,source_row_number,
       source_row_hash,source_metadata,syllables,phoneme_hint,grapheme_notes,stress_pattern,has_schwa,
       morphemes,morphology_notes,irregularity_notes,source_category,source_name,source_url,
       source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
      select $2::uuid,m.canonical_word_id,m.source_id,'active','human-reviewed-syllables-2026-10-14',
       r.source_row_number,r.source_row_hash,
       coalesce(m.source_metadata,'{}'::jsonb) || jsonb_build_object(
         'humanApprovedWrittenSyllableBreakdown',r.written_breakdown,
         'humanReviewDate','2026-10-14','humanReviewManifestSha256',$3::text,
         'supersededMetadataId',m.id),
       r.syllables,r.phoneme_hint,m.grapheme_notes,m.stress_pattern,m.has_schwa,
       m.morphemes,m.morphology_notes,m.irregularity_notes,m.source_category,m.source_name,m.source_url,
       m.source_licence,m.source_use_note,m.confidence,m.review_status,'Katie Sanderson',now()
      from public.canonical_teaching_dictionary_word_metadata m
      join release r on r.old_metadata_id=m.id
      where m.row_status='superseded'`, [JSON.stringify(releaseRows), batchId, digest]);
  if (inserted.rowCount !== releaseRows.length) fail("Replacement metadata count mismatch.");
  const active = await client.query<{ count: string }>(
    "select count(*)::text as count from public.canonical_teaching_dictionary_word_metadata where row_status='active'",
  );
  if (Number(active.rows[0].count) < 1993) fail("Active metadata count fell unexpectedly.");
  await client.query("commit");
  console.log(JSON.stringify({ ...summary, batchId, replacedMetadataRows: inserted.rowCount }));
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
