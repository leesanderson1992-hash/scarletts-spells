import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import {
  confirmFreeWritingEvidenceCandidates,
  detectAndStoreFreeWritingEvidenceCandidates,
  FREE_WRITING_EVIDENCE_SOURCE_TYPE,
  getFreeWritingEvidenceSourceEntityId,
} from "../lib/rewards/free-writing-evidence";
import { getChildRewardReadModel } from "../lib/rewards/read-model";
import {
  createOrUpdateGoldenNuggetFromParentApproval,
  moveGoldenNuggetIntoForgeFromDailyAssignmentItem,
} from "../lib/rewards/word-treasures";
import { completeDailySpellingPracticeItems } from "../lib/writing-practice/daily-spelling-practice-completion";

const CONFIRM = "LOCAL_WORD_TREASURE_PHASE_3_7A";
const DAILY_PRACTICE_TITLE = "Daily spelling practice";
const PRACTICE_DATE = "2026-06-28";
const TARGET_WORD = "because";
const ORIGINAL_MISSPELLING = "becuase";
const MICRO_SKILL_KEY = "phase_3_7a_spelling_transfer";

type SupabaseClient = ReturnType<typeof createClient<any, "public">>;
type RowCountMap = Map<string, number>;

function loadEnvFile(path: string) {
  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;

  return value && !value.startsWith("--") ? value : null;
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function assertLocalSupabaseUrl(value: string) {
  const url = new URL(value);
  const localHosts = new Set(["127.0.0.1:54321", "localhost:54321"]);

  if (url.protocol !== "http:" || !localHosts.has(url.host)) {
    throw new Error(
      "Refusing to run against a non-local Supabase URL. Expected http://127.0.0.1:54321 or http://localhost:54321.",
    );
  }
}

function base64UrlJson(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createLocalServiceRoleKey() {
  const secret =
    process.env.SUPABASE_JWT_SECRET ??
    "super-secret-jwt-token-with-at-least-32-characters-long";
  const header = base64UrlJson({
    alg: "HS256",
    typ: "JWT",
  });
  const payload = base64UrlJson({
    iss: "supabase",
    ref: "local",
    role: "service_role",
    iat: 1641769200,
    exp: 1957345200,
  });
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

function assertNoError(error: { message?: string } | null, label: string) {
  if (error) {
    const details = [
      error.message,
      "name" in error && typeof error.name === "string" ? error.name : null,
      "status" in error && typeof error.status === "number"
        ? `status ${error.status}`
        : null,
      "code" in error && typeof error.code === "string" ? error.code : null,
    ]
      .filter(Boolean)
      .join("; ");

    throw new Error(`${label}: ${details || JSON.stringify(error)}`);
  }
}

function assertRow<T>(value: T | null, label: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`${label}: expected a row but received none.`);
  }
}

async function countRows(
  supabase: SupabaseClient,
  table: string,
  childId: string,
) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("child_id", childId);

  assertNoError(error, `Failed to count ${table}`);

  return count ?? 0;
}

async function countTreasureEvents(input: {
  supabase: SupabaseClient;
  treasureId: string;
  eventType?: string;
}) {
  let query = input.supabase
    .from("child_word_treasure_events")
    .select("id", { count: "exact", head: true })
    .eq("treasure_id", input.treasureId);

  if (input.eventType) {
    query = query.eq("event_type", input.eventType);
  }

  const { count, error } = await query;
  assertNoError(error, `Failed to count ${input.eventType ?? "treasure"} events`);

  return count ?? 0;
}

async function readForbiddenCounts(
  supabase: SupabaseClient,
  childId: string,
  tables: string[],
) {
  const counts: RowCountMap = new Map();

  for (const table of tables) {
    counts.set(table, await countRows(supabase, table, childId));
  }

  return counts;
}

async function assertForbiddenCountsUnchanged(input: {
  supabase: SupabaseClient;
  childId: string;
  before: RowCountMap;
}) {
  for (const [table, before] of input.before) {
    const after = await countRows(input.supabase, table, input.childId);

    assert.equal(after, before, `${table} changed during 3.7A lifecycle signoff.`);
  }
}

