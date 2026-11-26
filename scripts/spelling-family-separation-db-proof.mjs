// A rollback-only staging fixture exercises the spelling/grammar read boundary.
import pg from 'pg';
import assert from 'node:assert/strict';
const url=process.env.SUPABASE_STAGING_DB_URL;
assert(url?.includes('qkpjbajicacbrphthibk'), 'Staging only');
const db=new pg.Client({connectionString:url}); await db.connect();
try {
 const {rows:[link]}=await db.query(`select m.* from teaching_dictionary_current_sense_family_memberships m
 join canonical_teaching_dictionary_words w on w.id=m.canonical_word_id where w.display_word='children' limit 1`);
 assert(link,'Reviewed children fixture required');
 await db.query('begin');
 // Temporarily classify this existing link to test exclusion; this is not an
 // editorial change to children. Rollback restores the useful spelling link.
 await db.query(`insert into teaching_dictionary_grammatical_family_links(family_key,canonical_word_id,relation_kind,source_memberships,approval_reference)
 values($1,$2,'grammatical_form',$3,'disposable-staging-boundary-proof')`,[link.family_key,link.canonical_word_id,JSON.stringify([link])]);
 const count=async table=>Number((await db.query(`select count(*) n from ${table} where family_key=$1 and canonical_word_id=$2`,[link.family_key,link.canonical_word_id])).rows[0].n);
 assert.equal(await count('teaching_dictionary_current_sense_family_memberships'),0);
 assert.equal(await count('teaching_dictionary_spelling_lexical_members'),0);
 assert.equal(await count('teaching_dictionary_grammatical_relationships'),1);
 assert(Number((await db.query('select count(*) n from teaching_dictionary_sense_family_membership_events where id=$1',[link.id])).rows[0].n)===1,'Original reviewed fact preserved');
 await db.query('rollback');
 assert.equal(await count('teaching_dictionary_current_sense_family_memberships'),1);
 assert.equal(await count('teaching_dictionary_grammatical_relationships'),0);
 console.log('PASS: spelling exclusion, separate grammatical read, original fact preservation and rollback restoration');
} finally {await db.query('rollback').catch(()=>{});await db.end();}
