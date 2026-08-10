#!/usr/bin/env node
/* Guarded Production-dark publication of the reviewed Base Word family release. */
/* eslint-disable @typescript-eslint/no-explicit-any -- release artifacts and pg rows are runtime-validated */

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

export const RELEASE_ID = "adle_base_word_family_meanings_v1_2026_08_09";
export const PACKAGE_TYPE = "base_word_family_batch_v1";
export const PACKAGE_SCHEMA_VERSION = "v1";
export const ACCEPTED_PACKAGE_SHA256 = "c6b5c3db64d902f7a3b2e18e60d822baef4c48d0fec855cb211edca564676576";
export const IMPORT_BATCH_ID = "ddc8993b-26ca-57da-8383-1efec1be8ee1";
export const PREDECESSOR_BATCH_ID = "d659485d-7bd2-44ca-815e-f5a3995eb068";
export const SOURCE_COMMIT = "e4219122b7e68f37a47af6fa4152e65d19083cd3";
export const MIGRATION_VERSION = "20260809160000";
export const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
export const IMPORTER_VERSION = "adle_base_word_family_meaning_release_v1";
export const RELEASE_CONFIRMATION = `publish:${RELEASE_ID}:${ACCEPTED_PACKAGE_SHA256.slice(0, 16)}:production-dark`;

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const RELEASE_RELATIVE = "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-09-base-word-family-meanings-v1";
const RELEASE_DIR = resolve(ROOT, RELEASE_RELATIVE);
const MANIFEST_PATH = resolve(RELEASE_DIR, "manifest.json");
const AUDITOR_PATH = resolve(ROOT, "scripts/audit-base-word-family-meaning-release.py");
const MIGRATION_PATH = resolve(ROOT, "supabase/migrations/20260809160000_allow_base_word_family_release_ledger.sql");
const RELEASE_ROLE = "teaching_dictionary_releaser";
const ADVISORY_LOCK = "adle_base_word_family_meaning_release_v1";
const SUPPORTED_SKILLS = [
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
] as const;

type Manifest = {
  schemaVersion: string;
  releaseId: string;
  packageType: string;
  packageSchemaVersion: string;
  packageSha256: string;
  sourceCommit: string;
  requiredMigrationVersions: string[];
  requiredMigrations: Array<{ version: string; path: string; sha256: string }>;
  predecessorImportBatchId: string;
  importBatchId: string;
  workbookSha256: string;
  workbookSha256Basis: string;
  sourceFiles: Record<string, { path: string; sha256: string }>;
  review: { approvedBy: string; approvedAt: string; meaningPairSha256: string };
  rowCounts: { baseWordFamilies: number; baseWordFamilyMembers: number; missingOrUnreviewedMeanings: number };
  meaningClassCounts: Record<string, number>;
  roleCounts: Record<string, number>;
  skills: Record<string, { families: number; members: number; roles: Record<string, number> }>;
  authorityManifests: Array<{ microSkillKey: string; authorityKey: string; path: string; sha256: string; families: number; members: number }>;
  semanticNote: string;
  operationalEffects: Record<string, boolean>;
};

type LoadedPackage = {
  manifest: Manifest;
  authorities: Array<{ descriptor: Manifest["authorityManifests"][number]; manifest: Record<string, any>; rawSha256: string }>;
  audit: Record<string, any>;
};

type DictionaryBinding = {
  wordId: string;
  sentenceId: string;
  dictationSentence: string;
  dictationTargetTokenIndex: number;
  audioText: string;
};

type Snapshot = Record<string, { count: number; sha256: string }>;

const PROTECTED_TABLES = [
  "public.adle_learning_items",
  "public.daily_assignments",
  "public.assignment_items",
  "public.adle_canonical_intake_candidates",
  "public.adle_curriculum_release_manifests",
  "public.adle_curriculum_release_dependencies",
  "public.adle_route_activation_revisions",
  "public.adle_route_activation_heads",
  "public.adle_assignment_attempt_events",
  "public.adle_taught_word_history",
  "public.adle_review_schedule_words",
  "public.adle_review_schedule_word_routes",
  "public.adle_review_outcome_events",
] as const;

function fail(message: string): never {
  throw new Error(message);
}

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

export function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function assertMergedMain(): string {
  const head = git("rev-parse", "HEAD");
  const main = git("rev-parse", "origin/main");
  if (head !== main) fail(`Mutation requires exact authoritative origin/main; HEAD=${head}, origin/main=${main}.`);
  if (git("status", "--porcelain")) fail("Mutation requires a completely clean authoritative worktree.");
  return head;
}

function productionDatabaseUrl(): string {
  const value = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED
    ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION
    ?? process.env.SUPABASE_PRODUCTION_DB_URL;
  if (!value) fail("A governed Production database URL is required.");
  const parsed = new URL(value);
  if (!parsed.hostname.includes(PRODUCTION_PROJECT_REF) && !decodeURIComponent(parsed.username).includes(PRODUCTION_PROJECT_REF)) {
    fail("The database URL does not identify the governed Production project.");
  }
  return value;
}

function clientForProduction(): pg.Client {
  return new pg.Client({ connectionString: productionDatabaseUrl(), ssl: { rejectUnauthorized: false } });
}