async function insertSingle<T extends { id: string }>(
  supabase: SupabaseClient,
  table: string,
  values: Record<string, unknown>,
  label: string,
) {
  const { data, error } = await supabase
    .from(table)
    .insert(values)
    .select("id")
    .single();

  assertNoError(error, label);

  return data as T;
}

async function createCourseScaffold(input: {
  supabase: SupabaseClient;
  parentUserId: string;
  childId: string;
}) {
  const course = await insertSingle(
    input.supabase,
    "courses",
    {
      parent_user_id: input.parentUserId,
      child_id: input.childId,
      title: "Phase 3.7A lifecycle signoff",
      structure_type: "timed",
      coin_reward_trigger: "none",
      gold_coin_reward_amount: 0,
      is_active: true,
    },
    "Failed to create course",
  );
  const module = await insertSingle(
    input.supabase,
    "course_modules",
    {
      course_id: course.id,
      parent_user_id: input.parentUserId,
      title: "Free writing signoff",
      coin_reward_trigger: "none",
      gold_coin_reward_amount: 0,
      position: 0,
    },
    "Failed to create course module",
  );

  return { courseId: course.id, moduleId: module.id };
}

async function createTask(input: {
  supabase: SupabaseClient;
  parentUserId: string;
  courseId: string;
  moduleId: string;
  taskType: "lesson" | "test";
  title: string;
  fieldKey: string;
  position: number;
}) {
  const task = await insertSingle(
    input.supabase,
    "course_tasks",
    {
      course_id: input.courseId,
      module_id: input.moduleId,
      parent_user_id: input.parentUserId,
      title: input.title,
      task_type: input.taskType,
      position: input.position,
      gold_bar_rule: "none",
      coin_reward_trigger: "none",
      gold_coin_reward_amount: 0,
      lesson_schema: {
        version: 1,
        blocks: [
          {
            id: input.fieldKey,
            block_id: input.fieldKey,
            type: "textarea",
            label: "Free response",
          },
        ],
      },
    },
    `Failed to create ${input.taskType} task`,
  );

  return task.id;
}

async function createSubmissionAndSample(input: {
  supabase: SupabaseClient;
  parentUserId: string;
  childId: string;
  courseId: string;
  taskId: string;
  text: string;
  title: string;
}) {
  const submission = await insertSingle(
    input.supabase,
    "task_submissions",
    {
      task_id: input.taskId,
      course_id: input.courseId,
      child_id: input.childId,
      parent_user_id: input.parentUserId,
      submission_text: input.text,
      parent_review_status: "pending",
    },
    "Failed to create task submission",
  );
  const writingSample = await insertSingle(
    input.supabase,
    "writing_samples",
    {
      child_id: input.childId,
      parent_user_id: input.parentUserId,
      task_submission_id: submission.id,
      title: input.title,
      sample_text: input.text,
      written_at: PRACTICE_DATE,
      source: "phase_3_7a_lifecycle_signoff",
    },
    "Failed to create writing sample",
  );

  return { submissionId: submission.id, writingSampleId: writingSample.id };
}

