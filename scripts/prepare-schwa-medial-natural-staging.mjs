#!/usr/bin/env node
/** Mirror only the approved natural resolver relationship as a staging fixture. */
import pg from "pg";
process.loadEnvFile(".env.local");
process.loadEnvFile(".env.staging.local");
const prodUrl = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const stageUrl = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
if (!prodUrl || !new URL(prodUrl).username.includes("wwohrqtunajrbwxyssjf") ||
  !stageUrl || !ref || !new URL(stageUrl).username.endsWith(ref) ||
  !new URL(stageUrl).hostname.endsWith("pooler.supabase.com") ||
  !/^[a-f0-9-]{36}$/i.test(actor ?? "")) throw Error("SCHWA_STAGING_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const skill = "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS";
const prod = new pg.Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
const stage = new pg.Client({ connectionString: stageUrl, ssl: { rejectUnauthorized: false } });
await prod.connect(); await stage.connect();
try {
  await prod.query("begin read only");
  const source = await prod.query(`select misspelling_normalized,correct_spelling_normalized,dialect_code,normalization_version
    from public.spelling_canonical_mappings where misspelling_normalized='natrual' and
      correct_spelling_normalized='natural' and micro_skill_key=$1 and mapping_status='active' and
      resolver_visibility_status='visible'`, [skill]);
  if (source.rowCount !== 1) throw Error("NATURAL_PRODUCTION_RESOLVER_CHANGED");
  await prod.query("rollback");
  await stage.query("begin");
  const word = await stage.query(`select id from public.canonical_teaching_dictionary_words
    where id='bd80fcac-79ff-573b-a0eb-a16530b15d4b' and normalised_word='natural'
      and review_status='approved_for_first_exposure' and row_status='active'`);
  if (word.rowCount !== 1) throw Error("NATURAL_STAGING_WORD_MISSING");
  const value = source.rows[0];
  const existing = await stage.query(`select id,mapping_status,resolver_visibility_status from public.spelling_canonical_mappings
    where misspelling_normalized=$1 and correct_spelling_normalized=$2 and micro_skill_key=$3`,
    [value.misspelling_normalized,value.correct_spelling_normalized,skill]);
  if (existing.rowCount && (existing.rows[0].mapping_status !== "active" || existing.rows[0].resolver_visibility_status !== "visible"))
    throw Error("NATURAL_STAGING_RESOLVER_CONFLICT");
  if (!existing.rowCount) {
    const created = await stage.query(`insert into public.spelling_canonical_mappings
      (misspelling_normalized,correct_spelling_normalized,micro_skill_key,dialect_code,normalization_version,
       mapping_status,resolver_visibility_status,created_by_admin_user_id,decision_note)
      values($1,$2,$3,$4,$5,'active','visible',$6::uuid,$7) returning id`,
      [value.misspelling_normalized,value.correct_spelling_normalized,skill,value.dialect_code,
        value.normalization_version,actor,"Staging fixture for approved natrual resolver relationship"]);
    await stage.query(`insert into public.spelling_canonical_mapping_events
      (mapping_id,event_type,new_status,new_resolver_visibility_status,admin_user_id,note)
      values($1,'resolver_visibility_enabled','active','visible',$2::uuid,$3)`,
      [created.rows[0].id,actor,"Staging fixture for approved natrual resolver relationship"]);
  }
  if (apply) await stage.query("commit"); else await stage.query("rollback");
  console.log(JSON.stringify({ environment: "staging", mode: apply ? "fixture_installed" : "rollback_proof",
    relationship: "natrual→natural", skill }));
} catch (error) { await prod.query("rollback").catch(() => undefined);
  await stage.query("rollback").catch(() => undefined); throw error; }
finally { await prod.end(); await stage.end(); }
