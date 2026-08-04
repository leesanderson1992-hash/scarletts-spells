#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const MANIFEST_PATH = resolve(ROOT, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-03-dynamic-prefix-pedagogy-v1/manifest.json");
const STAGING_REF = "jlhotktspjvffslvuyfz";
const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";
const ACK = "release-profile-pedagogy-v1";
const BATCH_ID = "10a761b4-4e00-4e7b-8fc9-edc5af5a9d35";
const LOCK_KEY = 734_482_053;

type Definition = {
  text: string;
  label: string;
  meaning: string;
  rules: string[];
  example?: { prefix: string; base: string; word: string; meaning: string };
};
type Profile = {
  microSkillKey: string;
  targetForms: string[];
  choiceForms: string[];
  introContent: { title: string; paragraphs: string[] };
  meaningCheckKind: "meaning" | "prefix_form";
  meaningBins: Array<{ id: string; label: string; description: string; prefixText: string }>;
  validChoiceAudit: Array<{ word: string; choiceVerdicts: Record<string, boolean> }>;
};
type Manifest = {
  schemaVersion: string;
  releaseId: string;
  target: { environment: string; supabaseProjectRef: string; productionEnabled: boolean };
  review: { approvedBy: string; approvedOn: string; sources: string[] };
  prefixDefinitions: Definition[];
  profiles: Profile[];
};

function fail(message: string): never { throw new Error(message); }
function sha(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

async function loadManifest() {
  const raw = await readFile(MANIFEST_PATH);
  const manifest = JSON.parse(raw.toString("utf8")) as Manifest;
  const errors: string[] = [];
  if (manifest.schemaVersion !== "dynamic_prefix_pedagogy_release_v1" || manifest.releaseId !== "adle_dynamic_prefix_pedagogy_staging_v1_2026_08_03_r2") errors.push("identity");
  if (manifest.target.environment !== "staging" || manifest.target.supabaseProjectRef !== STAGING_REF || manifest.target.productionEnabled !== false) errors.push("target");
  if (!manifest.review.approvedBy || !manifest.review.approvedOn || manifest.review.sources.length < 2) errors.push("review");
  const expectedForms = ["un", "dis", "mis", "in", "im", "il", "ir", "re", "pre", "sub", "inter", "super"];
  if (manifest.prefixDefinitions.map((entry) => entry.text).join("|") !== expectedForms.join("|") || manifest.prefixDefinitions.some((entry) => !entry.label || !entry.meaning || !entry.rules.length || entry.rules.some((rule) => !rule.trim()))) errors.push("definitions");
  const expectedProfiles = ["D4_MOR_PREFIXES_UN", "D4_MOR_PREFIXES_DIS_MIS", "D4_MOR_PREFIXES_IN_IM_IL_IR", "D4_MOR_PREFIXES_RE_PRE", "D4_MOR_PREFIXES_SUB_INTER_SUPER"];
  if (manifest.profiles.map((entry) => entry.microSkillKey).join("|") !== expectedProfiles.join("|")) errors.push("profiles");
  const definitions = new Map(manifest.prefixDefinitions.map((entry) => [entry.text, entry]));
  for (const profile of manifest.profiles) {
    if (profile.choiceForms.length < 3 || new Set(profile.choiceForms).size !== profile.choiceForms.length || profile.targetForms.some((form) => !profile.choiceForms.includes(form)) || profile.choiceForms.some((form) => !definitions.has(form))) errors.push(`choices:${profile.microSkillKey}`);
    if (
      !profile.introContent.title
      || !profile.introContent.paragraphs.length
      || profile.validChoiceAudit.length !== 7
      || new Set(profile.validChoiceAudit.map((entry) => entry.word)).size !== 7
      || profile.validChoiceAudit.some((entry) =>
        !entry.word
        || Object.keys(entry.choiceVerdicts).join("|") !== profile.choiceForms.join("|")
        || Object.entries(entry.choiceVerdicts).filter(([, valid]) => valid).length !== 1
        || !profile.targetForms.includes(Object.entries(entry.choiceVerdicts).find(([, valid]) => valid)?.[0] ?? "")
      )
    ) errors.push(`audit:${profile.microSkillKey}`);
    if (profile.meaningBins.length < 2 || profile.meaningBins.some((bin) => !bin.id || !bin.label || !bin.prefixText || !definitions.has(bin.prefixText))) errors.push(`bins:${profile.microSkillKey}`);
  }
  if (errors.length) fail(`Invalid immutable pedagogy package: ${errors.join(", ")}`);
  return { manifest, packageSha256: sha(raw), definitions };
}

function databaseUrl(): string {
  return arg("--database-url") ?? process.env.SUPABASE_STAGING_DB_URL ?? fail("Provide --database-url or SUPABASE_STAGING_DB_URL.");
}
function hasDatabaseUrl(): boolean {
  return Boolean(arg("--database-url") ?? process.env.SUPABASE_STAGING_DB_URL);
}
function assertStagingUrl(value: string) {
  const parsed = new URL(value);
  const identity = `${parsed.hostname}:${parsed.username}`;
  if (identity.includes(PRODUCTION_REF)) fail("Production Supabase is permanently rejected.");
  if (!identity.includes(STAGING_REF)) fail("Database URL does not identify the pinned staging project.");
}
async function connect() { const url = databaseUrl(); assertStagingUrl(url); const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } }); await client.connect(); return client; }

