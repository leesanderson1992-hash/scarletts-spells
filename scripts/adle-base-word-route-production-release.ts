#!/usr/bin/env node
/* Governed BW-2B publication and operational activation for the immutable Base Word route release. */
/* eslint-disable @typescript-eslint/no-explicit-any -- reviewed JSON artifacts and PostgreSQL rows are validated at runtime */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

import {
  fingerprintAdleCurriculumReleaseManifest,
  teachingDictionaryClosureSemanticProjection,
  validateAdleCurriculumReleaseManifestV2,
  validateAdleTeachingDictionaryClosureManifestV1,
  type AdleCurriculumReleaseManifestV2,
  type AdleTeachingDictionaryClosureManifestV1,
} from "../lib/adle/curriculum-release-authority";

export const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
export const RELEASE_KEY = "adle_base_word_lab_v2_2026_08_10";
export const PACKAGE_SHA256 = "3cf19a6d14cb3873d4129a0fd099903969a2d839d0a4ccb7d2a67a3f27b5dac1";
export const FAMILY_BATCH_ID = "ddc8993b-26ca-57da-8383-1efec1be8ee1";
export const PROOF_CHILD_ID = "2498bb47-0b09-47c9-bfc1-18f95b52d35c";
export const NON_PROOF_CHILD_ID = "e4f9fc37-371d-4593-ad0d-bb16b586e818";
export const SKILLS = [
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
] as const;
export const PUBLISH_CONFIRMATION = `publish:${RELEASE_KEY}:${PACKAGE_SHA256.slice(0, 16)}:production-dark`;
export const ACTIVATE_CONFIRMATION = `activate:${RELEASE_KEY}:${PROOF_CHILD_ID}:allowlist:emergency-disabled`;
export const PAUSE_CONFIRMATION = `pause:${RELEASE_KEY}:production`;
export const REVOKE_CONFIRMATION = `safety-revoke:${RELEASE_KEY}:production:block-incomplete`;

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const RELEASE_DIR = resolve(ROOT, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-10-base-word-lab-v2");
const PUBLISHED_BY = "Katie Sanderson / Codex governed BW-2B";
const LOCK_KEY = "adle_base_word_lab_v2_2026_08_10";
const PROTECTED_TABLES = [
  "public.parent_verifications",
  "public.parent_verified_spelling_candidate_mappings",
  "public.adle_canonical_intake_candidates",
  "public.adle_learning_items",
  "public.adle_learning_item_sources",
  "public.daily_assignments",
  "public.assignment_items",
  "public.adle_assignment_attempt_events",
  "public.adle_taught_word_history",
  "public.adle_review_schedule_words",
  "public.adle_review_outcome_events",
] as const;

type PackageManifest = {
  schemaVersion: string;
  releaseKey: string;
  familyImportBatchId: string;
  sourceMainSha: string;
  approvalRefs: string[];
  sourceClassification: string;
  counts: Record<string, number>;
  sourceFiles: Record<string, { sha256: string }>;
  operationalEffects: Record<string, boolean>;
  packageSha256: string;
};

type AcceptedPackage = {
  manifest: PackageManifest;
  content: any[];
  contentProvenance: any[];
  closure: AdleTeachingDictionaryClosureManifestV1;
  bindings: any[];
  release: AdleCurriculumReleaseManifestV2;
  fileHashes: Record<string, string>;
};

function fail(message: string): never { throw new Error(message); }
function arg(flag: string): string | undefined { const index = process.argv.indexOf(flag); return index < 0 ? undefined : process.argv[index + 1]; }
function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
}
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function parse(path: string): any { return JSON.parse(readFileSync(resolve(RELEASE_DIR, path), "utf8")); }
function git(...args: string[]): string { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }

function assertMergedMain(): string {
  const head = git("rev-parse", "HEAD");
  const main = git("rev-parse", "origin/main");
  if (head !== main) fail(`Mutation requires exact origin/main: HEAD=${head}, origin/main=${main}.`);
  if (git("status", "--porcelain")) fail("Mutation requires a completely clean worktree.");
  return head;
}

