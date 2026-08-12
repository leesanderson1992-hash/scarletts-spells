#!/usr/bin/env node
/* Governed, Production-dark publication of the reviewed Compound reading correction. */
/* eslint-disable @typescript-eslint/no-explicit-any -- repository artifacts and database rows are validated at runtime */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

import {
  fingerprintAdleCurriculumReleaseManifest,
  validateAdleCurriculumReleaseManifestV2,
} from "../lib/adle/curriculum-release-authority";
import { resolveSeparatedHyphenatedReadingIntroductionV2 } from "../lib/adle/morphology/compound-word-reading-release-v2";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const DIR = resolve(ROOT, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-12-compound-word-separated-hyphenated-reading-pages-v2");
const APPROVAL_PATH = resolve(ROOT, "data/adle/review/d4-mor/v2/compound-word-separated-hyphenated-reading-pages-approval.json");
const MIGRATION = "20260812120000_publish_compound_reading_content_correction.sql";
const PROJECT_REF = "wwohrqtunajrbwxyssjf";
const SKILL = "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED";
const OLD_AUTHORITY_ID = "120595ba-98e6-4b2c-b11e-fb23edc98be1";
const OLD_RELEASE_ID = "8bcae678-a1d2-4572-a1e9-9aacb378cf9f";
const OLD_AUTHORITY_FINGERPRINT = "cb297b8e765d4303662e2a37a6f7353e5a347a87fda6863ad18ee3c0f769147e";
const OLD_RELEASE_SHA = "d94bffc2ab613d2a40b7522e1349978416f3152c0919bf98885a1492df62edea";
const PUBLISHED_BY = "Katie Sanderson / Codex governed Separated-Hyphenated teaching correction";
const LOCK_KEY = "compound_word_separated_hyphenated_reading_pages_2026_08_12";
const MIGRATE_CONFIRMATION = "migrate:compound-reading-content-correction:production";
const PUBLISH_CONFIRMATION = "publish:compound-reading-content-correction:production-dark";

function fail(message: string): never { throw new Error(message); }
function sha(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function fileSha(path: string): string { return sha(readFileSync(path)); }
function json(path: string): any { return JSON.parse(readFileSync(path, "utf8")); }
function canonical(value: any): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
}
function arg(flag: string): string | undefined { const index = process.argv.indexOf(flag); return index < 0 ? undefined : process.argv[index + 1]; }
function git(...args: string[]): string { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }
function assertMain(): string {
  const head = git("rev-parse", "HEAD");
  const main = git("rev-parse", "origin/main");
  if (head !== main) fail(`exact merged main required: ${head} != ${main}`);
  if (git("status", "--porcelain")) fail("clean worktree required");
  return head;
}
function databaseUrl(): string {
  const value = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION ?? process.env.SUPABASE_PRODUCTION_DB_URL;
  if (!value) fail("governed Production database URL required");
  const parsed = new URL(value);
  if (!parsed.hostname.includes(PROJECT_REF) && !decodeURIComponent(parsed.username).includes(PROJECT_REF)) fail("database is not Production");
  return value;
}
async function withClient<T>(callback: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await callback(client); } finally { await client.end(); }
}