async function createFinalisedSpellingIssue(input: {
  supabase: SupabaseClient;
  parentUserId: string;
  childId: string;
  courseId: string;
  moduleId: string;
}) {
  const fieldKey = "initial-spelling-field";
  const taskId = await createTask({
    supabase: input.supabase,
    parentUserId: input.parentUserId,
    courseId: input.courseId,
    moduleId: input.moduleId,
    taskType: "lesson",
    title: "Initial parent-finalised spelling issue",
    fieldKey,
    position: 0,
  });
  const { submissionId, writingSampleId } = await createSubmissionAndSample({
    supabase: input.supabase,
    parentUserId: input.parentUserId,
    childId: input.childId,
    courseId: input.courseId,
    taskId,
    text: `I wrote ${ORIGINAL_MISSPELLING} and my parent finalised it as ${TARGET_WORD}.`,
    title: "Initial spelling sample",
  });
  const misspelling = await insertSingle(
    input.supabase,
    "misspelling_instances",
    {
      writing_sample_id: writingSampleId,
      child_id: input.childId,
      parent_user_id: input.parentUserId,
      misspelled_word: ORIGINAL_MISSPELLING,
      corrected_word: TARGET_WORD,
      context_text: `I wrote ${ORIGINAL_MISSPELLING}.`,
      position_start: 8,
      position_end: 15,
      error_type: "Irregular/tricky memory word",
      suggested_word: TARGET_WORD,
    },
    "Failed to create misspelling instance",
  );
  const learningItem = await insertSingle(
    input.supabase,
    "learning_items",
    {
      child_id: input.childId,
      parent_user_id: input.parentUserId,
      micro_skill_key: MICRO_SKILL_KEY,
      progress_state: "golden_nugget",
      is_active: true,
      metadata: {
        target_word: TARGET_WORD,
        phase: "3.7A",
      },
    },
    "Failed to create learning item",
  );
  const issue = await insertSingle(
    input.supabase,
    "writing_issues",
    {
      child_id: input.childId,
      parent_user_id: input.parentUserId,
      task_submission_id: submissionId,
      writing_sample_id: writingSampleId,
      source_misspelling_instance_id: misspelling.id,
      issue_status: "finalised",
      final_classification: "fragile_knowledge",
      observed_text: ORIGINAL_MISSPELLING,
      suggested_replacement: TARGET_WORD,
      approved_replacement: TARGET_WORD,
      context_text: `I wrote ${ORIGINAL_MISSPELLING}.`,
      source_field_key: fieldKey,
      position_start: 8,
      position_end: 15,
      micro_skill_key: MICRO_SKILL_KEY,
      parent_review_note: "Phase 3.7A parent finalisation.",
      parent_marked_at: new Date().toISOString(),
      final_classified_at: new Date().toISOString(),
      metadata: {
        phase: "3.7A",
      },
    },
    "Failed to create finalised writing issue",
  );

  return {
    issueId: issue.id,
    learningItemId: learningItem.id,
    misspellingId: misspelling.id,
    submissionId,
  };
}

function buildDraftPayload(fieldKey: string, text: string) {
  return {
    [fieldKey]: text,
    prompt: TARGET_WORD,
    choice: TARGET_WORD,
    __field_meta: {
      [fieldKey]: {
        label: "Free response",
        type: "textarea",
      },
      prompt: {
        label: "Copy this prompt",
        type: "textarea",
      },
      choice: {
        label: "Choose one",
        type: "select-one",
      },
    },
  };
}

async function createEvidenceCandidate(input: {
  supabase: SupabaseClient;
  parentUserId: string;
  childId: string;
  courseId: string;
  moduleId: string;
  taskType: "lesson" | "test";
  position: number;
  fieldKey: string;
  text: string;
}) {
  const taskId = await createTask({
    supabase: input.supabase,
    parentUserId: input.parentUserId,
    courseId: input.courseId,
    moduleId: input.moduleId,
    taskType: input.taskType,
    title: `Evidence ${input.position + 1}`,
    fieldKey: input.fieldKey,
    position: input.position + 1,
  });
  const { submissionId, writingSampleId } = await createSubmissionAndSample({
    supabase: input.supabase,
    parentUserId: input.parentUserId,
    childId: input.childId,
    courseId: input.courseId,
    taskId,
    text: input.text,
    title: `Evidence sample ${input.position + 1}`,
  });
  const candidates = await detectAndStoreFreeWritingEvidenceCandidates({
    supabase: input.supabase,
    parentUserId: input.parentUserId,
    childId: input.childId,
    taskSubmissionId: submissionId,
    taskId,
    taskType: input.taskType,
    draftPayload: buildDraftPayload(input.fieldKey, input.text),
    submissionText: input.text,
    writingSampleId,
  });

  assert.equal(candidates.length, 1, "Expected one candidate for an authentic field.");

  return {
    candidate: candidates[0],
    taskId,
    submissionId,
    writingSampleId,
  };
}