function databaseUrl(): string {
  const value = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED
    ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION
    ?? process.env.SUPABASE_PRODUCTION_DB_URL;
  if (!value) fail("A governed Production database URL is required.");
  const parsed = new URL(value);
  if (!parsed.hostname.includes(PRODUCTION_PROJECT_REF) && !decodeURIComponent(parsed.username).includes(PRODUCTION_PROJECT_REF)) fail("Database URL is not Production.");
  return value;
}

function loadAcceptedPackage(): AcceptedPackage {
  const manifest = parse("manifest.json") as PackageManifest;
  const { packageSha256, ...packageProjection } = manifest;
  if (
    manifest.schemaVersion !== "adle_base_word_route_release_package_v1"
    || manifest.releaseKey !== RELEASE_KEY
    || manifest.familyImportBatchId !== FAMILY_BATCH_ID
    || packageSha256 !== PACKAGE_SHA256
    || sha256(canonical(packageProjection)) !== PACKAGE_SHA256
    || manifest.counts.microSkills !== 2
    || manifest.counts.familyAuthorities !== 2
    || manifest.counts.teachingContentAuthorities !== 2
    || manifest.counts.dictionaryClosureWords !== 225
    || manifest.counts.routeDependencies !== 6
    || manifest.operationalEffects.activation
    || manifest.operationalEffects.environmentChange
    || manifest.operationalEffects.learnerWrites
  ) fail("The reviewed Base Word route-release package identity or invariant set drifted.");
  const fileHashes: Record<string, string> = {};
  for (const [path, expected] of Object.entries(manifest.sourceFiles)) {
    const actual = sha256(readFileSync(resolve(RELEASE_DIR, path)));
    if (actual !== expected.sha256) fail(`Reviewed artifact hash drift: ${path}.`);
    fileHashes[path] = actual;
  }
  const content = [
    parse("teaching-content-d4_mor_base_words_identify_base.json"),
    parse("teaching-content-d4_mor_base_words_preserve_base.json"),
  ].sort((a, b) => a.microSkillKey.localeCompare(b.microSkillKey));
  const contentProvenance = parse("teaching-content-source-provenance.json");
  const closure = parse("teaching-dictionary-closure.json") as AdleTeachingDictionaryClosureManifestV1;
  const bindings = parse("teaching-dictionary-source-bindings.json");
  const release = parse("route-release.json") as AdleCurriculumReleaseManifestV2;
  const closureValidation = validateAdleTeachingDictionaryClosureManifestV1(closure);
  const releaseValidation = validateAdleCurriculumReleaseManifestV2(release);
  if (!closureValidation.valid) fail(`Invalid closure artifact: ${closureValidation.errors.join(",")}.`);
  if (!releaseValidation.valid) fail(`Invalid release artifact: ${releaseValidation.errors.join(",")}.`);
  if (closure.words.length !== 225 || bindings.length !== 225 || content.length !== 2 || contentProvenance.length !== 2) fail("Reviewed package counts drifted.");
  const fingerprints = fingerprintAdleCurriculumReleaseManifest(release);
  if (release.releaseKey !== RELEASE_KEY || release.microSkills.length !== 2 || !fingerprints.releaseManifestSha256 || !fingerprints.dependencyFingerprint) fail("Release identity is incomplete.");
  return { manifest, content, contentProvenance, closure, bindings, release, fileHashes };
}

async function tableDigest(client: pg.Client, table: string): Promise<{ count: number; sha256: string }> {
  const rows = await client.query<{ row: unknown }>(`select to_jsonb(value) row from ${table} value`);
  return { count: rows.rowCount ?? rows.rows.length, sha256: sha256(rows.rows.map(({ row }) => canonical(row)).sort().join("\n")) };
}
async function protectedSnapshot(client: pg.Client): Promise<Record<string, { count: number; sha256: string }>> {
  const snapshot: Record<string, { count: number; sha256: string }> = {};
  for (const table of PROTECTED_TABLES) snapshot[table] = await tableDigest(client, table);
  return snapshot;
}