function load() {
  const approval = json(APPROVAL_PATH);
  const teaching = json(resolve(DIR, "teaching-content-separated-hyphenated-reading-pages.json"));
  const release = json(resolve(DIR, "route-release-separated-hyphenated-reading-pages.json"));
  const packageManifest = json(resolve(DIR, "package-manifest.json"));
  const releaseValidation = validateAdleCurriculumReleaseManifestV2(release);
  if (!releaseValidation.valid) fail(releaseValidation.errors.join(","));
  const introduction = resolveSeparatedHyphenatedReadingIntroductionV2(teaching);
  if (!introduction || introduction.readingPages?.length !== 3) fail("teaching authority cannot resolve the exact three reading pages");
  if (
    approval.micro_skill_key !== SKILL || approval.approval_status !== "approved" ||
    approval.source_commit !== "edce0c69ad1f0171e749ddbc72a7c91b4f999aca" ||
    approval.pages?.length !== 3 || approval.pages.some((page: any, index: number) =>
      page.page_ordinal !== index + 1 || page.approval_status !== "approved" ||
      canonical(page.page_content) !== canonical(introduction.readingPages?.[index])) ||
    fileSha(APPROVAL_PATH) !== packageManifest.approvalArtifactSha256 ||
    fileSha(resolve(ROOT, packageManifest.sourceFile)) !== packageManifest.sourceFileSha256
  ) fail("approval/source binding mismatch");
  const fingerprints = fingerprintAdleCurriculumReleaseManifest(release);
  if (canonical(fingerprints) !== canonical(packageManifest.releaseFingerprints)) fail("release fingerprints drifted");
  return { approval, teaching, release, packageManifest, introduction, fingerprints };
}

async function protectedSnapshot(client: pg.Client): Promise<any> {
  const [oldAuthority, oldRelease, activation, assignments, learningItems, closed] = await Promise.all([
    client.query(`select id,semantic_fingerprint,authority_manifest_sha256 from public.adle_curriculum_dependency_authorities where id=$1`, [OLD_AUTHORITY_ID]),
    client.query(`select id,release_manifest_sha256,dependency_fingerprint from public.adle_curriculum_release_manifests where id=$1`, [OLD_RELEASE_ID]),
    client.query(`select
      (select count(*)::int from public.adle_route_activation_revisions revision join public.adle_curriculum_release_manifests release on release.id=revision.release_manifest_id where release.route_id='compound_word_lab') revisions,
      (select count(*)::int from public.adle_route_activation_heads where route_id='compound_word_lab' and route_version='v2') heads`),
    client.query(`select count(*)::int count from public.daily_assignments where lesson_route_metadata#>>'{canonicalRoute,routeId}'='compound_word_lab' and lesson_route_metadata#>>'{canonicalRoute,routeVersion}'='v2'`),
    client.query(`select item.id,word.display_word,item.micro_skill_key,item.source_kind,item.source_ref,item.item_status,item.row_status from public.adle_learning_items item join public.canonical_teaching_dictionary_words word on word.id=item.canonical_word_id where item.micro_skill_key like 'D4_MOR_COMPOUND_WORDS_%' order by item.id`),
    client.query(`select release.id release_id,release.release_manifest_sha256,authority.id authority_id,authority.semantic_fingerprint from public.adle_curriculum_release_manifests release join public.adle_curriculum_release_dependencies dependency on dependency.release_manifest_id=release.id and dependency.authority_type='teaching_content' join public.adle_curriculum_dependency_authorities authority on authority.id=dependency.authority_id where dependency.micro_skill_key='D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS' order by release.published_at`),
  ]);
  if (oldAuthority.rowCount !== 1 || oldAuthority.rows[0].semantic_fingerprint !== OLD_AUTHORITY_FINGERPRINT) fail("historical teaching authority drifted");
  if (oldRelease.rowCount !== 1 || oldRelease.rows[0].release_manifest_sha256 !== OLD_RELEASE_SHA) fail("historical route release drifted");
  return {
    oldAuthority: oldAuthority.rows[0], oldRelease: oldRelease.rows[0],
    activation: activation.rows[0], assignments: assignments.rows[0],
    learningItems: learningItems.rows, closed: closed.rows,
  };
}

