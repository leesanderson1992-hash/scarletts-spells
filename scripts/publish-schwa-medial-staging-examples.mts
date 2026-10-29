#!/usr/bin/env node
/** Re-review three already approved medial examples in disposable staging. */
import pg from "pg";
import { loadWeakVowelRepairInventory } from "./weak-vowel-repair-source";
import { repairSourceFingerprint } from "../lib/teaching-dictionary-manager/weak-vowel-repair";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

process.loadEnvFile(".env.local"); process.loadEnvFile(".env.staging.local");
const prodUrl = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const stageUrl = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
if (!prodUrl || !new URL(prodUrl).username.includes("wwohrqtunajrbwxyssjf") ||
  !stageUrl || !ref || !new URL(stageUrl).username.endsWith(ref) ||
  !new URL(stageUrl).hostname.endsWith("pooler.supabase.com") || !/^[a-f0-9-]{36}$/i.test(actor ?? ""))
  throw Error("SCHWA_STAGING_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const words = ["camera", "different", "family"];
const skill = "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS";
const inventory = await loadWeakVowelRepairInventory(stageUrl, "staging");
const sources = new Map(inventory.sources.filter(row => row.microSkillKey === skill &&
  row.assignmentStatus === "assigned" && words.includes(row.word.display_word))
  .map(row => [row.word.display_word, row]));
if (sources.size !== 3) throw Error("MEDIAL_STAGING_RELATIONSHIPS_MISSING");
const prod = new pg.Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
const stage = new pg.Client({ connectionString: stageUrl, ssl: { rejectUnauthorized: false } });
await prod.connect(); await stage.connect();
try {
  await prod.query("begin read only");
  const originals = (await prod.query(`select distinct on (w.display_word) w.display_word,v.id,v.content,
    s.dictation_sentence from public.adle_weak_vowel_content_publications p
    join public.teaching_dictionary_route_content_versions v on v.id=p.content_version_id
    join public.canonical_teaching_dictionary_words w on w.id=p.canonical_word_id
    join lateral (select dictation_sentence from public.canonical_teaching_dictionary_dictation_sentences
      where canonical_word_id=w.id and row_status='active' and review_status='approved_for_first_exposure'
      order by created_at desc,id desc limit 1) s on true
    where w.display_word=any($1::text[]) and p.micro_skill_key=$2
    order by w.display_word,p.published_at desc,p.content_version_id desc`, [words,skill])).rows;
  if (originals.length !== 3) throw Error("MEDIAL_PRODUCTION_REVIEWED_CONTENT_MISSING");
  await prod.query("rollback");
  await stage.query("begin isolation level serializable");
  await stage.query("set local lock_timeout='5s'"); await stage.query("set local statement_timeout='90s'");
  const result = [];
  for (const word of words) {
    const source = sources.get(word)!;
    const original = originals.find(row => row.display_word === word)!;
    const prior = await stage.query(`select content_version_id from public.adle_weak_vowel_content_publications
      where canonical_word_id=$1 and micro_skill_key=$2 order by published_at desc limit 1`,[source.word.id,skill]);
    if (prior.rowCount) { result.push({ word, status: "already_published" }); continue; }
    const content = structuredClone(original.content);
    const facts = content.content?.weakVowel;
    if (!facts || content.microSkillKey !== skill || !facts.wordRecording?.sha256 || !facts.sentenceRecording?.sha256)
      throw Error(`MEDIAL_PRODUCTION_FACTS_MISSING:${word}`);
    const approvedSentence = source.dictations.filter(row => row.review_status === "approved_for_first_exposure" &&
      row.dictation_sentence === original.dictation_sentence);
    if (approvedSentence.length !== 1) throw Error(`MEDIAL_STAGING_SENTENCE_CHANGED:${word}`);
    const definition = await stage.query(`select definition from public.teaching_dictionary_definition_versions
      where canonical_word_id=$1 and route_id is null order by published_at desc,id desc limit 1`,[source.word.id]);
    if (definition.rows[0]?.definition !== content.wordMeaning) throw Error(`MEDIAL_STAGING_DEFINITION_CHANGED:${word}`);
    const sourceFingerprint = repairSourceFingerprint(source);
    facts.sourceFingerprint = sourceFingerprint;
    facts.reviewSourceReference = `${facts.reviewSourceReference ?? ""}; Production reviewed medial content ${original.id}; staging re-review 2026-10-29`;
    const blockers = weakVowelRouteBlockers(facts,{ displayWord: word, definition: content.wordMeaning,
      dictationSentence: original.dictation_sentence, microSkillKey: skill });
    if (blockers.length) throw Error(`MEDIAL_STAGING_FACTS_BLOCKED:${word}:${blockers.join(",")}`);
    const draft = await stage.query(`insert into public.teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
      values($1,$2,'en-GB',$3::jsonb,'approved_submission',$4,$5::uuid) returning id`,
      [source.word.id,word,JSON.stringify({ displayWord: word,definition: content.wordMeaning,
        dictationSentence: original.dictation_sentence,skillKeys:[skill],routeContents:[content],
        canonicalMorphology:{ parts:[],joins:[],transformations:[] } }),
      `Approved Production medial content ${original.id} staging proof`,actor]);
    const staged = await stage.query("select public.stage_teaching_dictionary_route_draft($1::uuid,$2::uuid) ids",[draft.rows[0].id,actor]);
    if (staged.rows[0].ids.length !== 1) throw Error(`MEDIAL_STAGING_STAGE_FAILED:${word}`);
    const versionId = staged.rows[0].ids[0];
    await stage.query("select public.review_teaching_dictionary_route_content($1::uuid,$2::uuid)",[versionId,actor]);
    await stage.query("select public.publish_adle_weak_vowel_content_v1($1::uuid,$2::uuid,$3,$4,$5)",
      [versionId,actor,sourceFingerprint,facts.wordRecording.sha256,facts.sentenceRecording.sha256]);
    result.push({ word, status: apply ? "published" : "rollback_proof", contentVersionId: versionId });
  }
  if (apply) await stage.query("commit"); else await stage.query("rollback");
  console.log(JSON.stringify({ environment: "staging", mode: apply ? "published" : "rollback_proof", result }));
} catch(error) { await prod.query("rollback").catch(()=>undefined); await stage.query("rollback").catch(()=>undefined); throw error; }
finally { await prod.end(); await stage.end(); }
