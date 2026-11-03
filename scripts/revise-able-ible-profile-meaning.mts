/** Reviewed -able/-ible profile revision. Dry run rolls the whole transaction back. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const environment = process.argv[2];
const apply = process.argv.includes("--apply");
const stagingFixture = process.argv.includes("--staging-fixture");
const meaning = "Capable of, fit for, or able to be";
const sourceReference = "Katie Sanderson reviewed -able/-ible profile meaning in Codex chat, 2026-11-03";
if (environment !== "staging" && environment !== "production")
  throw new Error("ENVIRONMENT_STAGING_OR_PRODUCTION_REQUIRED");
if (apply && !process.argv.includes(`--confirm=reviewed-able-ible-meaning:${environment}`))
  throw new Error("EXACT_REVIEWED_MEANING_CONFIRMATION_REQUIRED");
if (stagingFixture && (environment !== "staging" || apply))
  throw new Error("STAGING_FIXTURE_IS_ROLLBACK_ONLY");
const envKey = environment === "production" ? "SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED" :
  "SUPABASE_STAGING_DB_URL";
delete process.env[envKey];
process.loadEnvFile(environment === "production" ? ".env.local" : ".env.staging.local");
const url = process.env[envKey];
const expectedRef = environment === "production" ? "wwohrqtunajrbwxyssjf" :
  "qkpjbajicacbrphthibk";
if (!url || new URL(url).username.split(".").at(-1) !== expectedRef)
  throw new Error("PINNED_DATABASE_REQUIRED");
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
async function seedStagingFixture() {
  const catalog = await db.query(`insert into public.micro_skill_catalog
    select (jsonb_populate_record(null::public.micro_skill_catalog,
      to_jsonb(c)||jsonb_build_object('id',$1::uuid,
        'micro_skill_key','D4_MOR_SUFFIXES_ABLE_IBLE',
        'display_name','Staging rollback proof -able and -ible',
        'metadata',coalesce(c.metadata,'{}'::jsonb)||'{"rollback_only":true}'::jsonb,
        'created_at',now(),'updated_at',now()))).*
    from public.micro_skill_catalog c
    where c.micro_skill_key='D4_MOR_SUFFIXES_FUL_LESS' returning id`,
  [randomUUID()]);
  assert.equal(catalog.rows.length, 1, "STAGING_FIXTURE_CATALOG_MISSING");
  const words = await db.query(`select id,normalised_word from
    public.canonical_teaching_dictionary_words where row_status='active'
      and review_status='approved_for_first_exposure'
      and normalised_word=any($1::text[]) order by normalised_word`,
  [["enjoyable", "impossible", "possible", "readable"]]);
  assert.equal(words.rows.length, 4, "STAGING_FIXTURE_WORDS_MISSING");
  const batch = await db.query(`insert into public.canonical_teaching_dictionary_import_batches
    (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,
      readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at)
    values('rollback-proof/able-ible-profile-meaning',$1,'staging_rollback_fixture_v1',
      '{"errors":0}'::jsonb,'{"profiles":1,"members":4}'::jsonb,
      '{"disposable":true}'::jsonb,'local_dev_import','applied',
      '{"rollback_only":true}'::jsonb,'staging rollback fixture',now()) returning id`,
  [digest(words.rows)]);
  const batchId = batch.rows[0].id as string;
  const profile = await db.query(`insert into public.canonical_teaching_dictionary_suffix_profiles
    (import_batch_id,micro_skill_key,suffix_label,suffix_text,suffix_meaning,
      meaning_bins,include_meaning_sort,suffix_choices,intro_content,
      reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,
      review_status,source_sheet,source_row_number,source_row_hash,source_metadata,
      source_category,source_name,source_use_note,confidence,reviewed_by,reviewed_at)
    values($1,'D4_MOR_SUFFIXES_ABLE_IBLE','-able and -ible','able/ible','can be',
      '[{"id":"can_be","label":"CAN BE","description":"can be"}]'::jsonb,false,
      '[{"text":"able","label":"-able","status":"target","meaning":"can be"},
        {"text":"ible","label":"-ible","status":"target","meaning":"can be"},
        {"text":"abel","label":"-abel","status":"unsupported","meaning":null},
        {"text":"ibel","label":"-ibel","status":"unsupported","meaning":null}]'::jsonb,
      '{"title":"Staging rollback proof"}'::jsonb,'reflection','Review the suffix.',
      false,'active','approved_for_first_exposure','rollback-proof',1,$2,
      '{"rollback_only":true}'::jsonb,'internal_authored','staging rollback fixture',
      'Disposed at transaction end.','high','staging rollback fixture',now()) returning id`,
  [batchId, digest({ batchId, profile: "able_ible" })]);
  for (const word of words.rows) {
    const suffix = word.normalised_word.endsWith("able") ? "able" : "ible";
    const base = word.normalised_word.slice(0, -suffix.length);
    const parts = [
      { id: "base", kind: "base", sourceText: base, surfaceText: base,
        gloss: "reviewed staging fixture base", displayRange: { start: 0, end: base.length } },
      { id: "suffix", kind: "suffix", sourceText: suffix, surfaceText: suffix,
        gloss: "can be", displayRange: { start: base.length, end: word.normalised_word.length } },
    ];
    const joins = [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }];
    await db.query(`insert into public.canonical_teaching_dictionary_suffix_members
      (import_batch_id,suffix_profile_id,canonical_word_id,member_role,suffix_variant,
        semantic_base_text,semantic_base_kind,base_meaning,new_word_meaning,meaning_bin_key,
        teaching_split_parts,teaching_split_joins,true_morphology_parts,true_morphology_joins,
        true_morphology_transformations,transformation_notes,true_morphology_provenance,
        assignment_eligible,row_status,review_status,source_sheet,source_row_number,
        source_row_hash,source_metadata,source_category,source_name,source_use_note,
        confidence,reviewed_by,reviewed_at)
      values($1,$2,$3,'transfer',$4,$5,'base','reviewed staging fixture base',
        'Staging rollback fixture word.','can_be',$6::jsonb,$7::jsonb,$6::jsonb,$7::jsonb,
        '[]'::jsonb,'','{"source":"staging fixture","status":"reviewed"}'::jsonb,
        true,'active','approved_for_first_exposure','rollback-proof',1,$8,
        '{"rollback_only":true}'::jsonb,'internal_authored','staging rollback fixture',
        'Disposed at transaction end.','high','staging rollback fixture',now())`,
    [batchId, profile.rows[0].id, word.id, suffix, base,
      JSON.stringify(parts), JSON.stringify(joins), digest({ word: word.id, batchId })]);
  }
}
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  if (stagingFixture) await seedStagingFixture();
  const active = await db.query(`select * from public.canonical_teaching_dictionary_suffix_profiles
    where micro_skill_key='D4_MOR_SUFFIXES_ABLE_IBLE' and row_status='active' for update`);
  assert.equal(active.rows.length, 1, "ONE_ACTIVE_ABLE_IBLE_PROFILE_REQUIRED");
  const previous = active.rows[0];
  assert.equal(previous.review_status, "approved_for_first_exposure");
  assert.equal(previous.suffix_meaning, "can be", "PROFILE_MEANING_CHANGED");
  assert.equal(previous.production_enabled, environment === "production");
  assert.deepEqual(previous.meaning_bins, [{ id: "can_be", label: "CAN BE", description: "can be" }]);
  assert(Array.isArray(previous.suffix_choices));
  const choices = previous.suffix_choices.map((choice: Record<string, unknown>) =>
    choice.status === "target" ? { ...choice, meaning } : choice);
  assert.deepEqual(previous.suffix_choices.filter((choice: Record<string, unknown>) =>
    choice.status === "target").map((choice: Record<string, unknown>) => choice.text).sort(),
  ["able", "ible"]);
  const members = await db.query(`select * from public.canonical_teaching_dictionary_suffix_members
    where suffix_profile_id=$1 and row_status='active' order by canonical_word_id for update`,
  [previous.id]);
  assert(members.rows.length >= 4, "REVIEWED_PROFILE_MEMBERS_REQUIRED");
  assert(members.rows.every((row) => row.review_status === "approved_for_first_exposure"
    && row.assignment_eligible), "PROFILE_MEMBER_REVIEW_CHANGED");
  const nextBins = [{ id: "can_be", label: meaning.toUpperCase(), description: meaning }];
  const sourceHash = digest({ previousId: previous.id, previousHash: previous.source_row_hash,
    meaning, bins: nextBins, choices, memberIds: members.rows.map((row) => row.id) });
  const batch = await db.query(`insert into public.canonical_teaching_dictionary_import_batches
    (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,
      readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at)
    values($1,$2,'reviewed_able_ible_profile_meaning_v1',$3::jsonb,$4::jsonb,
      $5::jsonb,'admin_import','applied',$6::jsonb,$7,now()) returning id`,
  [`teaching-dictionary-manager/suffix-profile-meaning/${sourceHash}`, sourceHash,
    JSON.stringify({ errors: 0, ownerReviewedMeaning: meaning }),
    JSON.stringify({ profiles: 1, members: members.rows.length }),
    JSON.stringify({ productionEnabled: previous.production_enabled }),
    JSON.stringify({ previousProfileId: previous.id, sourceReference }), sourceReference]);
  const batchId = batch.rows[0].id as string;
  await db.query(`update public.canonical_teaching_dictionary_suffix_profiles
    set row_status='superseded',production_enabled=false,updated_at=now() where id=$1`, [previous.id]);
  const nextId = randomUUID();
  const profile = await db.query(`insert into public.canonical_teaching_dictionary_suffix_profiles
    select (jsonb_populate_record(null::public.canonical_teaching_dictionary_suffix_profiles,
      to_jsonb(p)||jsonb_build_object(
        'id',$1::uuid,'import_batch_id',$2::uuid,'suffix_meaning',$3::text,
        'meaning_bins',$4::jsonb,'suffix_choices',$5::jsonb,'row_status','active',
        'production_enabled',$6::boolean,'source_row_hash',$7::text,
        'source_metadata',coalesce(p.source_metadata,'{}'::jsonb)||$8::jsonb,
        'source_sheet','reviewed-profile-meaning','source_row_number',1,
        'source_name','Teaching Dictionary Manager','source_use_note',$9::text,
        'reviewed_by','Katie Sanderson','reviewed_at',now(),
        'created_at',now(),'updated_at',now()))).*
    from public.canonical_teaching_dictionary_suffix_profiles p where p.id=$10
    returning id,suffix_meaning,meaning_bins,suffix_choices,production_enabled`,
  [nextId, batchId, meaning, JSON.stringify(nextBins), JSON.stringify(choices),
    previous.production_enabled, sourceHash,
    JSON.stringify({ previousProfileId: previous.id, sourceReference }),
    sourceReference, previous.id]);
  assert.equal(profile.rows.length, 1);
  for (const member of members.rows) {
    const memberHash = digest({ previousMemberId: member.id, profileHash: sourceHash });
    const inserted = await db.query(`insert into public.canonical_teaching_dictionary_suffix_members
      select (jsonb_populate_record(null::public.canonical_teaching_dictionary_suffix_members,
        to_jsonb(m)||jsonb_build_object('id',$1::uuid,'import_batch_id',$2::uuid,
          'suffix_profile_id',$3::uuid,'source_row_hash',$4::text,
          'source_metadata',coalesce(m.source_metadata,'{}'::jsonb)||$5::jsonb,
          'created_at',now(),'updated_at',now()))).*
      from public.canonical_teaching_dictionary_suffix_members m where m.id=$6
      returning id,canonical_word_id,semantic_base_text,base_meaning,new_word_meaning,
        teaching_split_parts,true_morphology_parts,meaning_bin_key,assignment_eligible`,
    [randomUUID(), batchId, nextId, memberHash,
      JSON.stringify({ previousMemberId: member.id, sourceReference }), member.id]);
    assert.equal(inserted.rows.length, 1);
    for (const key of ["canonical_word_id", "semantic_base_text", "base_meaning",
      "new_word_meaning", "teaching_split_parts", "true_morphology_parts",
      "meaning_bin_key", "assignment_eligible"])
      assert.deepEqual(inserted.rows[0][key], member[key], `COPIED_MEMBER_FACT_CHANGED:${key}`);
  }
  const proof = await db.query(`select count(*)::int n from
    public.canonical_teaching_dictionary_suffix_members where suffix_profile_id=$1 and row_status='active'`,
  [nextId]);
  assert.equal(proof.rows[0].n, members.rows.length);
  assert.equal(profile.rows[0].suffix_meaning, meaning);
  assert.deepEqual(profile.rows[0].meaning_bins, nextBins);
  assert.deepEqual(profile.rows[0].suffix_choices, choices);
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ environment, status: apply ? "applied" : "rollback_proof",
    previousProfileId: previous.id, newProfileId: apply ? nextId : null,
    copiedMembers: members.rows.length, meaning, sourceHash }, null, 2));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
