import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {delimiter,resolve} from 'node:path';
const require=createRequire(import.meta.url);
const root=process.env.PATH?.split(delimiter).map(p=>resolve(p,'../@electric-sql/pglite')).find(existsSync);
if(!root)throw new Error('Run with npx --package=@electric-sql/pglite@0.5.8');
const {PGlite}=require(root);const db=new PGlite();
try{
 await db.exec(`create table canonical_teaching_dictionary_import_batches(id uuid primary key,package_type text,batch_status text);
 create table canonical_teaching_dictionary_base_word_family_members(id int,import_batch_id uuid,canonical_word_id uuid,row_status text,review_status text,dictation_sentence_id uuid,updated_at timestamptz);
 create table canonical_teaching_dictionary_dictation_sentences(id uuid,canonical_word_id uuid,row_status text,review_status text);`);
 const old=readFileSync('supabase/migrations/20260809160000_allow_base_word_family_release_ledger.sql','utf8');
 await db.exec(old.slice(old.indexOf('create or replace function public.prevent_applied_base_word_family_release_mutation()'),old.indexOf('drop trigger if exists base_word_family_release_rows_immutable')));
 await db.exec(`create trigger frozen before update on canonical_teaching_dictionary_base_word_family_members for each row execute function prevent_applied_base_word_family_release_mutation();`);
 await db.exec(readFileSync('supabase/migrations/20261015154000_preserve_frozen_family_dictation_links.sql','utf8'));
 await db.exec(`create trigger link_sentence after insert or update on canonical_teaching_dictionary_dictation_sentences for each row execute function link_base_word_members_to_canonical_dictation_sentence();
 insert into canonical_teaching_dictionary_import_batches values('00000000-0000-4000-8000-000000000001','base_word_family_batch_v1','applied');
 insert into canonical_teaching_dictionary_base_word_family_members values
 (1,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','active','approved_for_first_exposure','00000000-0000-4000-8000-000000000003',now()),
 (2,null,'00000000-0000-4000-8000-000000000002','active','approved_for_first_exposure','00000000-0000-4000-8000-000000000003',now());
 insert into canonical_teaching_dictionary_dictation_sentences values('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','active','approved_for_first_exposure');`);
 const rows=(await db.query('select id,dictation_sentence_id from canonical_teaching_dictionary_base_word_family_members order by id')).rows;
 assert.equal(rows[0].dictation_sentence_id,'00000000-0000-4000-8000-000000000003');assert.equal(rows[1].dictation_sentence_id,'00000000-0000-4000-8000-000000000004');
 await assert.rejects(db.exec("update canonical_teaching_dictionary_base_word_family_members set dictation_sentence_id=null where id=1"),/immutable/);
 console.log('PASS: new dictation preserves frozen family references, updates mutable legacy links, and retains release immutability');
}finally{await db.close();}
