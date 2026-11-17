/* Explicit disposable staging proof; invokes real workbook and publication actions. */
const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT,'staging');
const actor=process.env.STAGING_ADMIN_USER_ID,old=Module._load;assert(actor);
Module._load=function(r,...a){if(r==='@/lib/admin/access')return{requireAdminUser:async()=>({id:actor})};if(r==='next/cache')return{revalidatePath(){},updateTag(){},cacheLife(){},cacheTag(){},unstable_cache:fn=>fn};if(r==='next/navigation')return{redirect(url){throw Object.assign(new Error(url),{redirectTo:url})}};return old.call(this,r,...a)};
const {createServiceRoleClient}=require('../lib/supabase/service-role');
const {loadReviewedMeaningBundles}=require('../lib/teaching-dictionary-manager/multi-sense-export');
const {prefillReviewWorkbookFacts}=require('../lib/teaching-dictionary-manager/review-workbook-facts');
const {buildReviewWorkbook}=require('../lib/teaching-dictionary-manager/review-workbook');
const {importReviewedMultiSenseCsv}=require('../app/(authenticated)/admin/teaching-dictionary/multi-sense-actions');
const {publishPrefixWorkbookWords}=require('../app/(authenticated)/admin/teaching-dictionary/lesson-updates/prefix-actions');
const {loadPendingPrefixWorkbookQueue}=require('../lib/teaching-dictionary-manager/prefix-bulk-review');
const {loadDynamicPrefixProfiles}=require('../lib/adle/morphology/dynamic-prefix-profile-loader');
const {loadSpecialistBulkReview}=require('../lib/teaching-dictionary-manager/specialist-bulk-review');
const {loadTeachingDictionaryEvidenceAuthorityForSkill}=require('../lib/teaching-dictionary-manager/evidence-authority');
const db=createServiceRoleClient(),skill='D4_MOR_PREFIXES_IN_IM_IL_IR',child='00000000-0000-4000-8000-000000000001';
const read=async q=>{const r=await q;assert.ifError(r.error);return r.data};
(async()=>{
const words=await read(db.from('canonical_teaching_dictionary_words').select('id,display_word').in('display_word',['imperfect','inaccurate']).eq('row_status','active'));assert.equal(words.length,2);
const receipts=[];
for(let attempt=1;attempt<=3;attempt++){
 const bundles=await loadReviewedMeaningBundles(db,words.map(w=>w.id));assert.equal(bundles.length,2);
 const facts=await prefillReviewWorkbookFacts(db,bundles,skill);
 const bytes=await buildReviewWorkbook({skill,title:'Prefix republishing staging regression',notes:new Map(),requestedSenses:new Map(bundles.map(b=>[b.wordId,b.senseSet.senses[0].id])),...facts});
 const form=new FormData();form.set('workbook_skill',skill);form.set('review_workbook',new File([bytes],'reviewed-prefix-republication.xlsx'));
 const imported=await importReviewedMultiSenseCsv({},form);console.log({attempt,imported});assert(!imported.error,JSON.stringify(imported));assert.equal(imported.issues?.length??0,0,JSON.stringify(imported));assert(!imported.familyTasks?.length,JSON.stringify(imported));
 const queue=await loadPendingPrefixWorkbookQueue(db,skill);const selected=queue.filter(r=>words.some(w=>w.id===r.wordId));assert.equal(selected.length,2,JSON.stringify(imported));assert(selected.every(r=>!r.blockers.length),JSON.stringify(selected.map(r=>r.blockers)));
 const publish=new FormData();publish.set('skill',skill);for(const r of selected){publish.append('word_id',r.wordId);publish.append('draft_id',r.id)}
 try{await publishPrefixWorkbookWords(publish);assert.fail('Expected redirect')}catch(e){assert.match(e.redirectTo??e.message,/published=2$/,e.redirectTo??e.message)}
 const {profiles}=await loadDynamicPrefixProfiles(db,child,{microSkillKeys:[skill],allowStagingProfiles:true});const profile=profiles.find(p=>p.microSkillKey===skill);assert(profile);assert(words.every(w=>profile.wordsByCanonicalId.has(w.id)));
 const raw=await read(db.from('canonical_teaching_dictionary_prefix_profiles').select('id,intro_content').eq('micro_skill_key',skill).eq('row_status','active').single());const audits=raw.intro_content.validChoiceAudit;assert.equal(new Set(audits.map(a=>a.word)).size,audits.length);for(const w of words)assert.equal(audits.filter(a=>a.word===w.display_word).length,1);
 receipts.push({attempt,profile:raw.id,words:words.map(w=>w.display_word),auditCount:audits.length});
 if(attempt===2){
  const launch=await read(db.from('teaching_dictionary_lesson_launches').select('id').eq('published_profile_id',raw.id).single());
  await read(db.rpc('rollback_teaching_dictionary_launch_v2',{p_launch:launch.id,p_actor:actor,p_reason:'Disposable staging regression: republish and retry after rollback'}));
  const pending=await loadPendingPrefixWorkbookQueue(db,skill);
  assert(words.every(w=>pending.some(r=>r.wordId===w.id)),'Rolled-back words must remain in the pending queue');
  const review=await loadSpecialistBulkReview(db,skill,'dynamic_prefix_word_lab');
  assert(words.every(w=>review.rows.some(r=>r.id===w.id)),'Rolled-back words must remain in the review export');
 }

}
const [authority,pool]=await Promise.all([loadTeachingDictionaryEvidenceAuthorityForSkill(db,'staging',skill),loadSpecialistBulkReview(db,skill,'dynamic_prefix_word_lab')]);
const covered=new Set([...pool.current.map(w=>w.canonicalWordId),...pool.rows.map(w=>w.id)]);assert(authority.every(r=>covered.has(r.canonicalWordId)),'Every assignment must be Active or in review');
const result={status:'passed',receipts,assigned:authority.length,active:pool.current.length,review:pool.rows.length};fs.writeFileSync('.tmp/prefix-republication-staging-proof.json',JSON.stringify(result,null,2));console.log(result);
})().catch(e=>{console.error(e);process.exitCode=1});
