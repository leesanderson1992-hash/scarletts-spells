import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** E1 operations proof inside the parent script's disposable PostgreSQL cluster. */
export async function proveWritingEnrichment({ db, connect, actor, otherActor, child, occurrence, word }) {
  let proofs = 0;
  const report = {
    version: "WRITING_ENRICHMENT_INVENTORY_V1", gapKeyVersion: "WRITING_ENRICHMENT_GAP_KEY_V1",
    corpusScope: "disposable-child", scannedAt: "2026-09-06T20:00:00Z", inputFingerprint: "input-one",
    identityFingerprint: "dictionary-one", relationshipFingerprint: "phase-b-one",
    entries: [{ gapKey: "gap-one", gapType: "missing_governed_relationship", normalizedForm: "i", dialect: "en-GB",
      canonicalWordId: word, microSkillKey: null, occurrenceCount: 1, submissionCount: 1, priority: 1001,
      route: "s4_review", reasons: ["NO_ADMITTED_PHASE_B_PAIR"], sourceAuthorities: [], occurrenceIds: [occurrence.id] }],
  };
  await db.query("update writing_enrichment_controls set inventory_enabled=false where environment_key='local'");
  await assert.rejects(db.query("select persist_writing_enrichment_inventory('inventory-one','local',$1,$2)",[report,actor]),/INVENTORY_DISABLED/); proofs++;
  await db.query("update writing_enrichment_controls set inventory_enabled=true,generation_enabled=true where environment_key='local'");
  const persist = async (client=db,value=report) => (await client.query("select persist_writing_enrichment_inventory('inventory-one','local',$1,$2) id",[value,actor])).rows[0].id;
  const other = await connect();
  const [inventoryId,repeatedId]=await Promise.all([persist(),persist(other)]);
  assert.equal(inventoryId,repeatedId);
  assert.equal((await db.query("select count(*)::int n from writing_enrichment_inventory_occurrences")).rows[0].n,1);
  await assert.rejects(persist(db,{...report,inputFingerprint:"changed"}),/INVENTORY_CONFLICT/); proofs++;
  const outsideOccurrence = "outside-occurrence";
  await db.query("insert into writing_occurrences values($1,(select id from writing_source_snapshots limit 1),'field',0,1,'x','hash','unknown','fixture')",
    [outsideOccurrence]);
  const outsideReport={...report,inputFingerprint:"outside",entries:[{...report.entries[0],gapKey:"outside",occurrenceIds:[outsideOccurrence]}]};
  await db.query("update writing_enrichment_cohorts set enabled=false where environment_key='local' and child_id=$1",[child]);
  await assert.rejects(db.query("select persist_writing_enrichment_inventory('outside','local',$1,$2)",[outsideReport,actor]),/OUTSIDE_COHORT/);
  await db.query("update writing_enrichment_cohorts set enabled=true where environment_key='local' and child_id=$1",[child]); proofs++;
  const entry=(await db.query("select id from writing_enrichment_inventory_entries where run_id=$1",[inventoryId])).rows[0].id;
  const candidate={canonicalWordId:word,microSkillKey:"fixture_skill",relationshipRole:"demonstrates",sourceReference:"synthetic-reviewed-morphology",licenceReference:"original-synthetic",method:"deterministic_candidate"};
  const attemptArgs=["attempt-one",entry,"local","WRITING_ENRICHMENT_GENERATOR_V1","deterministic_candidate","reviewed_morphology","source-fingerprint",JSON.stringify(["synthetic:source:v1"]),"dictionary-one","phase-b-one",candidate,JSON.stringify([]),"candidate",actor];
  const attempt=(await db.query("select record_writing_enrichment_attempt($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) id",attemptArgs)).rows[0].id;
  assert.equal((await db.query("select record_writing_enrichment_attempt($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) id",attemptArgs)).rows[0].id,attempt);
  const changedAttempt=[...attemptArgs]; changedAttempt[6]="changed";
  await assert.rejects(db.query("select record_writing_enrichment_attempt($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",changedAttempt),/ATTEMPT_CONFLICT/); proofs++;
  await db.query("update adle_word_skill_review_controls set review_enabled=true where environment_key='local'");
  const packageId=(await db.query("select create_writing_enrichment_candidate_package($1,'e1-package-one','local',$2) id",[[attempt],actor])).rows[0].id;
  assert.equal((await db.query("select create_writing_enrichment_candidate_package($1,'e1-package-one','local',$2) id",[[attempt],actor])).rows[0].id,packageId);
  await assert.rejects(db.query("select create_writing_enrichment_candidate_package($1,'too-large','local',$2)",[Array.from({length:26},()=>attempt),actor]),/BATCH_SIZE_INVALID/); proofs++;
  await db.query("select review_word_skill_candidate_package_with_metrics($1,'local','[\"rejected\"]','[\"insufficient governed semantics\"]',$2,'Synthetic rejection',45)",[packageId,actor]);
  assert.equal((await db.query("select curator_active_seconds from adle_word_skill_review_metrics where package_id=$1",[packageId])).rows[0].curator_active_seconds,45);
  assert.equal((await db.query("select rejection_reason from adle_word_skill_pair_review_annotations where package_id=$1",[packageId])).rows[0].rejection_reason,"insufficient governed semantics");
  assert.equal((await db.query("select rejected_candidates::int n from writing_enrichment_metrics where primary_source_kind='reviewed_morphology'")).rows[0].n,1); proofs++;
  await db.query("update adle_word_skill_review_controls set review_enabled=false where environment_key='local'");
  const batch=randomUUID(),dictionaryWord=randomUUID();
  await db.query("insert into canonical_teaching_dictionary_import_batches values($1,'fixture','folder-v1','commit-v1','applied')",[batch]);
  await db.query("insert into canonical_teaching_dictionary_words(id,normalised_word,dialect_code,row_status,import_batch_id) values($1,'newword','en-GB','active',$2)",[dictionaryWord,batch]);
  await assert.rejects(db.query("select record_writing_enrichment_dictionary_release('local',$1,'wrong',$2,$3)",[batch,[dictionaryWord],actor]),/UNVERIFIED/);
  const dictionaryEvent=(await db.query("select record_writing_enrichment_dictionary_release('local',$1,'commit-v1',$2,$3) id",[batch,[dictionaryWord],actor])).rows[0].id;
  assert.equal((await db.query("select record_writing_enrichment_dictionary_release('local',$1,'commit-v1',$2,$3) id",[batch,[dictionaryWord],actor])).rows[0].id,dictionaryEvent); proofs++;
  await assert.rejects(db.query("update writing_enrichment_inventory_runs set input_fingerprint='changed'"),/immutable/);
  await db.query("set role authenticated");
  for (const table of ["writing_enrichment_inventory_runs","writing_enrichment_inventory_occurrences","writing_enrichment_attempts","writing_enrichment_authority_events","writing_enrichment_replay_targets"]) {
    await assert.rejects(db.query(`select * from ${table}`),/permission denied/);
  }
  await assert.rejects(db.query("select persist_writing_enrichment_inventory('parent','local',$1,$2)",[report,otherActor]),/permission denied/);
  await db.query("reset role"); proofs++;
  return proofs;
}
