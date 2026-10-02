/** Namespace reproduction and repair only in the operator-owned disposable Docker database. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const hash = text => createHash('sha256').update(text).digest('hex');
const signatures = ['public.assert_context_rate_card()',
  'public.record_parent_added_contextual_occurrence(text,uuid,text,text,text)'];

export async function proveContextDigestQualification({db,parent}) {
  // Earlier historical proofs intentionally exercise the original public extension layout.
  // This move reproduces Production locally; the forward migration never moves the extension.
  await db.query('create schema extensions');
  await db.query('grant usage on schema extensions to service_role');
  await db.query('alter extension pgcrypto set schema extensions');
  const probe = new db.constructor(db.connectionParameters);
  await probe.connect();
  try {
    await probe.query('set search_path=public,pg_temp');
    assert.equal((await probe.query("select to_regprocedure('digest(text,text)') id")).rows[0].id,null);
    assert.equal((await probe.query("select encode(extensions.digest('their:there','sha256'),'hex') value")).rows[0].value,hash('their:there'));
    const definitions = async () => (await probe.query(`select oid::text,proowner::regrole::text owner,
      proacl::text acl,prosecdef,proconfig,prosrc from pg_proc where oid=any($1::regprocedure[]) order by oid`,[signatures])).rows;
    const before = await definitions();
    assert.equal(before.length,2);
    for (const row of before) assert.deepEqual(row.proconfig,['search_path=public, pg_temp']);
    const triggerBefore = (await probe.query("select tgfoid::text from pg_trigger where tgname='context_rate_card_scope'")).rows;
    const version = 'digest-namespace-local';
    const fingerprint = hash([version,'openai','gpt-6-luna','/v1/responses','default','USD',1000000,
      '0.1000000000','0.0100000000','0.1250000000','0.5000000000','CONTEXT_COST_USD_V1'].join('|'));
    const card = fp => probe.query(`insert into writing_context_ai_rate_cards(version,provider,model,endpoint,service_tier,
      currency,unit_tokens,input_rate,cached_input_rate,cache_write_rate,output_rate,calculation_version,effective_at,
      source_url,evidence_ref,approved_by,fingerprint) values($1,'openai','gpt-6-luna','/v1/responses','default','USD',
      1000000,.1,.01,.125,.5,'CONTEXT_COST_USD_V1',now(),
      'https://developers.openai.com/api/docs/pricing','local/digest',$2,$3)`,[version,parent,fp]);
    const child = randomUUID(), task = randomUUID(), submission = randomUUID();
    const text = 'their peace', fieldHash = hash(JSON.stringify(text));
    // These rollback-only historical parent-path fixtures are never created in Production.
    await probe.query('begin');
    await probe.query('insert into children values($1,$2)',[child,parent]);
    await probe.query("insert into course_tasks values($1,$2,'lesson','Local namespace regression','Synthetic only',null)",[task,parent]);
    await probe.query('insert into task_submissions values($1,$2,$3,$4,now(),$5)',[submission,parent,child,task,text]);
    const snapshot = (await probe.query(`insert into writing_source_snapshots(submission_id,parent_user_id,child_id,
      task_id,occurred_at,envelope) values($1,$2,$3,$4,now(),$5) returning id`,
    [submission,parent,child,task,{rawSubmissionText:text}])).rows[0].id;
    const addOccurrence = async (word,start) => {
      const id = `digest:${randomUUID()}`;
      await probe.query(`insert into writing_occurrences(id,snapshot_id,field_path,field_hash,start_utf16,end_utf16,
        observed_text,provenance) values($1,$2,'/rawSubmissionText',$3,$4,$5,$6,'learner_response')`,
      [id,snapshot,fieldHash,start,start+word.length,word]);
      return id;
    };
    const governed = await addOccurrence('their',0);
    const add = (occurrence,owner,word,intended) => probe.query(
      'select record_parent_added_contextual_occurrence($1,$2,$3,$4,$5) id',[occurrence,owner,fieldHash,word,intended]);
    async function rejected(action,expected) {
      await probe.query('savepoint rejected_probe');
      try { await assert.rejects(action,expected); }
      finally { await probe.query('rollback to savepoint rejected_probe'); }
    }
    await rejected(() => card(fingerprint),{code:'42883'});
    await rejected(() => add(governed,parent,'their','there'),{code:'42883'});
    console.log('PASS: both frozen unqualified digest calls reproduce Production namespace failure');
    // Retain fixtures across the schema correction without persisting educational facts.
    await probe.query('rollback');
    const migration = readFileSync(new URL('../supabase/migrations/20260929150000_fix_context_digest_schema_qualification.sql',import.meta.url),'utf8');
    await probe.query(migration);
    const after = await definitions();
    assert.deepEqual(after,before.map(row => ({...row,prosrc:row.prosrc.replace('digest(', 'extensions.digest(')})),
      'Only the digest qualification changes: OIDs, owner, ACL, security and search paths are preserved');
    assert.deepEqual((await probe.query("select tgfoid::text from pg_trigger where tgname='context_rate_card_scope'")).rows,triggerBefore);
    assert.equal((await probe.query("select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'")).rows[0].nspname,'extensions');
    // Repeat equivalent inputs after repair. All parent facts are rolled back at the end.
    await probe.query('begin');
    await probe.query('insert into children values($1,$2)',[child,parent]);
    await probe.query("insert into course_tasks values($1,$2,'lesson','Local namespace regression','Synthetic only',null)",[task,parent]);
    await probe.query('insert into task_submissions values($1,$2,$3,$4,now(),$5)',[submission,parent,child,task,text]);
    await probe.query(`insert into writing_source_snapshots(id,submission_id,parent_user_id,child_id,task_id,occurred_at,envelope)
      values($1,$2,$3,$4,$5,now(),$6)`,[snapshot,submission,parent,child,task,{rawSubmissionText:text}]);
    const fixedGoverned = await addOccurrence('their',0), fixedUnknown = await addOccurrence('peace',6);
    await probe.query('set local role service_role');
    await card(fingerprint);
    assert.equal((await probe.query('select fingerprint from writing_context_ai_rate_cards where version=$1',[version])).rows[0].fingerprint,fingerprint);
    await rejected(() => card('0'.repeat(64)),/rate_card_fingerprint_invalid/);
    await probe.query('reset role');
    await rejected(() => add(fixedGoverned,randomUUID(),'their','there'),/parent_added_context_scope_invalid/);
    const governedCase = (await add(fixedGoverned,parent,'their','there')).rows[0].id;
    const unknownCase = (await add(fixedUnknown,parent,'peace','piece')).rows[0].id;
    const facts = (await probe.query(`select id,pair_fingerprint,governed_family_key,parent_decision_id from
      writing_context_parent_added_cases where id=any($1::uuid[])`,[[governedCase,unknownCase]])).rows;
    assert.equal(facts.find(row=>row.id===governedCase).pair_fingerprint,hash('their:there'));
    assert.equal(facts.find(row=>row.id===governedCase).governed_family_key,'THERE_THEIR_THEYRE');
    assert(facts.find(row=>row.id===governedCase).parent_decision_id);
    assert.equal(facts.find(row=>row.id===unknownCase).pair_fingerprint,hash('peace:piece'));
    assert.equal(facts.find(row=>row.id===unknownCase).governed_family_key,null);
    assert.equal(facts.find(row=>row.id===unknownCase).parent_decision_id,null);
    assert.equal((await probe.query('select count(*)::int n from writing_context_catalog_review_cases where parent_added_case_id=$1',[unknownCase])).rows[0].n,1);
    await rejected(() => add(fixedGoverned,parent,'their','there'),/parent_added_context_scope_invalid/);
    await probe.query('rollback');
    console.log('PASS: qualified digest preserves rate-card/pair fingerprints, ownership, dedupe and unknown-family exclusion; metadata unchanged');
  } finally { await probe.query('rollback').catch(()=>{}); await probe.end(); }
}
