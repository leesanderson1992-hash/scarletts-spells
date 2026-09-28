/** Synthetic evidence only, inside the disposable PostgreSQL proof. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

export async function proveContextFeedbackCorrections({ db, parent, child, task }) {
  const catalogBefore = (await db.query("select count(*)::int n from micro_skill_catalog")).rows[0].n;
  async function snapshot(text) {
    const submission = randomUUID();
    await db.query("insert into task_submissions values($1,$2,$3,$4,now(),$5)", [submission,parent,child,task,text]);
    return (await db.query(`insert into writing_source_snapshots
      (submission_id,parent_user_id,child_id,task_id,occurred_at,envelope)
      values($1,$2,$3,$4,now(),$5) returning id`,
    [submission,parent,child,task,{ rawSubmissionText: text }])).rows[0].id;
  }
  async function occurrence(source, text, word, start = text.indexOf(word)) {
    const id = `corrective:${randomUUID()}`;
    const hash = createHash("sha256").update(JSON.stringify(text)).digest("hex");
    await db.query(`insert into writing_occurrences
      (id,snapshot_id,field_path,field_hash,start_utf16,end_utf16,observed_text,provenance)
      values($1,$2,'/rawSubmissionText',$3,$4,$5,$6,'learner_response')`,
    [id,source,hash,start,start + word.length,word]);
    return { id, hash, word, source };
  }
  async function detector(source, ids, version) {
    return (await db.query("select record_writing_context_detector_run($1,$2,$3,$4,$5,$6,$7) id",
      [source,parent,child,randomUUID(),`detector-${version}`,`registry-${version}`,ids])).rows[0].id;
  }
  async function attempt(item, run, version, status, mode = "shadow", prompt = "corrective-prompt") {
    return (await db.query(`insert into writing_context_ai_attempts
      (occurrence_id,snapshot_id,parent_user_id,child_id,run_key,mode,family_key,
       result_status,alternative_member,reason_code,provider,model,returned_model,
       prompt_fingerprint,schema_fingerprint,config_fingerprint,gate_version,
       detector_run_id,candidate_detector_version,family_registry_version)
      values($1,$2,$3,$4,$5,$6,'THERE_THEIR_THEYRE',$7,$8,$9,'openai','gpt-6-luna',
       'gpt-6-luna',$13,'corrective-schema','corrective-config',
       'corrective-gate',$10,$11,$12) returning id`,
    [item.id,item.source,parent,child,randomUUID(),mode,status,status === "INVALID" ? "there" : null,
      status === "NOT_ASSESSED" ? "AI_PROVIDER_TRANSPORT_UNAVAILABLE" : status === "INVALID" ? "UNIQUE_REPLACEMENT" : status === "VALID" ? "SUPPORTED_USE" : "SEMANTIC_AMBIGUITY",
      run,`detector-${version}`,`registry-${version}`,prompt])).rows[0].id;
  }
  async function advisory(item, ai, status) {
    return (await db.query(`insert into writing_context_advisory_observations
      (occurrence_id,snapshot_id,parent_user_id,child_id,family_key,release_key,release_id,
       run_key,manifest_fingerprint,observation_status,observed_member,alternative_member,
       reason_code,result_fingerprint,analysis_source,ai_attempt_id)
      values($1,$2,$3,$4,'THERE_THEIR_THEYRE','corrective-release',
       'a1000000-0000-4000-8000-000000000001',$5,'corrective-config',$6,'their',$7,
       'corrective-reason','corrective-result','ai_provider',$8) returning id`,
    [item.id,item.source,parent,child,randomUUID(),status,status === "INVALID" ? "there" : null,ai])).rows[0].id;
  }
  async function add(item, intended) {
    return (await db.query("select record_parent_added_contextual_occurrence($1,$2,$3,$4,$5) id",
      [item.id,parent,item.hash,item.word,intended])).rows[0].id;
  }
  async function spellingBatch(source, members, count = members.length, status = "completed") {
    const run = (await db.query("insert into writing_shadow_runs(snapshot_id,replay_key,status) values($1,$2,$3) returning id", [source,randomUUID(),status])).rows[0].id;
    const batch = randomUUID();
    await db.query("insert into writing_known_spelling_batches values($1,$2,$3,'corrective-spelling','corrective-mapping',$4,$4)", [batch,run,source,count]);
    for (const id of members) await db.query("insert into writing_known_spelling_checks values($1,$2,$3,'NO_MAPPING')", [randomUUID(),batch,id]);
    return batch;
  }

  // 1. One checked occurrence cannot claim coverage of a second in that snapshot.
  const scope = await snapshot("their peace");
  const scopedTheir = await occurrence(scope, "their peace", "their");
  const scopedPeace = await occurrence(scope, "their peace", "peace");
  await db.query("insert into misspelling_instances values($1,$2,false,true),($3,null,false,true)", [randomUUID(),scopedPeace.id,randomUUID()]);
  const partial = await spellingBatch(scope, [scopedTheir.id]);
  const full = await spellingBatch(scope, [scopedTheir.id,scopedPeace.id]);
  const interrupted = await spellingBatch(scope, [scopedPeace.id], 1, "processing");
  const incomplete = await spellingBatch(scope, [scopedPeace.id], 2);
  const scopeMetrics = await db.query("select batch_id,parent_added_misses from writing_spelling_feedback_detector_metrics_v1 where batch_id=any($1::uuid[])", [[partial,full,interrupted,incomplete]]);
  assert.equal(scopeMetrics.rows.length, 2);
  assert.equal(scopeMetrics.rows.find(row => row.batch_id === partial).parent_added_misses, 0);
  assert.equal(scopeMetrics.rows.find(row => row.batch_id === full).parent_added_misses, 1);
  console.log("PASS 1: exact completed spelling scope; partial, full, legacy, interrupted and incomplete cases");

  // 2. The original reviewed observation retains v1 after a newer v2 run/result.
  const lineageSource = await snapshot("their their");
  const reviewed = await occurrence(lineageSource, "their their", "their", 0);
  const shadowReviewed = await occurrence(lineageSource, "their their", "their", 6);
  const v1 = await detector(lineageSource, [reviewed.id,shadowReviewed.id], "v1");
  const oldAttempt = await attempt(reviewed, v1, "v1", "INVALID", "parent_advisory");
  const oldObservation = await advisory(reviewed, oldAttempt, "INVALID");
  const shadowAttempt = await attempt(shadowReviewed, v1, "v1", "VALID");
  const v2 = await detector(lineageSource, [reviewed.id,shadowReviewed.id], "v2");
  const newAttempt = await attempt(reviewed, v2, "v2", "VALID", "parent_advisory");
  const newObservation = await advisory(reviewed, newAttempt, "VALID");
  assert.equal((await db.query("select count(*)::int n from writing_context_parent_decisions where occurrence_id=$1", [reviewed.id])).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from writing_issues where source_writing_occurrence_id=$1", [reviewed.id])).rows[0].n, 0);
  await db.query("update writing_context_advisory_control set enabled=true,ai_mode='parent_advisory' where singleton=true");
  const oldDecision = (await db.query("select record_writing_context_parent_decision($1,$2,$3,'VALID') id", [reviewed.id,oldObservation,parent])).rows[0].id;
  const latestDecision = (await db.query("select record_writing_context_parent_decision($1,$2,$3,'VALID') id", [reviewed.id,newObservation,parent])).rows[0].id;
  const history = await db.query("select decision_id,observation_id,ai_attempt_id,detector_run_id,detector_version,registry_version,prompt_fingerprint,schema_fingerprint,gate_version,is_current from writing_context_feedback_decisions_v1 where occurrence_id=$1", [reviewed.id]);
  const old = history.rows.find(row => row.decision_id === oldDecision);
  assert.equal(old.observation_id, oldObservation);
  assert.equal(old.ai_attempt_id, oldAttempt);
  assert.equal(old.detector_run_id, v1);
  assert.equal(old.detector_version, "detector-v1");
  assert.equal(old.registry_version, "registry-v1");
  assert.equal(old.prompt_fingerprint, "corrective-prompt");
  assert.equal(old.schema_fingerprint, "corrective-schema");
  assert.equal(old.gate_version, "corrective-gate");
  assert.equal(old.is_current, false);
  assert.equal(history.rows.find(row => row.decision_id === latestDecision).detector_run_id, v2);
  await db.query("select disable_writing_context_advisory($1)", [parent]);
  const shadowCase = await add(shadowReviewed, "there");
  const shadowLink = (await db.query("select c.ai_attempt_id,c.detector_run_id,d.ai_attempt_id decision_attempt,d.detector_run_id decision_run from writing_context_parent_added_cases c join writing_context_parent_decisions d on d.id=c.parent_decision_id where c.id=$1", [shadowCase])).rows[0];
  assert.equal(shadowLink.ai_attempt_id, shadowAttempt);
  assert.equal(shadowLink.detector_run_id, v1);
  assert.equal(shadowLink.decision_attempt, shadowAttempt);
  assert.equal(shadowLink.decision_run, v1);
  // Even newer shadow output must not rewrite the independently captured link.
  await attempt(shadowReviewed, v2, "v2", "INVALID");
  assert.equal((await db.query("select ai_attempt_id from writing_context_feedback_decisions_v1 where occurrence_id=$1 and is_current", [shadowReviewed.id])).rows[0].ai_attempt_id, shadowAttempt);
  console.log("PASS 2: historical observations, supersession and bound shadow attempts retain original AI/detector provenance");

  // 3. Deleting a snapshot removes promoted source facts and research pointers.
  for (const [word,intended] of [["their","there"],["peace","piece"]]) {
    const source = await snapshot(word);
    const item = await occurrence(source, word, word);
    const caseId = await add(item, intended);
    const fact = (await db.query("select parent_decision_id from writing_context_parent_added_cases where id=$1", [caseId])).rows[0];
    if (!fact.parent_decision_id) {
      const issue = (await db.query("select writing_issue_id from writing_context_parent_added_cases where id=$1", [caseId])).rows[0].writing_issue_id;
      await assert.rejects(db.query("insert into writing_context_learning_handoffs(writing_issue_id,parent_user_id,child_id,occurrence_id,micro_skill_key,handoff_state) values($1,$2,$3,$4,'D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE','PENDING_CANONICAL_WORD')", [issue,parent,child,item.id]));
      await assert.rejects(db.query("insert into adle_learning_items(id,source_kind,source_ref) values($1,'parent_verified_contextual_choice',$2)", [randomUUID(),`contextual_writing_issue:${issue}`]));
      await db.query("update writing_issues set issue_status='child_responded' where id=$1", [issue]);
      await db.query("select finalise_parent_added_contextual_repair($1,$2,$3,'concept_gap')", [issue,parent,child]);
      const repair = (await db.query("select metadata from writing_issues where id=$1", [issue])).rows[0].metadata;
      assert.equal(repair.evidence_kind, "REPAIR_ONLY");
      assert.equal(repair.learning_projection, "BLOCKED_UNGOVERNED_CONTEXTUAL_PAIR");
      await assert.rejects(db.query("select reconcile_contextual_adle_learning_need($1,$2,$3)", [issue,parent,child]));
    }
    await db.query("insert into writing_context_research_candidates(parent_added_case_id,category) values($1,'DETECTION_MISS')", [caseId]);
    if (fact.parent_decision_id) await db.query("insert into writing_context_research_candidates(parent_decision_id,category) values($1,'AI_DISAGREEMENT')", [fact.parent_decision_id]);
    await db.query("delete from writing_source_snapshots where id=$1", [source]);
    assert.equal((await db.query("select count(*)::int n from writing_context_research_candidates where parent_added_case_id=$1 or parent_decision_id=$2", [caseId,fact.parent_decision_id])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from writing_context_parent_added_cases where id=$1", [caseId])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from writing_occurrences where id=$1", [item.id])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from writing_context_catalog_review_cases where parent_added_case_id=$1", [caseId])).rows[0].n, 0);
  }
  // An AI-observed source also deletes without retaining decision/attempt pointers.
  await db.query("insert into writing_context_research_candidates(parent_decision_id,category) values($1,'AI_DISAGREEMENT')", [oldDecision]);
  await db.query("delete from writing_source_snapshots where id=$1", [lineageSource]);
  assert.equal((await db.query("select count(*)::int n from writing_context_research_candidates where parent_decision_id=$1", [oldDecision])).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from writing_context_ai_attempts where snapshot_id=$1", [lineageSource])).rows[0].n, 0);
  console.log("PASS 3: promoted known-family and unknown-family source deletion cascades research pointers");

  // 4. An original miss remains historical after current parent truth excludes it.
  const missSource = await snapshot("their");
  const missed = await occurrence(missSource, "their", "their");
  const missRun = await detector(missSource, [], "miss");
  const missCase = await add(missed, "there");
  const missDecision = (await db.query("select parent_decision_id from writing_context_parent_added_cases where id=$1", [missCase])).rows[0].parent_decision_id;
  async function missCount() {
    return (await db.query("select parent_added_misses from writing_context_feedback_detector_metrics_v1 where detector_version='detector-miss' and family_key='THERE_THEIR_THEYRE'")).rows[0].parent_added_misses;
  }
  assert.equal(await missCount(), 1);
  await db.query("insert into writing_context_parent_decisions(occurrence_id,parent_user_id,child_id,family_key,classification,reason_code,supersedes_decision_id) values($1,$2,$3,'THERE_THEIR_THEYRE','EXCLUDED','PARENT_REJECTED',$4)", [missed.id,parent,child,missDecision]);
  assert.equal(await missCount(), 0);
  const missHistory = await db.query("select parent_classification,detector_outcome,detector_run_id,is_current from writing_context_feedback_decisions_v1 where occurrence_id=$1", [missed.id]);
  assert(missHistory.rows.some(row => row.parent_classification === "INVALID" && row.detector_outcome === "PARENT_ADDED_MISS" && row.detector_run_id === missRun && !row.is_current));
  assert(missHistory.rows.some(row => row.parent_classification === "EXCLUDED" && row.is_current));
  console.log("PASS 4: superseded miss leaves current recall while its original evidence remains durable");

  // 5. Non-comparable cases remain visible but never enlarge comparable coverage.
  const denominatorSource = await snapshot("their their their their their their");
  const statuses = ["VALID","UNCERTAIN","NOT_ASSESSED","VALID","VALID",null];
  const parentStatuses = ["VALID","INVALID","INVALID","EXCLUDED","UNCERTAIN","VALID"];
  const denominatorItems = [];
  for (let i = 0; i < statuses.length; i++) denominatorItems.push(await occurrence(denominatorSource, "their their their their their their", "their", i * 6));
  const denominatorRun = await detector(denominatorSource, denominatorItems.map(item => item.id), "denominator");
  for (let i = 0; i < statuses.length; i++) {
    const ai = statuses[i] ? await attempt(denominatorItems[i], denominatorRun, "denominator", statuses[i], "shadow", "denominator-prompt") : null;
    await db.query(`insert into writing_context_parent_decisions
      (occurrence_id,parent_user_id,child_id,family_key,classification,intended_member,reason_code,ai_attempt_id)
      values($1,$2,$3,'THERE_THEIR_THEYRE',$4,$5,$6,$7)`,
    [denominatorItems[i].id,parent,child,parentStatuses[i],parentStatuses[i] === "INVALID" ? "there" : null,
      parentStatuses[i] === "EXCLUDED" ? "PARENT_EXCLUDED" : null,ai]);
  }
  const outcomes = await db.query("select ai_outcome,ai_status from writing_context_feedback_decisions_v1 where occurrence_id=any($1::text[])", [denominatorItems.map(item => item.id)]);
  assert.equal(outcomes.rows.filter(row => row.ai_outcome === "AI_ABSTENTION_RESOLVED").length, 1);
  assert.equal(outcomes.rows.filter(row => row.ai_status === "NOT_ASSESSED" && row.ai_outcome === "NOT_COMPARABLE").length, 1);
  const metrics = await db.query("select total_reviewed_count,comparable_count,excluded_count,unresolved_count,operational_not_assessed_count,not_comparable from writing_context_feedback_ai_metrics_v1");
  for (const row of metrics.rows) assert.equal(row.total_reviewed_count, row.comparable_count + row.excluded_count + row.unresolved_count + row.not_comparable);
  // Global aggregates include earlier fixtures: prove the exact six-case slice separately.
  const slice = (await db.query(`select count(*)::int total,
    count(*) filter(where ai_outcome in ('AGREED_VALID','AGREED_INVALID','AI_FALSE_INVALID','AI_MISSED_INVALID','AI_ABSTENTION_RESOLVED','REPLACEMENT_CHANGED'))::int comparable,
    count(*) filter(where ai_outcome='EXCLUDED')::int excluded,
    count(*) filter(where ai_outcome='PARENT_UNRESOLVED')::int unresolved,
    count(*) filter(where ai_status='NOT_ASSESSED')::int operational,
    count(*) filter(where ai_outcome='NOT_COMPARABLE')::int not_comparable
    from writing_context_feedback_decisions_v1 where occurrence_id=any($1::text[]) and is_current`, [denominatorItems.map(item => item.id)])).rows[0];
  assert.deepEqual(slice, { total: 6, comparable: 2, excluded: 1, unresolved: 1, operational: 1, not_comparable: 2 });
  assert(metrics.rows.some(row => row.excluded_count > 0));
  assert(metrics.rows.some(row => row.unresolved_count > 0));
  assert(metrics.rows.some(row => row.operational_not_assessed_count > 0));
  assert(metrics.rows.some(row => row.not_comparable > 0));
  const exactAggregate = (await db.query(`select total_reviewed_count,comparable_count,
    excluded_count,unresolved_count,operational_not_assessed_count,not_comparable
    from writing_context_feedback_ai_metrics_v1 where prompt_fingerprint='denominator-prompt'`)).rows[0];
  assert.deepEqual(exactAggregate, { total_reviewed_count: 5, comparable_count: 2,
    excluded_count: 1, unresolved_count: 1, operational_not_assessed_count: 1, not_comparable: 1 });
  console.log("PASS 5: explicit total/comparable/excluded/unresolved/operational/missing-evidence denominator buckets");
  const control = (await db.query("select enabled,ai_mode from writing_context_advisory_control")).rows[0];
  assert.deepEqual(control, { enabled: false, ai_mode: "disabled" });
  assert.equal((await db.query("select count(*)::int n from micro_skill_catalog")).rows[0].n, catalogBefore);
}
