#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { reviewWritingChallengeDevSnapshot } from "../lib/adle/review-v3/dev-snapshot";
import { sealCompiledReviewSnapshotV3 } from "../lib/adle/review-v3/snapshot-validator";

const CONFIRMATION = "ADLE_REVIEW_WORK_DISPOSABLE_DB_PROOF";
const EMAIL = "adle-review-proof-parent@example.test";
const PASSWORD = "Local-only-proof-2026!";
const ADMIN_EMAIL = "adle-review-proof-admin@example.test";
const SKILL = "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS";
const WRITING =
  "I think homework can feel imposible when every subject gives a task on the same night. It is neccessary to practise important skills, because repetition can make a different result possible. However, the home enviroment should also leave time for famly, exercise and rest. Children may recieve better support if teachers coordinate their plans. My favourite solution is a short, focused task instead of a seperate worksheet for every lesson. This would definately reduce stress without removing useful practice. A seperate plan would still need agreement. I would be surprised if a balanced plan did not help, just as a well-maintained bicycle works better than one pushed too hard.";

const targets = [
  { canonical: "impossible", observed: "imposible", outcome: "failure", repair: "completed_correct" },
  { canonical: "necessary", observed: "neccessary", outcome: "failure", repair: "completed_correct" },
  { canonical: "environment", observed: "enviroment", outcome: "failure", repair: "attempted_not_secured" },
  { canonical: "receive", observed: "recieve", outcome: "failure", repair: "attempted_not_secured" },
  { canonical: "different", observed: "different", outcome: "success", repair: "not_required" },
  { canonical: "possible", observed: "possible", outcome: "success", repair: "not_required" },
  { canonical: "favourite", observed: "favourite", outcome: "success", repair: "not_required" },
  { canonical: "solution", observed: "solution", outcome: "success", repair: "not_required" },
  { canonical: "surprised", observed: "surprised", outcome: "success", repair: "not_required" },
  { canonical: "bicycle", observed: "bicycle", outcome: "success", repair: "not_required" },
] as const;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function assertLocal(url: string) {
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local disposable target: ${parsed.hostname}`);
  }
}

function occurrence(word: string, occurrenceNumber = 1) {
  let start = -1;
  let cursor = 0;
  for (let index = 0; index < occurrenceNumber; index += 1) {
    start = WRITING.indexOf(word, cursor);
    assert(start >= 0, `Missing fixture occurrence ${word} #${occurrenceNumber}`);
    cursor = start + word.length;
  }
  return { start, end: start + word.length };
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  assert.equal(process.env.ADLE_REVIEW_WORK_DB_PROOF_CONFIRM, CONFIRMATION);
  const databaseUrl = required("ADLE_REVIEW_WORK_DB_PROOF_URL");
  const apiUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  assertLocal(databaseUrl);
  assertLocal(apiUrl);

  const service = createClient(apiUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();

  const findOrCreateUser = async (email: string) => {
    const users = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users.error) throw users.error;
    const existing = users.data.users.find((user) => user.email === email);
    if (existing) return existing.id;
    const created = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw created.error;
    return created.data.user.id;
  };

  const parentId = await findOrCreateUser(EMAIL);
  const adminId = await findOrCreateUser(ADMIN_EMAIL);
  const ids = {
    child: randomUUID(),
    assignment: randomUUID(),
    assignmentItem: randomUUID(),
    session: randomUUID(),
    prompt: randomUUID() as string,
    bundle: randomUUID(),
    importBatch: randomUUID(),
    words: new Map<string, string>(),
    encounters: new Map<string, string>(),
    schedules: new Map<string, string>(),
  };
  for (const word of [...targets.map((target) => target.canonical), "definitely", "separate", "family"]) {
    ids.words.set(word, randomUUID());
  }
  const existingWords = await db.query<{ id: string; normalised_word: string }>(
    `select id,normalised_word
       from public.canonical_teaching_dictionary_words
      where row_status='active' and dialect_code='en-GB' and normalised_word=any($1::text[])`,
    [[...ids.words.keys()]],
  );
  for (const existingWord of existingWords.rows) {
    ids.words.set(existingWord.normalised_word, existingWord.id);
  }
  for (const target of targets) {
    ids.encounters.set(target.canonical, randomUUID());
    ids.schedules.set(target.canonical, randomUUID());
  }

  const original = reviewWritingChallengeDevSnapshot();
  const originalPrompt = original.promptCandidates.find(
    (prompt) => prompt.challengeType === "persuasion",
  );
  assert(originalPrompt);
  const existingPrompt = await db.query<{ id: string }>(
    `select id
       from public.adle_review_prompt_versions
      where stable_prompt_key=$1 and content_version=$2 and row_status='active'
      limit 1`,
    [originalPrompt.stablePromptKey, originalPrompt.contentVersion],
  );
  if (existingPrompt.rows[0]) ids.prompt = existingPrompt.rows[0].id;
  const { sourceFingerprint: _ignored, ...provenance } = original.provenance;
  void _ignored;
  const snapshot = sealCompiledReviewSnapshotV3({
    ...original,
    assignment: {
      assignmentId: ids.assignment,
      reviewItemId: ids.assignmentItem,
      generationSource: "adle_review_writing_challenge_v3",
    },
    targets: targets.map((target, index) => ({
      contractVersion: 3 as const,
      encounterId: ids.encounters.get(target.canonical)!,
      order: index + 1,
      canonicalWordId: ids.words.get(target.canonical)!,
      canonicalSpelling: target.canonical,
      answerAuthority: {
        referenceId: `proof-answer-${target.canonical}`,
        version: "v1",
        matchingPolicy: "governed_exact_tokens_v1" as const,
      },
      audioAuthority: {
        referenceId: `proof-audio-${target.canonical}`,
        version: "v1",
        kind: "speech_text" as const,
        speechText: target.canonical,
        assetReference: null,
      },
      schedule: {
        scheduleWordId: ids.schedules.get(target.canonical)!,
        sourceBundleId: ids.bundle,
        dueKind: "scheduled_review" as const,
        dueOn: "2026-08-27",
        intervalIndex: 0,
        schedulePolicyVersion: "review_policy_v1_2026-07-04",
        wordScheduleVersion: "adle_review_per_word_schedule_v1",
      },
      routeProvenance: [],
      availableCue: null,
    })),
    promptCandidates: original.promptCandidates.map((prompt) =>
      prompt.challengeType === "persuasion"
        ? { ...prompt, promptVersionId: ids.prompt }
        : prompt,
    ),
    initialChallengeType: "persuasion",
    provenance,
  });

  await db.query("begin");
  try {
    await db.query(
      `insert into public.children(id,parent_user_id,first_name,date_of_birth)
       values($1,$2,'Disposable Review Proof','2015-04-12')`,
      [ids.child, parentId],
    );
    await db.query(
      `insert into public.micro_skill_families(
         mastery_domain_key,skill_family_key,display_name,is_assignable,is_active,metadata
       ) values('D4','D4_SCHWA','Schwa',true,true,jsonb_build_object('proofTag',$1::text))
       on conflict (skill_family_key) do nothing`,
      [CONFIRMATION],
    );
    await db.query(
      `insert into public.micro_skill_clusters(
         mastery_domain_key,skill_family_key,skill_cluster_key,display_name,
         is_assignable,is_active,metadata
       ) values('D4','D4_SCHWA','D4_SCHWA_MEDIAL','Medial schwa',true,true,
         jsonb_build_object('proofTag',$1::text))
       on conflict (skill_cluster_key) do nothing`,
      [CONFIRMATION],
    );
    await db.query(
      `insert into public.micro_skill_catalog(
         mastery_domain_key,skill_family_key,skill_cluster_key,micro_skill_key,
         display_name,practice_route,is_assignable,is_active,allowed_template_keys,metadata
       ) values('D4','D4_SCHWA','D4_SCHWA_MEDIAL',$1,'Common medial weak vowels',
         'word_practice',true,true,array['SPELLING_WORD_PRACTICE'],jsonb_build_object('proofTag',$2::text))
       on conflict (micro_skill_key) do nothing`,
      [SKILL, CONFIRMATION],
    );
    await db.query(
      `insert into public.canonical_teaching_dictionary_import_batches(
         id,source_folder_path,source_folder_sha256,validator_version,validation_summary,
         row_counts,readiness_summary,import_mode,batch_status,source_metadata
       ) values($1,'disposable/adle-review-work',$2,'adle_review_work_db_proof_v1','{}','{}','{}',
         'local_dev_import','applied',jsonb_build_object('proofTag',$3::text))`,
      [ids.importBatch, hash(CONFIRMATION), CONFIRMATION],
    );
    let rowNumber = 2;
    for (const [word, wordId] of ids.words) {
      await db.query(
        `insert into public.canonical_teaching_dictionary_words(
           id,import_batch_id,row_status,source_sheet,source_row_number,source_row_hash,
           source_metadata,word_key,normalised_word,display_word,dialect_code,frequency_band,
           age_band,complexity_band,source_category,source_name,source_licence,source_use_note,
           confidence,review_status
         ) values($1,$2,'active','adle-review-proof',$3,$4,jsonb_build_object('proofTag',$5::text),
           $6,$7,$7,'en-GB','high','middle_primary','medium','internal_reviewed_seed',
           'Disposable ADLE Review proof','internal','Disposable controlled fixture only.',
           'high','approved_for_first_exposure')
         on conflict do nothing`,
        [wordId, ids.importBatch, rowNumber, hash(`${CONFIRMATION}:${word}`), CONFIRMATION, `${word}_en_gb`, word],
      );
      rowNumber += 1;
    }
    await db.query(
      `insert into public.canonical_teaching_dictionary_transfer_selector_profiles(
         micro_skill_key,selector_kind,feature_type,feature_key,permitted_transformations,
         semantic_constraints,required_transfer_words,allowed_age_bands,minimum_source_quality,
         content_version,row_status,review_status,reviewed_by,reviewed_at,review_notes
       ) values($1,'base_word_family','root','disposable-medial-vowel','[]','{}',1,
         '["middle_primary"]','high','proof-v1','active','approved_for_first_exposure',
         'Disposable proof',timezone('utc',now()),$2)
       on conflict do nothing`,
      [SKILL, CONFIRMATION],
    );
    await db.query(
      `insert into public.canonical_teaching_dictionary_content_versions(
         import_batch_id,source_sheet,source_row_number,source_row_hash,source_metadata,
         micro_skill_key,content_version,version_status,is_active,teaching_objective,
         child_friendly_explanation,rule_explanation,first_exposure_progression,
         guided_practice_progression,review_proofreading_progression,source_category,
         source_name,source_licence,source_use_note,confidence,final_readiness_review_status,
         final_readiness_reviewed_by,final_readiness_reviewed_at
       ) values($1,'adle-review-proof',2,$2,jsonb_build_object('proofTag',$3::text),$4,'proof-v1',
         'active',true,'Notice the unstressed vowel.','Listen for the weak middle vowel.',
         'Check the governed spelling when the middle vowel is unclear.','[]','[]','[]',
         'internal_reviewed_seed','Disposable ADLE Review proof','internal',
         'Disposable controlled fixture only.','high','signed_off','Disposable proof',timezone('utc',now()))
       on conflict do nothing`,
      [ids.importBatch, hash(`${CONFIRMATION}:content`), CONFIRMATION, SKILL],
    );
    const selectedPrompt = snapshot.promptCandidates.find(
      (prompt) => prompt.promptVersionId === ids.prompt,
    );
    assert(selectedPrompt);
    await db.query(
      `insert into public.adle_review_prompt_versions(
         id,stable_prompt_key,challenge_type,content_version,prompt_text,instruction_text,
         configuration,reuse_policy,release_reference,source_fingerprint,review_status,row_status
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved','active')
       on conflict do nothing`,
      [ids.prompt, selectedPrompt.stablePromptKey, selectedPrompt.challengeType,
        selectedPrompt.contentVersion, selectedPrompt.promptText,
        selectedPrompt.instructionText, selectedPrompt.configuration,
        selectedPrompt.reusePolicy, selectedPrompt.authority.releaseReference,
        selectedPrompt.authority.sourceFingerprint],
    );
    for (const word of ["definitely", "separate", "family"]) {
      await db.query(
        `insert into public.canonical_teaching_dictionary_word_support(
           import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,
           source_row_hash,source_metadata,micro_skill_key,support_role,source_category,
           source_name,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at
         ) values($1,$2,'active','adle-review-proof',$3,$4,jsonb_build_object('proofTag',$5::text),
           $6,'support_example','internal_reviewed_seed','Disposable ADLE Review proof','internal',
           'Disposable controlled fixture only.','high','approved_for_first_exposure',
           'Disposable proof',timezone('utc',now()))
         on conflict do nothing`,
        [ids.importBatch, ids.words.get(word), rowNumber++, hash(`${CONFIRMATION}:support:${word}`), CONFIRMATION, SKILL],
      );
    }
    await db.query(
      `insert into public.daily_assignments(
         id,child_id,parent_user_id,assignment_date,title,status,assignment_generation_source,
         compiled_review_snapshot,session_started_at,session_completed_at
       ) values($1,$2,$3,'2026-08-27','ADLE Daily Plan','completed','adle_composer_v1',$4,
         '2026-08-27T09:00:00Z','2026-08-27T09:20:00Z')`,
      [ids.assignment, ids.child, parentId, snapshot],
    );
    await db.query(
      `insert into public.assignment_items(
         id,daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,
         source_entity_id,position,status,metadata
       ) values($1,$2,$3,$4,'spelling','adle_review_v3','adle_composer',$5,1,'completed',
         jsonb_build_object('proofTag',$6::text))`,
      [ids.assignmentItem, ids.assignment, ids.child, parentId, `adle-review:${ids.session}`, CONFIRMATION],
    );
    await db.query(
      `insert into public.adle_review_bundles(
         id,child_id,source_ref,interval_index,next_due_on,schedule_policy_version,bundle_status,row_status
       ) values($1,$2,$3,0,'2026-08-27','review_policy_v1_2026-07-04','active','active')`,
      [ids.bundle, ids.child, `proof:${CONFIRMATION}`],
    );
    for (const target of targets) {
      await db.query(
        `insert into public.adle_review_schedule_words(
           id,child_id,canonical_word_id,bundle_id,membership_status,catch_up_stage,next_retest_due_on,
           taught_on,row_status,word_schedule_version,word_interval_index,word_next_due_on,
           word_schedule_policy_version,word_schedule_transition_count,word_last_review_completed_on,
           word_last_review_completed_at
         ) values($1,$2,$3,$4,'scheduled',0,'2026-09-03','2026-08-01','active',
           'adle_review_per_word_schedule_v1',1,'2026-09-03','review_policy_v1_2026-07-04',1,
           '2026-08-27','2026-08-27T09:20:00Z')`,
        [ids.schedules.get(target.canonical), ids.child, ids.words.get(target.canonical), ids.bundle],
      );
    }
    await db.query(
      `insert into public.adle_review_sessions(
         id,daily_assignment_id,assignment_item_id,child_id,parent_user_id,snapshot_fingerprint,
         selected_prompt_version_id,selected_challenge_type,stage,draft_text,submitted_writing_text,
         writing_started_at,writing_deadline_at,writing_submitted_at,state_version,completed_at
       ) values($1,$2,$3,$4,$5,$6,$7,'persuasion','completed',$8,$8,
         '2026-08-27T09:00:00Z','2026-08-27T09:10:00Z','2026-08-27T09:10:00Z',7,
         '2026-08-27T09:20:00Z')`,
      [ids.session, ids.assignment, ids.assignmentItem, ids.child, parentId,
        snapshot.provenance.sourceFingerprint, ids.prompt, WRITING],
    );

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const span = occurrence(target.observed);
      const attemptId = randomUUID();
      await db.query(
        `insert into public.adle_assignment_attempt_events(
           id,child_id,parent_user_id,daily_assignment_id,assignment_item_id,canonical_word_id,
           section_key,template_key,target_word,attempt_text,is_correct,attempt_kind,evidence_class,source_ref
         ) values($1,$2,$3,$4,$5,$6,'review','ADLE_REVIEW_V3',$7,$8,$9,
           'review_production','scheduled_review_attempt',$10)`,
        [attemptId, ids.child, parentId, ids.assignment, ids.assignmentItem, ids.words.get(target.canonical), target.canonical, target.observed, target.outcome === "success", `proof:${ids.session}:${index + 1}`],
      );
      await db.query(
        `insert into public.adle_review_word_encounters(
           id,review_session_id,schedule_word_id,canonical_word_id,target_order,writing_disposition,
           original_outcome,original_outcome_source,attribution_algorithm_version,attribution_provenance,
           original_attempt_event_id,repair_state
         ) values($1,$2,$3,$4,$5,$6,$7,'writing','proof_exact_span_v1',$8,$9,$10)`,
        [ids.encounters.get(target.canonical), ids.session, ids.schedules.get(target.canonical), ids.words.get(target.canonical), index + 1, target.outcome === "success" ? "correct_in_writing" : "attributable_misspelling", target.outcome, { observedText: target.observed, positionStart: span.start, positionEnd: span.end }, attemptId, target.outcome === "success" ? "not_required" : "required"],
      );
      if (target.outcome === "failure") {
        const cueId = randomUUID();
        await db.query(
          `insert into public.adle_review_memory_cue_versions(
             id,child_id,canonical_word_id,spelling_authority_reference_id,spelling_authority_version,
             tricky_grapheme_start,tricky_grapheme_end,selected_tricky_text,cue_text,
             source_review_encounter_id,version_number,version_status
           ) values($1,$2,$3,$4,'v1',0,2,$5,$6,$7,1,'active')`,
          [cueId, ids.child, ids.words.get(target.canonical), `proof-answer-${target.canonical}`, target.canonical.slice(0, 2), `Remember the governed spelling of ${target.canonical}.`, ids.encounters.get(target.canonical)],
        );
        const repairAttemptId = randomUUID();
        await db.query(
          `insert into public.adle_assignment_attempt_events(
             id,child_id,parent_user_id,daily_assignment_id,assignment_item_id,canonical_word_id,
             section_key,template_key,target_word,attempt_text,is_correct,attempt_kind,evidence_class,source_ref
           ) values($1,$2,$3,$4,$5,$6,'review_repair','ADLE_REPAIR_V3',$7,$8,$9,
             'repair_retry','immediate_repair_attempt',$10)`,
          [repairAttemptId, ids.child, parentId, ids.assignment, ids.assignmentItem, ids.words.get(target.canonical), target.canonical, target.repair === "completed_correct" ? target.canonical : target.observed, target.repair === "completed_correct", `proof:repair:${ids.session}:${index + 1}`],
        );
        await db.query(
          `insert into public.adle_review_repair_attempts(
             review_encounter_id,attempt_number,attempt_text,is_correct,assignment_attempt_event_id
           ) values($1,1,$2,$3,$4)`,
          [ids.encounters.get(target.canonical), target.repair === "completed_correct" ? target.canonical : target.observed, target.repair === "completed_correct", repairAttemptId],
        );
        await db.query(
          `update public.adle_review_word_encounters set repair_state=$2,repair_stage='terminal',
             repair_terminal_at='2026-08-27T09:18:00Z',repair_tricky_grapheme_start=0,
             repair_tricky_grapheme_end=2,repair_tricky_text=$3,repair_memory_cue_version_id=$4,
             repair_attempt_count=1 where id=$1`,
          [ids.encounters.get(target.canonical), target.repair, target.canonical.slice(0, 2), cueId],
        );
      }
      const outcomeId = randomUUID();
      await db.query(
        `insert into public.adle_review_outcome_events(
           id,child_id,canonical_word_id,bundle_id,event_type,occurred_on,interval_index,
           schedule_policy_version,attempt_text,daily_assignment_id,assignment_item_id,
           review_session_id,review_encounter_id,schedule_word_id,original_result,result_source,
           due_kind,frozen_due_on,frozen_interval_index,word_schedule_version,
           assignment_practice_date,review_completed_on,completed_at,original_attempted_at,
           writing_submitted_at,source_provenance
         ) values($1,$2,$3,$4,$5,'2026-08-27',0,'review_policy_v1_2026-07-04',$6,$7,$8,
           $9,$10,$11,$12,'review_writing','scheduled_review','2026-08-27',0,
           'adle_review_per_word_schedule_v1','2026-08-27','2026-08-27','2026-08-27T09:20:00Z',
           '2026-08-27T09:10:00Z','2026-08-27T09:10:00Z',jsonb_build_object('proofTag',$13::text))`,
        [outcomeId, ids.child, ids.words.get(target.canonical), ids.bundle, target.outcome === "success" ? "review_pass" : "review_fail", target.observed, ids.assignment, ids.assignmentItem, ids.session, ids.encounters.get(target.canonical), ids.schedules.get(target.canonical), target.outcome, CONFIRMATION],
      );
      await db.query(`update public.adle_review_word_encounters set review_outcome_event_id=$2 where id=$1`, [ids.encounters.get(target.canonical), outcomeId]);
    }
    await db.query(
      `insert into public.adle_review_completion_receipts(
         review_session_id,idempotency_key,snapshot_fingerprint,request_fingerprint,
         completed_at,review_completed_on,result_payload
       ) values($1,$2,$3,$4,'2026-08-27T09:20:00Z','2026-08-27',$5)`,
      [ids.session, `proof:${ids.session}`, snapshot.provenance.sourceFingerprint, hash(`request:${ids.session}`), { proofTag: CONFIRMATION, learnerReviewCompleted: true }],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }

  console.log(JSON.stringify({
    status: "seeded",
    proofTag: CONFIRMATION,
    parentId,
    adminId,
    childId: ids.child,
    dailyAssignmentId: ids.assignment,
    reviewSessionId: ids.session,
    sourceId: `${ids.assignment}:${ids.session}`,
    email: EMAIL,
    password: PASSWORD,
    targetCounts: { successful: 6, repaired: 2, missed: 2 },
    writingHash: hash(WRITING),
    snapshotFingerprint: snapshot.provenance.sourceFingerprint,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
