#!/usr/bin/env node
/* Build the reviewed, immutable BW-2B dependency/release artifacts from exact Production source rows. */
/* eslint-disable @typescript-eslint/no-explicit-any -- database projections are validated before serialization */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

const PROJECT_REF = "wwohrqtunajrbwxyssjf";
const FAMILY_BATCH_ID = "ddc8993b-26ca-57da-8383-1efec1be8ee1";
const RELEASE_KEY = "adle_base_word_lab_v2_2026_08_10";
const CLOSURE_KEY = "adle_base_word_dictionary_closure_v1_2026_08_10";
const SKILLS = [
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
] as const;
const FAMILY_KEYS: Record<(typeof SKILLS)[number], string> = {
  D4_MOR_BASE_WORDS_IDENTIFY_BASE: "base_word_family_membership:identify-base:adle_base_word_family_meanings_v1_2026_08_09",
  D4_MOR_BASE_WORDS_PRESERVE_BASE: "base_word_family_membership:preserve-base:adle_base_word_family_meanings_v1_2026_08_09",
};
const CONTENT_KEYS: Record<(typeof SKILLS)[number], string> = {
  D4_MOR_BASE_WORDS_IDENTIFY_BASE: "adle_base_word_identify_teaching_content_human_reviewed_v1_2026_08_10",
  D4_MOR_BASE_WORDS_PRESERVE_BASE: "adle_base_word_preserve_teaching_content_human_reviewed_v1_2026_08_10",
};
const APPROVAL_REFS = [
  "architecture:model-c-approved:2026-08-09",
  "github:pull/32",
  "production-goal:bw-2b:2026-08-10",
];
const CONFIRMATION = "BUILD_BASE_WORD_ROUTE_RELEASE_FROM_PRODUCTION_READ_ONLY";

function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function databaseUrl(): string {
  const value = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED
    ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION
    ?? process.env.SUPABASE_PRODUCTION_DB_URL;
  if (!value) throw new Error("A governed Production database URL is required.");
  const parsed = new URL(value);
  if (!parsed.hostname.includes(PROJECT_REF) && !decodeURIComponent(parsed.username).includes(PROJECT_REF)) {
    throw new Error("The database URL does not identify the governed Production project.");
  }
  return value;
}

