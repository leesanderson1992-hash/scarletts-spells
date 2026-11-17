const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),Excel=require('exceljs'),Module=require('node:module');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');const actor=process.env.STAGING_ADMIN_USER_ID,old=Module._load;
Module._load=function(r,...a){if(r==='@/lib/admin/access')return{requireAdminUser:async()=>({id:actor})};if(r==='next/cache')return{revalidatePath(){},updateTag(){},cacheLife(){},cacheTag(){},unstable_cache:fn=>fn};if(r==='next/navigation')return{redirect(url){throw Object.assign(new Error(url),{redirectTo:url})}};return old.call(this,r,...a)};
const {GET}=require('../app/(authenticated)/admin/teaching-dictionary/export/review-workbook/route');
const {importReviewedMultiSenseCsv}=require('../app/(authenticated)/admin/teaching-dictionary/multi-sense-actions');
const {publishCompoundWorkbookWords}=require('../app/(authenticated)/admin/teaching-dictionary/lesson-updates/compound-actions');
const {createServiceRoleClient}=require('../lib/supabase/service-role');
const {loadPendingCompoundWorkbookQueue}=require('../lib/teaching-dictionary-manager/compound-workbook-draft');
const {compoundReviewSource,loadCompoundBulkReview}=require('../lib/teaching-dictionary-manager/compound-review');
const {loadWorkbookFamilyChoices,createWorkbookFamily}=require('../lib/teaching-dictionary-manager/workbook-family-resolution');
const {loadReviewedMeaningBundles}=require('../lib/teaching-dictionary-manager/multi-sense-export');
const {prefillReviewWorkbookFacts}=require('../lib/teaching-dictionary-manager/review-workbook-facts');
const {buildReviewWorkbook}=require('../lib/teaching-dictionary-manager/review-workbook');
const {canonicalWordSum}=require('../lib/teaching-dictionary-manager/canonical-morphology');
const db=createServiceRoleClient(),skill='D4_MOR_COMPOUND_WORDS_'+process.argv[2],selected=process.argv[2]==='CLOSED_COMPOUNDS'?['bedroom','playground']:['ice cream','part-time'];
const read=async q=>{const r=await q;assert.ifError(r.error);return r.data};
async function download(scope){const res=await GET(new Request(`http://localhost/admin/teaching-dictionary/export/review-workbook?skill=${skill}&scope=${scope}`));assert.equal(res.status,200,await(res.status===200?Promise.resolve(''):res.text()));const book=new Excel.Workbook();await book.xlsx.load(await res.arrayBuffer());return book}
(async()=>{
 const source=await compoundReviewSource(db,skill);const beforeFamilyCounts=await read(db.from('teaching_dictionary_current_sense_family_memberships').select('canonical_word_id').in('canonical_word_id',source.curriculum.structures.filter(s=>selected.includes(s.wholeWord)).map(s=>s.wholeCanonicalWordId)));const blank=await download('blank');assert.equal(blank.getWorksheet('Words to review').getRow(4).getCell(4).dataValidation.type,'list');
 let book;
 if(process.argv.includes('--repeat')){
  const ids=source.curriculum.structures.filter(s=>selected.includes(s.wholeWord)).map(s=>s.wholeCanonicalWordId);
  const bundles=await loadReviewedMeaningBundles(db,ids),facts=await prefillReviewWorkbookFacts(db,bundles,skill);
  const bytes=await buildReviewWorkbook({skill,title:'Republish reviewed compounds',...facts,notes:new Map(),compoundFacts:new Map(source.curriculum.structures.map(s=>[s.wholeCanonicalWordId,{componentToWholeRelationship:s.componentToWholeRelationship}]))});
  book=new Excel.Workbook();await book.xlsx.load(bytes);
 }else book=await download('review');
 const sheet=book.getWorksheet('Words to review'),headers=sheet.getRow(3).values;
 const c=(r,n)=>r.getCell(headers.indexOf(n)),set=(r,n,v)=>{assert(headers.includes(n),n);c(r,n).value=v};const targets=[];
 for(let n=4;n<=sheet.rowCount;n++){const r=sheet.getRow(n),word=c(r,'Word').text;if(!word)continue;set(r,'Use in lesson',selected.includes(word)?'Yes':'No');if(selected.includes(word)){set(r,'Part of speech',word==='part-time'?'adjective':'noun');if(word==='part-time'){set(r,'Spoken syllable count',2);set(r,'Stress pattern','secondary-primary');}}if(selected.includes(word))targets.push({r,n,word})}
 assert.equal(targets.length,2);
 const makeForm=async decisions=>{const form=new FormData();form.set('workbook_skill',skill);form.set('review_workbook',new File([await book.xlsx.writeBuffer()],'reviewed-compounds.xlsx'));if(decisions)form.set('family_decisions',JSON.stringify(decisions));return form};
 // Resolve each primary teaching family using the same reviewed component facts.
 const decisions=[];
 for(const {r,n,word} of targets){
  const native=source.curriculum.structures.find(s=>s.wholeWord===word),base=native.components[0].displaySurface;
  let options=await loadWorkbookFamilyChoices(db,base,false,null);
  if(!options.families.length){
   if(!options.bases.length){
    const w=await read(db.from('canonical_teaching_dictionary_words').select('id').eq('normalised_word',base).eq('row_status','active').single());
    const m=await read(db.from('canonical_teaching_dictionary_word_metadata').select('phoneme_hint,syllables,stress_pattern').eq('canonical_word_id',w.id).eq('row_status','active').limit(1).maybeSingle());
    const parts=[{id:'base',kind:'base',sourceText:base,surfaceText:base,gloss:native.components[0].meaning,displayRange:{start:0,end:base.length}}];
    const pronunciation=m?.phoneme_hint?{id:'component-pronunciation',ipa:m.phoneme_hint,spokenSyllableCount:Number(m.syllables)||null,stressPattern:m.stress_pattern||''}:null;
    await read(db.rpc('import_reviewed_teaching_dictionary_word',{p_request_id:randomUUID(),p_word_id:w.id,p_display_word:base,p_expected_reviewed_at:'',p_sense_set:{senses:[{id:'compound-component',definition:native.components[0].meaning,partOfSpeech:'noun',pronunciationId:pronunciation?.id??null}],pronunciations:pronunciation?[pronunciation]:[]},p_analyses:[{senseId:'compound-component',parts,joins:[],transformations:[],wordSum:canonicalWordSum(parts,base)}],p_actor:actor,p_source_reference:'Disposable compound workbook proof from the approved component meaning'}));
    options=await loadWorkbookFamilyChoices(db,base,false,null);
   }
   assert(options.bases.length,base);
   const family=await createWorkbookFamily(db,actor,base,options.bases[0].senseId,null);
   decisions.push({row:n,familyKey:family.key});set(r,'Word family',family.key);
  }else{decisions.push({row:n,familyKey:options.families[0].key});set(r,'Word family',options.families[0].key)}
 }
 // An incorrect join must not approve or publish the word.
 const {r}=targets[0],correct=c(r,'Part 2 join before').text;
 for(const t of targets)set(t.r,'Use in lesson',t===targets[0]?'Yes':'No');set(r,'Part 2 join before',correct==='none'?'space':'none');
 const invalid=await importReviewedMultiSenseCsv({},await makeForm(decisions));assert(invalid.error||invalid.issues?.length,JSON.stringify(invalid));
 set(r,'Part 2 join before',correct);for(const t of targets)set(t.r,'Use in lesson','Yes');
 let imported=await importReviewedMultiSenseCsv({},await makeForm(decisions));console.log({imported});assert(!imported.error,JSON.stringify(imported));assert.equal(imported.issues?.length??0,0,JSON.stringify(imported));assert(!imported.familyTasks?.length,JSON.stringify(imported));
 const queue=await loadPendingCompoundWorkbookQueue(db,skill);const ready=queue.filter(row=>selected.includes(row.payload.displayWord));assert.equal(ready.length,2);assert(ready.every(row=>!row.blockers.length),JSON.stringify(ready.map(row=>({word:row.payload.displayWord,blockers:row.blockers}))));
 const form=new FormData();form.set('skill',skill);for(const row of ready){form.append('word_id',row.wordId);form.append('draft_id',row.id)}
 try{await publishCompoundWorkbookWords(form);assert.fail('Expected redirect')}catch(e){assert.match(e.redirectTo??e.message,/published=2$/,e.redirectTo??e.message)}
 const after=await loadCompoundBulkReview(db,skill);assert(selected.every(word=>after.current.some(row=>row.word===word)));assert(selected.every(word=>!after.rows.some(row=>row.word===word)));
 for(const row of ready){const analysis=await read(db.from('teaching_dictionary_current_sense_morphology').select('id').eq('canonical_word_id',row.wordId).eq('sense_id',row.payload.skillSenseIds[skill]).single());const links=await read(db.from('teaching_dictionary_current_sense_family_memberships').select('family_key').eq('canonical_word_id',row.wordId).eq('sense_morphology_id',analysis.id));assert.equal(links.length,Math.max(1,beforeFamilyCounts.filter(link=>link.canonical_word_id===row.wordId).length),'Preserve the distinct component families');}
 const finalSource=await compoundReviewSource(db,skill);const revision=await read(db.from('adle_route_activation_revisions').select('readiness_report').eq('id',finalSource.activationRevisionId).single());assert.equal(revision.readiness_report.scope.kind,'child_allowlist');
 const receipt={skill,published:selected,active:after.current.length,review:after.rows.map(row=>row.word),scopePreserved:true};fs.writeFileSync(`.tmp/compound-${process.argv[2]}-receipt.json`,JSON.stringify(receipt));console.log(receipt);
})().catch(e=>{console.error(e);process.exitCode=1});
