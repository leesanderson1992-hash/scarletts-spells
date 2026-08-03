#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { dynamicPrefixRuntime } from "../lib/adle/morphology/dynamic-prefix-runtime";

export const ACCEPTED_PACKAGE_SHA256 = "9890cf6149b3a411b2ea1aa4cd097b1727fa12678b72a52d3d36572c9f400a10";
export const ACCEPTED_STAGING_RELEASE_ID = "adle_dynamic_prefix_pedagogy_staging_v1_2026_08_03_r2";
export const PRODUCTION_RELEASE_ID = "adle_dynamic_prefix_pedagogy_production_v1_2026_08_03";
export const PRODUCTION_SUPABASE_REF = "wwohrqtunajrbwxyssjf";
export const STAGING_SUPABASE_REF = "jlhotktspjvffslvuyfz";
export const PRODUCTION_VERCEL_PROJECT_NAME = "scarletts-spells";
export const PRODUCTION_VERCEL_PROJECT_ID = "prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl";
export const PRODUCTION_RELEASE_FLAG = "ADLE_DYNAMIC_PREFIX_PEDAGOGY_PRODUCTION_RELEASE";
export const READ_ONLY_RELEASE_FLAG_VALUE = "read-only-preflight";
export const MUTATING_RELEASE_FLAG_VALUE = "authorised-production-release";
export const RELEASE_CONFIRMATION = `publish-${PRODUCTION_RELEASE_ID}-${ACCEPTED_PACKAGE_SHA256.slice(0, 16)}`;
export const DEACTIVATE_CONFIRMATION = `restore-${PRODUCTION_RELEASE_ID}-${ACCEPTED_PACKAGE_SHA256.slice(0, 16)}`;
export const PRODUCTION_PACKAGE_TYPE = "micro_skill_content_batch_v1";
export const PRODUCTION_IMPORTER_VERSION = "dynamic_prefix_pedagogy_production_release_v2";
export const PROFILE_MUTATION_FIELDS = ["meaning_bins", "prefix_choices", "intro_content"] as const;
export const READ_ONLY_BEGIN_SQL = "begin transaction isolation level repeatable read read only";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ACCEPTED_MANIFEST_PATH = resolve(
  ROOT,
  "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-03-dynamic-prefix-pedagogy-v1/manifest.json",
);
const MIGRATION_VERSION = "20260803113000";
const MIGRATION_PATH = resolve(
  ROOT,
  "supabase/migrations/20260803113000_allow_in_im_il_ir_dynamic_prefix_20_item_plan.sql",
);
const ADVISORY_LOCK_KEY = 1_918_930_803;
const BATCH_NAMESPACE = "142f9e4d-8f7c-4b98-bec4-27de153d005f";

export const PROFILE_KEYS = [
  "D4_MOR_PREFIXES_UN",
  "D4_MOR_PREFIXES_DIS_MIS",
  "D4_MOR_PREFIXES_IN_IM_IL_IR",
  "D4_MOR_PREFIXES_RE_PRE",
  "D4_MOR_PREFIXES_SUB_INTER_SUPER",
] as const;

const EXPECTED_FORMS = ["un", "dis", "mis", "in", "im", "il", "ir", "re", "pre", "sub", "inter", "super"];
const EXPECTED_POOLS: Record<(typeof PROFILE_KEYS)[number], string[]> = {
  D4_MOR_PREFIXES_UN: ["un", "dis", "mis"],
  D4_MOR_PREFIXES_DIS_MIS: ["dis", "mis", "un"],
  D4_MOR_PREFIXES_IN_IM_IL_IR: ["in", "im", "il", "ir"],
  D4_MOR_PREFIXES_RE_PRE: ["re", "pre", "un"],
  D4_MOR_PREFIXES_SUB_INTER_SUPER: ["sub", "inter", "super"],
};

export const EXPECTED_PROFILE_COLUMNS = [
  "id", "import_batch_id", "micro_skill_key", "prefix_label", "prefix_text", "prefix_meaning",
  "meaning_bins", "prefix_choices", "intro_content", "reflection_prompt_key", "reflection_prompt_text",
  "production_enabled", "row_status", "review_status", "source_sheet", "source_row_number",
  "source_row_hash", "source_metadata", "source_category", "source_name", "source_url", "source_licence",
  "source_use_note", "confidence", "reviewed_by", "reviewed_at", "created_at", "updated_at",
] as const;

export const PROTECTED_TABLES = [
  ["public", "canonical_teaching_dictionary_prefix_members"],
  ["public", "canonical_teaching_dictionary_words"],
  ["public", "canonical_teaching_dictionary_word_metadata"],
  ["public", "canonical_teaching_dictionary_word_morphology"],
  ["public", "canonical_teaching_dictionary_dictation_sentences"],
  ["public", "learning_items"],
  ["public", "adle_learning_items"],
  ["public", "daily_assignments"],
  ["public", "assignment_items"],
  ["public", "adle_assignment_attempt_events"],
  ["public", "learning_item_evidence"],
  ["public", "adle_authentic_use_events"],
  ["public", "adle_slippage_events"],
  ["public", "adle_word_proficiency"],
  ["public", "adle_review_bundles"],
  ["public", "adle_review_schedule_words"],
  ["public", "adle_review_schedule_word_routes"],
  ["public", "adle_review_outcome_events"],
  ["public", "adle_review_outcome_event_routes"],
  ["public", "adle_taught_word_history"],
  ["public", "child_word_treasures"],
  ["public", "child_word_treasure_events"],
  ["public", "child_word_treasure_evidence_candidates"],
  ["auth", "users"],
] as const;

export type PrefixDefinition = {
  text: string;
  label: string;
  meaning: string;
  rules: string[];
  example?: { prefix: string; base: string; word: string; meaning: string };
};

