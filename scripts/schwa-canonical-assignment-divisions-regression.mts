/** Rollback-only staging check for the Dictionary/assignment authority boundary. */
import assert from 'node:assert/strict';
import pg from 'pg';
import {projectSchwaSyllables} from '../lib/teaching-dictionary-manager/schwa-syllables';
const connection=process.env.SUPABASE_STAGING_DB_URL;
assert(connection?.includes('qkpjbajicacbrphthibk'));
const db=new pg.Client({connectionString:connection});await db.connect();
const word='0486de76-672b-5b32-b39a-06592f26efc8',skill='D4_SCHWA_FINAL_ER_FINAL';
const facts={syllableSource:'dictionary',acceptedCutSets:[[4]],target:{start:4,end:6,syllableIndex:2}};
const project=async(value:unknown)=> (await db.query('select teaching_dictionary_schwa_current_division_facts($1,$2,\'staging\',$3) facts',[word,skill,JSON.stringify(value)])).rows[0].facts;
try {
 await db.query('begin');
 await db.query('select review_dictionary_written_divisions($1,\'wri·ter\',$2)',[word,process.env.STAGING_ADMIN_USER_ID]);
 assert.deepEqual(await project(facts),projectSchwaSyllables('writer','wri·ter',facts as any).facts);
 assert.equal(await project({...facts,syllableSource:undefined}),null,'Conflicting legacy cuts require review');
 assert.equal(await project({...facts,syllableSource:'unknown'}),null);
 const alternative={...facts,syllableSource:'reviewed_alternative'};
 assert.deepEqual(await project(alternative),alternative,'Reviewed alternatives preserve their published cuts');
 await db.query("insert into teaching_dictionary_schwa_syllable_reviews(environment_key,canonical_word_id,micro_skill_key,reset_by) values('staging',$1,$2,$3) on conflict(environment_key,canonical_word_id,micro_skill_key) do update set resolved_at=null",[word,skill,process.env.STAGING_ADMIN_USER_ID]);
 assert.equal(await project(facts),null,'A pending review excludes new assignments');
 await db.query('rollback');
 console.log('Canonical cut projection, legacy conflicts, alternatives and pending review holds passed; all fixture changes rolled back.');
}finally{await db.query('rollback');await db.end();}