function projection(row: Record<string, unknown>) {
  return { id: row.id, microSkillKey: row.micro_skill_key, meaningBins: row.meaning_bins, prefixChoices: row.prefix_choices, introContent: row.intro_content ?? null };
}
function releasedProjection(profile: Profile, definitions: Map<string, Definition>) {
  const cards = profile.targetForms.map((form) => definitions.get(form)!);
  const choices = profile.choiceForms.map((form, index) => ({
    ...definitions.get(form)!,
    outcome: null,
    status: index === 0 ? "target" : "valid_alternative",
    reviewedSource: "dynamic-prefix-pedagogy-v1",
  }));
  return {
    meaningBins: profile.meaningBins,
    prefixChoices: choices,
    introContent: {
      ...profile.introContent,
      presentationPolicyVersion: "dynamic_prefix_pedagogy_v1",
      teachingCards: cards,
      meaningCheckKind: profile.meaningCheckKind,
      meaningResultsPresentation: "none",
      coverClosePolicy: { kind: "track_ratio", threshold: 0.8 },
      validChoiceAudit: profile.validChoiceAudit,
    },
  };
}
async function readProfiles(client: pg.Client, keys: string[], lock = false) {
  const result = await client.query(`select id,micro_skill_key,meaning_bins,prefix_choices,intro_content,row_status,review_status from canonical_teaching_dictionary_prefix_profiles where micro_skill_key=any($1) and row_status='active' and review_status='approved_for_first_exposure' order by array_position($1::text[],micro_skill_key)${lock ? " for update" : ""}`, [keys]);
  if (result.rowCount !== 5) fail(`Expected five active reviewed Prefix profiles; found ${result.rowCount}.`);
  return result.rows as Record<string, unknown>[];
}
async function protectedCounts(client: pg.Client) {
  const result = await client.query(`select (select count(*)::int from adle_learning_items) learning_items,(select count(*)::int from daily_assignments) assignments,(select count(*)::int from assignment_items) assignment_items,(select count(*)::int from adle_assignment_attempt_events) attempts,(select count(*)::int from adle_review_schedule_words) schedules,(select count(*)::int from child_word_treasure_events) rewards`);
  return result.rows[0] as Record<string, number>;
}