async function collectPlan(client: pg.Client, accepted = load()): Promise<any> {
  const ledger = await client.query(`select version from supabase_migrations.schema_migrations where version=$1`, [MIGRATION.slice(0, 14)]);
  if (ledger.rowCount !== 1) fail("reading-content correction migration is not applied");
  const protectedState = await protectedSnapshot(client);
  if (protectedState.activation.revisions !== 0 || protectedState.activation.heads !== 0 || protectedState.assignments.count !== 0) fail("Compound route is not Production-dark");
  const authority = await client.query(`select id,semantic_fingerprint,manifest_file_sha256 from public.adle_curriculum_dependency_authorities where authority_key=$1`, [accepted.teaching.authorityKey]);
  const release = await client.query(`select id,release_manifest_sha256,dependency_fingerprint from public.adle_curriculum_release_manifests where release_key=$1`, [accepted.release.releaseKey]);
  if (![0, 1].includes(authority.rowCount ?? -1) || ![0, 1].includes(release.rowCount ?? -1) || authority.rowCount !== release.rowCount) fail("partial correction authority exists");
  if (authority.rowCount && (authority.rows[0].semantic_fingerprint !== accepted.release.microSkills[0].dependencies.find((dependency: any) => dependency.authorityType === "teaching_content")?.semanticFingerprint || authority.rows[0].manifest_file_sha256 !== accepted.packageManifest.teachingContentManifestSha256)) fail("existing correction authority differs");
  if (release.rowCount && (release.rows[0].release_manifest_sha256 !== accepted.fingerprints.releaseManifestSha256 || release.rows[0].dependency_fingerprint !== accepted.fingerprints.dependencyFingerprint)) fail("existing correction release differs");
  const projection = {
    status: release.rowCount ? "already_published" : "ready",
    authorityId: authority.rows[0]?.id ?? null,
    releaseId: release.rows[0]?.id ?? null,
    protectedState,
    fingerprints: accepted.fingerprints,
    migrationVersion: MIGRATION.slice(0, 14),
  };
  return { ...projection, planSha256: sha(canonical(projection)) };
}

async function migrate(): Promise<any> {
  const mainSha = assertMain();
  if (arg("--confirm") !== MIGRATE_CONFIRMATION) fail(`exact confirmation required: ${MIGRATE_CONFIRMATION}`);
  return withClient(async (client) => {
    const version = MIGRATION.slice(0, 14);
    const path = resolve(ROOT, "supabase/migrations", MIGRATION);
    const sql = readFileSync(path, "utf8");
    const before = await protectedSnapshot(client);
    const present = await client.query(`select 1 from supabase_migrations.schema_migrations where version=$1`, [version]);
    if (!present.rowCount) {
      await client.query(sql);
      await client.query(`insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])`, [version, MIGRATION.replace(`${version}_`, "").replace(/\.sql$/u, ""), [sql]]);
    }
    const after = await protectedSnapshot(client);
    if (canonical(after) !== canonical(before)) fail("migration changed protected authority/learner state");
    return { status: present.rowCount ? "already_applied" : "applied", mainSha, version, migrationSha256: fileSha(path) };
  });
}

async function publish(): Promise<any> {
  const mainSha = assertMain();
  if (arg("--confirm") !== PUBLISH_CONFIRMATION) fail(`exact confirmation required: ${PUBLISH_CONFIRMATION}`);
  const expectedPlan = arg("--confirm-plan-sha256") ?? fail("reviewed plan SHA required");
  const accepted = load();
  return withClient(async (client) => {
    await client.query("begin transaction isolation level serializable");
    try {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [LOCK_KEY]);
      const plan = await collectPlan(client, accepted);
      if (plan.planSha256 !== expectedPlan) fail("Production plan changed");
      if (plan.status === "already_published") { await client.query("rollback"); return { ...plan, mutationPerformed: false }; }
      const authorityFile = resolve(DIR, "teaching-content-separated-hyphenated-reading-pages.json");
      const releaseFile = resolve(DIR, "route-release-separated-hyphenated-reading-pages.json");
      const authority = await client.query(`select public.publish_adle_reviewed_teaching_content_authority_v1($1::jsonb,$2,$3::jsonb,$4,$5) id`, [accepted.teaching, fileSha(authorityFile), accepted.approval, fileSha(APPROVAL_PATH), PUBLISHED_BY]);
      const authorityReplay = await client.query(`select public.publish_adle_reviewed_teaching_content_authority_v1($1::jsonb,$2,$3::jsonb,$4,$5) id`, [accepted.teaching, fileSha(authorityFile), accepted.approval, fileSha(APPROVAL_PATH), PUBLISHED_BY]);
      const release = await client.query(`select public.publish_adle_curriculum_release_v2($1::jsonb,$2,$3) id`, [accepted.release, fileSha(releaseFile), PUBLISHED_BY]);
      const releaseReplay = await client.query(`select public.publish_adle_curriculum_release_v2($1::jsonb,$2,$3) id`, [accepted.release, fileSha(releaseFile), PUBLISHED_BY]);
      if (authority.rows[0]?.id !== authorityReplay.rows[0]?.id || release.rows[0]?.id !== releaseReplay.rows[0]?.id) fail("publication replay identities changed");
      const after = await protectedSnapshot(client);
      if (canonical(after) !== canonical(plan.protectedState)) fail("publication changed protected learner/activation state");
      await client.query("commit");
      return { status: "published", mainSha, authorityId: authority.rows[0].id, releaseId: release.rows[0].id, ...accepted.fingerprints, protectedState: after, mutationPerformed: true };
    } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
  });
}