export type PrefixProfile = {
  microSkillKey: (typeof PROFILE_KEYS)[number];
  targetForms: string[];
  choiceForms: string[];
  introContent: { title: string; paragraphs: string[] };
  meaningCheckKind: "meaning" | "prefix_form";
  meaningBins: Array<{ id: string; label: string; description: string; prefixText: string }>;
  validChoiceAudit: Array<{ word: string; choiceVerdicts: Record<string, boolean> }>;
};

export type PrefixManifest = {
  schemaVersion: string;
  releaseId: string;
  target: { environment: string; supabaseProjectRef: string; productionEnabled: boolean };
  review: { approvedBy: string; approvedOn: string; sources: string[] };
  prefixDefinitions: PrefixDefinition[];
  profiles: PrefixProfile[];
};

export function productionReleaseLedgerFields(
  packageSchemaVersion: string,
  packageSha256 = ACCEPTED_PACKAGE_SHA256,
) {
  if (!packageSchemaVersion.trim()) fail("Production package schema version is required.");
  if (!/^[0-9a-f]{64}$/.test(packageSha256)) fail("Production package SHA-256 is malformed.");
  return {
    releaseId: PRODUCTION_RELEASE_ID,
    packageType: PRODUCTION_PACKAGE_TYPE,
    packageSchemaVersion,
    // This micro-skill content release has no separate workbook. Its immutable,
    // human-reviewed manifest is both the review surface and released package.
    workbookSha256: packageSha256,
    packageSha256,
    targetEnvironment: "production" as const,
    importerVersion: PRODUCTION_IMPORTER_VERSION,
  };
}

type QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
  rows: Row[];
  rowCount: number | null;
};

export type Queryable = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
};

export type ProtectedSnapshot = Record<string, { present: boolean; count: number; sha256: string }>;