async function collectPlan(client: pg.Client, accepted: AcceptedPackage): Promise<any> {
  const fingerprints = fingerprintAdleCurriculumReleaseManifest(accepted.release);
  const authorities = await client.query<any>(`
    select id,authority_key,authority_type,schema_version,manifest_file_sha256,authority_manifest,
      semantic_projection,semantic_fingerprint,source_classification,source_provenance
    from public.adle_curriculum_dependency_authorities
    where authority_key=any($1::text[]) order by authority_type,authority_key
  `, [accepted.release.microSkills.flatMap((skill) => skill.dependencies.map((dependency) => dependency.authorityKey))]);
  const existingRelease = await client.query<any>(`
    select * from public.adle_curriculum_release_manifests where release_key=$1 or release_manifest_sha256=$2
  `, [RELEASE_KEY, fingerprints.releaseManifestSha256]);
  const activationRows = await client.query<any>(`
    select h.micro_skill_key,h.current_revision_id,r.activation_status,r.release_manifest_sha256
    from public.adle_route_activation_heads h join public.adle_route_activation_revisions r on r.id=h.current_revision_id
    where h.environment_key='production' and h.route_id='base_word_lab' and h.route_version='v2'
    order by h.micro_skill_key
  `);
  const familyRows = authorities.rows.filter((row) => row.authority_type === "family_membership");
  if (familyRows.length !== 2) fail("The exact two family authorities are unavailable.");
  for (const skill of accepted.release.microSkills) {
    const family = skill.dependencies.find((dependency) => dependency.authorityType === "family_membership")!;
    const live = familyRows.find((row) => row.authority_key === family.authorityKey);
    if (!live || live.semantic_fingerprint !== family.semanticFingerprint || live.source_provenance?.importBatchId !== FAMILY_BATCH_ID) fail(`Family authority drift for ${skill.microSkillKey}.`);
  }
  for (const content of accepted.content) {
    const source = accepted.contentProvenance.find((entry) => entry.authorityKey === content.authorityKey);
    if (!source || source.sourceClassification !== "legacy_pre_release_ledger_projection") fail(`Teaching-content provenance is missing for ${content.authorityKey}.`);
    const live = await client.query<any>(`
      select c.*,b.created_at batch_created_at,b.release_id,b.package_sha256,b.batch_status
      from public.canonical_teaching_dictionary_content_versions c
      join public.canonical_teaching_dictionary_import_batches b on b.id=c.import_batch_id
      where c.id=$1 and c.micro_skill_key=$2 and c.version_status='active' and c.is_active
        and c.final_readiness_review_status='signed_off'
    `, [content.content.contentVersionId, content.microSkillKey]);
    const row = live.rows[0];
    const projection = row ? {
      contentVersionId: row.id,
      contentVersion: row.content_version,
      teachingObjective: row.teaching_objective,
      childFriendlyExplanation: row.child_friendly_explanation,
      ruleExplanation: row.rule_explanation,
      memoryTip: row.memory_tip ?? "",
      commonMisconceptions: row.common_misconceptions ?? "",
      firstExposureProgression: row.first_exposure_progression,
      guidedPracticeProgression: row.guided_practice_progression,
      reviewProofreadingProgression: row.review_proofreading_progression,
      exampleSelectionGuidance: row.example_selection_guidance ?? "",
      contrastPolicyGuidance: row.contrast_policy_guidance ?? "",
    } : null;
    if (!row || canonical(projection) !== canonical(content.content) || row.import_batch_id !== source.importBatchId
      || row.source_row_hash !== source.sourceRowHash || row.batch_status !== "applied" || row.release_id
      || new Date(row.batch_created_at) >= new Date("2026-07-26T00:00:00Z")) fail(`Teaching-content source drift for ${content.authorityKey}.`);
  }
  const closureSource = await client.query<any>(`
    select w.id canonical_word_id,w.word_key,w.normalised_word,w.display_word,w.dialect_code,
      wb.created_at word_batch_created_at,wb.release_id word_release_id,wb.batch_status word_batch_status,
      d.id dictation_sentence_id,d.dictation_sentence,d.dictation_target_token_index,d.audio_text,
      db.created_at dictation_batch_created_at,db.release_id dictation_release_id,db.batch_status dictation_batch_status
    from jsonb_to_recordset($1::jsonb) binding(word_key text,canonical_word_id uuid,dictation_sentence_id uuid)
    join public.canonical_teaching_dictionary_words w on w.id=binding.canonical_word_id and w.word_key=binding.word_key
      and w.row_status='active' and w.review_status='approved_for_first_exposure'
    join public.canonical_teaching_dictionary_import_batches wb on wb.id=w.import_batch_id
    join public.canonical_teaching_dictionary_dictation_sentences d on d.id=binding.dictation_sentence_id and d.canonical_word_id=w.id
      and d.row_status='active' and d.review_status='approved_for_first_exposure'
    join public.canonical_teaching_dictionary_import_batches db on db.id=d.import_batch_id
    order by w.word_key
  `, [JSON.stringify(accepted.bindings.map((binding) => ({ word_key: binding.wordKey, canonical_word_id: binding.canonicalWordId, dictation_sentence_id: binding.dictationSentenceId })))]);
  const liveClosure = closureSource.rows.map((row) => ({
    wordKey: row.word_key,
    normalisedWord: row.normalised_word,
    displayWord: row.display_word,
    dialectCode: row.dialect_code,
    dictationSentence: row.dictation_sentence,
    dictationTargetTokenIndex: row.dictation_target_token_index,
    audioText: row.audio_text,
  }));
  if (closureSource.rowCount !== 225 || canonical(liveClosure) !== canonical(accepted.closure.words)
    || closureSource.rows.some((row) => row.word_batch_status !== "applied" || row.dictation_batch_status !== "applied"
      || row.word_release_id || row.dictation_release_id
      || new Date(row.word_batch_created_at) >= new Date("2026-07-26T00:00:00Z")
      || new Date(row.dictation_batch_created_at) >= new Date("2026-07-26T00:00:00Z"))) fail("Teaching Dictionary closure source drifted or no longer qualifies for legacy provenance.");
  const publishedDependencies = authorities.rows.filter((row) => row.authority_type !== "family_membership");
  const existingReleaseCount = existingRelease.rows.length;
  const expectedPublished = existingReleaseCount ? 3 : 0;
  if (publishedDependencies.length !== expectedPublished) fail("A remaining dependency authority exists without the exact complete route release.");
  if (existingReleaseCount > 1) fail("Conflicting route release identities exist.");
  if (existingReleaseCount === 1) {
    const row = existingRelease.rows[0];
    if (row.release_key !== RELEASE_KEY || row.manifest_payload !== undefined && canonical(row.manifest_payload) !== canonical(accepted.release)
      || row.release_manifest_sha256 !== fingerprints.releaseManifestSha256 || row.dependency_fingerprint !== fingerprints.dependencyFingerprint) fail("Existing route release differs from the reviewed immutable artifact.");
  }
  if (activationRows.rowCount && !existingReleaseCount) fail("Operational activation exists without the reviewed route release.");
  const protectedState = await protectedSnapshot(client);
  const planProjection = {
    status: existingReleaseCount ? "already_published" : "ready",
    environment: "production",
    projectRef: PRODUCTION_PROJECT_REF,
    releaseKey: RELEASE_KEY,
    packageSha256: PACKAGE_SHA256,
    releaseManifestSha256: fingerprints.releaseManifestSha256,
    dependencyFingerprint: fingerprints.dependencyFingerprint,
    familyAuthorityIds: familyRows.map((row) => row.id).sort(),
    existingDependencyAuthorityIds: publishedDependencies.map((row) => row.id).sort(),
    existingReleaseId: existingRelease.rows[0]?.id ?? null,
    activationRows: activationRows.rows,
    protectedState,
  };
  return { ...planProjection, planSha256: sha256(canonical(planProjection)) };
}

