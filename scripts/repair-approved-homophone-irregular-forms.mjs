#!/usr/bin/env node
/** Follow-up release: encode five approved irregular past forms in the editor's schema. */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const root = resolve(import.meta.dirname,"..");
const releaseId = "2026-10-24-approved-homophone-irregular-form-repair-v1";
const priorId = "2026-10-24-approved-homophone-dictionary-v1";
const actor = "Katie Sanderson";
const approval = "Correction of five approved irregular-family analyses to the Teaching Dictionary transformation schema; owner approval 2026-10-24";
const forms = [
  ["blew","blow","blew is the irregular past tense of blow."],
  ["heard","hear","Heard is the irregular past tense of hear."],
  ["led","lead","Led is the irregular past tense of lead."],
  ["threw","throw","Threw is the irregular past tense of throw."],
  ["won","win","Won is the irregular past tense of win."],
];
const packageHash = createHash("sha256").update(JSON.stringify({ releaseId,priorId,forms })).digest("hex");
const mode = process.argv[2];
if (!["plan","apply","verify"].includes(mode)) throw new Error("Use plan, apply or verify");
let connectionString = readFileSync(resolve(root,".env.local"),"utf8").split(/\r?\n/)
  .find(x=>x.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="))?.split("=").slice(1).join("=").trim();
if (!connectionString) throw new Error("PRODUCTION_DATABASE_URL_REQUIRED");
connectionString = connectionString.replace(/^['"]|['"]$/g,"");
const target = new URL(connectionString);
if (!target.username.includes("wwohrqtunajrbwxyssjf") || !target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("PRODUCTION_DATABASE_TARGET_MISMATCH");
const db = new pg.Client({connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:12000});
const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
await db.connect();
try {
  await db.query(mode==="apply"?"begin isolation level serializable":"begin read only");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='180s'");
  if(mode==="apply")await db.query("select pg_advisory_xact_lock(hashtext($1))",[releaseId]);
  const prior = await one(`select id,package_sha256 from public.canonical_teaching_dictionary_import_batches
    where release_id=$1 and target_environment='production' and batch_status='applied'`,[priorId]);
  if(!prior)throw new Error("PRIOR_RELEASE_MISSING");
  const batch = await one(`select id,package_sha256,batch_status from public.canonical_teaching_dictionary_import_batches
    where release_id=$1 and target_environment='production'`,[releaseId]);
  if(batch && (batch.package_sha256!==packageHash || batch.batch_status!=="applied"))throw new Error("RELEASE_ID_CONFLICT");
  const rows = [];
  for(const [word,base,explanation] of forms){
    const row = await one(`select w.id word_id,w.word_key,x.* from public.canonical_teaching_dictionary_words w
      join public.canonical_teaching_dictionary_word_morphology x on x.canonical_word_id=w.id and x.row_status='active'
      where w.word_key=$1 and w.row_status='active'`,[`${word}_en_gb`]);
    const family = await one(`select * from public.canonical_teaching_dictionary_lexical_base_families
      where family_key=$1 and review_status='approved' order by revision desc limit 1`,[`${base}_verb_base_family`]);
    if(!row||!family)throw new Error(`MISSING_IRREGULAR_FAMILY:${word}`);
    rows.push({word,base,explanation,row,family,
      transformation:{type:"irregular_form",sourcePartId:"part_1",sourceText:base,surfaceText:word,explanation}});
  }
  if(mode==="verify"||batch){
    if(!batch)throw new Error("REPAIR_RELEASE_MISSING");
    for(const item of rows){
      const t=item.row.morphology_transformations;
      if(t.length!==1||Object.entries(item.transformation).some(([key,value])=>t[0]?.[key]!==value)
        ||item.family.source_reference!==releaseId)
        throw new Error(`IRREGULAR_READBACK_FAILED:${item.word}`);
    }
    await db.query("rollback");
    console.log(JSON.stringify({mode,target:"production",releaseId,forms:rows.length,alreadyApplied:true}));
  }else if(mode==="plan"){
    for(const item of rows){
      if(![1,2].includes(item.family.revision)||item.row.morphology_transformations?.[0]?.kind!=="irregular_past"
        ||item.row.morphology_parts?.[0]?.sourceText!==item.base)
        throw new Error(`IRREGULAR_BASELINE_CHANGED:${item.word}`);
    }
    await db.query("rollback");
    console.log(JSON.stringify({mode,target:"production",releaseId,forms:rows.length,familyRevisions:rows.length,metadataRevisions:rows.length}));
  }else{
    const newBatch=await one(`insert into public.canonical_teaching_dictionary_import_batches
      (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,
        import_mode,batch_status,source_metadata,imported_by,imported_at,release_id,package_type,package_schema_version,
        package_sha256,target_environment,importer_version,verification_summary,verified_at)
      values($1,$2,'homophone-irregular-repair-v1',$3,$4,$5,'admin_import','applied',$6,$7,now(),$8,
        'homophone_dictionary_repair','1',$2,'production','repair-approved-homophone-irregular-forms-v1',$9,now()) returning id`,
      [releaseId,packageHash,JSON.stringify({priorId,approval}),JSON.stringify({morphology:5,metadata:5,families:5}),
        JSON.stringify({approved:true}),JSON.stringify({priorBatchId:prior.id}),actor,releaseId,
        JSON.stringify({pendingReadback:true})]);
    for(const item of rows){
      const x=item.row;
      await db.query(`update public.canonical_teaching_dictionary_word_morphology
        set row_status='retired' where id=$1 and row_status='active'`,[x.id]);
      const newMorph=await one(`insert into public.canonical_teaching_dictionary_word_morphology
        (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,
          raw_morpholex_segmentation,raw_morpholex_pos,morphology_parts,feature_keys,morphology_joins,
          morphology_transformations,transformation_notes,word_sum,analysis_status,source_category,source_name,
          source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at,review_notes)
        values($1,$2,'active','approved-homophone-irregular-form-repair',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
          'approved','internal_reviewed_seed',$14,$15,null,$16,'high','approved_for_first_exposure',$17,now(),$18)
        returning id`,[newBatch.id,x.word_id,2+forms.findIndex(f=>f[0]===item.word),packageHash,
          JSON.stringify({...x.source_metadata,priorMorphologyId:x.id,repairReleaseId:releaseId}),
          x.raw_morpholex_segmentation,x.raw_morpholex_pos,JSON.stringify(x.morphology_parts),
          JSON.stringify(x.feature_keys),JSON.stringify(x.morphology_joins),JSON.stringify([item.transformation]),
          item.explanation,x.word_sum,"Owner-approved irregular-form correction",x.source_url,approval,actor,approval]);
      const metadata=await one(`select * from public.canonical_teaching_dictionary_word_metadata
        where canonical_word_id=$1 and row_status='active' order by created_at desc,id desc limit 1`,[x.word_id]);
      if(!metadata)throw new Error(`MISSING_METADATA:${item.word}`);
      await db.query(`update public.canonical_teaching_dictionary_word_metadata
        set row_status='superseded' where id=$1 and row_status='active'`,[metadata.id]);
      await db.query(`insert into public.canonical_teaching_dictionary_word_metadata
        (import_batch_id,canonical_word_id,source_id,row_status,source_sheet,source_row_number,source_row_hash,
          source_metadata,syllables,phoneme_hint,grapheme_notes,stress_pattern,has_schwa,morphemes,morphology_notes,
          irregularity_notes,written_syllable_breakdown,source_category,source_name,source_url,source_licence,
          source_use_note,confidence,review_status,reviewed_by,reviewed_at)
        values($1,$2,$3,'active','approved-homophone-irregular-form-repair',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
          $15,$16,$17,$18,$19,$20,$21,'approved_for_first_exposure',$22,now())`,
        [newBatch.id,x.word_id,metadata.source_id,2+forms.findIndex(f=>f[0]===item.word),packageHash,
          JSON.stringify({...metadata.source_metadata,priorMetadataId:metadata.id,repairReleaseId:releaseId}),
          metadata.syllables,metadata.phoneme_hint,metadata.grapheme_notes,metadata.stress_pattern,
          metadata.has_schwa,item.base,`${x.word_sum}. ${item.explanation}`,item.explanation,
          metadata.written_syllable_breakdown,metadata.source_category,metadata.source_name,metadata.source_url,
          metadata.source_licence,metadata.source_use_note,metadata.confidence,actor]);
      const family=item.family,revision=family.revision+1;
      await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_families
        (family_key,revision,base_lemma,base_part_of_speech,base_kind,canonical_base_word_id,
          base_meaning,source_reference,review_status) values($1,$2,$3,$4,$5,$6,$7,$8,'draft')`,
        [family.family_key,revision,family.base_lemma,family.base_part_of_speech,family.base_kind,
          family.canonical_base_word_id,family.base_meaning,releaseId]);
      const members=(await db.query(`select * from public.canonical_teaching_dictionary_lexical_base_family_members
        where family_key=$1 and revision=$2`,[family.family_key,family.revision])).rows;
      for(const member of members){
        await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_family_members
          (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,canonical_morphology_id,
            word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning,source_reference)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [family.family_key,revision,member.canonical_word_id,member.word_part_of_speech,member.relationship_kind,
            member.canonical_word_id===x.word_id?newMorph.id:member.canonical_morphology_id,
            member.word_sum,JSON.stringify(member.morphology_parts),JSON.stringify(member.morphology_joins),
            JSON.stringify(member.canonical_word_id===x.word_id?[item.transformation]:member.morphology_transformations),
            member.intended_meaning,releaseId]);
      }
      const variants=(await db.query(`select * from public.canonical_teaching_dictionary_lexical_base_variants
        where family_key=$1 and revision=$2`,[family.family_key,family.revision])).rows;
      for(const v of variants)await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_variants
        (family_key,revision,canonical_word_id,source_base_text,relation_kind,source_reference,
          approval_reference,reviewed_by,reviewed_at) values($1,$2,$3,$4,$5,$6,$7,$8,now())`,
        [v.family_key,revision,v.canonical_word_id,v.source_base_text,v.relation_kind,releaseId,v.approval_reference,v.reviewed_by]);
      await db.query(`select public.approve_canonical_lexical_base_family($1,$2,$3,$4)`,
        [family.family_key,revision,actor,approval]);
    }
    await db.query(`update public.canonical_teaching_dictionary_import_batches
      set verification_summary=$2,verified_at=now() where id=$1`,
      [newBatch.id,JSON.stringify({approvedForms:5,canonicalMorphologyRevisions:5,metadataRevisions:5,familyRevisions:5})]);
    await db.query("commit");
    const receipt={target:"production",mode,releaseId,packageHash,forms:5,familyRevisions:5,metadataRevisions:5,
      approvedBy:actor,approval,at:new Date().toISOString()};
    const path=resolve(root,"docs/implementation/seed-data/teaching-dictionary/releases",releaseId);
    mkdirSync(path,{recursive:true});writeFileSync(resolve(path,"production-receipt.json"),`${JSON.stringify(receipt,null,2)}\n`);
    console.log(JSON.stringify(receipt));
  }
}catch(error){await db.query("rollback").catch(()=>{});throw error}finally{await db.end()}