async function enqueueCanonicalIntakeForProfiles(
  client: pg.Client,
  microSkillKeys: string[],
  sourceReference: string,
) {
  const available = await client.query<{ available: boolean }>(
    "select to_regprocedure('public.adle_enqueue_canonical_intake_by_target(text,text,text)') is not null as available",
  );
  if (!available.rows[0]?.available) return 0;

  const targets = await client.query<{ normalised_word: string }>(
    `select distinct w.normalised_word
       from canonical_teaching_dictionary_prefix_profiles p
       join canonical_teaching_dictionary_prefix_members m on m.prefix_profile_id=p.id
       join canonical_teaching_dictionary_words w on w.id=m.canonical_word_id
      where p.micro_skill_key=any($1::text[])
        and p.row_status='active'
        and m.row_status='active'`,
    [microSkillKeys],
  );
  let enqueued = 0;
  for (const { normalised_word } of targets.rows) {
    const result = await client.query<{ enqueued_count: number }>(
      "select public.adle_enqueue_canonical_intake_by_target($1,$2,$3) as enqueued_count",
      [normalised_word, "prefix_profile_release", sourceReference],
    );
    enqueued += Number(result.rows[0]?.enqueued_count ?? 0);
  }
  return enqueued;
}

async function plan(manifest: Manifest, packageSha256: string, definitions: Map<string, Definition>) {
  const client = await connect();
  try {
    const rows = await readProfiles(client, manifest.profiles.map((entry) => entry.microSkillKey));
    console.log(JSON.stringify({ status: "plan", environment: "staging", packageSha256, beforeSha256: sha(canonical(rows.map(projection))), afterSha256: sha(canonical(manifest.profiles.map((profile) => ({ microSkillKey: profile.microSkillKey, ...releasedProjection(profile, definitions) })))), protectedCounts: await protectedCounts(client) }, null, 2));
  } finally { await client.end(); }
}

async function release(manifest: Manifest, packageSha256: string, definitions: Map<string, Definition>) {
  if (arg("--environment") !== "staging" || process.env.ADLE_DYNAMIC_PREFIX_PEDAGOGY_ACCEPT_STAGING !== ACK) fail(`Release requires --environment staging and ADLE_DYNAMIC_PREFIX_PEDAGOGY_ACCEPT_STAGING=${ACK}.`);
  const client = await connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);
    const beforeCounts = await protectedCounts(client);
    const rows = await readProfiles(client, manifest.profiles.map((entry) => entry.microSkillKey), true);
    const existing = await client.query("select source_folder_sha256,source_metadata from canonical_teaching_dictionary_import_batches where id=$1", [BATCH_ID]);
    if (existing.rowCount) {
      const sourceMetadata = existing.rows[0]?.source_metadata as { releaseId?: unknown; packageSha256?: unknown } | undefined;
      if (
        existing.rows[0]?.source_folder_sha256 !== packageSha256
        || sourceMetadata?.releaseId !== manifest.releaseId
        || sourceMetadata.packageSha256 !== packageSha256
      ) fail("Release batch identity already exists with different immutable content.");
    }
    if (!existing.rowCount) {
      const previousProfiles = rows.map(projection);
      await client.query(`insert into canonical_teaching_dictionary_import_batches(id,source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at) values($1,$2,$3,'dynamic_prefix_pedagogy_release_v1',$4,$5,$6,'admin_import','applied',$7,$8,now())`, [BATCH_ID, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-03-dynamic-prefix-pedagogy-v1", packageSha256, { errors: 0, warnings: 0 }, { profiles: 5 }, { production_enabled: false, learner_writes: 0 }, { releaseId: manifest.releaseId, packageSha256, previousProfiles }, manifest.review.approvedBy]);
    }
    for (const profile of manifest.profiles) {
      const next = releasedProjection(profile, definitions);
      await client.query("update canonical_teaching_dictionary_prefix_profiles set meaning_bins=$1,prefix_choices=$2,intro_content=$3 where micro_skill_key=$4 and row_status='active' and review_status='approved_for_first_exposure'", [JSON.stringify(next.meaningBins), JSON.stringify(next.prefixChoices), JSON.stringify(next.introContent), profile.microSkillKey]);
    }
    await client.query("update canonical_teaching_dictionary_import_batches set source_folder_sha256=$1,source_metadata=source_metadata || $2::jsonb,batch_status='applied',deactivated_at=null,deactivation_note=null where id=$3", [packageSha256, JSON.stringify({ releaseId: manifest.releaseId, packageSha256 }), BATCH_ID]);
    const reconciliationJobs = await enqueueCanonicalIntakeForProfiles(
      client,
      manifest.profiles.map((profile) => profile.microSkillKey),
      `dynamic_prefix_pedagogy_release:${manifest.releaseId}:${packageSha256}`,
    );
    const afterCounts = await protectedCounts(client);
    if (canonical(beforeCounts) !== canonical(afterCounts)) fail("Protected learner counts changed during profile-only release.");
    await client.query("commit");
    console.log(JSON.stringify({ status: "released", batchId: BATCH_ID, packageSha256, reconciliationJobs, protectedCounts: afterCounts }, null, 2));
  } catch (error) { await client.query("rollback"); throw error; } finally { await client.end(); }
}