async function withClient<T>(callback: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await callback(client); } finally { await client.end(); }
}

async function planCommand(accepted: AcceptedPackage): Promise<any> {
  return withClient(async (client) => {
    await client.query("begin transaction isolation level repeatable read read only");
    try { const plan = await collectPlan(client, accepted); await client.query("rollback"); return plan; }
    catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
  });
}

async function publishCommand(accepted: AcceptedPackage): Promise<any> {
  const mainSha = assertMergedMain();
  if (arg("--confirm") !== PUBLISH_CONFIRMATION) fail(`Exact confirmation required: ${PUBLISH_CONFIRMATION}`);
  const expectedPlan = arg("--confirm-plan-sha256") ?? fail("An immediately preceding plan SHA is required.");
  return withClient(async (client) => {
    await client.query("begin transaction isolation level serializable");
    try {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [LOCK_KEY]);
      const plan = await collectPlan(client, accepted);
      if (plan.planSha256 !== expectedPlan) fail("Production plan changed; re-run and review it.");
      if (plan.status === "already_published") { await client.query("rollback"); return { status: "already_published", ...plan, mutationPerformed: false }; }
      const receipts: any[] = [];
      for (const content of accepted.content) {
        const published = await client.query<{ id: string }>(`select public.publish_adle_base_word_teaching_content_authority_v1($1::jsonb,$2,'legacy_pre_release_ledger_projection',$3) id`, [content, accepted.fileHashes[`teaching-content-${content.microSkillKey.toLowerCase()}.json`], PUBLISHED_BY]);
        receipts.push({ authorityType: "teaching_content", authorityKey: content.authorityKey, authorityId: published.rows[0]?.id });
      }
      const closurePublished = await client.query<{ id: string }>(`select public.publish_adle_teaching_dictionary_closure_v1($1::jsonb,$2,$3::jsonb,'legacy_pre_release_ledger_projection',$4) id`, [accepted.closure, accepted.fileHashes["teaching-dictionary-closure.json"], JSON.stringify(accepted.bindings), PUBLISHED_BY]);
      receipts.push({ authorityType: "teaching_dictionary_closure", authorityKey: accepted.closure.authorityKey, authorityId: closurePublished.rows[0]?.id });
      const releasePublished = await client.query<{ id: string }>(`select public.publish_adle_curriculum_release_v2($1::jsonb,$2,$3) id`, [accepted.release, accepted.fileHashes["route-release.json"], PUBLISHED_BY]);
      const protectedAfter = await protectedSnapshot(client);
      if (canonical(protectedAfter) !== canonical(plan.protectedState)) fail("Dependency/release publication changed protected learner or assignment state.");
      const after = await collectPlan(client, accepted);
      if (after.status !== "already_published" || after.existingReleaseId !== releasePublished.rows[0]?.id || after.activationRows.length) fail("Published release could not be re-read exactly or created an activation.");
      await client.query("commit");
      return { status: "published", mainSha, releaseId: releasePublished.rows[0]?.id, authorityReceipts: receipts, releaseManifestSha256: after.releaseManifestSha256, dependencyFingerprint: after.dependencyFingerprint, protectedState: protectedAfter, mutationPerformed: true };
    } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
  });
}

