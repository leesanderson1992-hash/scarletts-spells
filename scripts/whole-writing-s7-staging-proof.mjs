/** Disposable S7 proof. The project ref below is staging only. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { ensureCanonicalIntakeForGovernedSource } from "../lib/adle/canonical-intake/governed-source-continuation";
import { processTaskSubmission } from "../lib/courses/submission-processing";
import { recoverWritingShadowRuns } from "../lib/writing-engine/whole-writing/worker";

const STAGING_REF = "jlhotktspjvffslvuyfz";
const PREVIEW_HOST = "scarletts-spells-staged-p6optzhph.vercel.app";
const protectedTables = [
  "adle_learning_items",
  "child_gold_coin_ledger_events",
  "child_gold_bar_ledger_events",
  "adle_authentic_use_events",
  "adle_review_schedule_words",
];

const firstConfigured = (...values) =>
  values.find((value) => typeof value === "string" && value.length > 0);
const stagingUrl = firstConfigured(
  process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const serviceKey = firstConfigured(
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.SB_SERVICE_ROLE_KEY,
);
const anonKey = firstConfigured(
  process.env.SUPABASE_ANON_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

assert.ok(
  stagingUrl?.includes(STAGING_REF),
  "The configured Supabase URL is not the fixed staging project",
);
assert.ok(serviceKey && anonKey, "Staging Supabase keys are required");
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
process.env.NEXT_PUBLIC_SUPABASE_URL = stagingUrl;

const service = createClient(stagingUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const parent = createClient(stagingUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const check = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
async function counts() {
  return Object.fromEntries(
    await Promise.all(
      protectedTables.map(async (table) => {
        const result = await service
          .from(table)
          .select("id", { count: "exact", head: true });
        if (result.error) throw new Error(result.error.message);
        return [table, result.count];
      }),
    ),
  );
}

function cleanupConsumedProofSource(parentUserId) {
  assert.match(parentUserId, /^[0-9a-f-]{36}$/i);
  const root = mkdtempSync(join(tmpdir(), "writing-s7-staging-cleanup-"));
  const queryPath = join(root, "cleanup.sql");
  try {
    writeFileSync(
      queryPath,
      `begin;
delete from public.adle_canonical_intake_candidates
where source_candidate_mapping_id in (
  select id from public.parent_verified_spelling_candidate_mappings
  where parent_user_id = '${parentUserId}'::uuid
);
alter table public.parent_verified_spelling_candidate_mappings
  disable trigger pvscm_protect_handoff_delete;
delete from public.parent_verified_spelling_candidate_mappings
where parent_user_id = '${parentUserId}'::uuid;
alter table public.parent_verified_spelling_candidate_mappings
  enable trigger pvscm_protect_handoff_delete;
delete from auth.users where id = '${parentUserId}'::uuid;
commit;
select count(*)::integer as residue
from public.children where parent_user_id = '${parentUserId}'::uuid;
`,
      { mode: 0o600 },
    );
    const output = execFileSync(
      "npx",
      [
        "--yes",
        "supabase@2.116.0",
        "db",
        "query",
        "--linked",
        "--project-ref",
        STAGING_REF,
        "--output",
        "json",
        "--file",
        queryPath,
      ],
      { encoding: "utf8", timeout: 90_000 },
    );
    assert.match(output, /"residue"\s*:\s*0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const tag = randomUUID();
let parentId = null;
try {
  const preview = await fetch(`https://${PREVIEW_HOST}/login`, {
    redirect: "manual",
  });
  assert.ok(
    preview.status >= 200 && preview.status < 400,
    `S7 Preview did not answer: HTTP ${preview.status}`,
  );

  const before = await counts();
  const email = `s7-proof-${tag}@example.test`;
  const password = `S7-proof-${randomUUID()}!`;
  parentId = check(
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }),
  ).user.id;
  const childId = check(
    await service
      .from("children")
      .insert({
        parent_user_id: parentId,
        first_name: "S7 Proof",
        notes: `disposable-s7:${tag}`,
      })
      .select("id")
      .single(),
  ).id;
  const courseId = check(
    await service
      .from("courses")
      .insert({
        parent_user_id: parentId,
        child_id: childId,
        title: "S7 proof",
        description: `disposable:${tag}`,
        structure_type: "timed",
      })
      .select("id")
      .single(),
  ).id;
  const moduleId = check(
    await service
      .from("course_modules")
      .insert({
        parent_user_id: parentId,
        course_id: courseId,
        title: "Unknown errors",
        position: 0,
      })
      .select("id")
      .single(),
  ).id;
  const lessonSchema = {
    version: 1,
    theme: "scarlett-default",
    title: "Unknown errors",
    blocks: [
      {
        block_id: "story",
        block_type: "question_textarea",
        label: "Story",
        rows: 3,
      },
    ],
  };
  const taskId = check(
    await service
      .from("course_tasks")
      .insert({
        parent_user_id: parentId,
        course_id: courseId,
        module_id: moduleId,
        title: "S7 proof",
        task_type: "lesson",
        position: 0,
        is_active: true,
        coin_reward_trigger: "none",
        gold_bar_rule: "none",
        lesson_schema: lessonSchema,
      })
      .select("id")
      .single(),
  ).id;
  check(
    await service.from("writing_shadow_controls").insert({
      child_id: childId,
      parent_user_id: parentId,
      capture_enabled: true,
      processing_enabled: true,
      extraction_enabled: true,
      resolution_enabled: true,
      evidence_shadow_enabled: false,
      known_error_detection_enabled: false,
      known_error_review_enabled: false,
    }),
  );

  check(await parent.auth.signInWithPassword({ email, password }));
  const observed = "szevenmispelt";
  const intended = "ssevenmisspelt";
  const text = `${observed} garden`;
  const draft = {
    story: text,
    __structured_lesson_response: {
      answers: [{ block_id: "story", value: text }],
    },
  };
  const submittedAt = new Date().toISOString();
  const submitted = check(
    await parent.rpc("submit_course_task_response_once", {
      p_parent_user_id: parentId,
      p_child_id: childId,
      p_course_id: courseId,
      p_task_id: taskId,
      p_submission_request_id: randomUUID(),
      p_submission_text: text,
      p_submitted_at: submittedAt,
      p_completion_date: submittedAt.slice(0, 10),
      p_structured_payload_type: "structured_lesson_response",
      p_structured_payload: draft.__structured_lesson_response,
      p_processing_payload: {
        writingSourceCapture: {
          rawSubmissionText: text,
          draftPayload: draft,
        },
        draftPayload: draft,
        taskType: "lesson",
        completionDate: submittedAt.slice(0, 10),
      },
    }),
  );
  const processing = await processTaskSubmission(submitted.submissionId);
  assert.ok(
    ["completed", "not_claimed"].includes(processing.status),
    `Submission processing failed: ${processing.status}`,
  );
  const shadow = await recoverWritingShadowRuns(service);
  assert.equal(shadow.failed, 0);

  const existingSample = check(
    await service
      .from("writing_samples")
      .select("id")
      .eq("task_submission_id", submitted.submissionId)
      .maybeSingle(),
  );
  const sample =
    existingSample ??
    check(
      await service
        .from("writing_samples")
        .insert({
          child_id: childId,
          parent_user_id: parentId,
          title: "S7 proof submission",
          sample_text: text,
          written_at: submittedAt.slice(0, 10),
          source: "Course task submission",
          task_submission_id: submitted.submissionId,
        })
        .select("id")
        .single(),
    );
  const snapshot = check(
    await service
      .from("writing_source_snapshots")
      .select("id")
      .eq("submission_id", submitted.submissionId)
      .single(),
  );
  const occurrence = check(
    await service
      .from("writing_occurrences")
      .select("id,start_utf16,end_utf16")
      .eq("snapshot_id", snapshot.id)
      .eq("observed_text", observed)
      .eq("provenance", "learner_response")
      .single(),
  );
  const skill = check(
    await service
      .from("micro_skill_catalog")
      .select("micro_skill_key")
      .eq("mastery_domain_key", "D4")
      .eq("is_active", true)
      .eq("is_assignable", true)
      .limit(1)
      .single(),
  );

  const misspelling = check(
    await service
      .from("misspelling_instances")
      .insert({
        writing_sample_id: sample.id,
        child_id: childId,
        parent_user_id: parentId,
        misspelled_word: observed,
        corrected_word: intended,
        suggested_word: intended,
        context_text: text,
        position_start: occurrence.start_utf16,
        position_end: occurrence.end_utf16,
        is_parent_overridden: false,
        is_false_positive: false,
        source_writing_occurrence_id: occurrence.id,
      })
      .select("id,source_writing_occurrence_id")
      .single(),
  );
  const issue = check(
    await service
      .from("writing_issues")
      .insert({
        child_id: childId,
        parent_user_id: parentId,
        task_submission_id: submitted.submissionId,
        writing_sample_id: sample.id,
        source_misspelling_instance_id: misspelling.id,
        issue_status: "child_responded",
        observed_text: observed,
        suggested_replacement: intended,
        approved_replacement: intended,
        context_text: text,
        position_start: occurrence.start_utf16,
        position_end: occurrence.end_utf16,
        micro_skill_key: skill.micro_skill_key,
      })
      .select("id,source_writing_occurrence_id")
      .single(),
  );
  const attempt = check(
    await service
      .from("writing_issue_correction_attempts")
      .insert({
        writing_issue_id: issue.id,
        child_id: childId,
        parent_user_id: parentId,
        task_submission_id: submitted.submissionId,
        attempted_correction: observed,
        corrected_independently: false,
        reflection: "could_not_fix",
        correction_outcome: "incorrect",
        assistance_state: "unknown",
        answer_visibility: "unknown",
      })
      .select("id,source_writing_occurrence_id,correction_outcome")
      .single(),
  );
  check(
    await service.from("spelling_catalog_review_cases").insert({
      parent_user_id: parentId,
      child_id: childId,
      task_submission_id: submitted.submissionId,
      writing_sample_id: sample.id,
      source_misspelling_instance_id: misspelling.id,
      source_provenance: "lesson_submission_parent_added_missed_word",
      reviewed_event_source_entity_id: issue.id,
      original_child_spelling: observed,
      original_correct_spelling: intended,
      misspelling_normalized: observed,
      correct_spelling_normalized: intended,
      case_status: "open",
      metadata: { proofTag: tag },
    }),
  );
  check(
    await service
      .from("writing_issues")
      .update({
        issue_status: "finalised",
        final_classification: "concept_gap",
        final_classified_at: new Date().toISOString(),
      })
      .eq("id", issue.id),
  );
  const candidate = check(
    await service
      .from("parent_verified_spelling_candidate_mappings")
      .select(
        "id,source_writing_occurrence_id,candidate_status,canonical_intake_handoff_state",
      )
      .eq("source_misspelling_instance_id", misspelling.id)
      .single(),
  );
  assert.equal(misspelling.source_writing_occurrence_id, occurrence.id);
  assert.equal(issue.source_writing_occurrence_id, occurrence.id);
  assert.equal(attempt.source_writing_occurrence_id, occurrence.id);
  assert.equal(attempt.correction_outcome, "incorrect");
  assert.equal(candidate.source_writing_occurrence_id, occurrence.id);
  assert.equal(candidate.candidate_status, "parent_local_promoted");

  const continued = await ensureCanonicalIntakeForGovernedSource({
    serviceClient: service,
    candidateMappingId: candidate.id,
    parentUserId: parentId,
    childId,
  });
  const intake = check(
    await service
      .from("adle_canonical_intake_candidates")
      .select("id,source_writing_occurrence_id,candidate_state")
      .eq("id", continued.canonicalIntakeCandidateId)
      .single(),
  );
  assert.equal(intake.source_writing_occurrence_id, occurrence.id);
  assert.deepEqual(await counts(), before);

  console.log(
    JSON.stringify({
      status: "passed",
      project: STAGING_REF,
      preview: PREVIEW_HOST,
      exactOccurrenceLineage: true,
      separateIncorrectRetry: true,
      canonicalIntakeCandidate: intake.candidate_state,
      protectedConsequenceChanges: 0,
    }),
  );
} finally {
  if (parentId) cleanupConsumedProofSource(parentId);
}