function fail(message: string): never {
  throw new Error(message);
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString("base64"));
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(",")}}`;
}

function canonicalHash(value: unknown): string {
  return sha256(canonical(value));
}

function uuidV5(namespace: string, value: string): string {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(namespaceBytes).update(value).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function productionBatchId(packageSha256 = ACCEPTED_PACKAGE_SHA256): string {
  return uuidV5(BATCH_NAMESPACE, `${PRODUCTION_RELEASE_ID}:${packageSha256}`);
}

export function validateManifestBytes(raw: Buffer): {
  manifest: PrefixManifest;
  definitions: Map<string, PrefixDefinition>;
  packageSha256: string;
} {
  const packageSha256 = sha256(raw);
  if (packageSha256 !== ACCEPTED_PACKAGE_SHA256) {
    fail(`Immutable package drift: expected ${ACCEPTED_PACKAGE_SHA256}, received ${packageSha256}.`);
  }
  const manifest = JSON.parse(raw.toString("utf8")) as PrefixManifest;
  const errors: string[] = [];
  if (manifest.schemaVersion !== "dynamic_prefix_pedagogy_release_v1") errors.push("schema_version");
  if (manifest.releaseId !== ACCEPTED_STAGING_RELEASE_ID) errors.push("accepted_staging_release_id");
  if (
    manifest.target.environment !== "staging"
    || manifest.target.supabaseProjectRef !== STAGING_SUPABASE_REF
    || manifest.target.productionEnabled !== false
  ) errors.push("immutable_staging_target");
  if (!manifest.review.approvedBy || !manifest.review.approvedOn || manifest.review.sources.length < 2) errors.push("review");
  if (manifest.prefixDefinitions.map((definition) => definition.text).join("|") !== EXPECTED_FORMS.join("|")) errors.push("definitions_order");
  if (manifest.prefixDefinitions.some((definition) =>
    !definition.text || !definition.label || !definition.meaning || !definition.rules.length
    || definition.rules.some((rule) => !rule.trim())
  )) errors.push("definitions_content");
  if (manifest.profiles.map((profile) => profile.microSkillKey).join("|") !== PROFILE_KEYS.join("|")) errors.push("profiles_order");
  const definitions = new Map(manifest.prefixDefinitions.map((definition) => [definition.text, definition]));
  for (const profile of manifest.profiles) {
    if (profile.choiceForms.join("|") !== EXPECTED_POOLS[profile.microSkillKey].join("|")) errors.push(`pool:${profile.microSkillKey}`);
    if (
      profile.choiceForms.length < 3
      || new Set(profile.choiceForms).size !== profile.choiceForms.length
      || profile.targetForms.some((form) => !profile.choiceForms.includes(form))
      || profile.choiceForms.some((form) => !definitions.has(form))
    ) errors.push(`choices:${profile.microSkillKey}`);
    if (
      !profile.introContent.title
      || !profile.introContent.paragraphs.length
      || profile.validChoiceAudit.length !== 7
      || new Set(profile.validChoiceAudit.map((entry) => entry.word)).size !== 7
      || profile.validChoiceAudit.some((entry) =>
        !entry.word
        || Object.keys(entry.choiceVerdicts).join("|") !== profile.choiceForms.join("|")
        || Object.values(entry.choiceVerdicts).filter(Boolean).length !== 1
      )
    ) errors.push(`audit:${profile.microSkillKey}`);
    if (
      profile.meaningBins.length < 2
      || profile.meaningBins.some((bin) => !bin.id || !bin.label || !bin.description || !bin.prefixText || !definitions.has(bin.prefixText))
    ) errors.push(`bins:${profile.microSkillKey}`);
  }
  if (errors.length) fail(`Invalid accepted Dynamic Prefix package: ${errors.join(", ")}.`);
  return { manifest, definitions, packageSha256 };
}

export async function loadAcceptedManifest() {
  return validateManifestBytes(await readFile(ACCEPTED_MANIFEST_PATH));
}

type ReleaseCommand = "validate" | "plan" | "release" | "verify" | "deactivate";

export function assertProductionEnvelope(input: {
  command: ReleaseCommand;
  environment?: string;
  releaseFlag?: string;
  confirmation?: string;
}): void {
  if (input.environment !== "production") fail("Production envelope requires --environment production.");
  const mutating = input.command === "release" || input.command === "deactivate";
  const allowedReadOnlyFlag = input.releaseFlag === READ_ONLY_RELEASE_FLAG_VALUE || input.releaseFlag === MUTATING_RELEASE_FLAG_VALUE;
  if (!mutating && !allowedReadOnlyFlag) {
    fail(`${input.command} requires ${PRODUCTION_RELEASE_FLAG}=${READ_ONLY_RELEASE_FLAG_VALUE}.`);
  }
  if (mutating && input.releaseFlag !== MUTATING_RELEASE_FLAG_VALUE) {
    fail(`${input.command} requires ${PRODUCTION_RELEASE_FLAG}=${MUTATING_RELEASE_FLAG_VALUE}.`);
  }
  if (input.command === "release" && input.confirmation !== RELEASE_CONFIRMATION) {
    fail(`Release requires the exact production confirmation token.`);
  }
  if (input.command === "deactivate" && input.confirmation !== DEACTIVATE_CONFIRMATION) {
    fail(`Deactivate requires the exact production restore confirmation token.`);
  }
}

export function assertProductionDatabaseTarget(databaseUrlValue: string | undefined): string {
  if (!databaseUrlValue) fail("A production PostgreSQL URL is required.");
  const parsed = new URL(databaseUrlValue);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) fail("Production database URL must use PostgreSQL.");
  const identity = `${parsed.hostname}|${decodeURIComponent(parsed.username)}`;
  if (identity.includes(STAGING_SUPABASE_REF)) fail("Staging Supabase is rejected by the production envelope.");
  if (!identity.includes(PRODUCTION_SUPABASE_REF)) fail("Database URL does not identify the pinned production Supabase project.");
  return PRODUCTION_SUPABASE_REF;
}

function databaseUrl(): string {
  return arg("--database-url")
    ?? process.env.SUPABASE_PRODUCTION_DB_URL
    ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED
    ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION
    ?? fail("Provide --database-url or a SUPABASE_PRODUCTION_DB_URL variant.");
}

function clientForProduction(): pg.Client {
  const url = databaseUrl();
  assertProductionDatabaseTarget(url);
  return new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
}

function releasedProjection(profile: PrefixProfile, definitions: Map<string, PrefixDefinition>) {
  const teachingCards = profile.targetForms.map((form) => definitions.get(form) ?? fail(`Missing reviewed definition ${form}.`));
  return {
    meaning_bins: profile.meaningBins,
    prefix_choices: profile.choiceForms.map((form, index) => ({
      ...(definitions.get(form) ?? fail(`Missing reviewed choice ${form}.`)),
      outcome: null,
      status: index === 0 ? "target" : "valid_alternative",
      reviewedSource: "dynamic-prefix-pedagogy-v1",
    })),
    intro_content: {
      ...profile.introContent,
      presentationPolicyVersion: "dynamic_prefix_pedagogy_v1",
      teachingCards,
      meaningCheckKind: profile.meaningCheckKind,
      meaningResultsPresentation: "none",
      coverClosePolicy: { kind: "track_ratio", threshold: 0.8 },
      validChoiceAudit: profile.validChoiceAudit,
    },
  };
}

function currentProjection(row: Record<string, unknown>) {
  return {
    meaning_bins: row.meaning_bins,
    prefix_choices: row.prefix_choices,
    intro_content: row.intro_content ?? null,
  };
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) fail(`Unsafe SQL identifier ${value}.`);
  return `"${value}"`;
}

export function assertExpectedProfileColumns(actual: string[]): void {
  const expected = [...EXPECTED_PROFILE_COLUMNS];
  const missing = expected.filter((column) => !actual.includes(column));
  const unexpected = actual.filter((column) => !expected.includes(column as (typeof EXPECTED_PROFILE_COLUMNS)[number]));
  if (missing.length || unexpected.length) {
    fail(`Unexpected production Prefix profile fields (missing=${missing.join("|") || "none"}; unexpected=${unexpected.join("|") || "none"}).`);
  }
}

async function assertProfileSchema(client: Queryable): Promise<void> {
  const result = await client.query<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema='public' and table_name='canonical_teaching_dictionary_prefix_profiles' order by ordinal_position`,
  );
  assertExpectedProfileColumns(result.rows.map((row) => row.column_name));
}

async function readProfiles(client: Queryable, lock = false): Promise<Record<string, unknown>[]> {
  const result = await client.query(
    `select * from public.canonical_teaching_dictionary_prefix_profiles where micro_skill_key=any($1) order by array_position($1::text[],micro_skill_key)${lock ? " for update" : ""}`,
    [[...PROFILE_KEYS]],
  );
  if (result.rowCount !== 5) fail(`Expected exactly five production Prefix profiles; found ${result.rowCount}.`);
  for (const [index, row] of result.rows.entries()) {
    if (row.micro_skill_key !== PROFILE_KEYS[index]) fail("Production Prefix profile ordering/identity mismatch.");
    if (row.row_status !== "active" || row.review_status !== "approved_for_first_exposure" || row.production_enabled !== true) {
      fail(`${String(row.micro_skill_key)} is not active, reviewed and production-enabled.`);
    }
  }
  return result.rows;
}

type MemberRow = Record<string, unknown> & { micro_skill_key: string; normalised_word: string; prefix_variant: string };

