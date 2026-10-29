#!/usr/bin/env node
/** Bounded staging fixture from four owner-approved Production dictionary words. */
import pg from "pg";

process.loadEnvFile(".env.local");
process.loadEnvFile(".env.staging.local");
const apply = process.argv.includes("--apply");
const prodUrl = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const stageUrl = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!prodUrl || !new URL(prodUrl).username.includes("wwohrqtunajrbwxyssjf") ||
  !stageUrl || !ref || !new URL(stageUrl).username.endsWith(ref) ||
  !new URL(stageUrl).hostname.endsWith("pooler.supabase.com") ||
  !/^[a-f0-9-]{36}$/i.test(actor ?? "")) throw Error("SCHWA_STAGING_TARGET_MISMATCH");
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
const prod = new pg.Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
const stage = new pg.Client({ connectionString: stageUrl, ssl: { rejectUnauthorized: false } });
const insert = async (table, row) => {
  const columns = Object.keys(row);
  await stage.query(`insert into public.${table} (${columns.map(col => `"${col}"`).join(",")}) values (${columns.map((_, i) => `$${i + 1}`).join(",")})`, columns.map(col => row[col]));
};
await prod.connect();
await stage.connect();
try {
  await prod.query("begin read only");
  const sourceWords = (await prod.query(`select * from public.canonical_teaching_dictionary_words
    where normalised_word=any($1::text[]) and row_status='active' and review_status='approved_for_first_exposure' and dialect_code='en-GB'`, [words])).rows;
  if (sourceWords.length !== 4) throw Error("INITIAL_A_PRODUCTION_WORD_SET_CHANGED");
  const ids = sourceWords.map(row => row.id);
  const sourceMetadata = (await prod.query(`select * from public.canonical_teaching_dictionary_word_metadata
    where canonical_word_id=any($1::uuid[]) and row_status='active'`, [ids])).rows;
  const sourceSentences = (await prod.query(`select * from public.canonical_teaching_dictionary_dictation_sentences
    where canonical_word_id=any($1::uuid[]) and row_status='active' and review_status='approved_for_first_exposure'`, [ids])).rows;
  const sourceMappings = (await prod.query(`select correct_spelling_normalized,misspelling_normalized,dialect_code,normalization_version
    from public.spelling_canonical_mappings where micro_skill_key=$1 and mapping_status='active'
      and resolver_visibility_status='visible' and correct_spelling_normalized=any($2::text[])`, [skill, words])).rows;
  if (sourceMetadata.length !== 4 || sourceSentences.length !== 4 || sourceMappings.length !== 4 ||
    sourceWords.some(word => sourceSentences.find(row => row.canonical_word_id === word.id)?.dictation_sentence !== sentences.get(word.normalised_word)))
    throw Error("INITIAL_A_APPROVED_PRODUCTION_FACTS_CHANGED");
  const batchIds = [...new Set([...sourceWords, ...sourceMetadata, ...sourceSentences].map(row => row.import_batch_id))];
  const batches = (await prod.query("select * from public.canonical_teaching_dictionary_import_batches where id=any($1::uuid[])", [batchIds])).rows;
  if (batches.length !== batchIds.length) throw Error("INITIAL_A_SOURCE_BATCH_MISSING");
  await prod.query("rollback");
  await stage.query("begin");
  await stage.query("set local lock_timeout='5s'");
  await stage.query("set local statement_timeout='90s'");
  const catalog = await stage.query("select 1 from public.micro_skill_catalog where micro_skill_key=$1 and is_active and is_assignable", [skill]);
  if (catalog.rowCount !== 1) throw Error("INITIAL_A_STAGING_CATALOG_MISSING");
  for (const batch of batches) if (!(await stage.query("select 1 from public.canonical_teaching_dictionary_import_batches where id=$1", [batch.id])).rowCount)
    await insert("canonical_teaching_dictionary_import_batches", batch);
  for (const word of sourceWords) {
    const existing = await stage.query("select display_word from public.canonical_teaching_dictionary_words where id=$1", [word.id]);
    if (existing.rowCount && existing.rows[0].display_word !== word.display_word) throw Error(`INITIAL_A_STAGING_WORD_CONFLICT:${word.display_word}`);
    if (!existing.rowCount) await insert("canonical_teaching_dictionary_words", word);
    for (const row of sourceMetadata.filter(item => item.canonical_word_id === word.id))
      if (!(await stage.query("select 1 from public.canonical_teaching_dictionary_word_metadata where id=$1", [row.id])).rowCount)
        await insert("canonical_teaching_dictionary_word_metadata", row);
    for (const row of sourceSentences.filter(item => item.canonical_word_id === word.id))
      if (!(await stage.query("select 1 from public.canonical_teaching_dictionary_dictation_sentences where id=$1", [row.id])).rowCount)
        await insert("canonical_teaching_dictionary_dictation_sentences", row);
    const definition = definitions.get(word.normalised_word);
    const currentDefinition = await stage.query(`select definition from public.teaching_dictionary_definition_versions
      where canonical_word_id=$1 and route_id is null order by published_at desc,id desc limit 1`, [word.id]);
    if (currentDefinition.rowCount && currentDefinition.rows[0].definition !== definition)
      throw Error(`INITIAL_A_STAGING_DEFINITION_CONFLICT:${word.display_word}`);
    if (!currentDefinition.rowCount) {
      const draft = await stage.query(`insert into public.teaching_dictionary_manager_drafts
        (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
        values($1,$2,'en-GB',$3::jsonb,'approved_submission',$4,$5::uuid) returning id`,
        [word.id,word.normalised_word,JSON.stringify({ displayWord: word.display_word, definition,
          dictationSentence: sentences.get(word.normalised_word) }),"Initial A owner-reviewed staging fixture 2026-10-29",actor]);
      await stage.query(`insert into public.teaching_dictionary_definition_versions
        (canonical_word_id,route_id,micro_skill_key,definition,draft_id) values($1,null,null,$2,$3)`, [word.id,definition,draft.rows[0].id]);
    }
    const mapping = sourceMappings.find(item => item.correct_spelling_normalized === word.normalised_word);
    const existingMapping = await stage.query(`select id,mapping_status,resolver_visibility_status from public.spelling_canonical_mappings
      where misspelling_normalized=$1 and correct_spelling_normalized=$2 and micro_skill_key=$3`,
      [mapping.misspelling_normalized,word.normalised_word,skill]);
    if (existingMapping.rowCount && (existingMapping.rows[0].mapping_status !== "active" || existingMapping.rows[0].resolver_visibility_status !== "visible"))
      throw Error(`INITIAL_A_STAGING_MAPPING_CONFLICT:${word.display_word}`);
    if (!existingMapping.rowCount) {
      const created = await stage.query(`insert into public.spelling_canonical_mappings
        (misspelling_normalized,correct_spelling_normalized,micro_skill_key,dialect_code,normalization_version,
         mapping_status,resolver_visibility_status,created_by_admin_user_id,decision_note)
        values($1,$2,$3,$4,$5,'active','visible',$6::uuid,$7) returning id`,
        [mapping.misspelling_normalized,word.normalised_word,skill,mapping.dialect_code,mapping.normalization_version,
          actor,"Staging fixture for the owner-reviewed Initial A relationship"]);
      await stage.query(`insert into public.spelling_canonical_mapping_events
        (mapping_id,event_type,new_status,new_resolver_visibility_status,admin_user_id,note)
        values($1,'resolver_visibility_enabled','active','visible',$2::uuid,$3)`,
        [created.rows[0].id,actor,"Staging fixture for owner-reviewed Initial A relationship"]);
    }
  }
  const readback = await stage.query(`select count(*)::int n from public.canonical_teaching_dictionary_words
    where normalised_word=any($1::text[]) and row_status='active' and review_status='approved_for_first_exposure'`, [words]);
  if (readback.rows[0].n !== 4) throw Error("INITIAL_A_STAGING_READBACK_FAILED");
  if (apply) await stage.query("commit"); else await stage.query("rollback");
  console.log(JSON.stringify({ environment: "staging", mode: apply ? "fixture_installed" : "rollback_proof", words }));
} catch (error) {
  await prod.query("rollback").catch(() => undefined);
  await stage.query("rollback").catch(() => undefined);
  throw error;
} finally { await prod.end(); await stage.end(); }
