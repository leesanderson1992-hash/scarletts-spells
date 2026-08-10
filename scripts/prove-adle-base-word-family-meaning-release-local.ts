#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIRMATION = "PROVE_BASE_WORD_FAMILY_MEANING_RELEASE_LOCALLY";
async function main(): Promise<void> {
  if (process.argv.at(-1) !== CONFIRMATION) throw new Error(`Refusing local transactional proof without: -- ${CONFIRMATION}`);

  // The Codex workspace supplies this optional isolated PostgreSQL runtime;
  // production application installs and CI do not need to bundle it.
  const pgliteModule = "@electric-sql/pglite";
  const { PGlite } = await import(pgliteModule);
  const db = new PGlite();
  await db.exec(`
  create schema if not exists public;
  create role teaching_dictionary_releaser nologin noinherit;
  create table public.canonical_teaching_dictionary_import_batches(
    id uuid primary key,
    import_mode text not null,
    batch_status text not null,
    release_id text,
    package_type text,
    package_schema_version text,
    workbook_sha256 text,
    package_sha256 text,
    target_environment text,
    importer_version text,
    constraint canonical_teaching_dictionary_import_batches_release_fields_check check (
      import_mode not in ('staging_release','production_release') or (
        btrim(coalesce(release_id,'')) <> '' and package_type in (
          'canonical_word_batch_v1','canonical_word_repair_v1','micro_skill_content_batch_v1'
        ) and btrim(coalesce(package_schema_version,'')) <> ''
        and workbook_sha256 ~ '^[0-9a-f]{64}$' and package_sha256 ~ '^[0-9a-f]{64}$'
        and target_environment in ('staging','production') and btrim(coalesce(importer_version,'')) <> ''
      )
    )
  );
  create table public.canonical_teaching_dictionary_base_word_families(
    id uuid primary key, import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id),
    base_family_key text not null
  );
  create table public.canonical_teaching_dictionary_base_word_family_members(
    id uuid primary key, import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id),
    base_word_family_id uuid not null references public.canonical_teaching_dictionary_base_word_families(id),
    child_friendly_meaning text
  );
`);
await db.exec(readFileSync(resolve("supabase/migrations/20260809160000_allow_base_word_family_release_ledger.sql"), "utf8"));

const OLD_BATCH = "00000000-0000-4000-8000-000000000001";
const NEW_BATCH = "00000000-0000-4000-8000-000000000002";
const OLD_FAMILY = "00000000-0000-4000-8000-000000000003";
const NEW_FAMILY = "00000000-0000-4000-8000-000000000004";
const NEW_MEMBER = "00000000-0000-4000-8000-000000000005";
await db.exec("begin");
await db.query(`insert into public.canonical_teaching_dictionary_import_batches(id,import_mode,batch_status) values($1,'admin_import','applied')`, [OLD_BATCH]);
await db.query(`insert into public.canonical_teaching_dictionary_import_batches(id,import_mode,batch_status,release_id,package_type,package_schema_version,workbook_sha256,package_sha256,target_environment,importer_version) values($1,'production_release','validated','proof-release','base_word_family_batch_v1','v1',$2,$3,'production','proof-v1')`, [NEW_BATCH, "a".repeat(64), "b".repeat(64)]);
await db.query(`insert into public.canonical_teaching_dictionary_base_word_families(id,import_batch_id,base_family_key) values($1,$2,'old-family'),($3,$4,'new-family')`, [OLD_FAMILY, OLD_BATCH, NEW_FAMILY, NEW_BATCH]);
await db.query(`insert into public.canonical_teaching_dictionary_base_word_family_members(id,import_batch_id,base_word_family_id,child_friendly_meaning) values($1,$2,$3,'reviewed gloss')`, [NEW_MEMBER, NEW_BATCH, NEW_FAMILY]);
await db.query(`update public.canonical_teaching_dictionary_import_batches set batch_status='applied' where id=$1`, [NEW_BATCH]);

let familyUpdateBlocked = false;
let memberDeleteBlocked = false;
let familyUpdateError = "";
let memberDeleteError = "";
await db.exec("savepoint prove_family_update");
try { await db.query(`update public.canonical_teaching_dictionary_base_word_families set base_family_key='mutated' where id=$1`, [NEW_FAMILY]); }
catch (error) { familyUpdateError = String(error); familyUpdateBlocked = familyUpdateError.includes("immutable"); await db.exec("rollback to savepoint prove_family_update"); }
await db.exec("release savepoint prove_family_update");
await db.exec("savepoint prove_member_delete");
try { await db.query(`delete from public.canonical_teaching_dictionary_base_word_family_members where id=$1`, [NEW_MEMBER]); }
catch (error) { memberDeleteError = String(error); memberDeleteBlocked = memberDeleteError.includes("immutable"); await db.exec("rollback to savepoint prove_member_delete"); }
await db.exec("release savepoint prove_member_delete");
if (!familyUpdateBlocked || !memberDeleteBlocked) throw new Error(`Applied Base Word family release rows were not immutable: ${JSON.stringify({ familyUpdateError, memberDeleteError })}`);

await db.query(`update public.canonical_teaching_dictionary_base_word_families set base_family_key='old-family-still-legacy' where id=$1`, [OLD_FAMILY]);
const legacy = await db.query(`select base_family_key from public.canonical_teaching_dictionary_base_word_families where id=$1`, [OLD_FAMILY]) as { rows: Array<{ base_family_key: string }> };
if (legacy.rows[0]?.base_family_key !== "old-family-still-legacy") throw new Error("The narrow trigger unexpectedly reclassified a legacy batch.");
const constraint = await db.query(`select pg_get_constraintdef(oid) definition from pg_constraint where conname='canonical_teaching_dictionary_import_batches_release_fields_check'`) as { rows: Array<{ definition: string }> };
if (!constraint.rows[0]?.definition.includes("base_word_family_batch_v1")) throw new Error("The release ledger does not accept the reviewed package type.");
const privilege = await db.query(`
  select
    has_table_privilege('teaching_dictionary_releaser','public.canonical_teaching_dictionary_base_word_families','INSERT') family_insert,
    has_table_privilege('teaching_dictionary_releaser','public.canonical_teaching_dictionary_base_word_family_members','INSERT') member_insert,
    has_table_privilege('teaching_dictionary_releaser','public.canonical_teaching_dictionary_base_word_families','UPDATE') family_update,
    has_table_privilege('teaching_dictionary_releaser','public.canonical_teaching_dictionary_base_word_family_members','UPDATE') member_update,
    has_table_privilege('teaching_dictionary_releaser','public.canonical_teaching_dictionary_base_word_families','DELETE') family_delete,
    has_table_privilege('teaching_dictionary_releaser','public.canonical_teaching_dictionary_base_word_family_members','DELETE') member_delete
`) as { rows: Array<{ family_insert: boolean; member_insert: boolean; family_update: boolean; member_update: boolean; family_delete: boolean; member_delete: boolean }> };
const grants = privilege.rows[0];
if (!grants?.family_insert || !grants.member_insert || grants.family_update || grants.member_update || grants.family_delete || grants.member_delete) {
  throw new Error(`Teaching Dictionary release role is not insert-only: ${JSON.stringify(grants)}`);
}
await db.exec("rollback");
const residue = await db.query(`select count(*)::int count from public.canonical_teaching_dictionary_import_batches`) as { rows: Array<{ count: number }> };
if (residue.rows[0]?.count !== 0) throw new Error("Transactional family release proof left residue.");
await db.close();

  console.log(JSON.stringify({
    status: "passed",
    packageTypeAccepted: true,
    appliedFamilyUpdateBlocked: familyUpdateBlocked,
    appliedMemberDeleteBlocked: memberDeleteBlocked,
    legacyBatchClassificationPreserved: true,
    insertOnlyReleaseRole: true,
    transactionRolledBack: true,
    residue: 0,
  }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