async function readMembers(client: Queryable): Promise<MemberRow[]> {
  const result = await client.query<MemberRow>(
    `select p.micro_skill_key,w.normalised_word,m.member_role,m.base_word,m.base_meaning,m.child_friendly_meaning,m.meaning_bin_key,m.teaching_split_parts,m.teaching_split_joins,m.transformation_notes,m.prefix_variant,m.assignment_eligible,m.row_status,m.review_status,m.source_sheet,m.source_row_number,m.source_row_hash,m.source_metadata,m.source_category,m.source_name,m.source_url,m.source_licence,m.source_use_note,m.confidence,m.reviewed_by,m.reviewed_at,m.created_at,m.updated_at from public.canonical_teaching_dictionary_prefix_members m join public.canonical_teaching_dictionary_prefix_profiles p on p.id=m.prefix_profile_id join public.canonical_teaching_dictionary_words w on w.id=m.canonical_word_id where p.micro_skill_key=any($1) order by array_position($1::text[],p.micro_skill_key),w.normalised_word`,
    [[...PROFILE_KEYS]],
  );
  return result.rows;
}

function assessMembers(manifest: PrefixManifest, rows: MemberRow[]) {
  return manifest.profiles.map((profile) => {
    const members = rows.filter((row) => row.micro_skill_key === profile.microSkillKey);
    if (members.length !== 7) fail(`${profile.microSkillKey} requires seven eligible members; found ${members.length}.`);
    if (members.some((member) => member.assignment_eligible !== true || member.row_status !== "active" || member.review_status !== "approved_for_first_exposure")) {
      fail(`${profile.microSkillKey} contains an ineligible or unreviewed member.`);
    }
    const audit = new Map(profile.validChoiceAudit.map((entry) => [entry.word, entry]));
    for (const member of members) {
      const verdict = audit.get(member.normalised_word) ?? fail(`${profile.microSkillKey}:${member.normalised_word} is absent from the accepted audit.`);
      const accepted = Object.entries(verdict.choiceVerdicts).filter(([, valid]) => valid).map(([form]) => form);
      if (accepted.length !== 1 || accepted[0] !== member.prefix_variant) {
        fail(`${profile.microSkillKey}:${member.normalised_word} does not have exactly one audited matching prefix.`);
      }
    }
    return {
      microSkillKey: profile.microSkillKey,
      eligibleMemberCount: members.length,
      canonicalMemberSha256: canonicalHash(members),
    };
  });
}

async function tableSnapshot(client: Queryable, schema: string, table: string) {
  const exists = await client.query<{ relation: string | null }>("select to_regclass($1)::text relation", [`${schema}.${table}`]);
  if (!exists.rows[0]?.relation) return { present: false, count: 0, sha256: sha256("absent") };
  const qualified = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
  const result = await client.query<{ count: string; row_hashes: string }>(
    `select count(*)::text count,coalesce(string_agg(row_hash,'' order by row_hash),'') row_hashes from (select md5(to_jsonb(source_row)::text) row_hash from ${qualified} source_row) protected_rows`,
  );
  const count = Number(result.rows[0]?.count ?? "0");
  return { present: true, count, sha256: sha256(result.rows[0]?.row_hashes ?? "") };
}

export async function protectedSnapshot(client: Queryable): Promise<ProtectedSnapshot> {
  const snapshot: ProtectedSnapshot = {};
  for (const [schema, table] of PROTECTED_TABLES) {
    snapshot[`${schema}.${table}`] = await tableSnapshot(client, schema, table);
  }
  return snapshot;
}

export function assertProtectedSnapshotEqual(before: ProtectedSnapshot, after: ProtectedSnapshot): void {
  if (canonical(before) !== canonical(after)) fail("Protected production count/hash drift detected.");
}

async function readAssignmentFacts(client: Queryable) {
  const statuses = await client.query<{ status: string; count: string }>(
    `select d.status,count(distinct d.id)::text count from public.daily_assignments d join public.assignment_items i on i.daily_assignment_id=d.id where i.metadata->>'provenance'='dynamic_prefix_v2' group by d.status order by d.status`,
  );
  const payloads = await client.query<{ lesson: unknown }>(
    `select distinct on (i.daily_assignment_id) i.prompt_data->'dynamicPrefixLesson' lesson from public.assignment_items i where i.metadata->>'provenance'='dynamic_prefix_v2' and i.prompt_data->>'dynamicPrefixActivityId'='intro-root' order by i.daily_assignment_id,i.position`,
  );
  const counts = Object.fromEntries(statuses.rows.map((row) => [row.status, Number(row.count)]));
  const readable = payloads.rows.filter((row) => dynamicPrefixRuntime(row.lesson) !== null).length;
  if (readable !== payloads.rows.length) fail(`Historical Prefix V2 readability failed for ${payloads.rows.length - readable} assignment(s).`);
  return {
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    pending: counts.pending ?? 0,
    completed: counts.completed ?? 0,
    skipped: counts.skipped ?? 0,
    payloadsChecked: payloads.rows.length,
    readablePayloads: readable,
    unreadablePayloads: payloads.rows.length - readable,
  };
}

