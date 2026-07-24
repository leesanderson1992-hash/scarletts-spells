// Copies only the production Teaching Dictionary's derived banding artefacts
// into the explicitly named staging project. It never changes production,
// lesson assignments, feature flags, or existing staging banding rows.
//
// Usage:
//   ADLE_DICTIONARY_PRODUCTION_DB_URL=... \
//   ADLE_DICTIONARY_STAGING_SUPABASE_URL=... \
//   ADLE_DICTIONARY_STAGING_SUPABASE_SERVICE_ROLE_KEY=... \
//   ADLE_DICTIONARY_ACCEPT_STAGING=disposable-data-only \
//   npx tsx scripts/sync-production-dictionary-banding-to-staging.ts --apply --confirm ADLE-DICTIONARY-BANDING-PRODUCTION-TO-STAGING-V1

import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const STAGING_HOST = "jlhotktspjvffslvuyfz.supabase.co";
const CONFIRMATION = "ADLE-DICTIONARY-BANDING-PRODUCTION-TO-STAGING-V1";
const BANDING_SOURCE_PATH = "adle-banding-run:banding_v1.1_2026-07-04";
const BANDING_VERSION = "banding_v1.1_2026-07-04";
const CHUNK_SIZE = 200;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function chunks<T>(values: T[]): T[][] {
  return Array.from({ length: Math.ceil(values.length / CHUNK_SIZE) }, (_, index) => values.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
}

async function allStagingIds(db: ReturnType<typeof createClient>, table: string, ids: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  for (const part of chunks(ids)) {
    const { data, error } = await db.from(table).select("id").in("id", part);
    if (error) throw new Error(`Read ${table}: ${error.message}`);
    for (const row of data ?? []) result.add(row.id as string);
  }
  return result;
}

async function insertChunks(db: ReturnType<typeof createClient>, table: string, rows: Record<string, unknown>[]): Promise<void> {
  for (const part of chunks(rows)) {
    const { error } = await db.from(table).insert(part);
    if (error) throw new Error(`Insert ${table}: ${error.message}`);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (!args.has("--apply") || !args.has("--confirm") || !args.has(CONFIRMATION)) {
    throw new Error(`Refusing to write. Pass --apply --confirm ${CONFIRMATION}.`);
  }
  if (process.env.ADLE_DICTIONARY_ACCEPT_STAGING !== "disposable-data-only") {
    throw new Error("Refusing to write. Set ADLE_DICTIONARY_ACCEPT_STAGING=disposable-data-only.");
  }

  const productionUrl = required("ADLE_DICTIONARY_PRODUCTION_DB_URL");
  const stagingUrl = required("ADLE_DICTIONARY_STAGING_SUPABASE_URL");
  const stagingKey = required("ADLE_DICTIONARY_STAGING_SUPABASE_SERVICE_ROLE_KEY");
  if (new URL(stagingUrl).host !== STAGING_HOST) throw new Error(`Refusing non-staging target: ${new URL(stagingUrl).host}.`);
  if (new URL(productionUrl).host === STAGING_HOST || new URL(productionUrl).hostname === "127.0.0.1") throw new Error("Refusing a non-production source database.");

  const production = new pg.Pool({ connectionString: productionUrl, ssl: { rejectUnauthorized: false } });
  const staging = createClient(stagingUrl, stagingKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const { rows: batches } = await production.query<Record<string, unknown>>("select * from public.canonical_teaching_dictionary_import_batches where source_folder_path = $1", [BANDING_SOURCE_PATH]);
    if (batches.length !== 1) throw new Error(`Expected one production banding batch; found ${batches.length}.`);
    const batch = batches[0];
    const batchId = batch.id as string;
    const { rows: bandingRows } = await production.query<Record<string, unknown>>("select * from public.canonical_teaching_dictionary_word_banding where import_batch_id = $1 order by id", [batchId]);
    const { rows: allocationRows } = await production.query<Record<string, unknown>>("select * from public.canonical_teaching_dictionary_skill_level_allocation where import_batch_id = $1 order by id", [batchId]);
    if (bandingRows.length === 0 || allocationRows.length === 0) throw new Error("Production banding package is unexpectedly empty.");
    if (new Set(bandingRows.map((row) => row.banding_version)).size !== 1 || bandingRows[0].banding_version !== BANDING_VERSION) throw new Error("Unexpected production banding version.");

    const [{ data: existingBanding, error: existingBandingError }, { data: version, error: versionError }] = await Promise.all([
      staging.from("canonical_teaching_dictionary_word_banding").select("id").limit(1),
      staging.from("canonical_teaching_dictionary_banding_versions").select("banding_version").eq("banding_version", BANDING_VERSION).maybeSingle(),
    ]);
    if (existingBandingError) throw new Error(`Read staging word banding: ${existingBandingError.message}`);
    if (versionError || !version) throw new Error(`Staging does not contain ${BANDING_VERSION}.`);
    if ((existingBanding ?? []).length > 0) throw new Error("Staging already has word-banding rows; refusing to overwrite them.");

    const wordIds = [...new Set(bandingRows.map((row) => row.canonical_word_id as string))];
    const existingWordIds = await allStagingIds(staging, "canonical_teaching_dictionary_words", wordIds);
    if (existingWordIds.size !== wordIds.length) throw new Error(`Staging is missing ${wordIds.length - existingWordIds.size} banded canonical words.`);
    const skillKeys = [...new Set(allocationRows.map((row) => row.micro_skill_key as string))];
    for (const part of chunks(skillKeys)) {
      const { data, error } = await staging.from("micro_skill_catalog").select("micro_skill_key").in("micro_skill_key", part);
      if (error) throw new Error(`Read staging micro-skill catalog: ${error.message}`);
      if ((data ?? []).length !== part.length) throw new Error("Staging is missing a production allocation micro-skill.");
    }

    const { data: existingBatch, error: existingBatchError } = await staging.from("canonical_teaching_dictionary_import_batches").select("id").eq("id", batchId).maybeSingle();
    if (existingBatchError) throw new Error(`Read staging import batch: ${existingBatchError.message}`);
    if (!existingBatch) {
      const { error } = await staging.from("canonical_teaching_dictionary_import_batches").insert(batch);
      if (error) throw new Error(`Insert staging import batch: ${error.message}`);
    }
    await insertChunks(staging, "canonical_teaching_dictionary_word_banding", bandingRows);
    await insertChunks(staging, "canonical_teaching_dictionary_skill_level_allocation", allocationRows);

    const [{ count: stagingBandingCount, error: bandingCountError }, { count: stagingAllocationCount, error: allocationCountError }] = await Promise.all([
      staging.from("canonical_teaching_dictionary_word_banding").select("*", { count: "exact", head: true }).eq("import_batch_id", batchId),
      staging.from("canonical_teaching_dictionary_skill_level_allocation").select("*", { count: "exact", head: true }).eq("import_batch_id", batchId),
    ]);
    if (bandingCountError || allocationCountError) throw new Error("Could not verify staging copy.");
    if (stagingBandingCount !== bandingRows.length || stagingAllocationCount !== allocationRows.length) throw new Error("Staging copy count mismatch.");
    console.log(JSON.stringify({ status: "applied", stagingHost: STAGING_HOST, bandingVersion: BANDING_VERSION, importedBatchId: batchId, wordBandingRows: bandingRows.length, allocationRows: allocationRows.length }));
  } finally {
    await production.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
