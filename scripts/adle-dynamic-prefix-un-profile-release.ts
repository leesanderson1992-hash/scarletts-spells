#!/usr/bin/env node
/** Governed, profile-only release for the approved production un- projection. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const RELEASE_DIR = resolve(
  ROOT,
  "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-02-dynamic-prefix-un-profile-v1",
);
const MANIFEST_PATH = resolve(RELEASE_DIR, "manifest.json");
const STAGING_PROJECT_REF = "jlhotktspjvffslvuyfz";
const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const RELEASE_ID = "adle_dynamic_prefix_un_profile_staging_v1_2026_08_02";
const CONTENT_ID = "d4_mor_prefixes_un_approved_profile_2026_07_28";
const PROFILE_KEY = "D4_MOR_PREFIXES_UN";
const SOURCE_SHA = "d7a69aa4d0d8c00c15706742f949334b821aaf4a1aeb380e43944c6fc3544189";
const APPROVED_PRODUCTION_PROJECTION_SHA = "892d8e99aa030da6626f0e46d1ccba680988a4447f648c7da8529ba6e8561b6d";
const UUID_NAMESPACE = "d4f1c0c0a6c349a1846f4b22d36c9a2f";
const LOCK_KEY = 734_482_051;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type ManifestMember = {
  wordKey: string;
  displayWord: string;
  memberRole: "transfer";
  baseWord: string;
  baseMeaning: string;
  childFriendlyMeaning: string;
  meaningBinKey: "not" | "reverse";
  prefixVariant: "un";
};
type Manifest = {
  schemaVersion: "dynamic_prefix_profile_release_v1";
  releaseId: string;
  contentId: string;
  target: { environment: "staging"; supabaseProjectRef: string; productionEnabled: false };
  source: {
    path: string;
    sha256: string;
    approvedProductionProfileId: string;
    approvedProductionBatchId: string;
    approvedProductionProfileSha256: string;
    approvedProductionMembersSha256: string;
    approvedProductionProjectionSha256: string;
    canonicalThreeWordPackageId: string;
    canonicalThreeWordPackageSha256: string;
  };
  activation: Record<string, boolean>;
  rowCounts: Record<string, number>;
  profile: {
    microSkillKey: string;
    prefixLabel: string;
    prefixText: string;
    prefixMeaning: string;
    meaningBins: Json[];
    prefixChoices: Json[];
    reflectionPromptKey: string;
    reflectionPromptText: string;
    introContent: null;
    productionEnabled: false;
    rowStatus: "active";
    reviewStatus: "approved_for_first_exposure";
  };
  members: ManifestMember[];
};

type LoadedPackage = {
  manifest: Manifest;
  packageSha256: string;
};

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

function stableUuid(kind: string, key: string): string {
  const digest = createHash("sha256")
    .update(`${UUID_NAMESPACE}:${kind}:${key}`)
    .digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

function memberParts(member: ManifestMember) {
  return [
    {
      id: "prefix",
      kind: "prefix",
      sourceText: "un",
      surfaceText: "un",
      gloss: member.meaningBinKey === "reverse" ? "reverse" : "not",
      displayRange: { start: 0, end: 2 },
    },
    {
      id: "base",
      kind: "base",
      sourceText: member.baseWord,
      surfaceText: member.baseWord,
      displayRange: { start: 2, end: member.displayWord.length },
    },
  ];
}

const MEMBER_JOINS = [{ afterPartId: "prefix", beforePartId: "base", joinType: "none" }];

async function loadPackage(): Promise<LoadedPackage> {
  const raw = await readFile(MANIFEST_PATH);
  const manifest = JSON.parse(raw.toString("utf8")) as Manifest;
  const blockers: string[] = [];
  if (
    manifest.schemaVersion !== "dynamic_prefix_profile_release_v1"
    || manifest.releaseId !== RELEASE_ID
    || manifest.contentId !== CONTENT_ID
  ) blockers.push("Package identity is not the approved immutable release.");
  if (
    manifest.target.environment !== "staging"
    || manifest.target.supabaseProjectRef !== STAGING_PROJECT_REF
    || manifest.target.productionEnabled !== false
  ) blockers.push("Package target is not the pinned disabled staging projection.");
  if (
    manifest.source.sha256 !== SOURCE_SHA
    || manifest.source.approvedProductionProjectionSha256 !== APPROVED_PRODUCTION_PROJECTION_SHA
  ) blockers.push("Approved source or production-projection hash changed.");
  const sourceRaw = await readFile(resolve(ROOT, manifest.source.path));
  if (sha256(sourceRaw) !== SOURCE_SHA) blockers.push("Repository source SHA-256 changed.");
  if (
    manifest.profile.microSkillKey !== PROFILE_KEY
    || manifest.profile.prefixLabel !== "un-"
    || manifest.profile.prefixText !== "un"
    || manifest.profile.prefixMeaning !== "not or reverse"
    || manifest.profile.introContent !== null
    || manifest.profile.productionEnabled !== false
    || manifest.profile.rowStatus !== "active"
    || manifest.profile.reviewStatus !== "approved_for_first_exposure"
  ) blockers.push("Approved profile facts changed.");
  if (
    canonicalJson(manifest.profile.meaningBins) !== canonicalJson([
      { id: "not", label: "NOT", description: "not" },
      { id: "reverse", label: "REVERSE", description: "reverse" },
    ])
    || canonicalJson(manifest.profile.prefixChoices) !== canonicalJson([
      { text: "un", label: "un-", outcome: null, meaning: null, status: "target" },
      { text: "", label: "no prefix", outcome: null, meaning: null, status: "target" },
    ])
    || manifest.profile.reflectionPromptKey !== "dynamic-prefix-un-observation-v2"
    || manifest.profile.reflectionPromptText !== "What did you notice about what un- does in these words?"
  ) blockers.push("Approved bins, choices, or reflection changed.");
  if (
    manifest.members.length !== 7
    || new Set(manifest.members.map((member) => member.wordKey)).size !== 7
    || manifest.members.some((member) =>
      member.memberRole !== "transfer"
      || member.prefixVariant !== "un"
      || `un${member.baseWord}` !== member.displayWord
      || !member.baseMeaning
      || !member.childFriendlyMeaning
      || !["not", "reverse"].includes(member.meaningBinKey),
    )
  ) blockers.push("Approved seven-member projection changed.");
  if (Object.values(manifest.activation).some(Boolean)) {
    blockers.push("Package requests a prohibited activation or write family.");
  }
  if (
    manifest.rowCounts.importBatches !== 1
    || manifest.rowCounts.profiles !== 1
    || manifest.rowCounts.members !== 7
    || Object.entries(manifest.rowCounts).some(([key, count]) =>
      !["importBatches", "profiles", "members"].includes(key) && count !== 0,
    )
  ) blockers.push("Package row counts exceed the profile-only boundary.");
  if (blockers.length) fail(blockers.join(" "));
  return { manifest, packageSha256: sha256(raw) };
}

function databaseUrl(): string {
  return arg("--database-url")
    ?? process.env.SUPABASE_STAGING_DB_URL
    ?? fail("Provide --database-url or SUPABASE_STAGING_DB_URL.");
}

function assertStagingDatabaseUrl(value: string): void {
  const parsed = new URL(value);
  const identity = `${parsed.hostname}:${parsed.username}`;
  if (identity.includes(PRODUCTION_PROJECT_REF)) fail("Production Supabase is permanently rejected.");
  if (!identity.includes(STAGING_PROJECT_REF)) fail("Database URL does not identify the pinned staging project.");
}

async function connect(): Promise<pg.Client> {
  const url = databaseUrl();
  assertStagingDatabaseUrl(url);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function protectedCounts(client: pg.Client): Promise<Record<string, number>> {
  const rows = await client.query(`select
    (select count(*)::int from adle_learning_items) as learning_items,
    (select count(*)::int from daily_assignments) as assignments,
    (select count(*)::int from assignment_items) as assignment_items,
    (select count(*)::int from adle_assignment_attempt_events) as attempts,
    (select count(*)::int from adle_review_schedule_words) as schedules,
    (select count(*)::int from child_word_treasure_events) as rewards`);
  return rows.rows[0] as Record<string, number>;
}

async function dictionarySnapshot(client: pg.Client, manifest: Manifest) {
  const words = await client.query(
    `select w.id,w.word_key,w.normalised_word,w.display_word,w.frequency_band,w.age_band,w.complexity_band,w.row_status,w.review_status,
      (select count(*)::int from canonical_teaching_dictionary_word_metadata m where m.canonical_word_id=w.id and m.row_status='active' and m.review_status='approved_for_first_exposure') metadata_count,
      (select count(*)::int from canonical_teaching_dictionary_word_morphology m where m.canonical_word_id=w.id and m.row_status='active') morphology_count,
      (select count(*)::int from canonical_teaching_dictionary_dictation_sentences d where d.canonical_word_id=w.id and d.row_status='active' and d.review_status='approved_for_first_exposure') dictation_count
    from canonical_teaching_dictionary_words w
    where w.word_key=any($1)
    order by array_position($1::text[],w.word_key)`,
    [manifest.members.map((member) => member.wordKey)],
  );
  if (
    words.rowCount !== 7
    || words.rows.some((row, index) =>
      row.word_key !== manifest.members[index]?.wordKey
      || row.normalised_word !== manifest.members[index]?.displayWord
      || row.display_word !== manifest.members[index]?.displayWord
      || row.row_status !== "active"
      || row.review_status !== "approved_for_first_exposure"
      || !row.frequency_band
      || !row.age_band
      || !row.complexity_band
      || Number(row.metadata_count) < 1
      || Number(row.dictation_count) !== 1,
    )
  ) fail("The seven existing staging dictionary words are not the complete approved source prerequisite.");
  return {
    wordsByKey: new Map(words.rows.map((row) => [row.word_key as string, row.id as string])),
    fingerprint: sha256(canonicalJson(words.rows.map((row) => ({
      wordKey: row.word_key,
      normalisedWord: row.normalised_word,
      displayWord: row.display_word,
      frequencyBand: row.frequency_band,
      ageBand: row.age_band,
      complexityBand: row.complexity_band,
      rowStatus: row.row_status,
      reviewStatus: row.review_status,
      metadataCount: Number(row.metadata_count),
      morphologyCount: Number(row.morphology_count),
      dictationCount: Number(row.dictation_count),
    })))),
    counts: {
      words: words.rowCount,
      metadata: words.rows.reduce((sum, row) => sum + Number(row.metadata_count), 0),
      morphology: words.rows.reduce((sum, row) => sum + Number(row.morphology_count), 0),
      dictations: words.rows.reduce((sum, row) => sum + Number(row.dictation_count), 0),
    },
  };
}

function profileProjection(row: Record<string, unknown>) {
  return {
    microSkillKey: row.micro_skill_key,
    prefixLabel: row.prefix_label,
    prefixText: row.prefix_text,
    prefixMeaning: row.prefix_meaning,
    meaningBins: row.meaning_bins,
    prefixChoices: row.prefix_choices,
    reflectionPromptKey: row.reflection_prompt_key,
    reflectionPromptText: row.reflection_prompt_text,
    introContent: row.intro_content ?? null,
    productionEnabled: row.production_enabled,
    rowStatus: row.row_status,
    reviewStatus: row.review_status,
  };
}

function memberProjection(row: Record<string, unknown>) {
  return {
    wordKey: row.word_key,
    displayWord: row.display_word,
    memberRole: row.member_role,
    baseWord: row.base_word,
    baseMeaning: row.base_meaning,
    childFriendlyMeaning: row.child_friendly_meaning,
    meaningBinKey: row.meaning_bin_key,
    prefixVariant: row.prefix_variant,
    teachingSplitParts: row.teaching_split_parts,
    teachingSplitJoins: row.teaching_split_joins,
    transformationNotes: row.transformation_notes,
    assignmentEligible: row.assignment_eligible,
    rowStatus: row.row_status,
    reviewStatus: row.review_status,
  };
}

async function readReleasedProjection(client: pg.Client, manifest: Manifest, expectedStatus: "active" | "superseded" = "active") {
  const batchId = stableUuid("batch", manifest.releaseId);
  const profiles = await client.query(
    "select * from canonical_teaching_dictionary_prefix_profiles where import_batch_id=$1 and micro_skill_key=$2",
    [batchId, PROFILE_KEY],
  );
  if (profiles.rowCount !== 1) fail("Expected exactly one released un- profile.");
  const profile = profiles.rows[0] as Record<string, unknown>;
  const members = await client.query(
    `select m.*,w.word_key,w.display_word from canonical_teaching_dictionary_prefix_members m
      join canonical_teaching_dictionary_words w on w.id=m.canonical_word_id
      where m.import_batch_id=$1 and m.prefix_profile_id=$2
      order by array_position($3::text[],w.word_key)`,
    [batchId, profile.id, manifest.members.map((member) => member.wordKey)],
  );
  if (members.rowCount !== 7) fail("Expected exactly seven released un- members.");
  const expectedProfile = { ...manifest.profile, rowStatus: expectedStatus };
  if (canonicalJson(profileProjection(profile)) !== canonicalJson(expectedProfile)) {
    fail("Released profile does not exactly match the approved projection.");
  }
  const expectedMembers = manifest.members.map((member) => ({
    ...member,
    teachingSplitParts: memberParts(member),
    teachingSplitJoins: MEMBER_JOINS,
    transformationNotes: "Concatenate un- and the complete teaching base.",
    assignmentEligible: expectedStatus === "active",
    rowStatus: expectedStatus,
    reviewStatus: "approved_for_first_exposure",
  }));
  const actualMembers = members.rows.map((row) => memberProjection(row));
  if (canonicalJson(actualMembers) !== canonicalJson(expectedMembers)) {
    fail("Released members do not exactly match the approved projection.");
  }
  return {
    batchId,
    profileId: String(profile.id),
    profileSha256: sha256(canonicalJson(profileProjection(profile))),
    membersSha256: sha256(canonicalJson(actualMembers)),
    projectionSha256: sha256(canonicalJson({ profile: profileProjection(profile), members: actualMembers })),
  };
}

async function plan(loaded: LoadedPackage): Promise<void> {
  const client = await connect();
  try {
    await client.query("begin read only");
    const dictionary = await dictionarySnapshot(client, loaded.manifest);
    const active = await client.query(
      "select import_batch_id from canonical_teaching_dictionary_prefix_profiles where micro_skill_key=$1 and row_status='active'",
      [PROFILE_KEY],
    );
    const batchId = stableUuid("batch", loaded.manifest.releaseId);
    if (active.rowCount && active.rows.some((row) => row.import_batch_id !== batchId)) {
      fail("An unrelated active staging un- profile already exists.");
    }
    const status = active.rowCount === 1 ? "already_applied" : "ready";
    await client.query("rollback");
    console.log(JSON.stringify({
      status,
      target: "staging",
      stagingProjectRef: STAGING_PROJECT_REF,
      productionProjectRejected: true,
      releaseId: loaded.manifest.releaseId,
      contentId: loaded.manifest.contentId,
      packageSha256: loaded.packageSha256,
      batchId,
      dictionaryCounts: dictionary.counts,
      dictionaryFingerprint: dictionary.fingerprint,
      inserts: { batches: status === "ready" ? 1 : 0, profiles: status === "ready" ? 1 : 0, members: status === "ready" ? 7 : 0 },
      updates: { canonicalWords: 0, metadata: 0, morphology: 0, dictations: 0, learnerRows: 0 },
      requiredConfirmation: `${loaded.manifest.releaseId}:${loaded.packageSha256}:release:staging`,
    }, null, 2));
  } finally {
    await client.end();
  }
}

function requireMutationConfirmation(loaded: LoadedPackage, operation: "release" | "deactivate" | "reactivate"): void {
  if (!process.argv.includes("--apply")) fail(`${operation} requires --apply.`);
  const expected = `${loaded.manifest.releaseId}:${loaded.packageSha256}:${operation}:staging`;
  if (arg("--confirm") !== expected) fail(`${operation} requires --confirm ${expected}`);
  if (arg("--target") !== "staging") fail(`${operation} requires --target staging.`);
}

async function release(loaded: LoadedPackage): Promise<void> {
  requireMutationConfirmation(loaded, "release");
  const client = await connect();
  const batchId = stableUuid("batch", loaded.manifest.releaseId);
  const profileId = stableUuid("profile", loaded.manifest.contentId);
  try {
    await client.query("begin isolation level serializable");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);
    const protectedBefore = await protectedCounts(client);
    const dictionaryBefore = await dictionarySnapshot(client, loaded.manifest);
    const existingBatch = await client.query(
      "select batch_status,source_folder_sha256 from canonical_teaching_dictionary_import_batches where id=$1 for update",
      [batchId],
    );
    if (existingBatch.rowCount) {
      if (existingBatch.rows[0].batch_status === "applied" && existingBatch.rows[0].source_folder_sha256 === loaded.packageSha256) {
        const projection = await readReleasedProjection(client, loaded.manifest);
        await client.query("rollback");
        console.log(JSON.stringify({ status: "already_applied", ...projection, packageSha256: loaded.packageSha256 }));
        return;
      }
      fail("Release batch identity already exists in a conflicting state.");
    }
    const active = await client.query(
      "select id from canonical_teaching_dictionary_prefix_profiles where micro_skill_key=$1 and row_status='active' for update",
      [PROFILE_KEY],
    );
    if (active.rowCount) fail("An active staging un- profile already exists.");
    const sourceMetadata = {
      schema_version: loaded.manifest.schemaVersion,
      release_id: loaded.manifest.releaseId,
      content_id: loaded.manifest.contentId,
      package_sha256: loaded.packageSha256,
      approved_production_projection_sha256: APPROVED_PRODUCTION_PROJECTION_SHA,
      source_sha256: SOURCE_SHA,
      prohibited_writes: loaded.manifest.activation,
    };
    await client.query(
      `insert into canonical_teaching_dictionary_import_batches
        (id,source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at)
       values ($1,$2,$3,'adle_dynamic_prefix_profile_release_v1',$4,$5,$6,'admin_import','applied',$7,$8,now())`,
      [
        batchId,
        "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-02-dynamic-prefix-un-profile-v1",
        loaded.packageSha256,
        { errors: 0, approvedProductionProjectionSha256: APPROVED_PRODUCTION_PROJECTION_SHA },
        loaded.manifest.rowCounts,
        { productionEnabled: false, exactApprovedSource: true, learnerWrites: 0 },
        sourceMetadata,
        "ADLE governed un- staging profile release",
      ],
    );
    const profile = loaded.manifest.profile;
    await client.query(
      `insert into canonical_teaching_dictionary_prefix_profiles
        (id,import_batch_id,micro_skill_key,prefix_label,prefix_text,prefix_meaning,meaning_bins,prefix_choices,reflection_prompt_key,reflection_prompt_text,intro_content,production_enabled,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,'active','approved_for_first_exposure','manifest.json',2,$12,$13,'internal_reviewed_seed','Approved production un- profile projection',$14,'internal','Exact approved facts; staging activation only.','high','Katie Sanderson','2026-07-28T00:00:00Z')`,
      [
        profileId,
        batchId,
        profile.microSkillKey,
        profile.prefixLabel,
        profile.prefixText,
        profile.prefixMeaning,
        JSON.stringify(profile.meaningBins),
        JSON.stringify(profile.prefixChoices),
        profile.reflectionPromptKey,
        profile.reflectionPromptText,
        profile.introContent,
        loaded.manifest.source.approvedProductionProfileSha256,
        sourceMetadata,
        loaded.manifest.source.path,
      ],
    );
    for (const [index, member] of loaded.manifest.members.entries()) {
      const canonicalWordId = dictionaryBefore.wordsByKey.get(member.wordKey);
      if (!canonicalWordId) fail(`${member.wordKey}: staging canonical identity is missing.`);
      await client.query(
        `insert into canonical_teaching_dictionary_prefix_members
          (id,import_batch_id,prefix_profile_id,canonical_word_id,member_role,base_word,base_meaning,child_friendly_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,transformation_notes,prefix_variant,assignment_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Concatenate un- and the complete teaching base.',$12,true,'active','approved_for_first_exposure','manifest.json',$13,$14,$15,'internal_reviewed_seed','Approved production un- profile projection',$16,'internal','Teaching split only; canonical dictionary facts remain unchanged.','high','Katie Sanderson','2026-07-28T00:00:00Z')`,
        [
          stableUuid("member", `${loaded.manifest.contentId}:${member.wordKey}`),
          batchId,
          profileId,
          canonicalWordId,
          member.memberRole,
          member.baseWord,
          member.baseMeaning,
          member.childFriendlyMeaning,
          member.meaningBinKey,
          JSON.stringify(memberParts(member)),
          JSON.stringify(MEMBER_JOINS),
          member.prefixVariant,
          index + 3,
          sha256(canonicalJson(member)),
          sourceMetadata,
          loaded.manifest.source.path,
        ],
      );
    }
    const projection = await readReleasedProjection(client, loaded.manifest);
    const dictionaryAfter = await dictionarySnapshot(client, loaded.manifest);
    const protectedAfter = await protectedCounts(client);
    if (dictionaryBefore.fingerprint !== dictionaryAfter.fingerprint) fail("Protected dictionary facts changed during profile release.");
    if (canonicalJson(protectedBefore) !== canonicalJson(protectedAfter)) fail("Protected learner/runtime rows changed during profile release.");
    await client.query("commit");
    console.log(JSON.stringify({
      status: "applied_and_verified",
      releaseId: loaded.manifest.releaseId,
      contentId: loaded.manifest.contentId,
      packageSha256: loaded.packageSha256,
      ...projection,
      approvedProductionProjectionSha256: APPROVED_PRODUCTION_PROJECTION_SHA,
      created: { batches: 1, profiles: 1, members: 7 },
      updated: { canonicalWords: 0, metadata: 0, morphology: 0, dictations: 0, learnerRows: 0 },
      dictionaryFingerprint: dictionaryAfter.fingerprint,
      protectedCounts: protectedAfter,
    }, null, 2));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function verify(loaded: LoadedPackage): Promise<void> {
  const client = await connect();
  try {
    await client.query("begin read only");
    const projection = await readReleasedProjection(client, loaded.manifest);
    const dictionary = await dictionarySnapshot(client, loaded.manifest);
    const batch = await client.query(
      "select batch_status,source_folder_sha256 from canonical_teaching_dictionary_import_batches where id=$1",
      [projection.batchId],
    );
    if (
      batch.rowCount !== 1
      || batch.rows[0].batch_status !== "applied"
      || batch.rows[0].source_folder_sha256 !== loaded.packageSha256
    ) fail("Release ledger is not applied with the exact immutable package SHA.");
    await client.query("rollback");
    console.log(JSON.stringify({
      status: "verified",
      releaseId: loaded.manifest.releaseId,
      contentId: loaded.manifest.contentId,
      packageSha256: loaded.packageSha256,
      ...projection,
      approvedProductionHashes: {
        profile: loaded.manifest.source.approvedProductionProfileSha256,
        members: loaded.manifest.source.approvedProductionMembersSha256,
        projection: loaded.manifest.source.approvedProductionProjectionSha256,
      },
      exactRows: { profiles: 1, members: 7 },
      unchangedDictionaryCounts: dictionary.counts,
      dictionaryFingerprint: dictionary.fingerprint,
    }, null, 2));
  } finally {
    await client.end();
  }
}

async function setActivation(loaded: LoadedPackage, activate: boolean): Promise<void> {
  const operation = activate ? "reactivate" : "deactivate";
  requireMutationConfirmation(loaded, operation);
  const client = await connect();
  const batchId = stableUuid("batch", loaded.manifest.releaseId);
  try {
    await client.query("begin isolation level serializable");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);
    const dictionaryBefore = await dictionarySnapshot(client, loaded.manifest);
    const protectedBefore = await protectedCounts(client);
    if (!activate) {
      const references = await client.query(
        "select count(*)::int as count from assignment_items where metadata->>'microSkillKey'=$1",
        [PROFILE_KEY],
      );
      if (Number(references.rows[0].count) !== 0) {
        fail("Deactivation is blocked because persisted un- assignments exist; historical payloads must remain available.");
      }
      await readReleasedProjection(client, loaded.manifest, "active");
      await client.query(
        "update canonical_teaching_dictionary_prefix_members set assignment_eligible=false,row_status='superseded',updated_at=now() where import_batch_id=$1",
        [batchId],
      );
      await client.query(
        "update canonical_teaching_dictionary_prefix_profiles set row_status='superseded',updated_at=now() where import_batch_id=$1",
        [batchId],
      );
      await client.query(
        "update canonical_teaching_dictionary_import_batches set batch_status='deactivated',deactivated_at=now(),deactivation_note='Guarded staging profile deactivation',updated_at=now() where id=$1",
        [batchId],
      );
      await readReleasedProjection(client, loaded.manifest, "superseded");
    } else {
      await readReleasedProjection(client, loaded.manifest, "superseded");
      const active = await client.query(
        "select id from canonical_teaching_dictionary_prefix_profiles where micro_skill_key=$1 and row_status='active' for update",
        [PROFILE_KEY],
      );
      if (active.rowCount) fail("Reactivation would conflict with another active un- profile.");
      await client.query(
        "update canonical_teaching_dictionary_prefix_profiles set row_status='active',updated_at=now() where import_batch_id=$1",
        [batchId],
      );
      await client.query(
        "update canonical_teaching_dictionary_prefix_members set assignment_eligible=true,row_status='active',updated_at=now() where import_batch_id=$1",
        [batchId],
      );
      await client.query(
        "update canonical_teaching_dictionary_import_batches set batch_status='applied',deactivated_at=null,deactivation_note=null,updated_at=now() where id=$1",
        [batchId],
      );
      await readReleasedProjection(client, loaded.manifest, "active");
    }
    const dictionaryAfter = await dictionarySnapshot(client, loaded.manifest);
    const protectedAfter = await protectedCounts(client);
    if (dictionaryBefore.fingerprint !== dictionaryAfter.fingerprint) fail("Dictionary facts changed during activation control.");
    if (canonicalJson(protectedBefore) !== canonicalJson(protectedAfter)) fail("Protected rows changed during activation control.");
    await client.query("commit");
    console.log(JSON.stringify({
      status: activate ? "reactivated_and_verified" : "deactivated_and_verified",
      releaseId: loaded.manifest.releaseId,
      batchId,
      packageSha256: loaded.packageSha256,
      dictionaryFingerprint: dictionaryAfter.fingerprint,
      protectedCounts: protectedAfter,
    }, null, 2));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const loaded = await loadPackage();
  const command = process.argv[2] ?? "";
  if (command === "validate") {
    console.log(JSON.stringify({
      status: "valid",
      releaseId: loaded.manifest.releaseId,
      contentId: loaded.manifest.contentId,
      packageSha256: loaded.packageSha256,
      sourceSha256: loaded.manifest.source.sha256,
      approvedProductionHashes: {
        profile: loaded.manifest.source.approvedProductionProfileSha256,
        members: loaded.manifest.source.approvedProductionMembersSha256,
        projection: loaded.manifest.source.approvedProductionProjectionSha256,
      },
      rows: loaded.manifest.rowCounts,
      productionRejected: true,
    }, null, 2));
    return;
  }
  if (command === "plan") return plan(loaded);
  if (command === "release") return release(loaded);
  if (command === "verify") return verify(loaded);
  if (command === "deactivate") return setActivation(loaded, false);
  if (command === "reactivate") return setActivation(loaded, true);
  fail("Use validate, plan, release, verify, deactivate, or reactivate.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