async function assessMigration(client: Queryable) {
  const migrationRaw = await readFile(MIGRATION_PATH, "utf8");
  const requiredFileTokens = [
    "D4_MOR_PREFIXES_IN_IM_IL_IR", "dynamic_prefix_v2", "dynamic_prefix_pedagogy_v1",
    "jsonb_array_length(p_items) = 20", "D4_MOR_PREFIXES_SUB_INTER_SUPER",
    "D4_MOR_SUFFIXES_FUL_LESS", "closed_compound_v1", "to service_role",
  ];
  if (requiredFileTokens.some((token) => !migrationRaw.includes(token))) fail("The narrow 20-item migration file drifted from its reviewed guard.");
  if (/\b(insert|update|delete)\s+(into\s+|from\s+)?public\.(daily_assignments|assignment_items|adle_learning_items|adle_assignment_attempt_events)\b/i.test(migrationRaw)) {
    fail("The narrow migration unexpectedly mutates learner or assignment rows.");
  }
  const ledger = await client.query<{ present: boolean }>(
    `select exists(select 1 from supabase_migrations.schema_migrations where version=$1) present`,
    [MIGRATION_VERSION],
  );
  const ledgerRows = await client.query<{ version: string; name: string | null }>(
    `select version,name from supabase_migrations.schema_migrations order by version,name`,
  );
  const functionFacts = await client.query<{
    definition: string;
    service_role_execute: boolean;
    authenticated_execute: boolean;
    anon_execute: boolean;
  }>(
    `select pg_get_functiondef('public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)'::regprocedure) definition,has_function_privilege('service_role','public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)','execute') service_role_execute,has_function_privilege('authenticated','public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)','execute') authenticated_execute,has_function_privilege('anon','public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)','execute') anon_execute`,
  );
  const facts = functionFacts.rows[0] ?? fail("Missing composed-plan persistence function.");
  const baselineTokens = ["jsonb_array_length(p_items) <> 16", "D4_MOR_PREFIXES_SUB_INTER_SUPER", "D4_MOR_SUFFIXES_FUL_LESS", "closed_compound_v1"];
  if (baselineTokens.some((token) => !facts.definition.includes(token))) fail("Production composed-plan baseline does not preserve the reviewed 16/18-item guards.");
  const present = Boolean(ledger.rows[0]?.present);
  const hasTwentyItemGuard = facts.definition.includes("D4_MOR_PREFIXES_IN_IM_IL_IR")
    && facts.definition.includes("dynamic_prefix_pedagogy_v1")
    && facts.definition.includes("jsonb_array_length(p_items) = 20");
  if (present !== hasTwentyItemGuard) fail("Migration ledger and live 20-item function guard disagree.");
  if (!facts.service_role_execute || facts.authenticated_execute || facts.anon_execute) fail("Composed-plan execution is not service-role-only.");
  return {
    version: MIGRATION_VERSION,
    present,
    ledgerCount: ledgerRows.rows.length,
    ledgerLatestVersion: ledgerRows.rows.at(-1)?.version ?? null,
    ledgerSha256: canonicalHash(ledgerRows.rows),
    localMigrationSha256: sha256(migrationRaw),
    function: "public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)",
    liveFunctionSha256: sha256(facts.definition),
    existingSixteenItemDefault: true,
    existingReviewedEighteenItemExceptions: true,
    approvedTwentyItemGuardPresent: hasTwentyItemGuard,
    localTwentyItemGuardValidated: true,
    serviceRoleExecute: facts.service_role_execute,
    authenticatedExecute: facts.authenticated_execute,
    anonExecute: facts.anon_execute,
    createsOrMutatesAssignmentsByItself: false,
  };
}

function runVercelApi(path: string): unknown {
  const result = spawnSync("vercel", ["api", path], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) fail(`Vercel read-only API failed (${result.status ?? "unknown"}).`);
  return JSON.parse(result.stdout);
}

function gitSha(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) fail("Cannot resolve the baseline Git SHA.");
  return result.stdout.trim();
}

export function assessVercelFacts(input: {
  project: Record<string, unknown>;
  deployments: Array<Record<string, unknown>>;
  environmentNames: string[];
  baselineGitSha: string;
}) {
  if (input.project.id !== PRODUCTION_VERCEL_PROJECT_ID || input.project.name !== PRODUCTION_VERCEL_PROJECT_NAME) {
    fail("Vercel project identity mismatch.");
  }
  const deployment = input.deployments[0] ?? fail("No production deployment found.");
  const metadata = (deployment.meta ?? {}) as Record<string, unknown>;
  const sourceSha = String(metadata.githubCommitSha ?? "");
  if (deployment.target !== "production" || !["READY", "ready"].includes(String(deployment.readyState ?? deployment.state))) {
    fail("Latest Vercel production deployment is not Ready.");
  }
  if (sourceSha !== input.baselineGitSha) fail("Production deployment source SHA does not match the synchronized baseline.");
  if (!input.environmentNames.includes("ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED")) fail("Production Prefix enablement environment key is absent.");
  const compilerModeConfigured = input.environmentNames.includes("ADLE_DYNAMIC_PREFIX_COMPILER_MODE");
  if (compilerModeConfigured) fail("Production compiler mode is explicitly configured; read-only preflight expected the shadow fallback.");
  return {
    projectName: PRODUCTION_VERCEL_PROJECT_NAME,
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    deploymentId: String(deployment.uid ?? deployment.id ?? ""),
    deploymentSourceSha: sourceSha,
    deploymentReadyState: String(deployment.readyState ?? deployment.state),
    deploymentTarget: "production",
    environmentNames: [...new Set(input.environmentNames)].sort(),
    compilerModeEnvironmentPresent: false,
    compilerModeResolution: "shadow" as const,
    futureEnvironmentChangeRequired: "Set ADLE_DYNAMIC_PREFIX_COMPILER_MODE=shared_authoritative only after migration and content verification, then deliberately redeploy.",
  };
}

function readVercelFacts(baselineGitSha: string) {
  const project = runVercelApi(`/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}`) as Record<string, unknown>;
  const deploymentResponse = runVercelApi(`/v6/deployments?projectId=${PRODUCTION_VERCEL_PROJECT_ID}&target=production&limit=3`) as { deployments?: Array<Record<string, unknown>> };
  const environmentResponse = runVercelApi(`/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}/env?target=production&limit=100`) as { envs?: Array<{ key?: string }> };
  return assessVercelFacts({
    project,
    deployments: deploymentResponse.deployments ?? [],
    environmentNames: (environmentResponse.envs ?? []).map((entry) => entry.key).filter((key): key is string => Boolean(key)),
    baselineGitSha,
  });
}

function nonTargetProfile(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !PROFILE_MUTATION_FIELDS.includes(key as (typeof PROFILE_MUTATION_FIELDS)[number])));
}

