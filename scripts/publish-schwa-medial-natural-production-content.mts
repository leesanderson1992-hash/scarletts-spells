#!/usr/bin/env node
/** Review and publish the newly approved medial u target, reusing natural's British audio. */
import pg from "pg";
import { loadWeakVowelRepairInventory } from "./weak-vowel-repair-source";
import { repairSourceFingerprint } from "../lib/teaching-dictionary-manager/weak-vowel-repair";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const ref = "wwohrqtunajrbwxyssjf";
const actor = (process.env.ADMIN_USER_IDS ?? "").split(",")[0];
if (!url || !ref || !new URL(url).username.includes(ref) ||
  !new URL(url).hostname.endsWith("pooler.supabase.com") || !/^[a-f0-9-]{36}$/i.test(actor ?? ""))
  throw Error("SCHWA_PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
const apply = process.argv.includes("--apply");
const skill = "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS";
const wordId = "bd80fcac-79ff-573b-a0eb-a16530b15d4b";
const source = (await loadWeakVowelRepairInventory(url, "production")).sources.find(row =>
  row.word.id === wordId && row.microSkillKey === skill && row.assignmentStatus === "assigned");
if (!source) throw Error("NATURAL_PRODUCTION_MEDIAL_RELATIONSHIP_MISSING");
const sourceFingerprint = repairSourceFingerprint(source);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='90s'");
  const existing = await db.query(`select content_version_id from public.adle_weak_vowel_content_publications
    where canonical_word_id=$1 and micro_skill_key=$2 order by published_at desc limit 1`, [wordId,skill]);
  if (existing.rowCount) {
    await db.query("rollback");
    console.log(JSON.stringify({ environment: "production", mode: "already_published", contentVersionId: existing.rows[0].content_version_id }));
  } else {
    const previous = await db.query<{ content: Record<string, any>; content_version_id: string }>(`
      select v.content,p.content_version_id from public.adle_weak_vowel_content_publications p
      join public.teaching_dictionary_route_content_versions v on v.id=p.content_version_id
      where p.canonical_word_id=$1 and p.micro_skill_key='D4_SCHWA_FINAL_AL'
      order by p.published_at desc,p.content_version_id desc limit 1`, [wordId]);
    if (previous.rowCount !== 1) throw Error("NATURAL_APPROVED_BRITISH_SOURCE_MISSING");
    const content = structuredClone(previous.rows[0].content);
    const facts = content.content?.weakVowel;
    const sentence = "The natural cave formed without people building it.";
    if (!facts || facts.wordRecording?.sha256 !== "eeecf99d86b64e120a15cfb6eee497f58814f17af1b76771b6879923d9e6e326" ||
      facts.spokenSyllableCount !== 3 || JSON.stringify(facts.acceptedCutSets) !== "[[3,4]]" ||
      facts.sentenceRecording?.sha256 !== "eeaa5be57090297bccea82fe89506a52ed60b01f0237c8994e853e6ced932be6" ||
      facts.sentenceTarget?.start !== 4 || facts.sentenceTarget?.end !== 11)
      throw Error("NATURAL_APPROVED_SPOKEN_FACTS_CHANGED");
    const currentSentence = await db.query(`select 1 from public.canonical_teaching_dictionary_dictation_sentences
      where canonical_word_id=$1 and dictation_sentence=$2 and row_status='active' and review_status='approved_for_first_exposure'`, [wordId,sentence]);
    if (currentSentence.rowCount !== 1) throw Error("NATURAL_APPROVED_DICTATION_CHANGED");
    content.microSkillKey = skill;
    facts.sourceFingerprint = sourceFingerprint;
    facts.target = { text: "u", start: 3, end: 4, syllableIndex: 2, soundType: "schwa" };
    facts.selectionTarget = { text: "u", start: 3, end: 4 };
    facts.detectiveVowelIndex = 3;
    facts.familyDecision = "skip";
    facts.familyAuthorityId = null;
    facts.reviewSourceReference = `Owner-approved natural British word and sentence audio, pronunciation and nat·u·ral cuts from ${previous.rows[0].content_version_id}; owner-approved medial written u target 2026-10-29`;
    const blockers = weakVowelRouteBlockers(facts, { displayWord: "natural", definition: content.wordMeaning,
      dictationSentence: sentence, microSkillKey: skill });
    if (blockers.length) throw Error(`NATURAL_MEDIAL_FACTS_BLOCKED:${blockers.join(",")}`);
    const draft = await db.query<{ id: string }>(`insert into public.teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
      values($1,'natural','en-GB',$2::jsonb,'approved_submission',$3,$4::uuid) returning id`,
      [wordId,JSON.stringify({ displayWord: "natural", definition: content.wordMeaning, dictationSentence: sentence,
        skillKeys: [skill], routeContents: [content], canonicalMorphology: { parts: [], joins: [], transformations: [] } }),
      "Owner-approved medial natural target 2026-10-29; prior British recording and cuts reused",actor]);
    const staged = await db.query<{ ids: string[] }>("select public.stage_teaching_dictionary_route_draft($1::uuid,$2::uuid) ids", [draft.rows[0].id,actor]);
    if (staged.rows[0].ids.length !== 1) throw Error("NATURAL_MEDIAL_STAGE_FAILED");
    const versionId = staged.rows[0].ids[0];
    await db.query("select public.review_teaching_dictionary_route_content($1::uuid,$2::uuid)", [versionId,actor]);
    await db.query("select public.publish_adle_weak_vowel_content_v1($1::uuid,$2::uuid,$3,$4,$5)",
      [versionId,actor,sourceFingerprint,facts.wordRecording.sha256,facts.sentenceRecording.sha256]);
    if (apply) await db.query("commit"); else await db.query("rollback");
    console.log(JSON.stringify({ environment: "production", mode: apply ? "published" : "rollback_proof",
      word: "natural", skill, contentVersionId: versionId }));
  }
} catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
finally { await db.end(); }