function loadAudit(): Record<string, any> {
  const result = spawnSync("python3", [AUDITOR_PATH], { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) fail(`Base Word family-meaning audit failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function validateAuthorityShape(authority: any, descriptor: Manifest["authorityManifests"][number], manifest: Manifest): void {
  if (
    authority?.schemaVersion !== "base_word_family_authority_source_v1"
    || authority.authoritySchemaVersion !== "1"
    || authority.authorityKey !== descriptor.authorityKey
    || authority.microSkillKey !== descriptor.microSkillKey
    || authority.importBatchId !== manifest.importBatchId
    || !SUPPORTED_SKILLS.includes(authority.microSkillKey)
    || !Array.isArray(authority.approvalRefs)
    || canonical(authority.approvalRefs) !== canonical([...authority.approvalRefs].sort())
    || !Array.isArray(authority.families)
    || authority.families.length !== descriptor.families
    || authority.families.reduce((count: number, family: any) => count + (Array.isArray(family.members) ? family.members.length : 0), 0) !== descriptor.members
  ) fail(`Invalid family authority artifact ${descriptor.path}.`);
  for (const family of authority.families) {
    if (!family.familyId || !family.baseFamilyKey || !family.baseWordKey || !family.baseMeaning || !family.etymologyRoute || !Array.isArray(family.members)) {
      fail(`Incomplete family projection in ${descriptor.path}.`);
    }
    for (const member of family.members) {
      if (
        !member.memberId || !member.wordKey
        || !["authentic_target", "base", "transfer"].includes(member.memberRole)
        || typeof member.assignmentEligible !== "boolean"
        || !member.wordSum || !member.childFriendlyMeaning
        || !Array.isArray(member.morphologyParts) || member.morphologyParts.length === 0
        || !Array.isArray(member.morphologyJoins) || !Array.isArray(member.morphologyTransformations)
      ) fail(`Incomplete member projection in ${descriptor.path}.`);
    }
  }
}

export function loadAcceptedPackage(): LoadedPackage {
  const manifest = parseJson(MANIFEST_PATH) as Manifest;
  const { packageSha256, ...fingerprint } = manifest;
  if (
    manifest.schemaVersion !== "base_word_family_release_v1"
    || manifest.releaseId !== RELEASE_ID
    || manifest.packageType !== PACKAGE_TYPE
    || manifest.packageSchemaVersion !== PACKAGE_SCHEMA_VERSION
    || packageSha256 !== ACCEPTED_PACKAGE_SHA256
    || sha256(canonical(fingerprint)) !== packageSha256
    || manifest.sourceCommit !== SOURCE_COMMIT
    || manifest.predecessorImportBatchId !== PREDECESSOR_BATCH_ID
    || manifest.importBatchId !== IMPORT_BATCH_ID
    || canonical(manifest.requiredMigrationVersions) !== canonical([MIGRATION_VERSION])
    || manifest.requiredMigrations.length !== 1
    || manifest.requiredMigrations[0]?.version !== MIGRATION_VERSION
    || manifest.requiredMigrations[0]?.path !== "supabase/migrations/20260809160000_allow_base_word_family_release_ledger.sql"
    || sha256(readFileSync(MIGRATION_PATH)) !== manifest.requiredMigrations[0]?.sha256
    || manifest.rowCounts.baseWordFamilies !== 87
    || manifest.rowCounts.baseWordFamilyMembers !== 227
    || manifest.rowCounts.missingOrUnreviewedMeanings !== 0
    || manifest.roleCounts.authentic_target !== 119
    || manifest.roleCounts.base !== 87
    || manifest.roleCounts.transfer !== 21
    || manifest.authorityManifests.length !== 2
    || Object.values(manifest.operationalEffects).some(Boolean)
  ) fail("The accepted Base Word family package identity or invariant set has drifted.");
  for (const source of Object.values(manifest.sourceFiles)) {
    if (sha256(readFileSync(resolve(ROOT, source.path))) !== source.sha256) fail(`Reviewed source drift: ${source.path}.`);
  }
  const audit = loadAudit();
  if (
    audit.authoritativeSourceCommit !== manifest.sourceCommit
    || audit.review.meaningPairSha256 !== manifest.review.meaningPairSha256
    || audit.counts.missingOrUnreviewed !== 0
    || canonical(audit.counts.classifications) !== canonical(manifest.meaningClassCounts)
    || canonical(audit.counts.roles) !== canonical(manifest.roleCounts)
    || canonical(audit.counts.skills) !== canonical(manifest.skills)
  ) fail("The release manifest no longer equals the reviewed family-meaning audit.");
  const authorities = manifest.authorityManifests.map((descriptor) => {
    const path = resolve(RELEASE_DIR, descriptor.path);
    const raw = readFileSync(path);
    const rawSha256 = sha256(raw);
    if (rawSha256 !== descriptor.sha256) fail(`Authority file hash drift: ${descriptor.path}.`);
    const authority = JSON.parse(raw.toString("utf8"));
    validateAuthorityShape(authority, descriptor, manifest);
    return { descriptor, manifest: authority, rawSha256 };
  });
  const memberProjection = new Map<string, string>();
  for (const authority of authorities) {
    for (const family of authority.manifest.families) {
      for (const member of family.members) {
        const key = `${authority.descriptor.microSkillKey}|${family.baseFamilyKey}|${member.wordKey}`;
        memberProjection.set(key, member.childFriendlyMeaning);
      }
    }
  }
  if (memberProjection.size !== 227) fail("The two authority artifacts do not bind exactly 227 distinct family-member rows.");
  for (const member of audit.members) {
    const authority = authorities.find((entry) => entry.descriptor.microSkillKey === member.microSkillKey) ?? fail("Missing skill authority.");
    const family = authority.manifest.families.find((entry: any) => entry.baseFamilyKey === member.baseFamilyKey) ?? fail("Missing family authority row.");
    const row = family.members.find((entry: any) => entry.wordKey === member.wordKey) ?? fail("Missing member authority row.");
    if (
      row.memberRole !== member.memberRole
      || row.childFriendlyMeaning !== member.childFriendlyMeaning
      || canonical(row.morphologyParts) !== canonical(member.morphologyParts)
      || canonical(row.morphologyJoins) !== canonical(member.morphologyJoins)
      || canonical(row.morphologyTransformations) !== canonical(member.morphologyTransformations)
    ) fail(`Authority projection drift for ${member.wordKey}.`);
  }
  return { manifest, authorities, audit };
}

async function tableSnapshot(client: pg.Client, table: string): Promise<{ count: number; sha256: string }> {
  const result = await client.query<{ row: unknown }>(`select to_jsonb(row_value) as row from ${table} row_value`);
  const rows = result.rows.map((entry) => canonical(entry.row)).sort();
  return { count: rows.length, sha256: sha256(rows.join("\n")) };
}

async function protectedSnapshot(client: pg.Client): Promise<Snapshot> {
  const result: Snapshot = {};
  for (const table of PROTECTED_TABLES) result[table] = await tableSnapshot(client, table);
  return result;
}

async function oldBatchSnapshot(client: pg.Client): Promise<{ families: number; members: number; missing: number; sha256: string }> {
  const result = await client.query<{ row: unknown }>(
    `select to_jsonb(projected) as row from (
      select 'family' kind,f.id::text id,f.base_family_key key,f.micro_skill_key skill,f.base_word_id::text word_id,
        f.base_meaning meaning,f.etymology_route semantics,null::text role,null::text teaching_gloss
      from public.canonical_teaching_dictionary_base_word_families f where f.import_batch_id=$1
      union all
      select 'member',m.id::text,f.base_family_key,f.micro_skill_key,m.canonical_word_id::text,null,
        jsonb_build_object('wordSum',m.word_sum,'parts',m.morphology_parts,'joins',m.morphology_joins,
          'transformations',m.morphology_transformations,'transformationNotes',coalesce(m.transformation_notes,''),
          'assignmentEligible',m.assignment_eligible),m.member_role,m.child_friendly_meaning
      from public.canonical_teaching_dictionary_base_word_family_members m
      join public.canonical_teaching_dictionary_base_word_families f on f.id=m.base_word_family_id and f.import_batch_id=m.import_batch_id
      where m.import_batch_id=$1
    ) projected`,
    [PREDECESSOR_BATCH_ID],
  );
  const rows = result.rows.map((entry) => canonical(entry.row)).sort();
  const familyRows = result.rows.filter((entry: any) => entry.row.kind === "family");
  const memberRows = result.rows.filter((entry: any) => entry.row.kind === "member");
  return {
    families: familyRows.length,
    members: memberRows.length,
    missing: memberRows.filter((entry: any) => !entry.row.teaching_gloss?.trim()).length,
    sha256: sha256(rows.join("\n")),
  };
}

async function assertPredecessorMatchesReviewedSource(client: pg.Client, loaded: LoadedPackage): Promise<{ projectionSha256: string; roles: Record<string, number> }> {
  const familyRows = await client.query<any>(
    `select f.base_family_key,f.micro_skill_key,word.word_key base_word_key,f.base_meaning,f.etymology_route,
      f.row_status,f.review_status
     from public.canonical_teaching_dictionary_base_word_families f
     join public.canonical_teaching_dictionary_words word on word.id=f.base_word_id
     where f.import_batch_id=$1 order by f.base_family_key`, [PREDECESSOR_BATCH_ID],
  );
  const memberRows = await client.query<any>(
    `select f.base_family_key,f.micro_skill_key,word.word_key,m.member_role,m.word_sum,m.morphology_parts,m.morphology_joins,
      m.morphology_transformations,coalesce(m.transformation_notes,'') transformation_notes,m.assignment_eligible,
      m.row_status,m.review_status,m.child_friendly_meaning
     from public.canonical_teaching_dictionary_base_word_family_members m
     join public.canonical_teaching_dictionary_base_word_families f on f.id=m.base_word_family_id and f.import_batch_id=m.import_batch_id
     join public.canonical_teaching_dictionary_words word on word.id=m.canonical_word_id
     where m.import_batch_id=$1 order by f.base_family_key,word.word_key`, [PREDECESSOR_BATCH_ID],
  );
  if (familyRows.rowCount !== loaded.audit.families.length || memberRows.rowCount !== loaded.audit.members.length) fail("The predecessor batch population differs from reviewed source.");
  const familyByKey = new Map(familyRows.rows.map((row: any) => [row.base_family_key, row]));
  for (const source of loaded.audit.families) {
    const live = familyByKey.get(source.baseFamilyKey) ?? fail(`Predecessor family missing: ${source.baseFamilyKey}.`);
    if (
      live.micro_skill_key !== source.microSkillKey || live.base_word_key !== source.baseWordKey
      || live.base_meaning !== source.baseMeaning || canonical(live.etymology_route) !== canonical(source.etymologyRoute)
      || live.row_status !== "active" || live.review_status !== source.reviewStatus
    ) fail(`Predecessor family semantics drift: ${source.baseFamilyKey}.`);
  }
  const memberByKey = new Map(memberRows.rows.map((row: any) => [`${row.base_family_key}|${row.word_key}`, row]));
  const roles: Record<string, number> = {};
  for (const source of loaded.audit.members) {
    const key = `${source.baseFamilyKey}|${source.wordKey}`;
    const live = memberByKey.get(key) ?? fail(`Predecessor member missing: ${key}.`);
    if (
      live.micro_skill_key !== source.microSkillKey || live.member_role !== source.memberRole
      || live.word_sum !== source.wordSum || canonical(live.morphology_parts) !== canonical(source.morphologyParts)
      || canonical(live.morphology_joins) !== canonical(source.morphologyJoins)
      || canonical(live.morphology_transformations) !== canonical(source.morphologyTransformations)
      || live.transformation_notes !== source.transformationNotes || live.assignment_eligible !== source.assignmentEligible
      || live.row_status !== "active" || live.review_status !== source.reviewStatus || live.child_friendly_meaning !== null
    ) fail(`Predecessor member semantics drift beyond the audited missing gloss: ${key}.`);
    roles[live.member_role] = (roles[live.member_role] ?? 0) + 1;
  }
  if (canonical(roles) !== canonical(loaded.manifest.roleCounts)) fail("Predecessor role counts differ from the reviewed release.");
  const projection = {
    families: familyRows.rows.map((row: any) => ({ ...row })),
    members: memberRows.rows.map((row: any) => ({ ...row, child_friendly_meaning: null })),
  };
  return { projectionSha256: sha256(canonical(projection)), roles };
}

async function assertMigration(client: pg.Client): Promise<{
  present: boolean; constraint: string; triggers: string[];
  privileges: { roleMember: boolean; familyInsert: boolean; memberInsert: boolean; familyUpdate: boolean; memberUpdate: boolean; publisherExecute: boolean };
}> {
  const ledger = await client.query("select 1 from supabase_migrations.schema_migrations where version=$1", [MIGRATION_VERSION]);
  const constraint = await client.query<{ definition: string }>(
    `select pg_get_constraintdef(oid) definition from pg_constraint
     where conrelid='public.canonical_teaching_dictionary_import_batches'::regclass
       and conname='canonical_teaching_dictionary_import_batches_release_fields_check'`,
  );
  const triggers = await client.query<{ tgname: string }>(
    `select tgname from pg_trigger where not tgisinternal and tgname=any($1::text[]) order by tgname`,
    [["base_word_family_release_rows_immutable", "base_word_family_release_member_rows_immutable"]],
  );
  const privilege = await client.query<any>(
    `select pg_has_role(current_user,'teaching_dictionary_releaser','MEMBER') role_member,
      has_table_privilege('teaching_dictionary_releaser','public.canonical_teaching_dictionary_base_word_families','INSERT') family_insert,
      has_table_privilege('teaching_dictionary_releaser','public.canonical_teaching_dictionary_base_word_family_members','INSERT') member_insert,
      has_table_privilege('teaching_dictionary_releaser','public.canonical_teaching_dictionary_base_word_families','UPDATE') family_update,
      has_table_privilege('teaching_dictionary_releaser','public.canonical_teaching_dictionary_base_word_family_members','UPDATE') member_update,
      has_function_privilege(current_user,'public.publish_adle_base_word_family_membership_authority_v1(jsonb,text,text,text)','EXECUTE') publisher_execute`,
  );
  const row = privilege.rows[0];
  return {
    present: ledger.rowCount === 1,
    constraint: constraint.rows[0]?.definition ?? "",
    triggers: triggers.rows.map((entry) => entry.tgname),
    privileges: {
      roleMember: row.role_member, familyInsert: row.family_insert, memberInsert: row.member_insert,
      familyUpdate: row.family_update, memberUpdate: row.member_update, publisherExecute: row.publisher_execute,
    },
  };
}

function migrationReady(migration: Awaited<ReturnType<typeof assertMigration>>): boolean {
  return migration.present && migration.constraint.includes(PACKAGE_TYPE) && migration.triggers.length === 2
    && migration.privileges.roleMember && migration.privileges.familyInsert && migration.privileges.memberInsert
    && !migration.privileges.familyUpdate && !migration.privileges.memberUpdate && migration.privileges.publisherExecute;
}

async function liveBindings(client: pg.Client, loaded: LoadedPackage): Promise<Map<string, DictionaryBinding>> {
  const wordKeys: string[] = [...new Set<string>(loaded.audit.members.map((member: any) => String(member.wordKey)))].sort();
  const words = await client.query<any>(
    `select id,word_key,row_status,review_status from public.canonical_teaching_dictionary_words
     where word_key=any($1::text[])`, [wordKeys],
  );
  if (words.rowCount !== wordKeys.length) fail(`Expected ${wordKeys.length} exact canonical words; found ${words.rowCount}.`);
  const wordByKey = new Map(words.rows.map((row: any) => [row.word_key, row]));
  for (const key of wordKeys) {
    const row = wordByKey.get(key);
    if (!row || row.row_status !== "active" || row.review_status !== "approved_for_first_exposure") {
      fail(`Canonical word authority is not exact and approved for ${key}.`);
    }
  }
  const sentences = await client.query<any>(
    `select id,canonical_word_id,dictation_sentence,dictation_target_token_index,audio_text
     from public.canonical_teaching_dictionary_dictation_sentences
     where canonical_word_id=any($1::uuid[]) and row_status='active' and review_status='approved_for_first_exposure'`,
    [[...wordByKey.values()].map((row: any) => row.id)],
  );
  if (sentences.rowCount !== wordKeys.length) fail(`Expected ${wordKeys.length} exact active dictation rows; found ${sentences.rowCount}.`);
  const sentenceByWord = new Map(sentences.rows.map((row: any) => [row.canonical_word_id, row]));
  const bindings = new Map<string, DictionaryBinding>();
  for (const member of loaded.audit.members) {
    const word = wordByKey.get(member.wordKey) ?? fail(`Missing canonical word ${member.wordKey}.`);
    const sentence = sentenceByWord.get(word.id) ?? fail(`Missing dictation for ${member.wordKey}.`);
    if (!sentence.dictation_sentence?.trim() || sentence.dictation_target_token_index < 0 || !sentence.audio_text?.trim()) {
      fail(`Incomplete shared Teaching Dictionary dictation binding for ${member.wordKey}.`);
    }
    bindings.set(member.wordKey, {
      wordId: word.id,
      sentenceId: sentence.id,
      dictationSentence: sentence.dictation_sentence,
      dictationTargetTokenIndex: sentence.dictation_target_token_index,
      audioText: sentence.audio_text,
    });
  }
  return bindings;
}

function materializeAuthority(
  source: Record<string, any>,
  bindings: Map<string, DictionaryBinding>,
): Record<string, any> {
  const families = source.families.map((family: any) => ({
    familyId: family.familyId,
    baseFamilyKey: family.baseFamilyKey,
    baseWordId: bindings.get(family.baseWordKey)?.wordId ?? fail(`Missing base-word binding for ${family.baseWordKey}.`),
    baseMeaning: family.baseMeaning,
    etymologyRoute: family.etymologyRoute,
    members: family.members.map((member: any) => ({
      memberId: member.memberId,
      canonicalWordId: bindings.get(member.wordKey)?.wordId ?? fail(`Missing member binding for ${member.wordKey}.`),
      memberRole: member.memberRole,
      assignmentEligible: member.assignmentEligible,
      complexityLevel: member.complexityLevel,
      wordSum: member.wordSum,
      morphologyParts: member.morphologyParts,
      morphologyJoins: member.morphologyJoins,
      morphologyTransformations: member.morphologyTransformations,
      transformationNotes: member.transformationNotes,
      childFriendlyMeaning: member.childFriendlyMeaning,
    })).sort((left: any, right: any) => left.canonicalWordId.localeCompare(right.canonicalWordId) || left.memberId.localeCompare(right.memberId)),
  })).sort((left: any, right: any) => left.baseFamilyKey.localeCompare(right.baseFamilyKey) || left.familyId.localeCompare(right.familyId));
  return {
    schemaVersion: source.authoritySchemaVersion,
    authorityKey: source.authorityKey,
    microSkillKey: source.microSkillKey,
    importBatchId: source.importBatchId,
    approvalRefs: source.approvalRefs,
    families,
  };
}

async function releaseRowsSnapshot(client: pg.Client): Promise<{ families: number; members: number; missing: number; roles: Record<string, number> }> {
  const result = await client.query<any>(
    `with counts as (
       select count(distinct f.id)::int families,count(m.id)::int members,
         count(*) filter(where nullif(btrim(m.child_friendly_meaning),'') is null)::int missing
       from public.canonical_teaching_dictionary_base_word_families f
       join public.canonical_teaching_dictionary_base_word_family_members m
         on m.base_word_family_id=f.id and m.import_batch_id=f.import_batch_id
       where f.import_batch_id=$1
     ), roles as (
       select coalesce(jsonb_object_agg(member_role,member_count order by member_role),'{}'::jsonb) value
       from (select member_role,count(*)::int member_count
         from public.canonical_teaching_dictionary_base_word_family_members
         where import_batch_id=$1 group by member_role) grouped
     ) select counts.*,roles.value roles from counts cross join roles`,
    [IMPORT_BATCH_ID],
  );
  return result.rows[0] ?? { families: 0, members: 0, missing: 0, roles: {} };
}

async function existingRelease(
  client: pg.Client,
  loaded: LoadedPackage,
  bindings: Map<string, DictionaryBinding>,
): Promise<null | { batch: any; authorities: any[] }> {
  const batch = await client.query<any>(
    `select * from public.canonical_teaching_dictionary_import_batches
     where id=$1 or release_id=$2 or package_sha256=$3`,
    [IMPORT_BATCH_ID, RELEASE_ID, loaded.manifest.packageSha256],
  );
  if (batch.rowCount === 0) return null;
  if (batch.rowCount !== 1) fail("Conflicting Base Word family release-ledger identities exist.");
  const row = batch.rows[0];
  if (
    row.id !== IMPORT_BATCH_ID || row.release_id !== RELEASE_ID || row.package_type !== PACKAGE_TYPE
    || row.package_schema_version !== PACKAGE_SCHEMA_VERSION || row.package_sha256 !== ACCEPTED_PACKAGE_SHA256
    || row.workbook_sha256 !== loaded.manifest.workbookSha256 || row.target_environment !== "production"
    || row.importer_version !== IMPORTER_VERSION || row.batch_status !== "applied" || !row.verified_at
  ) fail("Existing Base Word family release receipt has a conflicting identity or incomplete state.");
  const authorities = await client.query<any>(
    `select id,authority_key,manifest_file_sha256,authority_manifest,semantic_fingerprint,source_classification
     from public.adle_curriculum_dependency_authorities where authority_type='family_membership' and authority_key=any($1::text[]) order by authority_key`,
    [loaded.authorities.map((entry) => entry.descriptor.authorityKey)],
  );
  if (authorities.rowCount !== 2) fail("The applied family release lacks its two immutable family authorities.");
  for (const expected of loaded.authorities) {
    const actual = authorities.rows.find((row: any) => row.authority_key === expected.descriptor.authorityKey);
    const materialized = materializeAuthority(expected.manifest, bindings);
    if (!actual || actual.manifest_file_sha256 !== expected.rawSha256 || canonical(actual.authority_manifest) !== canonical(materialized) || actual.source_classification !== "release_ledger") {
      fail(`Applied family authority drift: ${expected.descriptor.authorityKey}.`);
    }
  }
  return { batch: row, authorities: authorities.rows };
}

async function collectPlan(client: pg.Client, loaded: LoadedPackage): Promise<any> {
  const migration = await assertMigration(client);
  const oldBatch = await oldBatchSnapshot(client);
  if (oldBatch.families !== 87 || oldBatch.members !== 227 || oldBatch.missing !== 227) {
    fail(`The immutable predecessor batch no longer has the audited 87/227/227-missing state: ${canonical(oldBatch)}.`);
  }
  const predecessorProjection = await assertPredecessorMatchesReviewedSource(client, loaded);
  const bindings = await liveBindings(client, loaded);
  const protectedState = await protectedSnapshot(client);
  const routeState = {
    releases: Number((await client.query(`select count(*)::int count from public.adle_curriculum_release_manifests where route_id='base_word_lab'`)).rows[0].count),
    activationRevisions: Number((await client.query(`select count(*)::int count from public.adle_route_activation_revisions where route_id='base_word_lab'`)).rows[0].count),
    activationHeads: Number((await client.query(`select count(*)::int count from public.adle_route_activation_heads where route_id='base_word_lab'`)).rows[0].count),
  };
  if (routeState.releases || routeState.activationRevisions || routeState.activationHeads) fail("Base Word is no longer Production-dark; family publication is blocked.");
  const existing = await existingRelease(client, loaded, bindings);
  const familyAuthorityCount = Number((await client.query(
    `select count(*)::int count from public.adle_curriculum_dependency_authorities where authority_type='family_membership'`,
  )).rows[0].count);
  if (familyAuthorityCount !== (existing ? 2 : 0)) {
    fail(`Unexpected Production family-authority population: ${familyAuthorityCount}.`);
  }
  const rowState = existing ? await releaseRowsSnapshot(client) : null;
  if (existing && (
    rowState?.families !== 87 || rowState.members !== 227 || rowState.missing !== 0
    || canonical(rowState.roles) !== canonical(loaded.manifest.roleCounts)
  )) fail("Applied Base Word family release rows no longer equal the accepted package.");
  if (!existing) {
    const conflictingAuthorities = await client.query(
      `select 1 from public.adle_curriculum_dependency_authorities where authority_key=any($1::text[])`,
      [loaded.authorities.map((entry) => entry.descriptor.authorityKey)],
    );
    if (conflictingAuthorities.rowCount) fail("A family authority key already exists without the exact release receipt.");
  }
  const planWithoutHash = {
    status: existing ? "already_applied" : "ready",
    environment: "production",
    projectRef: PRODUCTION_PROJECT_REF,
    releaseId: RELEASE_ID,
    packageSha256: loaded.manifest.packageSha256,
    importBatchId: IMPORT_BATCH_ID,
    sourceCommit: loaded.manifest.sourceCommit,
    migration,
    oldBatch,
    predecessorProjection,
    plannedRows: loaded.manifest.rowCounts,
    roleCounts: loaded.manifest.roleCounts,
    skillCounts: loaded.manifest.skills,
    routeState,
    familyAuthorityCount,
    protectedState,
    existingAuthorityIds: existing?.authorities.map((row) => row.id).sort() ?? [],
    mutationPerformed: false,
  };
  return { ...planWithoutHash, planSha256: sha256(canonical(planWithoutHash)) };
}

function sourceMetadata(source: any, loaded: LoadedPackage, csvFile: string): Record<string, unknown> {
  return {
    csv_file: csvFile,
    source_row_number: source.sourceRowNumber,
    row_source: {
      source_category: source.sourceCategory,
      source_name: source.sourceName,
      source_url: source.sourceUrl,
      source_licence: source.sourceLicence,
      source_use_note: source.sourceUseNote,
    },
    release_id: RELEASE_ID,
    authoritative_source_commit: loaded.manifest.sourceCommit,
    meaning_pair_sha256: loaded.manifest.review.meaningPairSha256,
    meaning_provenance: source.meaningProvenance ?? null,
    semantic_note: loaded.manifest.semanticNote,
  };
}

async function insertReleaseRows(client: pg.Client, loaded: LoadedPackage, bindings: Map<string, DictionaryBinding>): Promise<void> {
  const familyByKey = new Map<string, any>();
  for (const authority of loaded.authorities) for (const family of authority.manifest.families) familyByKey.set(family.baseFamilyKey, family);
  const families = loaded.audit.families.map((source: any) => {
    const family = familyByKey.get(source.baseFamilyKey) ?? fail(`Missing authority family ${source.baseFamilyKey}.`);
    return {
      id: family.familyId, import_batch_id: IMPORT_BATCH_ID, base_family_key: source.baseFamilyKey,
      micro_skill_key: source.microSkillKey,
      base_word_id: bindings.get(source.baseWordKey)?.wordId ?? fail(`Missing base-word binding for ${source.baseWordKey}.`),
      base_meaning: source.baseMeaning,
      etymology_route: source.etymologyRoute, row_status: "active", source_sheet: "base_word_families.csv",
      source_row_number: source.sourceRowNumber, source_row_hash: source.sourceRowSha256, source_metadata: sourceMetadata(source, loaded, "base_word_families.csv"),
      source_category: source.sourceCategory, source_name: source.sourceName || null, source_url: source.sourceUrl || null,
      source_licence: source.sourceLicence || null, source_use_note: source.sourceUseNote || null, confidence: source.confidence,
      review_status: source.reviewStatus, reviewed_by: source.reviewedBy || null, reviewed_at: source.reviewedAt || null,
    };
  });
  const members = loaded.audit.members.map((source: any) => {
    const authority = loaded.authorities.find((entry) => entry.descriptor.microSkillKey === source.microSkillKey) ?? fail("Missing authority.");
    const family = authority.manifest.families.find((entry: any) => entry.baseFamilyKey === source.baseFamilyKey) ?? fail("Missing family.");
    const member = family.members.find((entry: any) => entry.wordKey === source.wordKey) ?? fail("Missing member.");
    const binding = bindings.get(source.wordKey) ?? fail(`Missing dictionary binding for ${source.wordKey}.`);
    return {
      id: member.memberId, import_batch_id: IMPORT_BATCH_ID, base_word_family_id: family.familyId, canonical_word_id: binding.wordId,
      member_role: source.memberRole, word_sum: source.wordSum, morphology_parts: source.morphologyParts,
      morphology_joins: source.morphologyJoins, morphology_transformations: source.morphologyTransformations,
      transformation_notes: source.transformationNotes || null, child_friendly_meaning: source.childFriendlyMeaning,
      dictation_sentence_id: binding.sentenceId, dictation_sentence: binding.dictationSentence,
      dictation_target_token_index: binding.dictationTargetTokenIndex, audio_text: binding.audioText,
      assignment_eligible: source.assignmentEligible, row_status: "active", source_sheet: "base_word_family_members.csv",
      source_row_number: source.sourceRowNumber, source_row_hash: source.sourceRowSha256, source_metadata: sourceMetadata(source, loaded, "base_word_family_members.csv"),
      source_category: source.sourceCategory, source_name: source.sourceName || null, source_url: source.sourceUrl || null,
      source_licence: source.sourceLicence || null, source_use_note: source.sourceUseNote || null, confidence: source.confidence,
      review_status: source.reviewStatus, reviewed_by: source.reviewedBy || null, reviewed_at: source.reviewedAt || null,
    };
  });
  await client.query(
    `insert into public.canonical_teaching_dictionary_base_word_families(
      id,import_batch_id,base_family_key,micro_skill_key,base_word_id,base_meaning,etymology_route,row_status,
      source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,source_licence,
      source_use_note,confidence,review_status,reviewed_by,reviewed_at)
    select id,import_batch_id,base_family_key,micro_skill_key,base_word_id,base_meaning,etymology_route,row_status,
      source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,source_licence,
      source_use_note,confidence,review_status,reviewed_by,reviewed_at
    from jsonb_to_recordset($1::jsonb) as row_value(
      id uuid,import_batch_id uuid,base_family_key text,micro_skill_key text,base_word_id uuid,base_meaning text,etymology_route jsonb,row_status text,
      source_sheet text,source_row_number integer,source_row_hash text,source_metadata jsonb,source_category text,source_name text,source_url text,source_licence text,
      source_use_note text,confidence text,review_status text,reviewed_by text,reviewed_at timestamptz)`,
    [families],
  );
  await client.query(
    `insert into public.canonical_teaching_dictionary_base_word_family_members(
      id,import_batch_id,base_word_family_id,canonical_word_id,member_role,word_sum,morphology_parts,morphology_joins,
      morphology_transformations,transformation_notes,child_friendly_meaning,dictation_sentence_id,dictation_sentence,
      dictation_target_token_index,audio_text,assignment_eligible,row_status,source_sheet,source_row_number,source_row_hash,
      source_metadata,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
    select id,import_batch_id,base_word_family_id,canonical_word_id,member_role,word_sum,morphology_parts,morphology_joins,
      morphology_transformations,transformation_notes,child_friendly_meaning,dictation_sentence_id,dictation_sentence,
      dictation_target_token_index,audio_text,assignment_eligible,row_status,source_sheet,source_row_number,source_row_hash,
      source_metadata,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at
    from jsonb_to_recordset($1::jsonb) as row_value(
      id uuid,import_batch_id uuid,base_word_family_id uuid,canonical_word_id uuid,member_role text,word_sum text,morphology_parts jsonb,morphology_joins jsonb,
      morphology_transformations jsonb,transformation_notes text,child_friendly_meaning text,dictation_sentence_id uuid,dictation_sentence text,
      dictation_target_token_index integer,audio_text text,assignment_eligible boolean,row_status text,source_sheet text,source_row_number integer,source_row_hash text,
      source_metadata jsonb,source_category text,source_name text,source_url text,source_licence text,source_use_note text,confidence text,review_status text,reviewed_by text,reviewed_at timestamptz)`,
    [members],
  );
}

async function migrateCommand(): Promise<any> {
  const mainSha = assertMergedMain();
  const migrationSql = readFileSync(MIGRATION_PATH, "utf8");
  const migrationSha256 = sha256(migrationSql);
  const confirmation = `apply:${MIGRATION_VERSION}:${migrationSha256.slice(0, 16)}:production`;
  if (arg("--confirm") !== confirmation) fail(`Exact confirmation required: ${confirmation}`);
  const client = clientForProduction(); await client.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK]);
    const current = await assertMigration(client);
    if (current.present) {
      if (!migrationReady(current)) fail("Applied migration receipt exists but its live contract is incomplete.");
      await client.query("rollback");
      return { status: "already_applied", version: MIGRATION_VERSION, migrationSha256, mainSha, live: current };
    }
    const body = migrationSql.replace(/^([\s\S]*?\n)?begin;\s*/i, (match) => match.replace(/begin;\s*$/i, "")).replace(/\s*commit;\s*$/i, "\n");
    await client.query(body);
    await client.query(
      "insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2::text[],$3)",
      [MIGRATION_VERSION, [migrationSql], "allow_base_word_family_release_ledger"],
    );
    const live = await assertMigration(client);
    if (!migrationReady(live)) fail("Migration did not establish the reviewed live contract.");
    await client.query("commit");
    return { status: "applied", version: MIGRATION_VERSION, migrationSha256, mainSha, live };
  } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
  finally { await client.end(); }
}

async function planCommand(loaded: LoadedPackage): Promise<any> {
  const client = clientForProduction(); await client.connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const plan = await collectPlan(client, loaded);
    await client.query("rollback");
    return plan;
  } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
  finally { await client.end(); }
}

async function releaseCommand(loaded: LoadedPackage): Promise<any> {
  const mainSha = assertMergedMain();
  if (arg("--confirm") !== RELEASE_CONFIRMATION) fail(`Exact confirmation required: ${RELEASE_CONFIRMATION}`);
  const expectedPlanSha = arg("--confirm-plan-sha256") ?? fail("--confirm-plan-sha256 from an immediately preceding read-only plan is required.");
  const client = clientForProduction(); await client.connect();
  try {
    await client.query("begin transaction isolation level serializable");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK]);
    const plan = await collectPlan(client, loaded);
    if (!migrationReady(plan.migration)) fail("The reviewed release migration is not established.");
    if (plan.planSha256 !== expectedPlanSha) fail("Production plan SHA changed; re-run and review the read-only plan.");
    if (plan.status === "already_applied") {
      await client.query("rollback");
      return { status: "already_applied", releaseId: RELEASE_ID, importBatchId: IMPORT_BATCH_ID, packageSha256: ACCEPTED_PACKAGE_SHA256, planSha256: plan.planSha256, mutationPerformed: false };
    }
    const bindings = await liveBindings(client, loaded);
    await client.query(`set local role ${RELEASE_ROLE}`);
    await client.query(
      `insert into public.canonical_teaching_dictionary_import_batches(
        id,source_folder_path,source_folder_sha256,source_commit,validator_version,validation_summary,row_counts,
        readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at,release_id,package_type,
        package_schema_version,workbook_sha256,package_sha256,target_environment,importer_version,verification_summary)
       values($1,$2,$3,$4,$5,$6,$7,$8,'production_release','validated',$9,$10,now(),$11,$12,$13,$14,$15,'production',$16,'{}'::jsonb)`,
      [IMPORT_BATCH_ID, RELEASE_RELATIVE, ACCEPTED_PACKAGE_SHA256, SOURCE_COMMIT, IMPORTER_VERSION,
        { errors: 0, warnings: 0, package_schema: loaded.manifest.schemaVersion }, loaded.manifest.rowCounts,
        { family_membership_ready: true, route_release_created: false, activation_created: false, learner_writes: 0 },
        { releaseManifest: loaded.manifest, protectedBefore: plan.protectedState, predecessorBatch: plan.oldBatch, planSha256: plan.planSha256, publicationMainSha: mainSha, restrictedRole: RELEASE_ROLE },
        loaded.manifest.review.approvedBy, RELEASE_ID, PACKAGE_TYPE, PACKAGE_SCHEMA_VERSION, loaded.manifest.workbookSha256,
        ACCEPTED_PACKAGE_SHA256, IMPORTER_VERSION],
    );
    await insertReleaseRows(client, loaded, bindings);
    await client.query("reset role");
    const rows = await releaseRowsSnapshot(client);
    if (rows.families !== 87 || rows.members !== 227 || rows.missing !== 0 || canonical(rows.roles) !== canonical(loaded.manifest.roleCounts)) {
      fail(`Inserted release projection failed verification: ${canonical(rows)}.`);
    }
    await client.query(`set local role ${RELEASE_ROLE}`);
    await client.query(
      `update public.canonical_teaching_dictionary_import_batches set batch_status='applied',verified_at=now(),updated_at=now(),
       verification_summary=$2 where id=$1 and batch_status='validated'`,
      [IMPORT_BATCH_ID, { status: "family_rows_verified", ...rows, packageSha256: ACCEPTED_PACKAGE_SHA256 }],
    );
    await client.query("reset role");
    const authorityReceipts = [];
    for (const authority of loaded.authorities) {
      const publishedManifest = materializeAuthority(authority.manifest, bindings);
      const published = await client.query<{ id: string }>(
        `select public.publish_adle_base_word_family_membership_authority_v1($1::jsonb,$2,'release_ledger',$3) id`,
        [publishedManifest, authority.rawSha256, loaded.manifest.review.approvedBy],
      );
      authorityReceipts.push({ authorityKey: authority.descriptor.authorityKey, authorityId: published.rows[0]?.id, manifestFileSha256: authority.rawSha256 });
    }
    await client.query(`set local role ${RELEASE_ROLE}`);
    await client.query(
      `update public.canonical_teaching_dictionary_import_batches set verification_summary=verification_summary || $2::jsonb,updated_at=now()
       where id=$1 and batch_status='applied'`,
      [IMPORT_BATCH_ID, { status: "applied_and_authorities_published", authorityReceipts }],
    );
    await client.query("reset role");
    const oldAfter = await oldBatchSnapshot(client);
    if (canonical(oldAfter) !== canonical(plan.oldBatch)) fail("The immutable predecessor batch changed during publication.");
    const protectedAfter = await protectedSnapshot(client);
    if (canonical(protectedAfter) !== canonical(plan.protectedState)) fail("A protected learner, assignment, route-release, or activation table changed during family publication.");
    const exact = await existingRelease(client, loaded, bindings);
    if (!exact) fail("The exact published release could not be re-read before commit.");
    await client.query("commit");
    return { status: "published", environment: "production", releaseId: RELEASE_ID, importBatchId: IMPORT_BATCH_ID, packageSha256: ACCEPTED_PACKAGE_SHA256, planSha256: plan.planSha256, authorityReceipts, oldBatch: oldAfter, protectedState: protectedAfter, mainSha };
  } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
  finally { await client.end(); }
}

async function verifyCommand(loaded: LoadedPackage): Promise<any> {
  const client = clientForProduction(); await client.connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const plan = await collectPlan(client, loaded);
    if (plan.status !== "already_applied") fail("The governed Base Word family release is not applied.");
    await client.query("rollback");
    return { status: "verified", environment: "production", releaseId: RELEASE_ID, importBatchId: IMPORT_BATCH_ID, packageSha256: ACCEPTED_PACKAGE_SHA256, planSha256: plan.planSha256, oldBatch: plan.oldBatch, roleCounts: plan.roleCounts, skillCounts: plan.skillCounts, routeState: plan.routeState, protectedState: plan.protectedState, authorityIds: plan.existingAuthorityIds, mutationPerformed: false };
  } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
  finally { await client.end(); }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "validate";
  const loaded = loadAcceptedPackage();
  if (command === "validate") {
    console.log(JSON.stringify({ status: "valid", releaseId: RELEASE_ID, packageSha256: ACCEPTED_PACKAGE_SHA256, importBatchId: IMPORT_BATCH_ID, rowCounts: loaded.manifest.rowCounts, meaningClassCounts: loaded.manifest.meaningClassCounts, roleCounts: loaded.manifest.roleCounts, skills: loaded.manifest.skills }, null, 2));
    return;
  }
  if (command === "migrate") { console.log(JSON.stringify(await migrateCommand(), null, 2)); return; }
  if (command === "plan") { console.log(JSON.stringify(await planCommand(loaded), null, 2)); return; }
  if (command === "release") { console.log(JSON.stringify(await releaseCommand(loaded), null, 2)); return; }
  if (command === "verify") { console.log(JSON.stringify(await verifyCommand(loaded), null, 2)); return; }
  fail(`Unknown command ${command}; expected validate, migrate, plan, release, or verify.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(ROOT, "scripts/adle-base-word-family-meaning-production-release.ts")) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