export function profilePlan(
  manifest: PrefixManifest,
  definitions: Map<string, PrefixDefinition>,
  rows: Record<string, unknown>[],
) {
  const unchangedFields = EXPECTED_PROFILE_COLUMNS.filter((field) => !PROFILE_MUTATION_FIELDS.includes(field as (typeof PROFILE_MUTATION_FIELDS)[number]));
  return manifest.profiles.map((profile, index) => {
    const row = rows[index] ?? fail(`Missing production profile ${profile.microSkillKey}.`);
    const before = currentProjection(row);
    const after = releasedProjection(profile, definitions);
    const fieldDeltas = Object.fromEntries(PROFILE_MUTATION_FIELDS.map((field) => [field, {
      changed: canonical(before[field]) !== canonical(after[field]),
      beforeSha256: canonicalHash(before[field]),
      proposedSha256: canonicalHash(after[field]),
    }]));
    return {
      profileId: String(row.id),
      microSkillKey: profile.microSkillKey,
      currentCanonicalSha256: canonicalHash(before),
      proposedCanonicalSha256: canonicalHash(after),
      fieldDeltas,
      changedFields: PROFILE_MUTATION_FIELDS.filter((field) => canonical(before[field]) !== canonical(after[field])),
      unchangedFields,
      unchangedProjectionSha256: canonicalHash(nonTargetProfile(row)),
      rollbackProjectionSha256: canonicalHash(before),
    };
  });
}

async function collectPlan(
  client: Queryable,
  loaded: Awaited<ReturnType<typeof loadAcceptedManifest>>,
  vercel: ReturnType<typeof readVercelFacts>,
  baselineGitSha: string,
) {
  await assertProfileSchema(client);
  const rows = await readProfiles(client);
  const members = assessMembers(loaded.manifest, await readMembers(client));
  const profiles = profilePlan(loaded.manifest, loaded.definitions, rows);
  const protectedBefore = await protectedSnapshot(client);
  const assignmentFacts = await readAssignmentFacts(client);
  const migration = await assessMigration(client);
  const rollbackProjection = rows.map((row) => ({
    profileId: String(row.id),
    microSkillKey: String(row.micro_skill_key),
    fields: [...PROFILE_MUTATION_FIELDS],
    projectionSha256: canonicalHash(currentProjection(row)),
  }));
  if (rollbackProjection.length !== 5) fail("Complete five-profile rollback projection was not captured.");
  const planWithoutHash = {
    status: "ready_for_reviewed_separate_authority",
    environment: "production",
    productionSupabaseRef: PRODUCTION_SUPABASE_REF,
    baselineGitSha,
    packageSha256: loaded.packageSha256,
    acceptedStagingReleaseId: loaded.manifest.releaseId,
    productionReleaseId: PRODUCTION_RELEASE_ID,
    productionBatchId: productionBatchId(loaded.packageSha256),
    vercel,
    profiles,
    profileMembers: members,
    currentCanonicalProfilesSha256: canonicalHash(rows.map((row) => ({ microSkillKey: row.micro_skill_key, ...currentProjection(row) }))),
    proposedCanonicalProfilesSha256: canonicalHash(loaded.manifest.profiles.map((profile) => ({ microSkillKey: profile.microSkillKey, ...releasedProjection(profile, loaded.definitions) }))),
    exactMutableProfileFields: [...PROFILE_MUTATION_FIELDS],
    exactUnchangedProfileFields: EXPECTED_PROFILE_COLUMNS.filter((field) => !PROFILE_MUTATION_FIELDS.includes(field as (typeof PROFILE_MUTATION_FIELDS)[number])),
    unexpectedProductionProfileFields: [],
    rollbackProjection,
    rollbackProjectionSha256: canonicalHash(rows.map((row) => ({ id: row.id, microSkillKey: row.micro_skill_key, ...currentProjection(row) }))),
    rollbackProjectionComplete: rollbackProjection.length === 5,
    protectedTables: protectedBefore,
    protectedSnapshotSha256: canonicalHash(protectedBefore),
    expectedProtectedTablesAfterRelease: protectedBefore,
    expectedProtectedSnapshotSha256AfterRelease: canonicalHash(protectedBefore),
    assignments: assignmentFacts,
    migration,
    compilerModeResolution: vercel.compilerModeResolution,
    futureEnvironmentChangeRequired: vercel.futureEnvironmentChangeRequired,
    stopConditions: [
      "Git, Vercel or Supabase identity drift",
      "accepted package SHA drift",
      "profile/member readiness or schema drift",
      "protected count/hash drift",
      "migration ledger/function mismatch",
      "historical Prefix V2 readability failure",
      "compiler mode no longer resolving to shadow before content publication",
    ],
    rollbackSequence: [
      "restore ADLE_DYNAMIC_PREFIX_COMPILER_MODE to shadow and redeploy",
      "verify shared-created and historical Prefix V2 assignments remain readable",
      "run guarded production deactivate with the captured five-profile projection if content rollback is required",
      "retain the additive 20-item allowance unless a separately reviewed database rollback is authorised",
    ],
    readyForSeparateProductionReleaseAuthority: true,
    mutationPerformed: false,
  };
  return { plan: { ...planWithoutHash, planSha256: canonicalHash(planWithoutHash) }, rows, protectedBefore };
}

