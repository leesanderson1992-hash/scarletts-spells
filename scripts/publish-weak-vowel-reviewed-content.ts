#!/usr/bin/env node
/** Atomic initial publication of owner-reviewed weak-vowel route facts only.
 * This never changes dictionary assignments, route activation or learner data.
 * Later words use the same per-word Teaching Dictionary review/publish actions. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

type Candidate = { canonicalWordId: string; spelling: string; microSkillKey: string;
  sourceFingerprint: string; sharedDefinition: { definition: string };
  routeContent: { routeId: string; routeVersion: string; microSkillKey: string;
    wordMeaning: string; wordSum: string; content: { weakVowel: {
      sourceFingerprint: string; wordRecording: { sha256: string };
      sentenceRecording: { sha256: string };
    } } } };
const arg = (name: string) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

async function main() {
  const envFile = arg("--env-file");
  if (envFile) process.loadEnvFile(resolve(envFile));
  const databaseUrl = process.env.WEAK_VOWEL_DATABASE_URL ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
  if (!databaseUrl) throw new Error("WEAK_VOWEL_DATABASE_URL_REQUIRED");
  const packagePath = resolve(arg("--package") ?? "content/secret-life-of-vowels/weak-vowel-route-content-candidates.json");
  const sheetPath = resolve(arg("--sheet") ?? "content/secret-life-of-vowels/reviewed-sheet-snapshot.json");
  const preflight = JSON.parse(execFileSync("npx", ["tsx", "scripts/preflight-weak-vowel-publication.ts",
    "--package", packagePath, "--sheet", sheetPath,
    ...(envFile ? ["--env-file", resolve(envFile)] : [])], {
    cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "--conditions=react-server" },
  })) as { assignedPairCount: number; failedPairCount: number; validatedClipCount: number };
  if (preflight.failedPairCount || preflight.assignedPairCount < 1) throw new Error("WEAK_VOWEL_PREFLIGHT_FAILED");
  const apply = process.argv.includes("--apply");
  const rollbackProof = process.argv.includes("--rollback-proof");
  if (apply && rollbackProof) throw new Error("CHOOSE_APPLY_OR_ROLLBACK_PROOF");
  if (!apply && !rollbackProof) {
    process.stdout.write(JSON.stringify({ mode: "read_only", ...preflight,
      next: "Apply only after the route-content migration is deployed; activation remains separate." }, null, 2) + "\n");
    return;
  }
  const actorId = arg("--actor-id") ?? process.env.ADMIN_USER_IDS?.split(",")[0]?.trim();
  if (!actorId || !uuid.test(actorId)) throw new Error("VERIFIED_ADMIN_ACTOR_ID_REQUIRED");
  const packageData = JSON.parse(readFileSync(packagePath, "utf8")) as { rows: Candidate[] };
  const sheet = JSON.parse(readFileSync(sheetPath, "utf8")) as {
    rows: Array<{ canonical_word_id: string; micro_skill_key: string; rhythm_sentence_text: string }>;
  };
  const sentences = new Map(sheet.rows.map((row) => [`${row.canonical_word_id}|${row.micro_skill_key}`, row.rhythm_sentence_text]));
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    if (rollbackProof) {
      const migration = readFileSync(resolve("supabase/migrations/20261021210000_publish_reviewed_weak_vowel_content.sql"), "utf8")
        .replace(/^begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
      await client.query(migration);
    }
    const actor = await client.query<{ id: string; email: string | null }>(
      "select id,email from auth.users where id=$1::uuid", [actorId]);
    if (actor.rowCount !== 1) throw new Error("VERIFIED_ADMIN_ACTOR_NOT_FOUND");
    const allowedIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((value) => value.trim());
    const allowedEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase());
    if (!allowedIds.includes(actorId) && !allowedEmails.includes(actor.rows[0].email?.toLowerCase() ?? ""))
      throw new Error("VERIFIED_ADMIN_ACTOR_NOT_ALLOWLISTED");
    const existing = await client.query("select count(*)::int n from public.adle_weak_vowel_content_publications");
    if (existing.rows[0].n !== 0) throw new Error("INITIAL_WEAK_VOWEL_PUBLICATION_ALREADY_STARTED");
    let published = 0;
    const proofSkills = new Set<string>();
    for (const row of packageData.rows) {
      if (rollbackProof && proofSkills.has(row.microSkillKey)) continue;
      const pair = `${row.canonicalWordId}|${row.microSkillKey}`;
      const sentence = sentences.get(pair);
      if (!sentence) throw new Error(`DICTATION_SENTENCE_MISSING:${pair}`);
      const current = await client.query<{ normalised_word: string; display_word: string }>(
        `select normalised_word,display_word from public.canonical_teaching_dictionary_words
         where id=$1::uuid and row_status='active' and dialect_code='en-GB' for share`, [row.canonicalWordId]);
      if (current.rowCount !== 1 || current.rows[0].display_word !== row.spelling)
        throw new Error(`CANONICAL_WORD_CHANGED:${pair}`);
      const payload = { displayWord: row.spelling, definition: row.sharedDefinition.definition,
        dictationSentence: sentence, skillKeys: [row.microSkillKey], routeContents: [row.routeContent],
        canonicalMorphology: { parts: [], joins: [], transformations: [] } };
      const draft = await client.query<{ id: string }>(
        `insert into public.teaching_dictionary_manager_drafts
           (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
         values($1::uuid,$2,'en-GB',$3::jsonb,'approved_submission',$4,$5::uuid) returning id`,
        [row.canonicalWordId, current.rows[0].normalised_word, JSON.stringify(payload),
          `Owner-approved weak-vowel Sheet; source ${row.sourceFingerprint}; route-only facts`, actorId]);
      const staged = await client.query<{ ids: string[] }>(
        "select public.stage_teaching_dictionary_route_draft($1::uuid,$2::uuid) ids", [draft.rows[0].id, actorId]);
      if (staged.rows[0].ids.length !== 1) throw new Error(`CONTENT_STAGE_FAILED:${pair}`);
      const versionId = staged.rows[0].ids[0];
      await client.query("select public.review_teaching_dictionary_route_content($1::uuid,$2::uuid)", [versionId, actorId]);
      const facts = row.routeContent.content.weakVowel;
      const result = await client.query<{ id: string }>(
        `select public.publish_adle_weak_vowel_content_v1($1::uuid,$2::uuid,$3,$4,$5) id`,
        [versionId, actorId, facts.sourceFingerprint,
          facts.wordRecording.sha256, facts.sentenceRecording.sha256]);
      if (result.rows[0].id !== versionId) throw new Error(`CONTENT_PUBLICATION_FAILED:${pair}`);
      published++;
      if (rollbackProof) proofSkills.add(row.microSkillKey);
    }
    if (published !== (rollbackProof ? 8 : preflight.assignedPairCount)) throw new Error("PUBLICATION_COUNT_MISMATCH");
    if (rollbackProof) {
      const staged = await client.query("select count(*)::int n from public.adle_weak_vowel_content_publications");
      if (staged.rows[0].n !== published) throw new Error("ROLLBACK_PROOF_READBACK_MISMATCH");
      await client.query("ROLLBACK");
      process.stdout.write(JSON.stringify({ mode: "rolled_back", skillsProved: proofSkills.size,
        publishedInsideTransaction: published, durableWrites: 0 }, null, 2) + "\n");
      return;
    }
    const proof = await client.query<{ n: number; distinct_pairs: number; activation_heads: number }>(
      `select count(*)::int n,
        count(distinct (canonical_word_id,micro_skill_key))::int distinct_pairs,
        (select count(*)::int from public.adle_route_activation_heads where route_id='weak_vowel_word_lab') activation_heads
       from public.adle_weak_vowel_content_publications`);
    if (proof.rows[0].n !== published || proof.rows[0].distinct_pairs !== published || proof.rows[0].activation_heads !== 0)
      throw new Error("PUBLICATION_PAIR_OR_ACTIVATION_READBACK_MISMATCH");
    await client.query("COMMIT");
    const readback = await client.query("select count(*)::int n from public.adle_weak_vowel_content_publications");
    if (readback.rows[0].n !== published) throw new Error("PUBLICATION_READBACK_MISMATCH");
    process.stdout.write(JSON.stringify({ mode: "published_route_content_only", published,
      activationChanged: false, learnerWrites: 0 }, null, 2) + "\n");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "WEAK_VOWEL_PUBLICATION_FAILED"}\n`);
  process.exitCode = 1;
});