async function main(): Promise<void> {
  if (process.argv.at(-1) !== CONFIRMATION) throw new Error(`Exact confirmation required: -- ${CONFIRMATION}`);
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const outputDir = resolve(root, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-10-base-word-lab-v2");
  const client = new pg.Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const familyAuthorities = await client.query<any>(`
      select authority_key,semantic_fingerprint from public.adle_curriculum_dependency_authorities
      where authority_type='family_membership' and authority_key=any($1::text[]) order by authority_key
    `, [SKILLS.map((skill) => FAMILY_KEYS[skill])]);
    if (familyAuthorities.rowCount !== 2) throw new Error("Both reviewed family authorities must already exist.");

    const contentRows = await client.query<any>(`
      select c.*,b.created_at batch_created_at,b.release_id,b.package_sha256,b.batch_status
      from public.canonical_teaching_dictionary_content_versions c
      join public.canonical_teaching_dictionary_import_batches b on b.id=c.import_batch_id
      where c.micro_skill_key=any($1::text[]) and c.version_status='active' and c.is_active
        and c.final_readiness_review_status='signed_off'
      order by c.micro_skill_key
    `, [SKILLS]);
    if (contentRows.rowCount !== 2) throw new Error("Expected one active signed-off teaching-content row per Base Word skill.");

    const dictionaryRows = await client.query<any>(`
      with governed_words as (
        select distinct m.canonical_word_id
        from public.canonical_teaching_dictionary_base_word_family_members m
        join public.canonical_teaching_dictionary_base_word_families f
          on f.id=m.base_word_family_id and f.import_batch_id=m.import_batch_id
        where m.import_batch_id=$1 and f.micro_skill_key=any($2::text[])
          and f.row_status='active' and f.review_status='approved_for_first_exposure'
          and m.row_status='active' and m.review_status='approved_for_first_exposure' and m.assignment_eligible
      )
      select w.id canonical_word_id,w.word_key,w.normalised_word,w.display_word,w.dialect_code,
        w.import_batch_id canonical_word_import_batch_id,w.source_row_hash canonical_word_source_row_hash,
        wb.created_at canonical_word_batch_created_at,wb.release_id canonical_word_release_id,
        d.id dictation_sentence_id,d.dictation_sentence,d.dictation_target_token_index,d.audio_text,
        d.import_batch_id dictation_import_batch_id,d.source_row_hash dictation_source_row_hash,
        db.created_at dictation_batch_created_at,db.release_id dictation_release_id
      from governed_words governed
      join public.canonical_teaching_dictionary_words w on w.id=governed.canonical_word_id
        and w.row_status='active' and w.review_status='approved_for_first_exposure'
      join public.canonical_teaching_dictionary_import_batches wb on wb.id=w.import_batch_id and wb.batch_status='applied'
      join public.canonical_teaching_dictionary_dictation_sentences d on d.canonical_word_id=w.id
        and d.row_status='active' and d.review_status='approved_for_first_exposure'
      join public.canonical_teaching_dictionary_import_batches db on db.id=d.import_batch_id and db.batch_status='applied'
      order by w.word_key
    `, [FAMILY_BATCH_ID, SKILLS]);
    if (dictionaryRows.rowCount !== 225) throw new Error(`Expected the exact 225-word selectable closure; found ${dictionaryRows.rowCount}.`);
    if (dictionaryRows.rows.some((row) => row.canonical_word_release_id || row.dictation_release_id || new Date(row.canonical_word_batch_created_at) >= new Date("2026-07-26T00:00:00Z") || new Date(row.dictation_batch_created_at) >= new Date("2026-07-26T00:00:00Z"))) {
      throw new Error("The selected closure no longer qualifies as an exact legacy pre-release-ledger projection.");
    }

    const contentFiles = contentRows.rows.map((row) => ({
      path: `teaching-content-${row.micro_skill_key.toLowerCase()}.json`,
      value: {
        schemaVersion: 1,
        authorityKey: CONTENT_KEYS[row.micro_skill_key as (typeof SKILLS)[number]],
        microSkillKey: row.micro_skill_key,
        approvalRefs: APPROVAL_REFS,
        content: {
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
        },
      },
      source: {
        contentVersionId: row.id,
        importBatchId: row.import_batch_id,
        sourceRowHash: row.source_row_hash,
        reviewedBy: row.final_readiness_reviewed_by,
        reviewedAt: row.final_readiness_reviewed_at,
        sourceClassification: "legacy_pre_release_ledger_projection",
      },
    }));

    const closureManifest = {
      schemaVersion: 1,
      authorityKey: CLOSURE_KEY,
      approvalRefs: APPROVAL_REFS,
      capabilities: ["canonical_word_identity_display", "canonical_dictation"],
      words: dictionaryRows.rows.map((row) => ({
        wordKey: row.word_key,
        normalisedWord: row.normalised_word,
        displayWord: row.display_word,
        dialectCode: row.dialect_code,
        dictationSentence: row.dictation_sentence,
        dictationTargetTokenIndex: row.dictation_target_token_index,
        audioText: row.audio_text,
      })),
    };
    const closureBindings = dictionaryRows.rows.map((row) => ({
      wordKey: row.word_key,
      canonicalWordId: row.canonical_word_id,
      dictationSentenceId: row.dictation_sentence_id,
    }));
    const semanticFingerprint = (value: unknown) => sha256(canonical(value));
    const familyByKey = new Map(familyAuthorities.rows.map((row) => [row.authority_key, row.semantic_fingerprint]));
    const contentBySkill = new Map(contentFiles.map((entry) => [entry.value.microSkillKey, semanticFingerprint({ schemaVersion: 1, microSkillKey: entry.value.microSkillKey, ...entry.value.content })]));
    const closureFingerprint = semanticFingerprint({ schemaVersion: 1, capabilities: closureManifest.capabilities, words: closureManifest.words });
    const releaseManifest = {
      schemaVersion: 2,
      releaseKey: RELEASE_KEY,
      route: { routeId: "base_word_lab", routeVersion: "v2", activationRouteKey: "base_word_family_v1", payloadVersion: 1 },
      approvalRefs: APPROVAL_REFS,
      microSkills: SKILLS.map((microSkillKey) => ({
        microSkillKey,
        dependencies: [
          { authorityKey: FAMILY_KEYS[microSkillKey], authorityType: "family_membership", authoritySchemaVersion: 1, semanticFingerprint: familyByKey.get(FAMILY_KEYS[microSkillKey]) },
          { authorityKey: CONTENT_KEYS[microSkillKey], authorityType: "teaching_content", authoritySchemaVersion: 1, semanticFingerprint: contentBySkill.get(microSkillKey) },
          { authorityKey: CLOSURE_KEY, authorityType: "teaching_dictionary_closure", authoritySchemaVersion: 1, semanticFingerprint: closureFingerprint },
        ],
      })),
    };

    mkdirSync(outputDir, { recursive: true });
    const files: Array<{ path: string; value: unknown }> = [
      ...contentFiles.map(({ path, value }) => ({ path, value })),
      { path: "teaching-content-source-provenance.json", value: contentFiles.map(({ value, source }) => ({ authorityKey: value.authorityKey, microSkillKey: value.microSkillKey, ...source })) },
      { path: "teaching-dictionary-closure.json", value: closureManifest },
      { path: "teaching-dictionary-source-bindings.json", value: closureBindings },
      { path: "route-release.json", value: releaseManifest },
    ];
    const sourceFiles: Record<string, { sha256: string }> = {};
    for (const file of files) {
      const rendered = stableJson(file.value);
      writeFileSync(resolve(outputDir, file.path), rendered);
      sourceFiles[file.path] = { sha256: sha256(rendered) };
    }
    const packageWithoutHash = {
      schemaVersion: "adle_base_word_route_release_package_v1",
      releaseKey: RELEASE_KEY,
      familyImportBatchId: FAMILY_BATCH_ID,
      sourceMainSha: execFileSync("git", ["rev-parse", "origin/main"], { cwd: root, encoding: "utf8" }).trim(),
      approvalRefs: APPROVAL_REFS,
      sourceClassification: "legacy_pre_release_ledger_projection",
      counts: { microSkills: 2, familyAuthorities: 2, teachingContentAuthorities: 2, dictionaryClosureWords: 225, routeDependencies: 6 },
      sourceFiles,
      operationalEffects: { routeRelease: true, activation: false, environmentChange: false, learnerWrites: false },
    };
    const packageManifest = { ...packageWithoutHash, packageSha256: sha256(canonical(packageWithoutHash)) };
    writeFileSync(resolve(outputDir, "manifest.json"), stableJson(packageManifest));
    await client.query("rollback");
    console.log(JSON.stringify({ outputDir, releaseKey: RELEASE_KEY, packageSha256: packageManifest.packageSha256, sourceFiles, counts: packageWithoutHash.counts }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