export async function withReadOnlyTransaction<T>(client: Queryable, operation: () => Promise<T>): Promise<T> {
  await client.query(READ_ONLY_BEGIN_SQL);
  try {
    await client.query("set local statement_timeout = '120s'");
    const result = await operation();
    await client.query("rollback");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function planCommand(loaded: Awaited<ReturnType<typeof loadAcceptedManifest>>) {
  const baselineGitSha = gitSha();
  const vercel = readVercelFacts(baselineGitSha);
  const client = clientForProduction();
  await client.connect();
  try {
    return await withReadOnlyTransaction(client, async () => (await collectPlan(client, loaded, vercel, baselineGitSha)).plan);
  } finally {
    await client.end();
  }
}

function confirmationPlanSha(): string {
  return arg("--confirm-plan-sha256") ?? fail("Mutation requires --confirm-plan-sha256 from an immediately preceding read-only plan.");
}

async function releaseCommand(loaded: Awaited<ReturnType<typeof loadAcceptedManifest>>) {
  const baselineGitSha = gitSha();
  const vercel = readVercelFacts(baselineGitSha);
  const client = clientForProduction();
  await client.connect();
  try {
    await client.query("begin transaction isolation level serializable read write");
    await client.query("select pg_advisory_xact_lock($1)", [ADVISORY_LOCK_KEY]);
    await assertProfileSchema(client);
    const rows = await readProfiles(client, true);
    const members = assessMembers(loaded.manifest, await readMembers(client));
    if (members.length !== 5) fail("Five member projections are required.");
    const protectedBefore = await protectedSnapshot(client);
    const planned = await collectPlan(client, loaded, vercel, baselineGitSha);
    if (!planned.plan.migration.present || !planned.plan.migration.approvedTwentyItemGuardPresent) {
      fail("The narrow reviewed 20-item migration must be applied and verified before profile publication.");
    }
    if (planned.plan.planSha256 !== confirmationPlanSha()) fail("Production plan SHA changed; re-run read-only plan and review it.");
    const batchId = productionBatchId(loaded.packageSha256);
    const existing = await client.query("select id from public.canonical_teaching_dictionary_import_batches where id=$1", [batchId]);
    if (existing.rowCount) fail("The deterministic production release batch already exists.");
    const previousProfiles = rows.map((row) => ({ id: row.id, microSkillKey: row.micro_skill_key, ...currentProjection(row) }));
    const ledger = productionReleaseLedgerFields(loaded.manifest.schemaVersion, loaded.packageSha256);
    await client.query(
      `insert into public.canonical_teaching_dictionary_import_batches(
        id,source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,
        import_mode,batch_status,source_metadata,imported_by,imported_at,
        release_id,package_type,package_schema_version,workbook_sha256,package_sha256,target_environment,importer_version,verification_summary
      ) values(
        $1,$2,$3,$4,$5,$6,$7,'production_release','applied',$8,$9,now(),
        $10,$11,$12,$13,$14,$15,$16,'{}'::jsonb
      )`,
      [
        batchId,
        "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-03-dynamic-prefix-pedagogy-v1",
        loaded.packageSha256,
        PRODUCTION_RELEASE_ID,
        { errors: 0, warnings: 0, package_schema: loaded.manifest.schemaVersion },
        { profiles: 5, profileFields: 15 },
        { production_enabled: true, learner_writes: 0 },
        {
          releaseId: PRODUCTION_RELEASE_ID,
          acceptedStagingReleaseId: loaded.manifest.releaseId,
          packageSha256: loaded.packageSha256,
          workbookSha256Basis: "immutable_human_reviewed_manifest",
          sourceCommit: baselineGitSha,
          previousProfiles,
          protectedSnapshotBefore: protectedBefore,
          planSha256: planned.plan.planSha256,
        },
        loaded.manifest.review.approvedBy,
        ledger.releaseId,
        ledger.packageType,
        ledger.packageSchemaVersion,
        ledger.workbookSha256,
        ledger.packageSha256,
        ledger.targetEnvironment,
        ledger.importerVersion,
      ],
    );
    for (const [index, profile] of loaded.manifest.profiles.entries()) {
      const row = rows[index] ?? fail(`Missing locked profile ${profile.microSkillKey}.`);
      const next = releasedProjection(profile, loaded.definitions);
      const updated = await client.query(
        `update public.canonical_teaching_dictionary_prefix_profiles set meaning_bins=$1,prefix_choices=$2,intro_content=$3 where id=$4 and micro_skill_key=$5 and production_enabled=true and row_status='active' and review_status='approved_for_first_exposure'`,
        [JSON.stringify(next.meaning_bins), JSON.stringify(next.prefix_choices), JSON.stringify(next.intro_content), row.id, profile.microSkillKey],
      );
      if (updated.rowCount !== 1) fail(`Guarded update failed for ${profile.microSkillKey}.`);
    }
    const afterRows = await readProfiles(client);
    for (const [index, row] of rows.entries()) {
      if (canonical(nonTargetProfile(row)) !== canonical(nonTargetProfile(afterRows[index]!))) fail(`Non-target profile field changed for ${String(row.micro_skill_key)}.`);
    }
    const protectedAfter = await protectedSnapshot(client);
    assertProtectedSnapshotEqual(protectedBefore, protectedAfter);
    await client.query("commit");
    return { status: "released", environment: "production", productionReleaseId: PRODUCTION_RELEASE_ID, batchId, packageSha256: loaded.packageSha256, planSha256: planned.plan.planSha256, protectedSnapshotSha256: canonicalHash(protectedAfter) };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function verifyCommand(loaded: Awaited<ReturnType<typeof loadAcceptedManifest>>) {
  const baselineGitSha = gitSha();
  const vercel = readVercelFacts(baselineGitSha);
  const client = clientForProduction();
  await client.connect();
  try {
    return await withReadOnlyTransaction(client, async () => {
      await assertProfileSchema(client);
      const rows = await readProfiles(client);
      const profiles = profilePlan(loaded.manifest, loaded.definitions, rows);
      if (profiles.some((profile) => profile.changedFields.length)) fail("Production profiles do not equal the accepted projection.");
      assessMembers(loaded.manifest, await readMembers(client));
      const batch = await client.query<{
        source_folder_sha256: string;
        source_metadata: Record<string, unknown>;
        batch_status: string;
        release_id: string | null;
        package_type: string | null;
        package_schema_version: string | null;
        workbook_sha256: string | null;
        package_sha256: string | null;
        target_environment: string | null;
        importer_version: string | null;
      }>(
        `select source_folder_sha256,source_metadata,batch_status,release_id,package_type,package_schema_version,
          workbook_sha256,package_sha256,target_environment,importer_version
        from public.canonical_teaching_dictionary_import_batches where id=$1`,
        [productionBatchId(loaded.packageSha256)],
      );
      const receipt = batch.rows[0] ?? fail("Production release batch receipt is missing.");
      const ledger = productionReleaseLedgerFields(loaded.manifest.schemaVersion, loaded.packageSha256);
      if (
        receipt.source_folder_sha256 !== loaded.packageSha256
        || receipt.batch_status !== "applied"
        || receipt.source_metadata?.releaseId !== PRODUCTION_RELEASE_ID
        || receipt.source_metadata?.workbookSha256Basis !== "immutable_human_reviewed_manifest"
        || receipt.release_id !== ledger.releaseId
        || receipt.package_type !== ledger.packageType
        || receipt.package_schema_version !== ledger.packageSchemaVersion
        || receipt.workbook_sha256 !== ledger.workbookSha256
        || receipt.package_sha256 !== ledger.packageSha256
        || receipt.target_environment !== ledger.targetEnvironment
        || receipt.importer_version !== ledger.importerVersion
      ) fail("Production release receipt identity mismatch.");
      const snapshot = await protectedSnapshot(client);
      assertProtectedSnapshotEqual(receipt.source_metadata.protectedSnapshotBefore as ProtectedSnapshot, snapshot);
      return { status: "verified", environment: "production", vercel, packageSha256: loaded.packageSha256, profiles: 5, protectedSnapshotSha256: canonicalHash(snapshot), mutationPerformed: false };
    });
  } finally {
    await client.end();
  }
}

async function deactivateCommand(loaded: Awaited<ReturnType<typeof loadAcceptedManifest>>) {
  const client = clientForProduction();
  await client.connect();
  try {
    await client.query("begin transaction isolation level serializable read write");
    await client.query("select pg_advisory_xact_lock($1)", [ADVISORY_LOCK_KEY]);
    const batchId = productionBatchId(loaded.packageSha256);
    const batch = await client.query<{ source_folder_sha256: string; batch_status: string; source_metadata: Record<string, unknown> }>(
      "select source_folder_sha256,batch_status,source_metadata from public.canonical_teaching_dictionary_import_batches where id=$1 for update",
      [batchId],
    );
    const receipt = batch.rows[0] ?? fail("Production rollback receipt is missing.");
    const sourceMetadata = receipt.source_metadata;
    if (
      receipt.source_folder_sha256 !== loaded.packageSha256
      || receipt.batch_status !== "applied"
      || sourceMetadata.releaseId !== PRODUCTION_RELEASE_ID
      || sourceMetadata.packageSha256 !== loaded.packageSha256
    ) fail("Production rollback receipt identity mismatch.");
    const previous = sourceMetadata.previousProfiles as Array<Record<string, unknown>> | undefined;
    if (!previous || previous.length !== 5) fail("Complete five-profile rollback projection is unavailable.");
    const protectedBefore = await protectedSnapshot(client);
    for (const profile of previous) {
      const restored = await client.query(
        `update public.canonical_teaching_dictionary_prefix_profiles set meaning_bins=$1,prefix_choices=$2,intro_content=$3 where id=$4 and micro_skill_key=$5 and production_enabled=true and row_status='active' and review_status='approved_for_first_exposure'`,
        [JSON.stringify(profile.meaning_bins), JSON.stringify(profile.prefix_choices), profile.intro_content === null ? null : JSON.stringify(profile.intro_content), profile.id, profile.microSkillKey],
      );
      if (restored.rowCount !== 1) fail(`Guarded restore failed for ${String(profile.microSkillKey)}.`);
    }
    const protectedAfter = await protectedSnapshot(client);
    assertProtectedSnapshotEqual(protectedBefore, protectedAfter);
    await client.query(
      "update public.canonical_teaching_dictionary_import_batches set batch_status='deactivated',deactivated_at=now(),deactivation_note=$1 where id=$2",
      ["Guarded Dynamic Prefix pedagogy v1 production projection restore.", batchId],
    );
    await client.query("commit");
    return { status: "deactivated", environment: "production", productionReleaseId: PRODUCTION_RELEASE_ID, batchId, restoredProfiles: previous.length, protectedSnapshotSha256: canonicalHash(protectedAfter) };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const command = (process.argv[2] ?? "validate") as ReleaseCommand;
  if (!["validate", "plan", "release", "verify", "deactivate"].includes(command)) fail(`Unknown production release command: ${command}.`);
  assertProductionEnvelope({
    command,
    environment: arg("--environment"),
    releaseFlag: process.env[PRODUCTION_RELEASE_FLAG],
    confirmation: arg("--confirm"),
  });
  const loaded = await loadAcceptedManifest();
  const projectRef = assertProductionDatabaseTarget(databaseUrl());
  if (command === "validate") {
    return console.log(JSON.stringify({
      status: "valid",
      environment: "production",
      projectRef,
      packageSha256: loaded.packageSha256,
      productionReleaseId: PRODUCTION_RELEASE_ID,
      productionBatchId: productionBatchId(loaded.packageSha256),
      definitions: loaded.manifest.prefixDefinitions.length,
      profiles: loaded.manifest.profiles.length,
      supportedCommands: ["validate", "plan", "release", "verify", "deactivate"],
      mutationPerformed: false,
    }, null, 2));
  }
  if (command === "plan") return console.log(JSON.stringify(await planCommand(loaded), null, 2));
  if (command === "release") return console.log(JSON.stringify(await releaseCommand(loaded), null, 2));
  if (command === "verify") return console.log(JSON.stringify(await verifyCommand(loaded), null, 2));
  return console.log(JSON.stringify(await deactivateCommand(loaded), null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
