#!/usr/bin/env node
/** Reuse the newest approved nature family in natural's medial lesson fact. */
import pg from "pg";
import { loadWeakVowelRepairInventory } from "./weak-vowel-repair-source";
import { repairSourceFingerprint } from "../lib/teaching-dictionary-manager/weak-vowel-repair";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const actor = (process.env.ADMIN_USER_IDS ?? "").split(",")[0];
const wordId = "bd80fcac-79ff-573b-a0eb-a16530b15d4b";
const familyId = "8b283fe5-797f-5181-8045-4ea64097800e";
const skill = "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS";
const apply = process.argv.includes("--apply");
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
  !new URL(url).hostname.endsWith("pooler.supabase.com") ||
  !/^[a-f0-9-]{36}$/i.test(actor)) throw Error("SCHWA_PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
const source = (await loadWeakVowelRepairInventory(url, "production")).sources.find(row =>
  row.word.id === wordId && row.microSkillKey === skill && row.assignmentStatus === "assigned");
if (!source) throw Error("NATURAL_MEDIAL_RELATIONSHIP_MISSING");
const sourceFingerprint = repairSourceFingerprint(source);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  const family = await db.query<{ id: string; base_word_id: string; eligible: number }>(`
    select f.id,f.base_word_id,count(m.id) filter(where m.row_status='active'
      and m.review_status='approved_for_first_exposure' and m.assignment_eligible)::int eligible
    from public.canonical_teaching_dictionary_base_word_families f
    join public.canonical_teaching_dictionary_words base on base.id=f.base_word_id
    left join public.canonical_teaching_dictionary_base_word_family_members m on m.base_word_family_id=f.id
    where f.id=$1 and f.base_family_key='nature_base_family' and f.row_status='active'
      and f.review_status='approved_for_first_exposure' and base.row_status='active'
      and base.review_status='approved_for_first_exposure'
    group by f.id`, [familyId]);
  if (family.rows[0]?.eligible !== 2) throw Error("NATURE_FAMILY_NOT_APPROVED_AND_ELIGIBLE");
  const current = await db.query<{ content: Record<string, any>; content_version_id: string }>(`
    select v.content,p.content_version_id from public.adle_weak_vowel_content_publications p
    join public.teaching_dictionary_route_content_versions v on v.id=p.content_version_id
    where p.canonical_word_id=$1 and p.micro_skill_key=$2
    order by p.published_at desc,p.content_version_id desc limit 1`, [wordId,skill]);
  if (current.rowCount !== 1) throw Error("NATURAL_MEDIAL_PUBLICATION_MISSING");
  const content = structuredClone(current.rows[0].content);
  const facts = content.content?.weakVowel;
  if (facts?.target?.text !== "u" || facts.target.start !== 3 || facts.target.end !== 4 ||
    facts.wordRecording?.sha256 !== "eeecf99d86b64e120a15cfb6eee497f58814f17af1b76771b6879923d9e6e326")
    throw Error("NATURAL_MEDIAL_REVIEWED_FACTS_CHANGED");
  if (facts.familyDecision === "approve" && facts.familyAuthorityId === familyId) {
    await db.query("rollback");
    console.log(JSON.stringify({ environment: "production", mode: "already_published", contentVersionId: current.rows[0].content_version_id }));
  } else {
    if (current.rows[0].content_version_id !== "db4e9a5a-1ae8-40c8-9d55-9b4cc10b158f" ||
      facts.familyDecision !== "skip" || facts.familyAuthorityId !== null)
      throw Error("NATURAL_MEDIAL_PREDECESSOR_CHANGED");
    facts.sourceFingerprint = sourceFingerprint;
    facts.familyDecision = "approve";
    facts.familyAuthorityId = familyId;
    facts.activityEligibility.family = { status: "ready", reason: null };
    facts.reviewSourceReference = `${facts.reviewSourceReference}; newest approved nature family ${familyId} reused 2026-10-29`;
    const sentence = "The natural cave formed without people building it.";
    const blockers = weakVowelRouteBlockers(facts, { displayWord: "natural", definition: content.wordMeaning,
      dictationSentence: sentence, microSkillKey: skill });
    if (blockers.length) throw Error(`NATURAL_MEDIAL_FAMILY_BLOCKED:${blockers.join(",")}`);
    const draft = await db.query<{ id: string }>(`insert into public.teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
      values($1,'natural','en-GB',$2::jsonb,'approved_submission',$3,$4::uuid) returning id`,
      [wordId,JSON.stringify({ displayWord: "natural", definition: content.wordMeaning, dictationSentence: sentence,
        skillKeys: [skill], routeContents: [content], canonicalMorphology: { parts: [], joins: [], transformations: [] } }),
      "Owner-approved newer equivalent nature family reused for medial natural 2026-10-29",actor]);
    const staged = await db.query<{ ids: string[] }>("select public.stage_teaching_dictionary_route_draft($1::uuid,$2::uuid) ids", [draft.rows[0].id,actor]);
    if (staged.rows[0].ids.length !== 1) throw Error("NATURAL_MEDIAL_FAMILY_STAGE_FAILED");
    const versionId = staged.rows[0].ids[0];
    await db.query("select public.review_teaching_dictionary_route_content($1::uuid,$2::uuid)", [versionId,actor]);
    await db.query("select public.publish_adle_weak_vowel_content_v1($1::uuid,$2::uuid,$3,$4,$5)",
      [versionId,actor,sourceFingerprint,facts.wordRecording.sha256,facts.sentenceRecording.sha256]);
    if (apply) await db.query("commit"); else await db.query("rollback");
    console.log(JSON.stringify({ environment: "production", mode: apply ? "published" : "rollback_proof",
      word: "natural", skill, familyId, contentVersionId: versionId }));
  }
} catch(error) { await db.query("rollback").catch(() => undefined); throw error; }
finally { await db.end(); }
