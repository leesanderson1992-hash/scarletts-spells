import fs from 'node:fs';
import pg from 'pg';
import {parseEnv} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const environment=process.argv[2],apply=process.argv.includes('--apply');
assert(['staging','production'].includes(environment));
const plan=JSON.parse(fs.readFileSync('data/teaching-dictionary/root-teaching-details-2026-11-27.json','utf8'));
assert.equal(plan.roots.length,36);assert.equal(new Set(plan.roots.map(r=>r.root)).size,36);
const e=parseEnv(fs.readFileSync(environment==='staging'?'.env.staging.local':'.env.local','utf8'));
const url=environment==='staging'?e.SUPABASE_STAGING_DB_URL:e.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
assert(new URL(url).username.includes(environment==='staging'?'qkpjbajicacbrphthibk':'wwohrqtunajrbwxyssjf'));
const db=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:false}});
const q=async(s,p=[])=>(await db.query(s,p)).rows;
const source=plan.approvalReference;
const actor=environment==='staging'?e.STAGING_ADMIN_USER_ID:'a28d4885-8328-4853-ba11-6c676619b9ea';
const current=()=>q(`select distinct on(f.family_key) f.*,to_jsonb(r) metadata,s.sense_set,s.reviewed_at::text reviewed_at
 from teaching_dictionary_families_with_current_meaning f
 join canonical_teaching_dictionary_lexical_root_metadata r using(family_key,revision)
 join teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=f.canonical_base_word_id
 where f.is_current_family and f.review_status='approved' and f.base_kind='bound_root'
 order by f.family_key,f.revision desc`);
