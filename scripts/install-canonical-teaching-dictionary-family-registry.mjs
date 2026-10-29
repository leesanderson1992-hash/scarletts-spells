#!/usr/bin/env node
/** Exact, transactional owner-reviewed family consolidation. Dry-run by default. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import pg from "pg";

process.loadEnvFile(".env.local");
const migrationName = "20261029220000_canonical_teaching_dictionary_family_registry.sql";
const migrationPath = resolve("supabase/migrations", migrationName);
const packagePath = resolve("../outputs/schwa-cluster-bulk-readiness-2026-10-29/canonical-family-live-import-package.json");
const receiptPath = resolve("../outputs/schwa-cluster-bulk-readiness-2026-10-29/canonical-family-live-import-receipt.json");
const apply = process.argv.includes("--apply");
if (process.argv.slice(2).some(arg => arg !== "--apply")) throw Error("Only --apply is supported; omission runs rollback proof.");
const connectionString = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!connectionString || !new URL(connectionString).hostname.endsWith("pooler.supabase.com"))
  throw Error("PRODUCTION_CONNECTION_NOT_VERIFIED");
const migrationSql = readFileSync(migrationPath, "utf8");
const packageRaw = readFileSync(packagePath, "utf8").trimEnd();
const pkg = JSON.parse(packageRaw);
const packageSha256 = createHash("sha256").update(packageRaw).digest("hex");
if (pkg.schemaVersion !== "canonical_base_family_registry_v1" ||
  pkg.groups.length !== 931 || pkg.aliases.length !== 1025 || pkg.members.length !== 1186 ||
  new Set(pkg.groups.map(row => row.canonical_family_id)).size !== 931 ||
  new Set(pkg.aliases.map(row => `${row.source_type}:${row.source_key}`)).size !== 1025 ||
  new Set(pkg.members.map(row => `${row.canonical_family_id}:${row.canonical_word_id}`)).size !== 1186)
  throw Error("CANONICAL_FAMILY_PACKAGE_SHAPE_MISMATCH");
const sourceDecision = readFileSync("/Users/katiesanderson/Downloads/family-match-candidates.csv");
if (createHash("sha256").update(sourceDecision).digest("hex") !== pkg.decisionSha256)
  throw Error("OWNER_DECISION_FILE_CHANGED");
const split = value => String(value || "").split("; ").filter(Boolean);
const db = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 120_000 });
await db.connect();
try {
  await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SET LOCAL statement_timeout='120s'");
  const protectedCounts = async () => (await db.query(`select jsonb_build_object(
    'children',(select count(*) from public.children),
    'learningItems',(select count(*) from public.adle_learning_items),
    'completedAssignments',(select count(*) from public.daily_assignments where status='completed'),
    'reviewSessions',(select count(*) from public.adle_review_sessions)) state`)).rows[0].state;
  const before = await protectedCounts();
  const ledger = await db.query("select version from supabase_migrations.schema_migrations where version='20261029220000'");
  const existing = await db.query("select to_regclass('public.canonical_teaching_dictionary_base_family_registry') registry");
  if (ledger.rowCount || existing.rows[0].registry) throw Error("CANONICAL_FAMILY_REGISTRY_ALREADY_EXISTS");
  const sourceKeys = await db.query(`select source_type,source_key,source_revision from (
    select distinct 'legacy_base'::text source_type,base_family_key source_key,null::integer source_revision
      from public.canonical_teaching_dictionary_base_word_families
      where row_status='active' and review_status='approved_for_first_exposure'
    union all
    select case when f.base_kind='bound_root' then 'lexical_root' else 'lexical_free_base' end,
      f.family_key,f.revision from public.canonical_teaching_dictionary_lexical_base_families f
      where f.review_status='approved' and f.revision=(select max(revision)
        from public.canonical_teaching_dictionary_lexical_base_families newer
        where newer.family_key=f.family_key and newer.review_status='approved')
  ) current_keys`);
  const actualKeys = new Set(sourceKeys.rows.map(row => `${row.source_type}:${row.source_key}:${row.source_revision ?? ""}`));
  const plannedKeys = new Set(pkg.aliases.map(row => `${row.source_type}:${row.source_key}:${row.source_revision || ""}`));
  if (actualKeys.size !== plannedKeys.size || [...actualKeys].some(key => !plannedKeys.has(key)))
    throw Error("SOURCE_FAMILY_KEYS_CHANGED");
  const wordIds = [...new Set([...pkg.groups.map(row => row.canonical_base_word_id).filter(Boolean),
    ...pkg.members.map(row => row.canonical_word_id)])];
  const activeWords = await db.query("select id from public.canonical_teaching_dictionary_words where id=any($1::uuid[]) and row_status='active' and dialect_code='en-GB'", [wordIds]);
  if (activeWords.rowCount !== wordIds.length) throw Error("CANONICAL_WORD_SOURCE_CHANGED");
  await db.query(migrationSql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, ""));
  const groups = pkg.groups.map(row => ({
    id: row.canonical_family_id, family_key: row.canonical_base_family_key,
    base_kind: row.base_kind, canonical_base_word_id: row.canonical_base_word_id || null,
    base_lemma: row.base_lemma, meaning_variants: row.meaning_variants,
    decision_status: row.decision_status.includes("provisional") ? "owner_decision_interpreted" : "owner_reviewed",
    decision_reference: `Owner-edited family-match-candidates.csv; SHA-256 ${pkg.decisionSha256}`,
    source_manifest_sha256: packageSha256,
  }));
  await db.query(`insert into public.canonical_teaching_dictionary_base_family_registry
    (id,family_key,base_kind,canonical_base_word_id,base_lemma,meaning_variants,decision_status,decision_reference,source_manifest_sha256)
    select x.id::uuid,x.family_key,x.base_kind,x.canonical_base_word_id::uuid,x.base_lemma,x.meaning_variants,
      x.decision_status,x.decision_reference,x.source_manifest_sha256
    from jsonb_to_recordset($1::jsonb) as x(id text,family_key text,base_kind text,
      canonical_base_word_id text,base_lemma text,meaning_variants jsonb,decision_status text,
      decision_reference text,source_manifest_sha256 text)`, [JSON.stringify(groups)]);
  const aliases = pkg.aliases.map(row => ({
    source_type: row.source_type, source_key: row.source_key,
    canonical_family_id: row.canonical_family_id, source_id: row.source_id,
    source_record_ids: split(row.source_record_ids),
    source_revision: row.source_revision ? Number(row.source_revision) : null,
  }));
  await db.query(`insert into public.canonical_teaching_dictionary_base_family_registry_aliases
    (source_type,source_key,canonical_family_id,source_id,source_record_ids,source_revision)
    select x.source_type,x.source_key,x.canonical_family_id::uuid,x.source_id,x.source_record_ids,x.source_revision
    from jsonb_to_recordset($1::jsonb) as x(source_type text,source_key text,canonical_family_id text,
      source_id text,source_record_ids text[],source_revision integer)`, [JSON.stringify(aliases)]);
  const members = pkg.members.map(row => ({
    canonical_family_id: row.canonical_family_id, canonical_word_id: row.canonical_word_id,
    source_family_keys: split(row.source_family_keys), source_member_roles: split(row.source_member_roles),
    source_assignment_eligibility: split(row.source_assignment_eligibility), source_record_ids: split(row.source_record_ids),
  }));
  await db.query(`insert into public.canonical_teaching_dictionary_base_family_registry_members
    (canonical_family_id,canonical_word_id,source_family_keys,source_member_roles,
      source_assignment_eligibility,source_record_ids)
    select x.canonical_family_id::uuid,x.canonical_word_id::uuid,x.source_family_keys,
      x.source_member_roles,x.source_assignment_eligibility,x.source_record_ids
    from jsonb_to_recordset($1::jsonb) as x(canonical_family_id text,canonical_word_id text,
      source_family_keys text[],source_member_roles text[],source_assignment_eligibility text[],source_record_ids text[])`, [JSON.stringify(members)]);
  const coverage = await db.query(`select
    (select count(*)::int from public.canonical_teaching_dictionary_base_family_registry) groups,
    (select count(*)::int from public.canonical_teaching_dictionary_base_family_registry_aliases) aliases,
    (select count(*)::int from public.canonical_teaching_dictionary_base_family_registry_members) members,
    (select count(*)::int from public.canonical_teaching_dictionary_base_family_registry r
      where r.canonical_base_word_id is not null and not exists
        (select 1 from public.canonical_teaching_dictionary_words w where w.id=r.canonical_base_word_id and w.row_status='active')) invalid_bases,
    (select count(*)::int from public.canonical_teaching_dictionary_base_family_registry_aliases a
      where not exists (select 1 from public.canonical_teaching_dictionary_base_family_registry r where r.id=a.canonical_family_id)) invalid_aliases`);
  const counts = coverage.rows[0];
  if (counts.groups !== 931 || counts.aliases !== 1025 || counts.members !== 1186 ||
    counts.invalid_bases !== 0 || counts.invalid_aliases !== 0) throw Error("CANONICAL_FAMILY_READBACK_FAILED");
  const act = await db.query(`select r.id,r.family_key,w.display_word base_word,
    array_agg(mw.display_word order by mw.display_word) member_words
    from public.canonical_teaching_dictionary_base_family_registry r
    join public.canonical_teaching_dictionary_words w on w.id=r.canonical_base_word_id
    join public.canonical_teaching_dictionary_base_family_registry_members m on m.canonical_family_id=r.id
    join public.canonical_teaching_dictionary_words mw on mw.id=m.canonical_word_id
    where r.family_key='act_base_family' group by r.id,r.family_key,w.display_word`);
  if (act.rowCount !== 1 || act.rows[0].base_word !== "act" ||
    JSON.stringify(act.rows[0].member_words) !== JSON.stringify(["act","action","activity","actor","actual","interact"]))
    throw Error("ACT_UNION_READBACK_FAILED");
  const after = await protectedCounts();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("PROTECTED_LEARNER_STATE_CHANGED");
  await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",
    ["20261029220000", "canonical_teaching_dictionary_family_registry", [migrationSql]]);
  if (apply) await db.query("COMMIT"); else await db.query("ROLLBACK");
  const receipt = { environment: "production", mode: apply ? "applied" : "rollback_proof",
    migrationName, migrationSha256: createHash("sha256").update(migrationSql).digest("hex"),
    packageSha256, ownerDecisionSha256: pkg.decisionSha256, counts, act: act.rows[0],
    protectedState: before, sourceFamilyKeys: actualKeys.size };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
} catch (error) {
  await db.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await db.end();
}