async function verify(): Promise<any> {
  const accepted = load();
  return withClient(async (client) => {
    const plan = await collectPlan(client, accepted);
    if (plan.status !== "already_published" || !plan.releaseId || !plan.authorityId) fail("correction release is not published exactly");
    const dependencies = await client.query(`select dependency.authority_type,dependency.authority_id,dependency.authority_key,dependency.semantic_fingerprint from public.adle_curriculum_release_dependencies dependency where dependency.release_manifest_id=$1 order by case dependency.authority_type when 'compound_structure' then 1 when 'teaching_content' then 2 else 3 end`, [plan.releaseId]);
    if (dependencies.rowCount !== 3) fail("correction release dependency set is incomplete");
    const readiness = await client.query(`select item.id learning_item_id,word.display_word,item.source_kind,item.source_ref,public.adle_compound_word_release_is_intake_ready_v2($1,$2,$3,item.micro_skill_key,item.canonical_word_id,word.normalised_word) ready from public.adle_learning_items item join public.canonical_teaching_dictionary_words word on word.id=item.canonical_word_id where item.micro_skill_key=$4 order by word.display_word`, [plan.releaseId, accepted.fingerprints.releaseManifestSha256, accepted.fingerprints.dependencyFingerprint, SKILL]);
    const oldReady = await client.query(`select public.adle_compound_word_release_is_intake_ready_v2($1,release_manifest_sha256,dependency_fingerprint,$2,word.id,word.normalised_word) ready from public.adle_curriculum_release_manifests release cross join public.canonical_teaching_dictionary_words word where release.id=$1 and word.display_word='mother-in-law'`, [OLD_RELEASE_ID, SKILL]);
    if (readiness.rowCount !== 2 || readiness.rows.some((row) => row.ready !== true) || oldReady.rows[0]?.ready !== false) fail("current/historical release readiness is not exact");
    return { status: "verified", ...plan, dependencies: dependencies.rows, learnerReadiness: readiness.rows, historicalReleaseReady: false, readingPageCount: accepted.introduction.readingPages?.length, productionDark: true };
  });
}

async function main() {
  const command = process.argv[2] ?? "validate";
  if (command === "validate") {
    const accepted = load();
    console.log(JSON.stringify({ status: "valid", contentHash: accepted.packageManifest.contentHash, approvalArtifactSha256: accepted.packageManifest.approvalArtifactSha256, ...accepted.fingerprints, readingPageCount: accepted.introduction.readingPages?.length }, null, 2));
  } else if (command === "migrate") console.log(JSON.stringify(await migrate(), null, 2));
  else if (command === "plan") console.log(JSON.stringify(await withClient((client) => collectPlan(client)), null, 2));
  else if (command === "publish") console.log(JSON.stringify(await publish(), null, 2));
  else if (command === "verify") console.log(JSON.stringify(await verify(), null, 2));
  else fail("expected validate, migrate, plan, publish, or verify");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