async function main() {
  const explicitServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  loadEnvFile(".env.local");

  const confirm = readArg("--confirm") ?? "";
  if (confirm !== CONFIRM) {
    throw new Error(`Refusing local smoke without --confirm ${CONFIRM}.`);
  }

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ??
    readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertLocalSupabaseUrl(supabaseUrl);
  const serviceRoleKey = explicitServiceRoleKey ?? createLocalServiceRoleKey();

  process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const stamp = Date.now();
  const email = `phase-3-7a-lifecycle-${stamp}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  let parentUserId: string | null = null;
  let childId: string | null = null;

  try {
    const { data: userData, error: userError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    assertNoError(userError, "Failed to create disposable auth user");
    parentUserId = userData.user?.id ?? null;

    assert.ok(parentUserId, "Disposable auth user did not return an id.");

    const child = await insertSingle(
      supabase,
      "children",
      {
        parent_user_id: parentUserId,
        first_name: "Phase37A",
      },
      "Failed to create disposable child",
    );
    childId = child.id;

    const forbiddenTables = [
      "spelling_reward_states",
      "spelling_reward_events",
      "learning_item_evidence",
      "child_gold_coin_ledger_events",
    ];
    const forbiddenCountsBefore = await readForbiddenCounts(
      supabase,
      childId,
      forbiddenTables,
    );

    const { courseId, moduleId } = await createCourseScaffold({
      supabase,
      parentUserId,
      childId,
    });
    const finalisedIssue = await createFinalisedSpellingIssue({
      supabase,
      parentUserId,
      childId,
      courseId,
      moduleId,
    });
    const nuggetResult = await createOrUpdateGoldenNuggetFromParentApproval({
      supabase,
      childId,
      parentUserId,
      correctedWord: TARGET_WORD,
      originalMisspelling: ORIGINAL_MISSPELLING,
      sourceIssueId: finalisedIssue.issueId,
      sourceLearningItemId: finalisedIssue.learningItemId,
      sourceSubmissionId: finalisedIssue.submissionId,
      sourceMisspellingInstanceId: finalisedIssue.misspellingId,
      microSkillKey: MICRO_SKILL_KEY,
      correctionAttemptedAt: new Date().toISOString(),
      metadata: {
        phase: "3.7A",
      },
    });

    assert.equal(nuggetResult.skippedReason, null);
    assert.ok(nuggetResult.treasure, "Parent finalisation did not create a treasure.");
    assert.equal(nuggetResult.treasure.status, "golden_nugget");
    assert.equal(
      await countTreasureEvents({
        supabase,
        treasureId: nuggetResult.treasure.id,
        eventType: "golden_nugget_created",
      }),
      1,
      "Parent finalisation should create exactly one Golden Nugget event.",
    );

    const treasureId = nuggetResult.treasure.id;
    const assignment = await insertSingle(
      supabase,
      "daily_assignments",
      {
        child_id: childId,
        parent_user_id: parentUserId,
        assignment_date: PRACTICE_DATE,
        title: DAILY_PRACTICE_TITLE,
        status: "pending",
        assignment_generation_source: "learning_items",
        source_learning_item_ids: [finalisedIssue.learningItemId],
      },
      "Failed to create daily assignment",
    );
    const assignmentItem = await insertSingle(
      supabase,
      "assignment_items",
      {
        daily_assignment_id: assignment.id,
        child_id: childId,
        parent_user_id: parentUserId,
        domain_module: "spelling",
        item_type: "controlled_spelling",
        source_type: "learning_item_evidence",
        source_entity_id: randomUUID(),
        learning_item_id: finalisedIssue.learningItemId,
        template_key: "phase_3_7a_template",
        target_word: TARGET_WORD,
        prompt_data: {
          targetWord: TARGET_WORD,
        },
        expected_answer: {
          correctSpelling: TARGET_WORD,
        },
        position: 0,
        status: "ready",
        metadata: {
          phase: "3.7A",
        },
      },
      "Failed to create assignment item",
    );

    const completion = await completeDailySpellingPracticeItems({
      supabase,
      parentUserId,
      childId,
      dailyAssignmentId: assignment.id,
      practiceDate: PRACTICE_DATE,
      moveGoldenNuggetIntoForge: (input) =>
        moveGoldenNuggetIntoForgeFromDailyAssignmentItem({
          ...input,
          supabase,
        }),
    });

    assert.equal(completion.completedItemCount, 1);

    const { data: forgedTreasure, error: forgedTreasureError } = await supabase
      .from("child_word_treasures")
      .select("status, entered_forge_at, authentic_correct_uses_after_forge")
      .eq("id", treasureId)
      .single();
    assertNoError(forgedTreasureError, "Failed to reread forged treasure");
    assertRow(forgedTreasure, "Failed to reread forged treasure");
    assert.equal(forgedTreasure.status, "in_forge");
    assert.ok(forgedTreasure.entered_forge_at, "Treasure did not enter Forge.");
    assert.equal(forgedTreasure.authentic_correct_uses_after_forge, 0);
    assert.equal(
      await countTreasureEvents({
        supabase,
        treasureId,
        eventType: "entered_forge",
      }),
      1,
      "Daily Assignment completion should create one Forge event.",
    );

    const retryOnlyTaskId = await createTask({
      supabase,
      parentUserId,
      courseId,
      moduleId,
      taskType: "lesson",
      title: "Returned spelling retry exclusion",
      fieldKey: "retry-field",
      position: 20,
    });
    const retryOnly = await createSubmissionAndSample({
      supabase,
      parentUserId,
      childId,
      courseId,
      taskId: retryOnlyTaskId,
      text: "",
      title: "Returned spelling retry exclusion",
    });
    const retryCandidates = await detectAndStoreFreeWritingEvidenceCandidates({
      supabase,
      parentUserId,
      childId,
      taskSubmissionId: retryOnly.submissionId,
      taskId: retryOnlyTaskId,
      taskType: "lesson",
      draftPayload: {
        __writing_issue_feedback: [
          {
            attempted_correction: TARGET_WORD,
          },
        ],
      },
      submissionText: "",
      writingSampleId: retryOnly.writingSampleId,
    });
    assert.equal(
      retryCandidates.length,
      0,
      "Returned spelling correction retry fields must not create evidence.",
    );

    const evidenceInputs = [
      {
        taskType: "lesson" as const,
        fieldKey: "lesson-free-writing-1",
        text: "Because I checked my sentence, I used because naturally.",
      },
      {
        taskType: "lesson" as const,
        fieldKey: "lesson-free-writing-2",
        text: "I chose because to explain my reason in a new paragraph.",
      },
      {
        taskType: "test" as const,
        fieldKey: "test-free-writing-1",
        text: "The answer works because the evidence supports it.",
      },
      {
        taskType: "lesson" as const,
        fieldKey: "lesson-free-writing-3",
        text: "She smiled because the plan finally made sense.",
      },
      {
        taskType: "test" as const,
        fieldKey: "test-free-writing-2",
        text: "I revised the ending because the first version was unclear.",
      },
    ];

    const firstEvidence = await createEvidenceCandidate({
      supabase,
      parentUserId,
      childId,
      courseId,
      moduleId,
      position: 0,
      ...evidenceInputs[0],
    });

    assert.equal(firstEvidence.candidate.duplicate_status, "unique_candidate");
    assert.equal(
      firstEvidence.candidate.confirmation_status,
      "pending_parent_confirmation",
    );
    assert.equal(
      firstEvidence.candidate.occurrence_count,
      2,
      "Multiple occurrences in one field should be one candidate with an occurrence count.",
    );

    let authenticUseEvents = await countTreasureEvents({
      supabase,
      treasureId,
      eventType: "authentic_correct_use_recorded",
    });
    const firstConfirmation = await confirmFreeWritingEvidenceCandidates({
      supabase,
      parentUserId,
      childId,
      candidateIds: [firstEvidence.candidate.id],
      confirmedByUserId: parentUserId,
    });
    assert.equal(firstConfirmation.confirmedCount, 1);
    assert.equal(firstConfirmation.goldenBarsAwardedCount, 0);
    assert.equal(
      await countTreasureEvents({
        supabase,
        treasureId,
        eventType: "authentic_correct_use_recorded",
      }),
      authenticUseEvents + 1,
      "First confirmation should create exactly one authentic-correct-use event.",
    );
    authenticUseEvents += 1;

    const duplicateSubmission = await createSubmissionAndSample({
      supabase,
      parentUserId,
      childId,
      courseId,
      taskId: firstEvidence.taskId,
      text: "I wrote because again in the same returned task field.",
      title: "Duplicate field rewrite",
    });
    const duplicateCandidates = await detectAndStoreFreeWritingEvidenceCandidates({
      supabase,
      parentUserId,
      childId,
      taskSubmissionId: duplicateSubmission.submissionId,
      taskId: firstEvidence.taskId,
      taskType: "lesson",
      draftPayload: buildDraftPayload(
        evidenceInputs[0].fieldKey,
        "I wrote because again in the same returned task field.",
      ),
      submissionText: "I wrote because again in the same returned task field.",
      writingSampleId: duplicateSubmission.writingSampleId,
    });
    assert.equal(duplicateCandidates.length, 1);
    assert.equal(
      duplicateCandidates[0].duplicate_status,
      "confirmed_duplicate",
      "Same Word Treasure plus same task field across resubmissions must be duplicate.",
    );
    assert.equal(duplicateCandidates[0].confirmation_status, "duplicate");

    await confirmFreeWritingEvidenceCandidates({
      supabase,
      parentUserId,
      childId,
      candidateIds: [duplicateCandidates[0].id, firstEvidence.candidate.id],
      confirmedByUserId: parentUserId,
    });
    assert.equal(
      await countTreasureEvents({
        supabase,
        treasureId,
        eventType: "authentic_correct_use_recorded",
      }),
      authenticUseEvents,
      "Duplicate or repeated confirmation must not increment canonical evidence.",
    );

    for (const [index, evidenceInput] of evidenceInputs.slice(1).entries()) {
      const evidence = await createEvidenceCandidate({
        supabase,
        parentUserId,
        childId,
        courseId,
        moduleId,
        position: index + 1,
        ...evidenceInput,
      });
      const beforeUseEvents = await countTreasureEvents({
        supabase,
        treasureId,
        eventType: "authentic_correct_use_recorded",
      });
      const beforeBarEvents = await countTreasureEvents({
        supabase,
        treasureId,
        eventType: "golden_bar_awarded",
      });
      const summary = await confirmFreeWritingEvidenceCandidates({
        supabase,
        parentUserId,
        childId,
        candidateIds: [evidence.candidate.id],
        confirmedByUserId: parentUserId,
      });
      const afterUseEvents = await countTreasureEvents({
        supabase,
        treasureId,
        eventType: "authentic_correct_use_recorded",
      });
      const afterBarEvents = await countTreasureEvents({
        supabase,
        treasureId,
        eventType: "golden_bar_awarded",
      });
      const expectedAward = index === evidenceInputs.slice(1).length - 1;

      assert.equal(summary.confirmedCount, 1);
      assert.equal(
        afterUseEvents,
        beforeUseEvents + 1,
        "Each unique parent confirmation should create exactly one authentic-correct-use event.",
      );
      assert.equal(
        afterBarEvents,
        beforeBarEvents + (expectedAward ? 1 : 0),
        "Only the fifth confirmed evidence unit should award a Gold Bar.",
      );
      assert.equal(summary.goldenBarsAwardedCount, expectedAward ? 1 : 0);
    }

    const sourceEntityId = getFreeWritingEvidenceSourceEntityId({
      taskId: firstEvidence.taskId,
      sourceFieldKey: evidenceInputs[0].fieldKey,
    });
    const { data: sourceEvent, error: sourceEventError } = await supabase
      .from("child_word_treasure_events")
      .select("source_type, source_entity_id")
      .eq("treasure_id", treasureId)
      .eq("event_type", "authentic_correct_use_recorded")
      .eq("source_type", FREE_WRITING_EVIDENCE_SOURCE_TYPE)
      .eq("source_entity_id", sourceEntityId)
      .maybeSingle();
    assertNoError(sourceEventError, "Failed to verify text source entity id");
    assert.ok(sourceEvent, "Confirmed evidence did not keep its task-field source.");

    const { data: goldenTreasure, error: goldenTreasureError } = await supabase
      .from("child_word_treasures")
      .select("status, golden_bar_at, authentic_correct_uses_after_forge")
      .eq("id", treasureId)
      .single();
    assertNoError(goldenTreasureError, "Failed to reread Golden Bar treasure");
    assertRow(goldenTreasure, "Failed to reread Golden Bar treasure");
    assert.equal(goldenTreasure.status, "golden_bar");
    assert.ok(goldenTreasure.golden_bar_at, "Golden Bar timestamp was not set.");
    assert.equal(goldenTreasure.authentic_correct_uses_after_forge, 5);
    assert.equal(
      await countTreasureEvents({
        supabase,
        treasureId,
        eventType: "golden_bar_awarded",
      }),
      1,
      "Gold Bar should be awarded exactly once.",
    );

    const { data: learningItemAfter, error: learningItemAfterError } = await supabase
      .from("learning_items")
      .select("progress_state, current_competency_level")
      .eq("id", finalisedIssue.learningItemId)
      .single();
    assertNoError(
      learningItemAfterError,
      "Failed to reread learning item for mastery guard",
    );
    assertRow(learningItemAfter, "Failed to reread learning item for mastery guard");
    assert.equal(
      learningItemAfter.progress_state,
      "golden_nugget",
      "Evidence confirmation must not infer learning item mastery.",
    );
    assert.notEqual(
      learningItemAfter.current_competency_level,
      5,
      "Evidence confirmation must not infer micro-skill mastery level.",
    );

    const readModel = await getChildRewardReadModel({
      supabase,
      parentUserId,
      childId,
      todayDateOnly: PRACTICE_DATE,
      lastFiveDaysSinceIso: "2000-01-01T00:00:00.000Z",
    });
    const progressRow = readModel.spellingRewardStates.find(
      (row) => row.target_word.toLowerCase() === TARGET_WORD,
    );

    assert.ok(progressRow, "My Progress read model did not include the Word Treasure.");
    assert.equal(progressRow.reward_state, "gold_bar_earned");
    assert.equal(progressRow.source, "canonical_word_treasure");
    assert.equal(readModel.rewardSnapshot.currentGoldBars, 1);
    assert.equal(readModel.rewardSnapshot.lifetimeGoldBars, 1);
    assert.equal(readModel.rewardSnapshot.nuggets, 0);
    assert.equal(readModel.rewardSnapshot.warmWorkshop, 0);

    await assertForbiddenCountsUnchanged({
      supabase,
      childId,
      before: forbiddenCountsBefore,
    });

    console.log("Phase 3.7A Word Treasure lifecycle signoff passed.");
    console.log(
      JSON.stringify(
        {
          assignmentItemId: assignmentItem.id,
          childId,
          parentUserId,
          readModelGoldBars: readModel.rewardSnapshot.currentGoldBars,
          targetWord: TARGET_WORD,
          treasureId,
        },
        null,
        2,
      ),
    );
  } finally {
    if (parentUserId) {
      await supabase.auth.admin.deleteUser(parentUserId);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
