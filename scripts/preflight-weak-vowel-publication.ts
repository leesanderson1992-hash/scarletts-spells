#!/usr/bin/env node
/** Read-only, live-source preflight for the reviewed weak-vowel import package. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";
import { repairSourceFingerprint } from "../lib/teaching-dictionary-manager/weak-vowel-repair";
import { loadWeakVowelRepairInventory } from "./weak-vowel-repair-source";

type Candidate = {
  canonicalWordId: string;
  spelling: string;
  microSkillKey: string;
  sourceFingerprint: string;
  reviewStatus: string;
  sharedDefinition: { definition: string };
  routeContent: { routeId: string; routeVersion: string; microSkillKey: string;
    wordMeaning: string; wordSum: string; content: { weakVowel: {
      sourceFingerprint: string;
      wordRecording: { src: string; sha256: string };
      sentenceRecording: { src: string; sha256: string };
    } } };
};

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const sha256 = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const shaFile = (path: string): string => sha256(readFileSync(path));
const key = (id: string, skill: string): string => `${id}|${skill}`;

async function main() {
  const envFile = arg("--env-file");
  if (envFile) process.loadEnvFile(resolve(envFile));
  const databaseUrl = process.env.WEAK_VOWEL_DATABASE_URL ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
  if (!databaseUrl) throw new Error("WEAK_VOWEL_DATABASE_URL_REQUIRED");
  const packagePath = resolve(arg("--package") ?? "content/secret-life-of-vowels/weak-vowel-route-content-candidates.json");
  const sheetPath = resolve(arg("--sheet") ?? "content/secret-life-of-vowels/reviewed-sheet-snapshot.json");
  const manifestPath = resolve(arg("--audio-manifest") ?? "public/audio/secret-life-of-vowels/reviewed/manifest.json");
  const definitionsPath = resolve(arg("--definitions") ?? "content/secret-life-of-vowels/approved-shared-definitions.json");
  const publicRoot = resolve(arg("--public-root") ?? "public");
  const packageData = JSON.parse(readFileSync(packagePath, "utf8")) as {
    schemaVersion: string; reviewStatus: string; assignedPairCount: number;
    sheetSha256: string; audioManifestSha256: string; sharedDefinitionsSha256: string;
    sourceAuthorityFingerprint: string; rows: Candidate[];
  };
  if (packageData.schemaVersion !== "weak_vowel_route_candidates_v1" || packageData.reviewStatus !== "candidate" ||
    packageData.sheetSha256 !== shaFile(sheetPath) || packageData.audioManifestSha256 !== shaFile(manifestPath) ||
    packageData.sharedDefinitionsSha256 !== shaFile(definitionsPath)) throw new Error("REVIEW_PACKAGE_SOURCE_HASH_CHANGED");
  const sheet = JSON.parse(readFileSync(sheetPath, "utf8")) as { rows: Array<Record<string, string>> };
  const sheetByPair = new Map(sheet.rows.map((row) => [key(row.canonical_word_id, row.micro_skill_key), row]));
  const inventory = await loadWeakVowelRepairInventory(databaseUrl, "production");
  if (packageData.sourceAuthorityFingerprint !== inventory.manifest.reconciliation.sourceFingerprint)
    throw new Error("LIVE_ASSIGNMENT_AUTHORITY_CHANGED");
  const liveByPair = new Map(inventory.sources.map((row) => [key(String(row.word.id), row.microSkillKey), row]));
  const assigned = inventory.sources.filter((row) => row.assignmentStatus === "assigned");
  if (assigned.length !== packageData.assignedPairCount || packageData.rows.length !== assigned.length ||
    new Set(packageData.rows.map((row) => key(row.canonicalWordId, row.microSkillKey))).size !== assigned.length)
    throw new Error("LIVE_ASSIGNMENT_COVERAGE_CHANGED");
  const failures: Array<{ pair: string; reason: string }> = [];
  const fail = (pair: string, reason: string) => failures.push({ pair, reason });
  const clipHashes = new Map<string, string>();
  for (const row of packageData.rows) {
    const pair = key(row.canonicalWordId, row.microSkillKey);
    const live = liveByPair.get(pair);
    const reviewed = sheetByPair.get(pair);
    const facts = row.routeContent.content.weakVowel;
    if (!live || live.assignmentStatus !== "assigned") { fail(pair, "PAIR_NOT_ASSIGNED"); continue; }
    if (!reviewed || reviewed.assignment_status !== "assigned") { fail(pair, "REVIEWED_PAIR_MISSING"); continue; }
    if (repairSourceFingerprint(live) !== row.sourceFingerprint || reviewed.source_fingerprint !== row.sourceFingerprint ||
      facts.sourceFingerprint !== row.sourceFingerprint) fail(pair, "LIVE_SOURCE_FINGERPRINT_CHANGED");
    if (row.spelling !== live.word.display_word || row.routeContent.routeId !== "weak_vowel_word_lab" ||
      row.routeContent.routeVersion !== "v1" || row.routeContent.microSkillKey !== row.microSkillKey ||
      row.routeContent.wordMeaning !== row.sharedDefinition.definition || row.reviewStatus !== "candidate")
      fail(pair, "ROUTE_IDENTITY_OR_DEFINITION_CHANGED");
    if (!reviewed.dinner_decision?.startsWith("Approve") || !reviewed.dictation_decision?.startsWith("Approve") ||
      reviewed.part1_decision !== "Approve") fail(pair, "SHEET_REVIEW_NOT_APPROVED");
    for (const [kind, clip, expected] of [
      ["word", facts.wordRecording, reviewed.word_audio_sha256],
      ["sentence", facts.sentenceRecording, reviewed.rhythm_recording_sha256],
    ] as const) {
      if (!/^\/audio\/[a-z0-9/_-]+\.mp3$/i.test(clip.src) || clip.sha256 !== expected) {
        fail(pair, `${kind.toUpperCase()}_AUDIO_IDENTITY_CHANGED`); continue;
      }
      const existing = clipHashes.get(clip.src);
      if (existing && existing !== clip.sha256) fail(pair, `${kind.toUpperCase()}_AUDIO_PATH_CONFLICT`);
      clipHashes.set(clip.src, clip.sha256);
    }
    for (const reason of weakVowelRouteBlockers(facts, {
      displayWord: row.spelling, dictationSentence: reviewed.rhythm_sentence_text,
      definition: row.routeContent.wordMeaning, microSkillKey: row.microSkillKey,
    })) fail(pair, `CONTENT:${reason}`);
  }
  for (const live of assigned) {
    const pair = key(String(live.word.id), live.microSkillKey);
    if (!packageData.rows.some((row) => key(row.canonicalWordId, row.microSkillKey) === pair)) fail(pair, "ASSIGNED_PAIR_OMITTED");
  }
  for (const [src, expected] of clipHashes) {
    const actual = shaFile(resolve(publicRoot, `.${src}`));
    if (actual !== expected) fail(src, "STAGED_AUDIO_HASH_CHANGED");
  }
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const ids = [...new Set(packageData.rows.map((row) => row.canonicalWordId))];
    const result = await client.query<{ canonical_word_id: string; definition: string }>(
      `select distinct on (canonical_word_id) canonical_word_id,definition
       from public.teaching_dictionary_definition_versions
       where canonical_word_id=any($1::uuid[]) and route_id is null
       order by canonical_word_id,published_at desc,id desc`, [ids]);
    const definitions = new Map(result.rows.map((row) => [row.canonical_word_id, row.definition]));
    for (const row of packageData.rows) if (definitions.get(row.canonicalWordId) !== row.sharedDefinition.definition)
      fail(key(row.canonicalWordId, row.microSkillKey), "LIVE_SHARED_DEFINITION_CHANGED");
    await client.query("ROLLBACK");
  } finally { await client.end(); }
  const result = { schemaVersion: "weak_vowel_publication_preflight_v1", assignedPairCount: assigned.length,
    validatedClipCount: clipHashes.size, failedPairCount: new Set(failures.map((row) => row.pair)).size,
    reviewState: "candidate_requires_governed_review", failures };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (failures.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "WEAK_VOWEL_PREFLIGHT_FAILED"}\n`);
  process.exitCode = 1;
});