async function verify(manifest: Manifest, packageSha256: string, definitions: Map<string, Definition>) {
  const client = await connect();
  try {
    const rows = await readProfiles(client, manifest.profiles.map((entry) => entry.microSkillKey));
    for (const [index, row] of rows.entries()) {
      const expected = releasedProjection(manifest.profiles[index]!, definitions);
      const actual = projection(row);
      if (canonical({ meaningBins: actual.meaningBins, prefixChoices: actual.prefixChoices, introContent: actual.introContent }) !== canonical(expected)) fail(`Released profile mismatch: ${actual.microSkillKey}`);
    }
    console.log(JSON.stringify({ status: "verified", batchId: BATCH_ID, packageSha256, profileCount: rows.length, projectionSha256: sha(canonical(rows.map(projection))), protectedCounts: await protectedCounts(client) }, null, 2));
  } finally { await client.end(); }
}

async function deactivate(manifest: Manifest) {
  if (arg("--environment") !== "staging" || process.env.ADLE_DYNAMIC_PREFIX_PEDAGOGY_ACCEPT_STAGING !== ACK) fail(`Deactivate requires --environment staging and ADLE_DYNAMIC_PREFIX_PEDAGOGY_ACCEPT_STAGING=${ACK}.`);
  const client = await connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);
    const batch = await client.query("select source_metadata from canonical_teaching_dictionary_import_batches where id=$1 for update", [BATCH_ID]);
    const previous = batch.rows[0]?.source_metadata?.previousProfiles as Array<{ id: string; microSkillKey: string; meaningBins: unknown; prefixChoices: unknown; introContent: unknown }> | undefined;
    if (!previous || previous.length !== 5) fail("No complete captured pre-release projection is available.");
    const beforeCounts = await protectedCounts(client);
    for (const profile of previous) await client.query("update canonical_teaching_dictionary_prefix_profiles set meaning_bins=$1,prefix_choices=$2,intro_content=$3 where id=$4 and micro_skill_key=$5", [JSON.stringify(profile.meaningBins), JSON.stringify(profile.prefixChoices), profile.introContent === null ? null : JSON.stringify(profile.introContent), profile.id, profile.microSkillKey]);
    const afterCounts = await protectedCounts(client);
    if (canonical(beforeCounts) !== canonical(afterCounts)) fail("Protected learner counts changed during restore.");
    await client.query("update canonical_teaching_dictionary_import_batches set batch_status='deactivated',deactivated_at=now(),deactivation_note=$1 where id=$2", ["Staging pedagogy release restored through the guarded deactivate command.", BATCH_ID]);
    await client.query("commit");
    console.log(JSON.stringify({ status: "deactivated", releaseId: manifest.releaseId, restoredProfiles: previous.length }, null, 2));
  } catch (error) { await client.query("rollback"); throw error; } finally { await client.end(); }
}

