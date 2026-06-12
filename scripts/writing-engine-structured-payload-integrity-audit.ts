import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

type Severity = "critical" | "warning" | "info";

type Finding = {
  severity: Severity;
  category: string;
  message: string;
  ids: {
    submissionId?: string;
    taskId?: string;
    courseId?: string;
    childId?: string;
    parentUserId?: string;
    draftId?: string;
    payloadId?: string;
    writingIssueIds?: string[];
    writingSampleIds?: string[];
  };
  recoveryCategory: string;
};

type CourseTaskRow = {
  id: string;
  course_id: string;
  parent_user_id: string;
  title: string | null;
  task_type: string;
  lesson_schema: unknown;
  created_at?: string | null;
};

type TaskSubmissionRow = {
  id: string;
  task_id: string;
  course_id: string;
  child_id: string;
  parent_user_id: string;
  submission_text: string | null;
  submitted_at: string;
  created_at: string | null;
  updated_at: string | null;
  parent_review_status: string;
  parent_reviewed_at: string | null;
};

type TaskSubmissionDraftRow = {
  id: string;
  task_id: string;
  course_id: string;
  child_id: string;
  parent_user_id: string;
  draft_text: string | null;
  draft_review_summary: string | null;
  draft_payload: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type TaskSubmissionPayloadRow = {
  id: string;
  submission_id: string;
  parent_user_id: string;
  course_id: string;
  task_id: string;
  child_id: string;
  payload_type: string;
  payload_version: number | null;
  payload_json: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type WritingIssueRow = {
  id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  child_id: string;
  parent_user_id: string;
  issue_status: string;
  final_classification: string | null;
  source_field_key: string | null;
  metadata: unknown;
  sent_back_at: string | null;
  child_responded_at: string | null;
  final_classified_at: string | null;
  created_at: string | null;
};

type WritingIssueCorrectionAttemptRow = {
  id: string;
  writing_issue_id: string;
  task_submission_id: string | null;
  child_id: string;
  parent_user_id: string;
  created_at: string | null;
};

type WritingSampleRow = {
  id: string;
  task_submission_id: string | null;
  child_id: string;
  parent_user_id: string;
  title: string | null;
  source: string | null;
  sample_text: string | null;
  created_at: string | null;
};

type TaskCompletionRow = {
  id: string;
  task_id: string;
  child_id: string;
  parent_user_id: string;
  completed_at: string | null;
  created_at: string | null;
};

type AuditData = {
  tasks: CourseTaskRow[];
  submissions: TaskSubmissionRow[];
  drafts: TaskSubmissionDraftRow[];
  payloads: TaskSubmissionPayloadRow[];
  writingIssues: WritingIssueRow[];
  correctionAttempts: WritingIssueCorrectionAttemptRow[];
  writingSamples: WritingSampleRow[];
  completions: TaskCompletionRow[];
};

type SupabaseLike = {
  from(table: string): any;
};

const READ_PAGE_SIZE = 1000;
const QUERY_TIMEOUT_MS = 10_000;
const MUTATION_METHODS = new Set([
  "insert",
  "update",
  "upsert",
  "delete",
]);

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLocalSupabaseUrl(url: string) {
  const parsed = new URL(url);
  return (
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
    parsed.port === "54321"
  );
}

function getAuditConfig() {
  const url =
    readEnv("STRUCTURED_PAYLOAD_AUDIT_SUPABASE_URL") ??
    readEnv("NEXT_PUBLIC_SUPABASE_URL") ??
    "http://127.0.0.1:54321";
  const key =
    readEnv("STRUCTURED_PAYLOAD_AUDIT_SUPABASE_KEY") ??
    readEnv("SUPABASE_SERVICE_ROLE_KEY") ??
    readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!key) {
    throw new Error(
      "Missing Supabase key. Set STRUCTURED_PAYLOAD_AUDIT_SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const local = isLocalSupabaseUrl(url);
  const hostedReadOnlyApproved =
    readEnv("STRUCTURED_PAYLOAD_AUDIT_ALLOW_HOSTED_READ_ONLY") === "true";

  if (!local && !hostedReadOnlyApproved) {
    throw new Error(
      `Refusing hosted/non-local audit target without STRUCTURED_PAYLOAD_AUDIT_ALLOW_HOSTED_READ_ONLY=true: ${url}`,
    );
  }

  return {
    url,
    key,
    target: local ? "local_dev" : "hosted_read_only_explicit",
  } as const;
}

function createReadOnlySupabase(url: string, key: string) {
  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "rpc") {
        return () => {
          throw new Error("Read-only audit refuses rpc calls.");
        };
      }

      if (property === "from") {
        return (table: string) => {
          const builder = target.from(table);

          return new Proxy(builder, {
            get(builderTarget, builderProperty, builderReceiver) {
              if (
                typeof builderProperty === "string" &&
                MUTATION_METHODS.has(builderProperty)
              ) {
                return () => {
                  throw new Error(
                    `Read-only audit refuses ${builderProperty} on ${table}.`,
                  );
                };
              }

              return Reflect.get(builderTarget, builderProperty, builderReceiver);
            },
          });
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

async function fetchAll<T>({
  supabase,
  table,
  select,
  orderColumn = "created_at",
}: {
  supabase: SupabaseLike;
  table: string;
  select: string;
  orderColumn?: string;
}): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += READ_PAGE_SIZE) {
    const to = from + READ_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: true })
      .range(from, to)
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

    if (error) {
      throw new Error(`Unable to read ${table}: ${error.message}`);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < READ_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function countRows(supabase: SupabaseLike, table: string) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

  if (error) {
    throw new Error(`Unable to count ${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function loadAuditData(supabase: SupabaseLike): Promise<AuditData> {
  const [
    tasks,
    submissions,
    drafts,
    payloads,
    writingIssues,
    correctionAttempts,
    writingSamples,
    completions,
  ] = await Promise.all([
    fetchAll<CourseTaskRow>({
      supabase,
      table: "course_tasks",
      select:
        "id, course_id, parent_user_id, title, task_type, lesson_schema, created_at",
    }),
    fetchAll<TaskSubmissionRow>({
      supabase,
      table: "task_submissions",
      select:
        "id, task_id, course_id, child_id, parent_user_id, submission_text, submitted_at, created_at, updated_at, parent_review_status, parent_reviewed_at",
      orderColumn: "submitted_at",
    }),
    fetchAll<TaskSubmissionDraftRow>({
      supabase,
      table: "task_submission_drafts",
      select:
        "id, task_id, course_id, child_id, parent_user_id, draft_text, draft_review_summary, draft_payload, created_at, updated_at",
    }),
    fetchAll<TaskSubmissionPayloadRow>({
      supabase,
      table: "task_submission_payloads",
      select:
        "id, submission_id, parent_user_id, course_id, task_id, child_id, payload_type, payload_version, payload_json, created_at, updated_at",
    }),
    fetchAll<WritingIssueRow>({
      supabase,
      table: "writing_issues",
      select:
        "id, task_submission_id, writing_sample_id, child_id, parent_user_id, issue_status, final_classification, source_field_key, metadata, sent_back_at, child_responded_at, final_classified_at, created_at",
    }),
    fetchAll<WritingIssueCorrectionAttemptRow>({
      supabase,
      table: "writing_issue_correction_attempts",
      select:
        "id, writing_issue_id, task_submission_id, child_id, parent_user_id, created_at",
    }),
    fetchAll<WritingSampleRow>({
      supabase,
      table: "writing_samples",
      select:
        "id, task_submission_id, child_id, parent_user_id, title, source, sample_text, created_at",
    }),
    fetchAll<TaskCompletionRow>({
      supabase,
      table: "task_completions",
      select:
        "id, task_id, child_id, parent_user_id, completed_at, created_at",
    }),
  ]);

  return {
    tasks,
    submissions,
    drafts,
    payloads,
    writingIssues,
    correctionAttempts,
    writingSamples,
    completions,
  };
}

function getPayloadType(taskType: string) {
  if (taskType === "lesson") {
    return "structured_lesson_response";
  }

  if (taskType === "test") {
    return "structured_test_response";
  }

  return null;
}

function isStructuredLessonDocument(value: unknown) {
  return isPlainObject(value) && Array.isArray(value.blocks);
}

function isStructuredTask(task: CourseTaskRow | undefined) {
  return (
    Boolean(task) &&
    (task?.task_type === "lesson" || task?.task_type === "test") &&
    isStructuredLessonDocument(task?.lesson_schema)
  );
}

function getStructuredResponse(value: unknown) {
  const candidate = isPlainObject(value) && isPlainObject(value.__structured_lesson_response)
    ? value.__structured_lesson_response
    : value;

  if (
    !isPlainObject(candidate) ||
    typeof candidate.task_id !== "string" ||
    typeof candidate.child_id !== "string" ||
    !Array.isArray(candidate.answers)
  ) {
    return null;
  }

  return candidate as {
    task_id: string;
    child_id: string;
    answers: Array<{ block_id?: unknown; value?: unknown }>;
  };
}

function valueIsMeaningful(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.some((item) =>
      typeof item === "string"
        ? item.trim().length > 0
        : isPlainObject(item) && Object.values(item).some(valueIsMeaningful),
    );
  }

  if (isPlainObject(value)) {
    return Object.values(value).some(valueIsMeaningful);
  }

  return false;
}

function hasMeaningfulStructuredResponse(value: unknown) {
  const response = getStructuredResponse(value);
  return Boolean(response?.answers.some((answer) => valueIsMeaningful(answer.value)));
}

function getReturnedFeedbackCount(payloadValue: unknown) {
  if (!isPlainObject(payloadValue) || !Array.isArray(payloadValue.__writing_issue_feedback)) {
    return 0;
  }

  return payloadValue.__writing_issue_feedback.filter(
    (issue) => isPlainObject(issue) && typeof issue.issue_id === "string",
  ).length;
}

function buildStructuredResponseFromSubmissionSummary({
  task,
  submission,
}: {
  task: CourseTaskRow;
  submission: TaskSubmissionRow;
}) {
  const submissionText = submission.submission_text?.trim() ?? "";

  if (!submissionText || !isPlainObject(task.lesson_schema)) {
    return null;
  }

  const blocks = Array.isArray(task.lesson_schema.blocks)
    ? task.lesson_schema.blocks
    : [];
  const textBlocks = blocks.filter(
    (block) =>
      isPlainObject(block) &&
      (block.block_type === "question_text" ||
        block.block_type === "question_textarea"),
  );

  if (textBlocks.length === 0) {
    return null;
  }

  const paragraphs = submissionText
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const answers = textBlocks.flatMap((block) => {
    const blockId = typeof block.block_id === "string" ? block.block_id : null;
    if (!blockId) {
      return [];
    }

    const label = typeof block.label === "string" ? block.label : blockId;
    const prefix = `${label}:`;
    const paragraph = paragraphs.find((candidate) => candidate.startsWith(prefix));
    const value = paragraph?.slice(prefix.length).trim() ?? "";

    return value ? [{ block_id: blockId, value }] : [];
  });

  if (answers.length > 0) {
    return {
      task_id: submission.task_id,
      child_id: submission.child_id,
      answers,
    };
  }

  const firstTextBlock = textBlocks.find(
    (block) => typeof block.block_id === "string",
  );

  return firstTextBlock
    ? {
        task_id: submission.task_id,
        child_id: submission.child_id,
        answers: [
          {
            block_id: firstTextBlock.block_id,
            value: submissionText,
          },
        ],
      }
    : null;
}

function keyForTaskChildParent<T extends {
  task_id: string;
  child_id: string;
  parent_user_id: string;
}>(row: T) {
  return `${row.parent_user_id}:${row.child_id}:${row.task_id}`;
}

function groupBy<T>(rows: T[], getKey: (row: T) => string | null | undefined) {
  const grouped = new Map<string, T[]>();

  rows.forEach((row) => {
    const key = getKey(row);
    if (!key) {
      return;
    }

    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });

  return grouped;
}

function getFixtureMarker(value: string | null | undefined) {
  const haystack = value ?? "";
  const match = haystack.match(
    /(STAGING_SMOKE|SMOKE|FIXTURE|TEST_WEEK|TEST|DEV_|LOCAL_SMOKE)/i,
  );

  return match?.[1] ?? null;
}

function summarizeCounts(findings: Finding[]) {
  return findings.reduce(
    (summary, finding) => {
      summary[finding.severity] += 1;
      return summary;
    },
    { critical: 0, warning: 0, info: 0 } satisfies Record<Severity, number>,
  );
}

function addFinding(findings: Finding[], finding: Finding) {
  findings.push(finding);
}

function auditData(data: AuditData) {
  const findings: Finding[] = [];
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
  const draftsByTaskChildParent = new Map(
    data.drafts.map((draft) => [keyForTaskChildParent(draft), draft]),
  );
  const payloadsBySubmission = groupBy(data.payloads, (payload) => payload.submission_id);
  const issuesBySubmission = groupBy(
    data.writingIssues,
    (issue) => issue.task_submission_id,
  );
  const samplesBySubmission = groupBy(
    data.writingSamples,
    (sample) => sample.task_submission_id,
  );
  const attemptsBySubmission = groupBy(
    data.correctionAttempts,
    (attempt) => attempt.task_submission_id,
  );
  const completionsByTaskChildParent = groupBy(data.completions, keyForTaskChildParent);

  const structuredSubmissions = data.submissions.filter((submission) =>
    isStructuredTask(tasksById.get(submission.task_id)),
  );
  const submissionsByTaskChildParent = groupBy(
    structuredSubmissions,
    keyForTaskChildParent,
  );

  const latestSubmissionIds = new Set<string>();
  submissionsByTaskChildParent.forEach((submissions) => {
    const [latest] = [...submissions].sort((left, right) =>
      right.submitted_at.localeCompare(left.submitted_at),
    );
    if (latest) {
      latestSubmissionIds.add(latest.id);
    }
  });

  structuredSubmissions.forEach((submission) => {
    const task = tasksById.get(submission.task_id);
    if (!task) {
      return;
    }

    const payloadType = getPayloadType(task.task_type);
    const matchingPayloads = (payloadsBySubmission.get(submission.id) ?? []).filter(
      (payload) => payload.payload_type === payloadType,
    );
    const healthyPayloads = matchingPayloads.filter((payload) =>
      hasMeaningfulStructuredResponse(payload.payload_json),
    );
    const draft = draftsByTaskChildParent.get(keyForTaskChildParent(submission)) ?? null;
    const draftHasAnswers = hasMeaningfulStructuredResponse(draft?.draft_payload);
    const returnedFeedbackCount = getReturnedFeedbackCount(draft?.draft_payload);
    const summaryResponse = buildStructuredResponseFromSubmissionSummary({
      task,
      submission,
    });
    const summaryRecoverable = hasMeaningfulStructuredResponse(summaryResponse);
    const linkedIssues = issuesBySubmission.get(submission.id) ?? [];
    const linkedSamples = samplesBySubmission.get(submission.id) ?? [];
    const linkedAttempts = attemptsBySubmission.get(submission.id) ?? [];
    const isApprovedOrCompleted =
      submission.parent_review_status === "approved" ||
      (completionsByTaskChildParent.get(keyForTaskChildParent(submission)) ?? [])
        .length > 0;
    const isLatest = latestSubmissionIds.has(submission.id);
    const ids = {
      submissionId: submission.id,
      taskId: submission.task_id,
      courseId: submission.course_id,
      childId: submission.child_id,
      parentUserId: submission.parent_user_id,
      draftId: draft?.id,
      payloadId: healthyPayloads[0]?.id ?? matchingPayloads[0]?.id,
      writingIssueIds: linkedIssues.map((issue) => issue.id),
      writingSampleIds: linkedSamples.map((sample) => sample.id),
    };

    if (matchingPayloads.length > 1) {
      addFinding(findings, {
        severity: "warning",
        category: "duplicate_durable_payload_rows",
        message:
          "Structured submission has multiple durable payload rows for the expected payload type; operator should inspect historical row uniqueness.",
        ids,
        recoveryCategory: "operator_review_duplicate_payloads",
      });
    }

    if (healthyPayloads.length > 0) {
      addFinding(findings, {
        severity: "info",
        category: "durable_payload_present",
        message: "Structured submission has meaningful durable payload evidence.",
        ids,
        recoveryCategory: "no_recovery_needed",
      });
    }

    if (matchingPayloads.length > 0 && healthyPayloads.length === 0) {
      addFinding(findings, {
        severity: "warning",
        category: "durable_payload_empty_or_unparseable",
        message:
          "Structured submission has a durable payload row, but the payload did not contain meaningful structured answers.",
        ids,
        recoveryCategory: draftHasAnswers
          ? "recover_from_draft"
          : summaryRecoverable
            ? "recover_from_flattened_submission_text"
            : "manual_parent_history_review",
      });
    }

    if (matchingPayloads.length === 0) {
      if (draftHasAnswers) {
        addFinding(findings, {
          severity: "warning",
          category: "missing_durable_payload_recoverable_from_draft",
          message:
            "Structured submission lacks durable payload evidence but the current draft still contains meaningful structured answers.",
          ids,
          recoveryCategory: "recover_from_draft",
        });
      } else if (summaryRecoverable) {
        addFinding(findings, {
          severity: "warning",
          category: "missing_durable_payload_recoverable_from_flattened_text",
          message:
            "Structured submission lacks durable payload evidence and structured draft answers, but flattened submission text appears reconstructable.",
          ids,
          recoveryCategory: "recover_from_flattened_submission_text",
        });
      } else {
        addFinding(findings, {
          severity: "critical",
          category: "missing_durable_payload_no_recovery_path",
          message:
            "Structured submission lacks durable payload evidence, meaningful draft answers, and flattened-text reconstruction evidence.",
          ids,
          recoveryCategory: "manual_parent_history_review",
        });
      }
    }

    if (
      isApprovedOrCompleted &&
      matchingPayloads.length === 0 &&
      !draftHasAnswers
    ) {
      addFinding(findings, {
        severity: summaryRecoverable ? "warning" : "critical",
        category: summaryRecoverable
          ? "approved_or_completed_flattened_only"
          : "approved_or_completed_possible_deleted_only_source",
        message: summaryRecoverable
          ? "Approved/completed structured submission has no durable payload or draft answers and depends on flattened text recovery."
          : "Approved/completed structured submission may have lost its only structured answer source before durable payload safety.",
        ids,
        recoveryCategory: summaryRecoverable
          ? "recover_from_flattened_submission_text"
          : "manual_parent_history_review",
      });
    }

    if (submission.parent_review_status === "returned") {
      if (!draft) {
        addFinding(findings, {
          severity: healthyPayloads.length > 0 || summaryRecoverable ? "warning" : "critical",
          category: "returned_submission_missing_draft",
          message:
            "Returned structured submission has no current draft row; child revisit may depend entirely on fallback recovery.",
          ids,
          recoveryCategory: healthyPayloads.length > 0
            ? "recover_from_durable_payload"
            : summaryRecoverable
              ? "recover_from_flattened_submission_text"
              : "manual_parent_history_review",
        });
      } else if (!draftHasAnswers) {
        addFinding(findings, {
          severity: healthyPayloads.length > 0 || summaryRecoverable ? "warning" : "critical",
          category: "returned_draft_missing_structured_answers",
          message:
            "Returned structured submission draft lacks meaningful structured answers; child revisit may show blank boxes if fallback recovery also fails.",
          ids,
          recoveryCategory: healthyPayloads.length > 0
            ? "recover_from_durable_payload"
            : summaryRecoverable
              ? "recover_from_flattened_submission_text"
              : "manual_parent_history_review",
        });
      } else {
        addFinding(findings, {
          severity: "info",
          category: "returned_draft_first_recoverable",
          message:
            "Returned structured submission is draft-first and contains meaningful structured answers.",
          ids,
          recoveryCategory: "no_recovery_needed",
        });
      }

      if (returnedFeedbackCount > 0 && !draftHasAnswers) {
        addFinding(findings, {
          severity: healthyPayloads.length > 0 || summaryRecoverable ? "warning" : "critical",
          category: "returned_feedback_without_structured_answers",
          message:
            "Returned draft contains writing-issue feedback but lacks meaningful structured answers.",
          ids,
          recoveryCategory: healthyPayloads.length > 0
            ? "recover_from_durable_payload_then_preserve_feedback"
            : summaryRecoverable
              ? "recover_from_flattened_submission_text_then_preserve_feedback"
              : "manual_parent_history_review",
        });
      }

      if (draftHasAnswers && returnedFeedbackCount === 0 && linkedIssues.length > 0) {
        addFinding(findings, {
          severity: "warning",
          category: "returned_answers_without_feedback_payload",
          message:
            "Returned structured submission has draft answers and linked writing issues, but no returned feedback payload for the child surface.",
          ids,
          recoveryCategory: "operator_review_returned_feedback_payload",
        });
      }
    }

    if (
      isLatest &&
      submission.parent_review_status !== "returned" &&
      matchingPayloads.length === 0 &&
      !draftHasAnswers &&
      !summaryRecoverable
    ) {
      addFinding(findings, {
        severity: "critical",
        category: "latest_child_revisit_blank_answer_risk",
        message:
          "Latest non-returned structured submission has no durable payload and no fallback answer source; child revisit would likely show blank answer boxes.",
        ids,
        recoveryCategory: "manual_parent_history_review",
      });
    }

    if (linkedAttempts.length > 0 && matchingPayloads.length === 0) {
      addFinding(findings, {
        severity: "warning",
        category: "returned_correction_history_without_durable_payload",
        message:
          "Submission has returned-correction attempt history but no durable structured payload evidence.",
        ids,
        recoveryCategory: draftHasAnswers
          ? "recover_from_draft_with_attempt_history"
          : summaryRecoverable
            ? "recover_from_flattened_text_with_attempt_history"
            : "manual_parent_history_review",
      });
    }
  });

  submissionsByTaskChildParent.forEach((submissions) => {
    const pending = submissions.filter(
      (submission) => submission.parent_review_status === "pending",
    );
    const returned = submissions.filter(
      (submission) => submission.parent_review_status === "returned",
    );

    if (submissions.length > 1 && (pending.length > 0 || returned.length > 1)) {
      const latest = [...submissions].sort((left, right) =>
        right.submitted_at.localeCompare(left.submitted_at),
      )[0];

      addFinding(findings, {
        severity: "warning",
        category: "duplicate_or_pending_historical_submissions",
        message:
          "Multiple structured submissions exist for the same parent/child/task with pending or repeated returned history; operator should verify intended active row.",
        ids: {
          submissionId: latest?.id,
          taskId: latest?.task_id,
          courseId: latest?.course_id,
          childId: latest?.child_id,
          parentUserId: latest?.parent_user_id,
        },
        recoveryCategory: "operator_review_duplicate_submission_history",
      });
    }
  });

  data.tasks.forEach((task) => {
    const marker = getFixtureMarker(task.title);
    if (!marker) {
      return;
    }

    addFinding(findings, {
      severity: "info",
      category: "possible_fixture_task_row",
      message: `Possible smoke/test fixture marker found in course task title: ${marker}.`,
      ids: {
        taskId: task.id,
        courseId: task.course_id,
        parentUserId: task.parent_user_id,
      },
      recoveryCategory: "operator_review_fixture_row",
    });
  });

  data.writingSamples.forEach((sample) => {
    const marker =
      getFixtureMarker(sample.title) ??
      getFixtureMarker(sample.source) ??
      getFixtureMarker(sample.sample_text);
    if (!marker) {
      return;
    }

    addFinding(findings, {
      severity: "info",
      category: "possible_fixture_writing_sample_row",
      message: `Possible smoke/test fixture marker found in writing sample metadata/text: ${marker}.`,
      ids: {
        childId: sample.child_id,
        parentUserId: sample.parent_user_id,
        writingSampleIds: [sample.id],
        submissionId: sample.task_submission_id ?? undefined,
      },
      recoveryCategory: "operator_review_fixture_row",
    });
  });

  return {
    findings,
    structuredSubmissionCount: structuredSubmissions.length,
    structuredTaskCount: data.tasks.filter(isStructuredTask).length,
    counts: summarizeCounts(findings),
  };
}

function printAuditSummary(input: {
  target: string;
  url: string;
  guardCountsUnchanged: boolean;
  reportPath: string | null;
  result: ReturnType<typeof auditData>;
}) {
  const { result } = input;
  const byCategory = result.findings.reduce<Record<string, number>>((summary, finding) => {
    summary[finding.category] = (summary[finding.category] ?? 0) + 1;
    return summary;
  }, {});

  console.log("Writing Engine structured payload integrity audit");
  console.log(`Target: ${input.target}`);
  console.log(`Supabase URL: ${input.url}`);
  console.log("Mode: read-only select audit; mutation helpers are blocked by script guard.");
  console.log(`Structured tasks scanned: ${result.structuredTaskCount}`);
  console.log(`Structured submissions scanned: ${result.structuredSubmissionCount}`);
  console.log(`Findings: critical=${result.counts.critical}, warning=${result.counts.warning}, info=${result.counts.info}`);
  console.log(`Row-count guard unchanged: ${input.guardCountsUnchanged ? "yes" : "no"}`);

  console.log("\nFindings by category:");
  Object.entries(byCategory)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([category, count]) => {
      console.log(`- ${category}: ${count}`);
    });

  const actionableFindings = result.findings
    .filter((finding) => finding.severity !== "info")
    .slice(0, 20);

  if (actionableFindings.length > 0) {
    console.log("\nActionable examples:");
    actionableFindings.forEach((finding) => {
      console.log(
        `- [${finding.severity}] ${finding.category} submission=${finding.ids.submissionId ?? "n/a"} task=${finding.ids.taskId ?? "n/a"} child=${finding.ids.childId ?? "n/a"} recovery=${finding.recoveryCategory}`,
      );
    });
  }

  console.log("\nOperator recovery categories:");
  console.log("- recover_from_durable_payload: use existing immutable payload evidence as source of truth.");
  console.log("- recover_from_draft: preserve current draft structured answers before any approval cleanup.");
  console.log("- recover_from_flattened_submission_text: reconstruct only text/textarea answers; manually verify labels.");
  console.log("- recover_from_*_then_preserve_feedback: recover answers and keep returned child feedback payload attached.");
  console.log("- operator_review_duplicate_submission_history: decide which historical row is active/canonical.");
  console.log("- operator_review_fixture_row: verify and remove only through a separately approved cleanup/backfill slice.");
  console.log("- manual_parent_history_review: ask the operator/parent to recover from external history; do not infer.");

  if (input.reportPath) {
    console.log(`\nJSON report written: ${input.reportPath}`);
  } else {
    console.log("\nJSON report not written. Re-run with --write-report to write under tmp/.");
  }
}

async function main() {
  const writeReport = process.argv.includes("--write-report");
  const config = getAuditConfig();
  const supabase = createReadOnlySupabase(config.url, config.key) as unknown as SupabaseLike;
  const guardedTables = [
    "task_submissions",
    "task_submission_drafts",
    "task_submission_payloads",
    "writing_samples",
    "writing_issues",
    "writing_issue_correction_attempts",
  ];
  const beforeCounts = Object.fromEntries(
    await Promise.all(
      guardedTables.map(async (table) => [table, await countRows(supabase, table)] as const),
    ),
  );
  const data = await loadAuditData(supabase);
  const result = auditData(data);
  const afterCounts = Object.fromEntries(
    await Promise.all(
      guardedTables.map(async (table) => [table, await countRows(supabase, table)] as const),
    ),
  );
  const guardCountsUnchanged =
    JSON.stringify(beforeCounts) === JSON.stringify(afterCounts);
  let reportPath: string | null = null;

  if (writeReport) {
    mkdirSync("tmp", { recursive: true });
    reportPath = join(
      "tmp",
      `writing-engine-structured-payload-integrity-audit-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`,
    );
    writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          target: config.target,
          supabaseUrl: config.url,
          readOnlyGuardCounts: {
            before: beforeCounts,
            after: afterCounts,
            unchanged: guardCountsUnchanged,
          },
          structuredTaskCount: result.structuredTaskCount,
          structuredSubmissionCount: result.structuredSubmissionCount,
          counts: result.counts,
          findings: result.findings,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  printAuditSummary({
    target: config.target,
    url: config.url,
    guardCountsUnchanged,
    reportPath,
    result,
  });

  if (!guardCountsUnchanged) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
