#!/usr/bin/env node
/** Copy three already published Production medial examples into staging only. */
import pg from "pg";
process.loadEnvFile(".env.local"); process.loadEnvFile(".env.staging.local");
const prodUrl = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const stageUrl = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!prodUrl || !new URL(prodUrl).username.includes("wwohrqtunajrbwxyssjf") ||
  !stageUrl || !ref || !new URL(stageUrl).username.endsWith(ref) ||
  !new URL(stageUrl).hostname.endsWith("pooler.supabase.com") ||
  !/^[a-f0-9-]{36}$/i.test(actor ?? "")) throw Error("SCHWA_STAGING_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const words = ["camera", "different", "family"];
const skill = "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS";
const prod = new pg.Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
const stage = new pg.Client({ connectionString: stageUrl, ssl: { rejectUnauthorized: false } });
const insert = async (table, row) => {
  const cols = Object.keys(row);
  await stage.query(`insert into public.${table} (${cols.map(col => `"${col}"`).join(",")})
    values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map(col => row[col]));
};
await prod.connect(); await stage.connect();
try {
  await prod.query("begin read only");
  const originals = (await prod.query(`select * from public.canonical_teaching_dictionary_words
    where normalised_word=any($1::text[]) and row_status='active' and review_status='approved_for_first_exposure'`, [words])).rows;
  if (originals.length !== 3) throw Error("MEDIAL_PRODUCTION_WORD_SET_CHANGED");
  const ids = originals.map(row => row.id);
  const metadata = (await prod.query(`select * from public.canonical_teaching_dictionary_word_metadata
    where canonical_word_id=any($1::uuid[]) and row_status='active'`, [ids])).rows;
  const dictations = (await prod.query(`select * from public.canonical_teaching_dictionary_dictation_sentences
    where canonical_word_id=any($1::uuid[]) and row_status='active' and review_status='approved_for_first_exposure'`, [ids])).rows;
  const publications = (await prod.query(`select distinct on (p.canonical_word_id) p.canonical_word_id,v.content
    from public.adle_weak_vowel_content_publications p join public.teaching_dictionary_route_content_versions v
      on v.id=p.content_version_id where p.canonical_word_id=any($1::uuid[]) and p.micro_skill_key=$2
    order by p.canonical_word_id,p.published_at desc,p.content_version_id desc`, [ids,skill])).rows;
  const mappings = (await prod.query(`select distinct on (correct_spelling_normalized)
    correct_spelling_normalized,misspelling_normalized,dialect_code,normalization_version
    from public.spelling_canonical_mappings where correct_spelling_normalized=any($1::text[]) and
      micro_skill_key=$2 and mapping_status='active' and resolver_visibility_status='visible'
    order by correct_spelling_normalized,created_at desc`, [words,skill])).rows;
  if (metadata.length !== 3 || dictations.length !== 3 || publications.length !== 3 || mappings.length !== 3 ||
    originals.some(word => publications.find(row => row.canonical_word_id === word.id)?.content?.wordMeaning == null ||
      !dictations.some(row => row.canonical_word_id === word.id))) throw Error("MEDIAL_APPROVED_SOURCE_INCOMPLETE");
  const batchIds = [...new Set([...originals,...metadata,...dictations].map(row => row.import_batch_id))];
  const batches = (await prod.query(`select * from public.canonical_teaching_dictionary_import_batches
    where id=any($1::uuid[])`, [batchIds])).rows;
  if (batches.length !== batchIds.length) throw Error("MEDIAL_SOURCE_BATCH_MISSING");
  await prod.query("rollback");
  await stage.query("begin"); await stage.query("set local lock_timeout='5s'");
  await stage.query("set local statement_timeout='90s'");
  for (const row of batches) if (!(await stage.query("select 1 from public.canonical_teaching_dictionary_import_batches where id=$1", [row.id])).rowCount)
    await insert("canonical_teaching_dictionary_import_batches",row);
  for (const word of originals) {
    const existing = await stage.query("select display_word from public.canonical_teaching_dictionary_words where id=$1", [word.id]);
    if (existing.rowCount && existing.rows[0].display_word !== word.display_word) throw Error(`MEDIAL_WORD_ID_CONFLICT:${word.display_word}`);
    if (!existing.rowCount) await insert("canonical_teaching_dictionary_words",word);
    for (const row of metadata.filter(row => row.canonical_word_id === word.id))
      if (!(await stage.query("select 1 from public.canonical_teaching_dictionary_word_metadata where id=$1", [row.id])).rowCount)
        await insert("canonical_teaching_dictionary_word_metadata",row);
    for (const row of dictations.filter(row => row.canonical_word_id === word.id))
      if (!(await stage.query("select 1 from public.canonical_teaching_dictionary_dictation_sentences where id=$1", [row.id])).rowCount)
        await insert("canonical_teaching_dictionary_dictation_sentences",row);
    const definition = publications.find(row => row.canonical_word_id === word.id).content.wordMeaning;
    const sentence = dictations.find(row => row.canonical_word_id === word.id).dictation_sentence;
    const latest = await stage.query(`select definition from public.teaching_dictionary_definition_versions
      where canonical_word_id=$1 and route_id is null order by published_at desc,id desc limit 1`,[word.id]);
    if (latest.rowCount && latest.rows[0].definition !== definition) throw Error(`MEDIAL_DEFINITION_CONFLICT:${word.display_word}`);
    if (!latest.rowCount) {
      const draft = await stage.query(`insert into public.teaching_dictionary_manager_drafts
        (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
        values($1,$2,'en-GB',$3::jsonb,'approved_submission',$4,$5::uuid) returning id`,
        [word.id,word.normalised_word,JSON.stringify({ displayWord: word.display_word, definition,
          dictationSentence: sentence }),"Approved Production medial example staging fixture",actor]);
      await stage.query(`insert into public.teaching_dictionary_definition_versions
        (canonical_word_id,route_id,micro_skill_key,definition,draft_id) values($1,null,null,$2,$3)`,
        [word.id,definition,draft.rows[0].id]);
    }
    const mapping = mappings.find(row => row.correct_spelling_normalized === word.normalised_word);
    const current = await stage.query(`select mapping_status,resolver_visibility_status from public.spelling_canonical_mappings
      where misspelling_normalized=$1 and correct_spelling_normalized=$2 and micro_skill_key=$3`,
      [mapping.misspelling_normalized,word.normalised_word,skill]);
    if (current.rowCount && (current.rows[0].mapping_status !== "active" || current.rows[0].resolver_visibility_status !== "visible"))
      throw Error(`MEDIAL_MAPPING_CONFLICT:${word.display_word}`);
    if (!current.rowCount) {
      const created = await stage.query(`insert into public.spelling_canonical_mappings
        (misspelling_normalized,correct_spelling_normalized,micro_skill_key,dialect_code,normalization_version,
         mapping_status,resolver_visibility_status,created_by_admin_user_id,decision_note)
        values($1,$2,$3,$4,$5,'active','visible',$6::uuid,$7) returning id`,
        [mapping.misspelling_normalized,word.normalised_word,skill,mapping.dialect_code,
          mapping.normalization_version,actor,"Approved Production medial example staging fixture"]);
      await stage.query(`insert into public.spelling_canonical_mapping_events
        (mapping_id,event_type,new_status,new_resolver_visibility_status,admin_user_id,note)
        values($1,'resolver_visibility_enabled','active','visible',$2::uuid,$3)`,
        [created.rows[0].id,actor,"Approved Production medial example staging fixture"]);
    }
  }
  if (apply) await stage.query("commit"); else await stage.query("rollback");
  console.log(JSON.stringify({ environment: "staging", mode: apply ? "fixture_installed" : "rollback_proof", words }));
} catch (error) { await prod.query("rollback").catch(() => undefined); await stage.query("rollback").catch(() => undefined); throw error; }
finally { await prod.end(); await stage.end(); }