async function activationCommand(accepted: AcceptedPackage, status: "enabled" | "paused" | "safety_revoked"): Promise<any> {
  const mainSha = assertMergedMain();
  const confirmation = status === "enabled" ? ACTIVATE_CONFIRMATION : status === "paused" ? PAUSE_CONFIRMATION : REVOKE_CONFIRMATION;
  if (arg("--confirm") !== confirmation) fail(`Exact confirmation required: ${confirmation}`);
  if (status === "enabled" && arg("--proof-child") !== PROOF_CHILD_ID) fail("Activation is restricted to the governed proof child.");
  return withClient(async (client) => {
    await client.query("begin transaction isolation level serializable");
    try {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [LOCK_KEY]);
      const plan = await collectPlan(client, accepted);
      if (plan.status !== "already_published" || !plan.existingReleaseId) fail("The exact immutable route release is not published.");
      const ownership = await client.query(`select 1 from public.children where id=$1 and parent_user_id='a28d4885-8328-4853-ba11-6c676619b9ea' and not is_archived`, [PROOF_CHILD_ID]);
      const nonProof = await client.query(`select 1 from public.children where id=$1 and parent_user_id='a28d4885-8328-4853-ba11-6c676619b9ea' and not is_archived`, [NON_PROOF_CHILD_ID]);
      if (ownership.rowCount !== 1 || nonProof.rowCount !== 1) fail("Controlled proof/non-proof child ownership no longer matches the governed Production scope.");
      const report = status === "enabled" ? {
        receiptVersion: "bw2b_activation_readiness_v1",
        routeReleaseKey: RELEASE_KEY,
        packageSha256: PACKAGE_SHA256,
        gateScope: "allowlist",
        proofChildId: PROOF_CHILD_ID,
        nonProofChildId: NON_PROOF_CHILD_ID,
        emergencyDisableVerifiedBeforeActivation: true,
      } : { receiptVersion: "bw2b_operational_stop_v1", routeReleaseKey: RELEASE_KEY, packageSha256: PACKAGE_SHA256 };
      const fingerprints = fingerprintAdleCurriculumReleaseManifest(accepted.release);
      const revisions: Array<{ microSkillKey: string; previousRevisionId: string | null; revisionId: string }> = [];
      for (const microSkillKey of SKILLS) {
        const current = plan.activationRows.find((row: any) => row.micro_skill_key === microSkillKey)?.current_revision_id ?? null;
        const result = await client.query<{ id: string }>(`select public.set_adle_route_activation_revision_v2($1,$2,'production',$3,$4,$5::jsonb,$6,$7,$8) id`, [
          fingerprints.releaseManifestSha256, microSkillKey, status,
          status === "safety_revoked" ? "block_incomplete" : "allow_existing",
          report, current, PUBLISHED_BY,
          status === "enabled" ? "BW-2B controlled Production proof activation" : status === "paused" ? "BW-2B operational pause" : "BW-2B safety revocation",
        ]);
        revisions.push({ microSkillKey, previousRevisionId: current, revisionId: result.rows[0]!.id });
      }
      await client.query("commit");
      return { status, mainSha, releaseId: plan.existingReleaseId, releaseManifestSha256: fingerprints.releaseManifestSha256, dependencyFingerprint: fingerprints.dependencyFingerprint, revisions, proofChildId: status === "enabled" ? PROOF_CHILD_ID : null };
    } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
  });
}

