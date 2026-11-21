/** Disposable staging draft only. Never modify reviewed production recordings. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServiceRoleClient} from '../lib/supabase/service-role';
import {loadSchwaWorkbookQueue,publishSchwaWorkbookWord,SCHWA_WORKBOOK_SOURCE} from '../lib/teaching-dictionary-manager/schwa-bulk-review';
import type {WordDraftPayload} from '../lib/teaching-dictionary-manager/contracts';
import manifest from '../lib/adle/weak-vowel/reviewed-audio-manifest.json';
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT,'staging');
const db=createServiceRoleClient(),actor=process.env.STAGING_ADMIN_USER_ID!,skill='D4_SCHWA_FINAL_AR_FINAL';
const wordId='e7537e10-41ec-5c4e-8104-036773404488';
const previous=await db.from('teaching_dictionary_manager_drafts').select('*').eq('canonical_word_id',wordId).eq('source_reference',SCHWA_WORKBOOK_SOURCE).order('created_at',{ascending:false}).limit(1).single();assert.ifError(previous.error);
const payload=structuredClone(previous.data!.payload) as unknown as WordDraftPayload;
const facts=payload.routeContents[0].content.weakVowel as any;
const src=Object.keys(manifest).find(src=>src.includes(`/word/${wordId}-`));assert(src,'A real reviewed popular word recording must be bundled.');
facts.wordRecording={src,sha256:(manifest as Record<string,string>)[src]};
let draft = "";
const insert = async () => {
  const inserted=await db.from('teaching_dictionary_manager_drafts').insert({canonical_word_id:wordId,normalised_word:previous.data!.normalised_word,dialect_code:previous.data!.dialect_code,payload,source_kind:'manual',source_reference:SCHWA_WORKBOOK_SOURCE,created_by:actor}).select('id').single();assert.ifError(inserted.error);
  draft=inserted.data!.id;
};
const queue=async()=>{const row=(await loadSchwaWorkbookQueue(db,skill,[wordId])).find(r=>r.id===draft);assert(row);return row;};
await insert();
const approvedHash=facts.wordRecording.sha256;
try{
  process.env.VERCEL_URL='protected-preview.invalid';
  assert.deepEqual((await queue()).blockers,[]);
  facts.wordRecording.sha256='0'.repeat(64);await insert();
  assert.match((await queue()).blockers.join(' '),/word audio.*changed/);
  await assert.rejects(()=>publishSchwaWorkbookWord(db,actor,skill,draft),/word audio.*changed/);
  const staged=await db.from('teaching_dictionary_route_content_versions').select('id').eq('draft_id',draft);assert.ifError(staged.error);assert.equal(staged.data!.length,0);
  facts.wordRecording.sha256=approvedHash;facts.wordRecording.src='/audio/missing-review-proof.mp3';await insert();
  assert.match((await queue()).blockers.join(' '),/word audio.*missing/);
  await assert.rejects(()=>publishSchwaWorkbookWord(db,actor,skill,draft),/word audio.*missing/);
} finally {facts.wordRecording={src,sha256:approvedHash};await insert();}
assert.deepEqual((await queue()).blockers,[]);
const published=await publishSchwaWorkbookWord(db,actor,skill,draft);assert((await queue()).published);
const retry=await publishSchwaWorkbookWord(db,actor,skill,draft);assert.deepEqual(retry,published);
const report={passed:true,draftId:draft,wordId,skill,realBundledRecording:true,protectedHostIgnored:true,changedAudioBlockedAtReadiness:true,missingAudioBlockedAtReadiness:true,invalidAudioPreventedPublication:true,noVersionCreatedForInvalidAudio:true,restoredWordPublished:true,retryIdempotent:true,contentVersionId:published.contentVersionId};
fs.mkdirSync('outputs/schwa-audio-publishing-20261121',{recursive:true});fs.writeFileSync('outputs/schwa-audio-publishing-20261121/staging-proof.json',JSON.stringify(report,null,2));console.log(report);
