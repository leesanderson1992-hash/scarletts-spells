/* eslint-disable @typescript-eslint/no-explicit-any -- scoped staging fixture and SQL projections */
import fs from 'node:fs';import assert from 'node:assert/strict';import {parseEnv} from 'node:util';import {randomUUID} from 'node:crypto';import pg from 'pg';import {createClient} from '@supabase/supabase-js';
import {loadRootOnlyWordIds} from '../lib/adle/loaders/root-only-entries';
import {loadWordBaseFamilies} from '../lib/teaching-dictionary-manager/base-family-summary';
import {approvedWorkbookFamily} from '../lib/teaching-dictionary-manager/workbook-family-resolution';
import {loadCanonicalWordSkillRelationshipAuthority} from '../lib/adle/word-skill-relationships/repository';
const e=parseEnv(fs.readFileSync('.env.staging.local','utf8'));assert(e.NEXT_PUBLIC_SUPABASE_URL?.includes('qkpjbajicacbrphthibk'));
Object.assign(process.env,e,{ADLE_ROUTE_ACTIVATION_ENVIRONMENT:'staging'});
const plan=JSON.parse(fs.readFileSync('data/teaching-dictionary/root-support-2026-11-27.json','utf8'));
const client=createClient(e.NEXT_PUBLIC_SUPABASE_URL!,e.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const db=new pg.Client({connectionString:e.SUPABASE_STAGING_DB_URL,ssl:{rejectUnauthorized:false}});await db.connect();
try{
const families=(await db.query(`with latest as(select distinct on(family_key) * from teaching_dictionary_families_with_current_meaning order by family_key,revision desc) select f.*,s.sense_set from latest f join teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=f.canonical_base_word_id where f.family_key=any($1::text[])`,[plan.roots.map((r:any)=>r.familyKey)])).rows;
assert.equal(families.length,29);for(const f of families){assert.equal(f.review_status,'approved');assert(f.sense_set.senses.some((s:any)=>s.id===f.canonical_base_sense_id&&s.partOfSpeech==='root'&&s.definition===f.base_meaning));}
const rootIds=await loadRootOnlyWordIds(client);for(const f of families)assert(rootIds.has(f.canonical_base_word_id));
const graph=(await db.query(`select canonical_base_word_id from teaching_dictionary_families_with_current_meaning where family_key=$1 order by revision desc limit 1`,[plan.graph.target])).rows[0];
const cards=await loadWordBaseFamilies(client,graph.canonical_base_word_id);
assert.equal(cards.length,1);assert.equal(cards[0].name,plan.graph.target);assert(!cards.some(c=>c.name===plan.graph.old));assert.equal((await approvedWorkbookFamily(client,plan.graph.old,true))?.key,plan.graph.target);
const authority=await loadCanonicalWordSkillRelationshipAuthority({client,environmentKey:'staging',canonicalWordIds:[...families.map(f=>f.canonical_base_word_id),graph.canonical_base_word_id]});
assert(!authority.relationships.some(r=>rootIds.has(r.canonicalWordId)));
const port=(await db.query(`select w.id from canonical_teaching_dictionary_words w join teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=w.id where w.normalised_word='port' and exists(select 1 from jsonb_array_elements(s.sense_set->'senses') z where z->>'partOfSpeech'='noun') and exists(select 1 from jsonb_array_elements(s.sense_set->'senses') z where z->>'partOfSpeech'='root')`)).rows[0];assert(port);assert(!rootIds.has(port.id));
await db.query('begin');const child=randomUUID();await db.query("insert into children(id,parent_user_id,first_name,notes) values($1,$2,'Root Target Guard Proof','Disposable staging rollback fixture')",[child,e.STAGING_ADMIN_USER_ID]);
const attempt=async(sql:string,args:unknown[],label:string)=>{await db.query('savepoint root_guard');let blocked=false;try{await db.query(sql,args);}catch(error){assert(String(error).includes('ROOT_SUPPORT_ONLY'),label+': '+String(error));blocked=true;}finally{await db.query('rollback to root_guard');}assert(blocked,label+' must be rejected');};
const insert=`insert into adle_learning_items(id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,intake_on,row_status) values($1,$2,$3,'D4_MOR_BASE_WORDS_IDENTIFY_BASE','pending','verified_misspelling','synthetic-root-target-proof','2026-11-27','active')`;
for(const f of families)await attempt(insert,[randomUUID(),child,f.canonical_base_word_id],f.base_lemma);
await db.query(insert,[randomUUID(),child,port.id]);
await attempt(`insert into assignment_items(id,daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,target_word,position,status,metadata) values($1,$2,$3,$4,'spelling','lesson','adle','graph',0,'pending','{}')`,[randomUUID(),randomUUID(),child,e.STAGING_ADMIN_USER_ID],'direct assignment');
await db.query('rollback');
const report={environment:'staging',rootEntriesVerified:29,rootOnlyViewVerified:true,rootResolverAdmissionBlocked:true,rootLearningItemRejections:29,directAssignmentRejected:true,mixedPortMeaningRetained:true,graphWorkbookAliasVerified:true,graphCards:cards.map(c=>({name:c.name,words:c.words.map(w=>w.word)})),disposableLearnerMutationsRolledBack:true};
fs.writeFileSync('outputs/root-support-release-20261127/staging-proof.json',JSON.stringify(report,null,2));console.log(report);
}finally{await db.query('rollback').catch(()=>{});await db.end()}