async function verifyCommand(accepted: AcceptedPackage): Promise<any> {
  const plan = await planCommand(accepted);
  if (plan.status !== "already_published") fail("The reviewed immutable route release is not published.");
  return { status: "verified", ...plan, closureSemanticFingerprint: sha256(canonical(teachingDictionaryClosureSemanticProjection(accepted.closure))), mutationPerformed: false };
}

async function main(): Promise<void> {
  const accepted = loadAcceptedPackage();
  const command = process.argv[2] ?? "validate";
  if (command === "validate") {
    const fingerprints = fingerprintAdleCurriculumReleaseManifest(accepted.release);
    console.log(JSON.stringify({ status: "valid", releaseKey: RELEASE_KEY, packageSha256: PACKAGE_SHA256, ...fingerprints, counts: accepted.manifest.counts }, null, 2)); return;
  }
  if (command === "plan") { console.log(JSON.stringify(await planCommand(accepted), null, 2)); return; }
  if (command === "publish") { console.log(JSON.stringify(await publishCommand(accepted), null, 2)); return; }
  if (command === "verify") { console.log(JSON.stringify(await verifyCommand(accepted), null, 2)); return; }
  if (command === "activate") { console.log(JSON.stringify(await activationCommand(accepted, "enabled"), null, 2)); return; }
  if (command === "pause") { console.log(JSON.stringify(await activationCommand(accepted, "paused"), null, 2)); return; }
  if (command === "safety-revoke") { console.log(JSON.stringify(await activationCommand(accepted, "safety_revoked"), null, 2)); return; }
  fail("Expected validate, plan, publish, verify, activate, pause, or safety-revoke.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