function serviceClient(): SupabaseClient {
  const rawUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? fail("Provide SUPABASE_URL for service-role release access.");
  const hostname = new URL(rawUrl).hostname;
  if (hostname.includes(PRODUCTION_REF)) fail("Production Supabase is permanently rejected.");
  if (hostname !== `${STAGING_REF}.supabase.co`) fail("Service URL does not identify the pinned staging project.");
  const key = process.env.SB_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? fail("Provide a staging service-role key.");
  return createClient(rawUrl, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function readServiceProfiles(client: SupabaseClient, keys: string[], full = false) {
  void full;
  const { data, error } = await client
    .from("canonical_teaching_dictionary_prefix_profiles")
    .select("*")
    .in("micro_skill_key", keys)
    .eq("row_status", "active")
    .eq("review_status", "approved_for_first_exposure");
  if (error) fail(`Read Prefix profiles: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length !== 5) fail(`Expected five active reviewed Prefix profiles; found ${rows.length}.`);
  const byKey = new Map(rows.map((row) => [String(row.micro_skill_key), row]));
  return keys.map((key) => byKey.get(key) ?? fail(`Missing active reviewed Prefix profile: ${key}.`));
}

async function serviceProtectedCounts(client: SupabaseClient) {
  const tables = {
    learning_items: "adle_learning_items",
    assignments: "daily_assignments",
    assignment_items: "assignment_items",
    attempts: "adle_assignment_attempt_events",
    schedules: "adle_review_schedule_words",
    rewards: "child_word_treasure_events",
  } as const;
  const entries = await Promise.all(Object.entries(tables).map(async ([key, table]) => {
    const { count, error } = await client.from(table).select("id", { count: "exact", head: true });
    if (error) fail(`Protected count ${table}: ${error.message}`);
    return [key, count ?? 0] as const;
  }));
  return Object.fromEntries(entries) as Record<string, number>;
}

function serviceReleaseRows(
  rows: Record<string, unknown>[],
  manifest: Manifest,
  definitions: Map<string, Definition>,
) {
  const manifestByKey = new Map(manifest.profiles.map((profile) => [profile.microSkillKey, profile]));
  return rows.map((row) => {
    const profile = manifestByKey.get(String(row.micro_skill_key)) ?? fail(`Unknown Prefix profile ${String(row.micro_skill_key)}.`);
    const next = releasedProjection(profile, definitions);
    return { ...row, meaning_bins: next.meaningBins, prefix_choices: next.prefixChoices, intro_content: next.introContent };
  });
}

async function atomicServiceProfileUpsert(client: SupabaseClient, rows: Record<string, unknown>[]) {
  const { error } = await client
    .from("canonical_teaching_dictionary_prefix_profiles")
    .upsert(rows, { onConflict: "id" });
  if (error) fail(`Atomic Prefix profile upsert: ${error.message}`);
}

async function servicePlan(manifest: Manifest, packageSha256: string, definitions: Map<string, Definition>) {
  const client = serviceClient();
  const rows = await readServiceProfiles(client, manifest.profiles.map((entry) => entry.microSkillKey));
  console.log(JSON.stringify({ status: "plan", environment: "staging", access: "service_role_atomic_upsert", packageSha256, beforeSha256: sha(canonical(rows.map(projection))), afterSha256: sha(canonical(manifest.profiles.map((profile) => ({ microSkillKey: profile.microSkillKey, ...releasedProjection(profile, definitions) })))), protectedCounts: await serviceProtectedCounts(client) }, null, 2));
}

async function serviceRelease(manifest: Manifest, packageSha256: string, definitions: Map<string, Definition>) {
  if (arg("--environment") !== "staging" || process.env.ADLE_DYNAMIC_PREFIX_PEDAGOGY_ACCEPT_STAGING !== ACK) fail(`Release requires --environment staging and ADLE_DYNAMIC_PREFIX_PEDAGOGY_ACCEPT_STAGING=${ACK}.`);
  const client = serviceClient();
  const keys = manifest.profiles.map((entry) => entry.microSkillKey);
  const beforeCounts = await serviceProtectedCounts(client);
  const beforeRows = await readServiceProfiles(client, keys, true);
  const { data: existing, error: existingError } = await client.from("canonical_teaching_dictionary_import_batches").select("id,source_folder_sha256,source_metadata,batch_status,deactivated_at,deactivation_note").eq("id", BATCH_ID).maybeSingle();
  if (existingError) fail(`Read pedagogy release batch: ${existingError.message}`);
  if (existing) {
    const sourceMetadata = existing.source_metadata as { releaseId?: unknown; packageSha256?: unknown } | null;
    if (
      existing.source_folder_sha256 !== packageSha256
      || sourceMetadata?.releaseId !== manifest.releaseId
      || sourceMetadata.packageSha256 !== packageSha256
    ) fail("Release batch identity already exists with different immutable content.");
  }
  let insertedBatch = false;
  let profilesChanged = false;
  try {
    if (!existing) {
      const { error } = await client.from("canonical_teaching_dictionary_import_batches").insert({
        id: BATCH_ID,
        source_folder_path: "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-03-dynamic-prefix-pedagogy-v1",
        source_folder_sha256: packageSha256,
        validator_version: "dynamic_prefix_pedagogy_release_v1",
        validation_summary: { errors: 0, warnings: 0 },
        row_counts: { profiles: 5 },
        readiness_summary: { production_enabled: false, learner_writes: 0 },
        import_mode: "admin_import",
        batch_status: "applied",
        source_metadata: { releaseId: manifest.releaseId, packageSha256, previousProfiles: beforeRows.map(projection) },
        imported_by: manifest.review.approvedBy,
        imported_at: new Date().toISOString(),
      });
      if (error) fail(`Insert pedagogy release batch: ${error.message}`);
      insertedBatch = true;
    }
    await atomicServiceProfileUpsert(client, serviceReleaseRows(beforeRows, manifest, definitions));
    profilesChanged = true;
    const { error: batchActivationError } = await client
      .from("canonical_teaching_dictionary_import_batches")
      .update({
        source_folder_sha256: packageSha256,
        source_metadata: { ...(existing?.source_metadata as Record<string, unknown> | null ?? {}), releaseId: manifest.releaseId, packageSha256 },
        batch_status: "applied",
        deactivated_at: null,
        deactivation_note: null,
      })
      .eq("id", BATCH_ID);
    if (batchActivationError) fail(`Mark pedagogy release applied: ${batchActivationError.message}`);
    const afterCounts = await serviceProtectedCounts(client);
    if (canonical(beforeCounts) !== canonical(afterCounts)) fail("Protected learner counts changed during profile-only release.");
    console.log(JSON.stringify({ status: "released", access: "service_role_atomic_upsert", batchId: BATCH_ID, packageSha256, protectedCounts: afterCounts }, null, 2));
  } catch (error) {
    if (profilesChanged) await atomicServiceProfileUpsert(client, beforeRows);
    if (insertedBatch) {
      const { error: deleteError } = await client.from("canonical_teaching_dictionary_import_batches").delete().eq("id", BATCH_ID);
      if (deleteError) fail(`Release failed and batch rollback also failed: ${deleteError.message}`);
    } else if (existing) {
      const { error: restoreBatchError } = await client
        .from("canonical_teaching_dictionary_import_batches")
        .update({
          batch_status: existing.batch_status,
          deactivated_at: existing.deactivated_at,
          deactivation_note: existing.deactivation_note,
        })
        .eq("id", BATCH_ID);
      if (restoreBatchError) fail(`Release failed and batch status rollback also failed: ${restoreBatchError.message}`);
    }
    throw error;
  }
}

async function serviceVerify(manifest: Manifest, packageSha256: string, definitions: Map<string, Definition>) {
  const client = serviceClient();
  const rows = await readServiceProfiles(client, manifest.profiles.map((entry) => entry.microSkillKey));
  for (const [index, row] of rows.entries()) {
    const expected = releasedProjection(manifest.profiles[index]!, definitions);
    const actual = projection(row);
    if (canonical({ meaningBins: actual.meaningBins, prefixChoices: actual.prefixChoices, introContent: actual.introContent }) !== canonical(expected)) fail(`Released profile mismatch: ${actual.microSkillKey}`);
  }
  console.log(JSON.stringify({ status: "verified", access: "service_role_atomic_upsert", batchId: BATCH_ID, packageSha256, profileCount: rows.length, projectionSha256: sha(canonical(rows.map(projection))), protectedCounts: await serviceProtectedCounts(client) }, null, 2));
}

async function serviceDeactivate(manifest: Manifest) {
  if (arg("--environment") !== "staging" || process.env.ADLE_DYNAMIC_PREFIX_PEDAGOGY_ACCEPT_STAGING !== ACK) fail(`Deactivate requires --environment staging and ADLE_DYNAMIC_PREFIX_PEDAGOGY_ACCEPT_STAGING=${ACK}.`);
  const client = serviceClient();
  const keys = manifest.profiles.map((entry) => entry.microSkillKey);
  const currentRows = await readServiceProfiles(client, keys, true);
  const { data: batch, error } = await client.from("canonical_teaching_dictionary_import_batches").select("source_metadata").eq("id", BATCH_ID).single();
  if (error) fail(`Read pedagogy release batch: ${error.message}`);
  const previous = (batch?.source_metadata as { previousProfiles?: Array<{ id: string; microSkillKey: string; meaningBins: unknown; prefixChoices: unknown; introContent: unknown }> } | null)?.previousProfiles;
  if (!previous || previous.length !== 5) fail("No complete captured pre-release projection is available.");
  const previousById = new Map(previous.map((profile) => [profile.id, profile]));
  const restoredRows = currentRows.map((row) => {
    const prior = previousById.get(String(row.id)) ?? fail(`Missing captured projection for ${String(row.micro_skill_key)}.`);
    return { ...row, meaning_bins: prior.meaningBins, prefix_choices: prior.prefixChoices, intro_content: prior.introContent };
  });
  const beforeCounts = await serviceProtectedCounts(client);
  try {
    await atomicServiceProfileUpsert(client, restoredRows);
    const afterCounts = await serviceProtectedCounts(client);
    if (canonical(beforeCounts) !== canonical(afterCounts)) fail("Protected learner counts changed during restore.");
    const { error: batchUpdateError } = await client
      .from("canonical_teaching_dictionary_import_batches")
      .update({
        batch_status: "deactivated",
        deactivated_at: new Date().toISOString(),
        deactivation_note: "Staging pedagogy release restored through the guarded deactivate command.",
      })
      .eq("id", BATCH_ID);
    if (batchUpdateError) fail(`Mark pedagogy release deactivated: ${batchUpdateError.message}`);
  } catch (restoreError) {
    await atomicServiceProfileUpsert(client, currentRows);
    throw restoreError;
  }
  console.log(JSON.stringify({ status: "deactivated", access: "service_role_atomic_upsert", releaseId: manifest.releaseId, restoredProfiles: previous.length }, null, 2));
}

async function main() {
  const command = process.argv[2] ?? "validate";
  const loaded = await loadManifest();
  if (command === "validate") return console.log(JSON.stringify({ status: "valid", packageSha256: loaded.packageSha256, definitions: 12, profiles: 5 }, null, 2));
  if (!hasDatabaseUrl()) {
    if (command === "plan") return servicePlan(loaded.manifest, loaded.packageSha256, loaded.definitions);
    if (command === "release") return serviceRelease(loaded.manifest, loaded.packageSha256, loaded.definitions);
    if (command === "verify") return serviceVerify(loaded.manifest, loaded.packageSha256, loaded.definitions);
    if (command === "deactivate") return serviceDeactivate(loaded.manifest);
  }
  if (command === "plan") return plan(loaded.manifest, loaded.packageSha256, loaded.definitions);
  if (command === "release") return release(loaded.manifest, loaded.packageSha256, loaded.definitions);
  if (command === "verify") return verify(loaded.manifest, loaded.packageSha256, loaded.definitions);
  if (command === "deactivate") return deactivate(loaded.manifest);
  fail(`Unknown command: ${command}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
