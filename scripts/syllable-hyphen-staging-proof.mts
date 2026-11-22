/** Disposable staging proof for the hyphenated re-enter workbook row. */
import assert from 'node:assert/strict';import fs from 'node:fs';import pg from 'pg';import {randomUUID} from 'node:crypto';
import {createServiceRoleClient} from '../lib/supabase/service-role';
import {buildReviewWorkbook,readReviewWorkbook} from '../lib/teaching-dictionary-manager/review-workbook';
import {prepareReviewedCsv,type MultiSenseCsvBundle} from '../lib/teaching-dictionary-manager/multi-sense-csv';
import {loadReviewedMeaningBundles} from '../lib/teaching-dictionary-manager/multi-sense-export';
import {stageSchwaWorkbookDraft,loadSchwaWorkbookQueue,publishSchwaWorkbookWord} from '../lib/teaching-dictionary-manager/schwa-bulk-review';
import {loadWeakVowelSelectionPool} from '../lib/adle/weak-vowel/readiness-loader';
import {generateSchwaTestLesson} from '../lib/teaching-dictionary-manager/schwa-test-lesson';
import {childAllowlistActivationReport} from '../lib/adle/route-activation-scope';
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT,'staging');assert(process.env.SUPABASE_STAGING_DB_URL?.includes('qkpjbajicacbrphthibk'));
const db=createServiceRoleClient(),actor=process.env.STAGING_ADMIN_USER_ID!,skill='D4_SCHWA_FINAL_ER_FINAL';
const dir='outputs/syllable-hyphen-20261122';fs.mkdirSync(dir,{recursive:true});
const existing=await db.from('canonical_teaching_dictionary_words').select('id').eq('normalised_word','re-enter').eq('dialect_code','en-GB').eq('row_status','active').maybeSingle();assert.ifError(existing.error);
const current=existing.data?(await loadReviewedMeaningBundles(db,[existing.data.id]))[0]:null;
const bundle:MultiSenseCsvBundle={wordId:existing.data?.id??'',displayWord:'re-enter',sourceSenseReviewedAt:current?.sourceSenseReviewedAt??'',senseSet:{pronunciations:[{id:'gb',ipa:'/ˌriːˈentə/',spokenSyllableCount:3,stressPattern:'secondary-primary-unstressed'}],senses:[{id:'review',definition:'To go into a place again.',partOfSpeech:'verb',pronunciationId:'gb',dictationSentence:'Use the code to re-enter.',dictationTargetTokenIndex:4}]},analyses:[{senseId:'review',parts:[{id:'prefix',kind:'prefix',sourceText:'re',surfaceText:'re',gloss:'again',displayRange:{start:0,end:2}},{id:'base',kind:'base',sourceText:'enter',surfaceText:'enter',gloss:'To go or come into a place.',displayRange:{start:3,end:8}}],joins:[{afterPartId:'prefix',beforePartId:'base',joinType:'hyphen'}],transformations:[],wordSum:'re + enter → re-enter',familyKey:'',componentPartId:'',relationshipKind:'',requestedSkillKeys:[skill]}]};
const fields={weak_vowel_target:'er',weak_vowel_occurrence:'1',weak_vowel_sound:'Schwa',activity_syllables:'re-·en-ter',family_exploration:'Not used',age_band:'middle_primary',frequency_band:'high',complexity_band:'medium',has_schwa:'Yes'};
const bytes=await buildReviewWorkbook({skill,title:'Hyphenated syllable proof',bundles:[bundle],families:new Map(),notes:new Map(),requestedSenses:new Map([[bundle.wordId,'review']]),schwaFacts:new Map([[bundle.wordId,fields]])});
fs.writeFileSync(`${dir}/staging-review.xlsx`,bytes);
const parsed=await readReviewWorkbook(bytes as unknown as ArrayBuffer,skill),entry=prepareReviewedCsv(parsed.csv)[0];assert.equal(entry.error,null);
const reviewed=entry.bundle!;const imported=await db.rpc('import_reviewed_teaching_dictionary_word',{p_request_id:randomUUID(),p_word_id:reviewed.wordId||null,p_display_word:reviewed.displayWord,p_expected_reviewed_at:reviewed.sourceSenseReviewedAt||null,p_sense_set:reviewed.senseSet,p_analyses:reviewed.analyses,p_actor:actor,p_source_reference:'Disposable staging hyphenated syllable parser proof'});assert.ifError(imported.error);assert.equal(typeof imported.data,'string');
const wordId=imported.data!;const [saved]=await loadReviewedMeaningBundles(db,[wordId]);
const draftId=await stageSchwaWorkbookDraft(db,actor,saved,skill,'review',parsed.schwaFacts.get(4)!);
const queue=(await loadSchwaWorkbookQueue(db,skill,[wordId])).find(row=>row.id===draftId)!;assert.deepEqual(queue.blockers,[]);assert.equal(queue.payload.writtenSyllableBreakdown,'re-·en·ter');
const route=queue.payload.routeContents[0].content.weakVowel as any;assert.deepEqual(route.acceptedCutSets,[[3,5]]);assert.equal(route.detectiveVowelIndex,6);
const published=await publishSchwaWorkbookWord(db,actor,skill,draftId);
const persisted=await db.from('teaching_dictionary_manager_drafts').select('payload').eq('id',draftId).single();assert.ifError(persisted.error);assert.equal((persisted.data!.payload as any).writtenSyllableBreakdown,'re-·en·ter');
const pool=await loadWeakVowelSelectionPool({client:db,environmentKey:'staging'},skill);assert.equal(pool.words.find(word=>word.canonicalWordId===wordId)?.contentVersionId,published.contentVersionId);
const child=await db.from('children').insert({parent_user_id:actor,first_name:`Hyphen syllable proof ${randomUUID().slice(0,6)}`,notes:'Disposable staging hyphenated workbook parser proof'}).select('id').single();assert.ifError(child.error);const childId=child.data!.id;
const sql=new pg.Client({connectionString:process.env.SUPABASE_STAGING_DB_URL});await sql.connect();try{
 const head=(await sql.query(`select h.current_revision_id,r.readiness_report,r.release_manifest_sha256 from adle_route_activation_heads h join adle_route_activation_revisions r on r.id=h.current_revision_id where h.environment_key='staging' and h.route_id='weak_vowel_word_lab' and h.micro_skill_key=$1`,[skill])).rows[0];assert(head);
 if(head.readiness_report.scope?.kind!=='all_eligible')await sql.query(`select set_adle_route_activation_revision_v2($1,$2,'staging','enabled','allow_existing',$3,$4,$5,$6)`,[head.release_manifest_sha256,skill,JSON.stringify(childAllowlistActivationReport([...new Set([...(head.readiness_report.scope?.childIds??[]),childId])])),head.current_revision_id,'syllable-hyphen-proof','Owner-requested hyphen parser staging verification']);
}finally{await sql.end();}
const lesson=await generateSchwaTestLesson(db,actor,childId,skill,wordId);
const lessonWord=lesson.snapshot.payload.resolvedLesson.words.find(word=>word.canonicalWordId===wordId)!;assert(lessonWord);assert.equal(lessonWord.spelling,'re-enter');assert.equal(lessonWord.dinner.contentVersion,published.contentVersionId);
const report={passed:true,wordId,draftId,contentVersionId:published.contentVersionId,childId,assignmentId:lesson.assignmentId,workbookRoundTrip:true,readyBeforePublish:true,reviewedDraftSyllables:'re-·en·ter',cuts:[3,5],detectiveIndex:6,activeForADLE:true,generatedLessonPreservesSpelling:true};fs.writeFileSync(`${dir}/staging-proof.json`,JSON.stringify(report,null,2));console.log(report);