const identity=rows=>rows.map(r=>({word:r.canonical_word_id,sense:r.sense_id,family:r.family_key,part:r.component_part_id,relationship:r.relationship_kind}));
await db.connect();
try {
 await db.query('begin isolation level serializable');
 await db.query("set local lock_timeout='5s'");await db.query("set local statement_timeout='60s'");
 const before=await current();if(environment==='production')assert.equal(before.length,36);
 const rootOnlyCount=(await q('select count(*)::int count from teaching_dictionary_root_only_entries'))[0].count;
 const beforeUntouched=before.filter(f=>!plan.roots.some(r=>r.root===f.base_lemma));
 const allLinks=await q('select * from teaching_dictionary_current_sense_family_memberships order by canonical_word_id,sense_id,family_key,component_part_id');
 const targetCounts=await q('select count(*)::int count from adle_learning_items where row_status=\'active\' and canonical_word_id in (select canonical_word_id from teaching_dictionary_root_only_entries)');assert.equal(targetCounts[0].count,0);
 const changes=[];
 for(const root of plan.roots){
  const matches=before.filter(f=>f.base_lemma===root.root);assert.equal(matches.length,1,root.root);const f=matches[0];
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['lexical-family:'+f.family_key]);
  if(f.base_meaning===root.meaning&&f.metadata.origin_language===root.origin&&JSON.stringify(f.metadata.teaching_examples)===JSON.stringify(root.examples)){changes.push({root:root.root,revision:f.revision,changed:false});continue;}
  if(environment==='production'){assert.equal(f.base_meaning,root.expectedPriorMeaning,root.root+' meaning changed since review');assert.equal(f.metadata.origin_language,root.expectedPriorOrigin,root.root+' origin changed since review');}
  const raw=(await q('select * from canonical_teaching_dictionary_lexical_base_families where family_key=$1 and revision=$2',[f.family_key,f.revision]))[0];
  const morph=(await q('select * from teaching_dictionary_current_sense_morphology where canonical_word_id=$1 and sense_id=$2',[f.canonical_base_word_id,f.canonical_base_sense_id]))[0];assert(morph);
  const nextSet=structuredClone(f.sense_set);const sense=nextSet.senses.find(s=>s.id===f.canonical_base_sense_id);assert.equal(sense.partOfSpeech,'root');sense.definition=root.meaning;
  const changedMeaning=f.base_meaning!==root.meaning;
  if(changedMeaning){
   const draft=(await q(`insert into teaching_dictionary_manager_drafts(canonical_word_id,normalised_word,payload,source_kind,source_reference,created_by)
    values($1,$2,$3,'manual',$4,$5) returning id`,[f.canonical_base_word_id,root.root,JSON.stringify({senseSet:nextSet}),source,actor]))[0];
   // Psych expands the taught meaning; the others simplify wording within the existing root identity.
   await q('select review_teaching_dictionary_meaning_change($1,$2,$3,$4,$5)',[draft.id,actor,f.reviewed_at,f.canonical_base_sense_id,root.root==='psych'?'meaning':'wording']);
   const parts=structuredClone(morph.morphology_parts);assert.equal(parts.length,1);assert.equal(parts[0].kind,'root');parts[0].gloss=root.meaning;
   await q('select review_teaching_dictionary_sense_morphology($1,$2,$3,\'approve\',$4,$5,$6,$7,$8,$9)',[randomUUID(),f.canonical_base_word_id,f.canonical_base_sense_id,JSON.stringify(parts),JSON.stringify(morph.morphology_joins),JSON.stringify(morph.morphology_transformations),morph.word_sum,actor,source]);
  }
  const revision=f.revision+1;
  await q(`insert into canonical_teaching_dictionary_lexical_base_families
   select (jsonb_populate_record(null::canonical_teaching_dictionary_lexical_base_families,$1::jsonb)).*`,[JSON.stringify({...raw,revision,base_meaning:root.meaning,review_status:'draft',reviewed_by:null,reviewed_at:null,approval_reference:null,semantic_fingerprint:null,source_reference:source,created_at:new Date().toISOString()})]);
  for(const table of ['canonical_teaching_dictionary_lexical_base_family_members','canonical_teaching_dictionary_lexical_base_variants']){
   await q(`insert into ${table} select (jsonb_populate_record(null::${table},to_jsonb(x)||jsonb_build_object('revision',$3::integer))).* from ${table} x where family_key=$1 and revision=$2`,[f.family_key,f.revision,revision]);
   assert.deepEqual(await q(`select to_jsonb(x)-'revision' row from ${table} x where family_key=$1 and revision=$2 order by to_jsonb(x)-'revision'`,[f.family_key,revision]),await q(`select to_jsonb(x)-'revision' row from ${table} x where family_key=$1 and revision=$2 order by to_jsonb(x)-'revision'`,[f.family_key,f.revision]));
  }
  await q(`insert into canonical_teaching_dictionary_lexical_root_metadata select (jsonb_populate_record(null::canonical_teaching_dictionary_lexical_root_metadata,$1::jsonb)).*`,[JSON.stringify({...f.metadata,revision,root_meaning:root.meaning,root_definition:root.meaning,origin_language:root.origin,teaching_examples:root.examples,source_reference:source,approval_reference:source,reviewed_by:actor,reviewed_at:new Date().toISOString(),created_at:new Date().toISOString()})]);
  const fingerprint=createHash('sha256').update(JSON.stringify({prior:raw.semantic_fingerprint,root,revision,source})).digest('hex');
  await q(`update canonical_teaching_dictionary_lexical_base_families set review_status='approved',reviewed_by=$3,reviewed_at=clock_timestamp(),approval_reference=$4,semantic_fingerprint=$5 where family_key=$1 and revision=$2`,[f.family_key,revision,actor,source,fingerprint]);
  changes.push({root:root.root,familyKey:f.family_key,wordId:f.canonical_base_word_id,revision,changed:true});
 }
 // Reconfirm existing links only, including self-links whose root-part gloss was revised.
 // No example word receives a link from this release.
 for(const link of allLinks){
  const f=before.find(f=>f.family_key===link.family_key||f.family_key===link.canonical_family_key);
  const rootChanged=f&&changes.some(c=>c.changed&&c.root===f.base_lemma);
  const revisedSelf=changes.some(c=>c.changed&&c.wordId===link.canonical_word_id);
  if(!rootChanged&&!revisedSelf)continue;
  const morph=(await q('select id from teaching_dictionary_current_sense_morphology where canonical_word_id=$1 and sense_id=$2',[link.canonical_word_id,link.sense_id]))[0];assert(morph);
  await q('select review_teaching_dictionary_sense_family_membership($1,$2,$3,$4,$5,$6,$7,\'approve\',$8,$9)',[randomUUID(),link.canonical_word_id,link.sense_id,morph.id,link.family_key,link.component_part_id,link.relationship_kind,actor,source]);
 }
 const after=await current();assert.equal(after.length,before.length);
 for(const root of plan.roots){const f=after.find(f=>f.base_lemma===root.root);assert.equal(f.base_meaning,root.meaning);assert.equal(f.metadata.origin_language,root.origin);assert.deepEqual(f.metadata.teaching_examples,root.examples);assert.equal(f.metadata.root_definition,root.meaning);}
 assert.deepEqual(after.filter(f=>!plan.roots.some(r=>r.root===f.base_lemma)),beforeUntouched);
 assert.deepEqual(identity(await q('select * from teaching_dictionary_current_sense_family_memberships order by canonical_word_id,sense_id,family_key,component_part_id')),identity(allLinks));
 const portBefore=before.find(f=>f.base_lemma==='port'),portAfter=after.find(f=>f.base_lemma==='port');
 assert.deepEqual(portBefore.sense_set.senses.filter(s=>s.partOfSpeech!=='root'),portAfter.sense_set.senses.filter(s=>s.partOfSpeech!=='root'));
 assert.equal((await q('select count(*)::int count from teaching_dictionary_root_only_entries'))[0].count,rootOnlyCount);
 assert.equal((await q('select teaching_dictionary_word_is_root_only($1) root',[portAfter.canonical_base_word_id]))[0].root,false);
 assert.deepEqual(await q('select count(*)::int count from adle_learning_items where row_status=\'active\' and canonical_word_id in (select canonical_word_id from teaching_dictionary_root_only_entries)'),targetCounts);
 await db.query(apply?'commit':'rollback');
 const report={environment,applied:apply,packageSha256:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),changes,unrelatedRootsPreserved:beforeUntouched.length,allFamilyLinksPreserved:allLinks.length,rootOnlyEntries:rootOnlyCount,activeRootTargets:0,portNounPreserved:true};
 fs.writeFileSync(`outputs/root-teaching-details-20261127/${environment}${apply?'':'-rollback'}.json`,JSON.stringify(report,null,2));console.log(report);
}catch(error){await db.query('rollback');throw error;}finally{await db.end();}
