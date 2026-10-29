#!/usr/bin/env node
/** Governed staging review and publication of four owner-approved Initial A words. */
import { createHash } from "node:crypto";
import pg from "pg";
import { loadWeakVowelRepairInventory } from "./weak-vowel-repair-source";
import { repairSourceFingerprint } from "../lib/teaching-dictionary-manager/weak-vowel-repair";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";
import { deviceSpeechSource } from "../lib/adle/weak-vowel/audio-source";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!url || !ref || !new URL(url).username.endsWith(ref) ||
  !new URL(url).hostname.endsWith("pooler.supabase.com") || !/^[a-f0-9-]{36}$/i.test(actor ?? ""))
  throw Error("SCHWA_STAGING_TARGET_OR_ACTOR_MISMATCH");
const apply = process.argv.includes("--apply");
const skill = "D4_SCHWA_INITIAL_A_INITIAL";
const words = ["about", "again", "around", "away"];
const definitions = new Map([
  ["about", "On the subject of something, or roughly a certain amount."],
  ["again", "One more time."],
  ["around", "On all sides of something or moving in a circle near it."],
  ["away", "At a distance from a place or in another direction."],
]);
const sentences = new Map([
  ["about", "We read a story about a brave mouse."],
  ["again", "Please read the last line again."],
  ["around", "The dog chased the cat around the park."],
  ["away", "The bird flew away from the cat."],
]);
const inventory = await loadWeakVowelRepairInventory(url, "staging");
const sources = new Map(inventory.sources.filter(source => source.microSkillKey === skill &&
  source.assignmentStatus === "assigned").map(source => [source.word.display_word, source]));
if (words.some(word => !sources.has(word))) throw Error(`INITIAL_A_STAGING_RELATIONSHIPS_MISSING:${JSON.stringify(
  inventory.sources.filter(source => source.microSkillKey === skill && words.includes(source.word.display_word))
    .map(source => ({ word: source.word.display_word, status: source.assignmentStatus,
      decisions: source.authority.decisions.map(row => row.reasonCodes) })))}`);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='90s'");
  const ready = (status: "ready" | "not_applicable") => ({ status, reason: null });
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  const output: Array<{ word: string; contentVersionId: string }> = [];
  for (const word of words) {
    const source = sources.get(word)!;
    const definition = definitions.get(word)!;
    const sentence = sentences.get(word)!;
    const approved = source.dictations.filter(row => row.review_status === "approved_for_first_exposure" &&
      row.dictation_sentence === sentence);
    if (source.word.review_status !== "approved_for_first_exposure" || approved.length !== 1)
      throw Error(`INITIAL_A_STAGING_APPROVAL_CHANGED:${word}`);
    const existing = await db.query(`select p.content_version_id from public.adle_weak_vowel_content_publications p
      where p.canonical_word_id=$1 and p.micro_skill_key=$2 order by p.published_at desc limit 1`, [source.word.id,skill]);
    if (existing.rowCount) { output.push({ word, contentVersionId: existing.rows[0].content_version_id }); continue; }
    const targetStart = sentence.toLocaleLowerCase("en-GB").indexOf(word);
    if (targetStart < 0 || sentence.toLocaleLowerCase("en-GB").lastIndexOf(word) !== targetStart)
      throw Error(`INITIAL_A_SENTENCE_TARGET_AMBIGUOUS:${word}`);
    const wordSrc = deviceSpeechSource(word);
    const sentenceSrc = deviceSpeechSource(sentence);
    const sourceFingerprint = repairSourceFingerprint(source);
    const facts = {
      schemaVersion: "weak_vowel_route_facts_v1", sourceFingerprint,
      activityEligibility: { dinner: ready("ready"), detective: ready("ready"),
        memoryLock: ready("ready"), dictation: ready("ready"), family: ready("not_applicable") },
      wordSense: null, pronunciationId: `device-voice:${word}`,
      wordRecording: { src: wordSrc, sha256: sha(wordSrc) }, spokenSyllableCount: 2,
      acceptedCutSets: [[1]],
      target: { text: "a", start: 0, end: 1, syllableIndex: 1, soundType: "other_unstressed" },
      selectionTarget: { text: "a", start: 0, end: 1 }, detectiveVowelIndex: 0,
      familyDecision: "skip", familyAuthorityId: null,
      sentenceRecording: { src: sentenceSrc, sha256: sha(sentenceSrc) },
      sentenceTarget: { start: targetStart, end: targetStart + word.length },
      reviewSourceReference: "Owner-approved Initial A pages and four word facts 2026-10-29; approved dictionary definition and sentence; temporary device voice for British recording improvement",
    };
    const blockers = weakVowelRouteBlockers(facts, { displayWord: word, definition,
      dictationSentence: sentence, microSkillKey: skill });
    if (blockers.length) throw Error(`INITIAL_A_ROUTE_FACTS_BLOCKED:${word}:${blockers.join(",")}`);
    const routeContent = { routeId: "weak_vowel_word_lab", routeVersion: "v1", microSkillKey: skill,
      wordMeaning: definition, wordSum: "", content: { weakVowel: facts } };
    const draft = await db.query<{ id: string }>(`insert into public.teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
      values($1,$2,'en-GB',$3::jsonb,'approved_submission',$4,$5::uuid) returning id`,
      [source.word.id,word,JSON.stringify({ displayWord: word, definition, dictationSentence: sentence,
        skillKeys: [skill], routeContents: [routeContent],
        canonicalMorphology: { parts: [], joins: [], transformations: [] } }),
      "Initial A owner-approved lesson facts 2026-10-29",actor]);
    const staged = await db.query<{ ids: string[] }>("select public.stage_teaching_dictionary_route_draft($1::uuid,$2::uuid) ids", [draft.rows[0].id,actor]);
    if (staged.rows[0].ids.length !== 1) throw Error(`INITIAL_A_STAGE_FAILED:${word}`);
    const contentVersionId = staged.rows[0].ids[0];
    await db.query("select public.review_teaching_dictionary_route_content($1::uuid,$2::uuid)", [contentVersionId,actor]);
    await db.query("select public.publish_adle_weak_vowel_content_v1($1::uuid,$2::uuid,$3,$4,$5)",
      [contentVersionId,actor,sourceFingerprint,sha(wordSrc),sha(sentenceSrc)]);
    output.push({ word, contentVersionId });
  }
  if (output.length !== 4) throw Error("INITIAL_A_PUBLICATION_COUNT_MISMATCH");
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ environment: "staging", mode: apply ? "published" : "rollback_proof", output }));
} catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
finally { await db.end(); }
