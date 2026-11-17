/** Read-only cross-language fingerprint and tamper checks against a compiled QA snapshot. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
const connectionString=process.env.SUPABASE_STAGING_DB_URL;
assert(connectionString?.includes('qkpjbajicacbrphthibk'),'Only the disposable staging database is allowed');
const snapshot=JSON.parse(fs.readFileSync(process.argv[2]??'.tmp/compound-durable-snapshot.json','utf8'));
assert.equal(snapshot.route.routeId,'compound_word_lab');
const db=new pg.Client({connectionString});await db.connect();
try{
 await db.query('begin read only');
 const valid=async s=>(await db.query('select adle_specialist_lesson_snapshot_is_structurally_valid_v3($1::jsonb) ok',[JSON.stringify(s)])).rows[0].ok;
 assert.equal(await valid(snapshot),true);
 const tampered=structuredClone(snapshot);tampered.payload.resolvedLesson.words[0].displayWord+='x';assert.equal(await valid(tampered),false);
 const malformed=structuredClone(snapshot);malformed.activities.pop();assert.equal(await valid(malformed),false);
 const legacy=structuredClone(snapshot);const body=structuredClone(snapshot);delete body.provenance.sourceFingerprint;
 legacy.provenance.sourceFingerprint=(await db.query('select adle_generic_snapshot_json_sha256_v1($1::jsonb) hash',[JSON.stringify(body)])).rows[0].hash;
 assert.equal(await valid(legacy),true,'Retain the previously accepted database fingerprint contract');
 await db.query('rollback');console.log('PASS: canonical compound snapshot, content tampering, malformed activities and historical fingerprint compatibility');
}finally{await db.end()}
