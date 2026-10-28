#!/usr/bin/env node
/** Staging-only governed route review and publication for the 14 owner-approved facts. */
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadWeakVowelRepairInventory } from "./weak-vowel-repair-source";
import { repairSourceFingerprint } from "../lib/teaching-dictionary-manager/weak-vowel-repair";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!url || !ref || !new URL(url).username.endsWith(ref) || !new URL(url).hostname.endsWith("pooler.supabase.com") ||
  !/^[a-f0-9-]{36}$/i.test(actor ?? "")) throw Error("SCHWA_STAGING_TARGET_OR_ACTOR_MISMATCH");
const apply = process.argv.includes("--apply");
const reviewed = JSON.parse(readFileSync("content/secret-life-of-vowels/schwa-final-et-al-reviewed-word-facts.json", "utf8")) as {
  rows: Array<{ canonicalWordId: string; word: string; microSkillKey: string; reviewStatus: string;
    dictationSentence: string; routeContent: { wordMeaning: string; content: { weakVowel: Record<string, unknown> & {
      wordRecording: { sha256: string }; sentenceRecording: { sha256: string } } } } }>;
};
if (reviewed.rows.length !== 14 || reviewed.rows.some(row => row.reviewStatus !== "owner_approved_word_facts"))
  throw Error("SCHWA_REVIEWED_CONTENT_SET_CHANGED");
const inventory = await loadWeakVowelRepairInventory(url, "staging");
const assignments = new Map(inventory.sources.filter(row => row.assignmentStatus === "assigned")
  .map(row => [`${row.word.id}|${row.microSkillKey}`, row]));
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='90s'");
  const already = await db.query<{ n: number }>("select count(*)::int n from public.adle_weak_vowel_content_publications where micro_skill_key in ('D4_SCHWA_FINAL_ET','D4_SCHWA_FINAL_AL')");
  if (already.rows[0].n !== 0) throw Error("STAGING_NEW_SKILL_PUBLICATIONS_ALREADY_EXIST");
  for (const row of reviewed.rows) {
    const source = assignments.get(`${row.canonicalWordId}|${row.microSkillKey}`);
    if (!source || source.word.display_word !== row.word) throw Error(`STAGING_ASSIGNMENT_MISSING:${row.word}`);
    const sourceFingerprint = repairSourceFingerprint(source);
    const routeContent = structuredClone(row.routeContent);
    routeContent.content.weakVowel.sourceFingerprint = sourceFingerprint;
    const facts = routeContent.content.weakVowel;
    const blockers = weakVowelRouteBlockers(facts as never, { displayWord: row.word, dictationSentence: row.dictationSentence,
      definition: routeContent.wordMeaning, microSkillKey: row.microSkillKey });
    if (blockers.length) throw Error(`STAGING_ROUTE_FACTS_BLOCKED:${row.word}:${blockers.join(",")}`);
    const payload = { displayWord: row.word, definition: routeContent.wordMeaning,
      dictationSentence: row.dictationSentence, skillKeys: [row.microSkillKey], routeContents: [routeContent],
      canonicalMorphology: { parts: [], joins: [], transformations: [] } };
    const draft = await db.query<{ id: string }>(`insert into public.teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
      values($1,$2,'en-GB',$3::jsonb,'approved_submission',$4,$5::uuid) returning id`,
      [row.canonicalWordId,row.word,JSON.stringify(payload),`Staging route proof: owner-approved ${row.microSkillKey} 2026-10-28`,actor]);
    const staged = await db.query<{ ids: string[] }>("select public.stage_teaching_dictionary_route_draft($1::uuid,$2::uuid) ids", [draft.rows[0].id,actor]);
    if (staged.rows[0].ids.length !== 1) throw Error(`STAGING_ROUTE_STAGE_FAILED:${row.word}`);
    const versionId = staged.rows[0].ids[0];
    await db.query("select public.review_teaching_dictionary_route_content($1::uuid,$2::uuid)", [versionId,actor]);
    await db.query("select public.publish_adle_weak_vowel_content_v1($1::uuid,$2::uuid,$3,$4,$5)",
      [versionId,actor,sourceFingerprint,facts.wordRecording.sha256,facts.sentenceRecording.sha256]);
  }
  const proof = await db.query<{ n: number }>("select count(*)::int n from public.adle_weak_vowel_content_publications where micro_skill_key in ('D4_SCHWA_FINAL_ET','D4_SCHWA_FINAL_AL')");
  if (proof.rows[0].n !== 14) throw Error("STAGING_PUBLICATION_READBACK_FAILED");
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ environment: "staging", mode: apply ? "published" : "rollback_proof", reviewedPairs: 14,
    publicationRows: proof.rows[0].n, durableWrites: apply ? "governed_staging_content" : 0 }));
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally { await db.end(); }
