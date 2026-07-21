import "server-only";

import { buildSpellcheckSourceText } from "@/lib/courses/spelling-analysis-text";
import { getReturnedCorrectionEvidenceFlags } from "@/lib/lessons/returned-correction-evidence";
import type { ReturnedWritingIssueDraftPayload } from "@/lib/lessons/responses";
import { normaliseLessonDraftPayload } from "@/lib/lessons/responses";
import { maybeAwardDailyCheckInCoins } from "@/lib/rewards/course-coins";
import { detectAndStoreFreeWritingEvidenceCandidates } from "@/lib/rewards/free-writing-evidence";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { replaceAnalysisForSample } from "@/lib/writing-engine/spelling/legacy-analysis";

const MAX_ATTEMPTS = 8;
const STALE_PROCESSING_MINUTES = 10;

type ProcessingPayload = {
  draftPayload?: unknown;
  submissionText?: string;
  lessonReviewSummary?: string;
  returnedWritingIssues?: ReturnedWritingIssueDraftPayload[];
  taskType?: "lesson" | "test";
  completionDate?: string;
};

type JobRow = {
  id: string;
  submission_id: string;
  parent_user_id: string;
  child_id: string;
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  attempt_count: number;
  payload: ProcessingPayload;
};

type SubmissionRow = {
  id: string;
  course_id: string;
  task_id: string;
  child_id: string;
  parent_user_id: string;
  submission_text: string;
  submitted_at: string;
};

function sanitizedError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown processing error";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

function retryDelaySeconds(attemptCount: number) {
  return Math.min(3600, 30 * 2 ** Math.max(0, attemptCount - 1));
}

async function claimJob(submissionId: string): Promise<JobRow | null> {
  const supabase = createServiceRoleClient();
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000).toISOString();

  await supabase
    .from("task_submission_processing_jobs")
    .update({ status: "failed", next_retry_at: new Date().toISOString() })
    .eq("submission_id", submissionId)
    .eq("status", "processing")
    .lt("processing_started_at", staleBefore);

  const { data: current } = await supabase
    .from("task_submission_processing_jobs")
    .select("id, submission_id, parent_user_id, child_id, task_id, status, attempt_count, payload")
    .eq("submission_id", submissionId)
    .in("status", ["pending", "failed"])
    .lte("next_retry_at", new Date().toISOString())
    .lt("attempt_count", MAX_ATTEMPTS)
    .maybeSingle();
  if (!current) return null;

  const nextAttempt = current.attempt_count + 1;
  const { data: claimed } = await supabase
    .from("task_submission_processing_jobs")
    .update({
      status: "processing",
      attempt_count: nextAttempt,
      processing_started_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .eq("status", current.status)
    .eq("attempt_count", current.attempt_count)
    .select("id, submission_id, parent_user_id, child_id, task_id, status, attempt_count, payload")
    .maybeSingle();

  return claimed as JobRow | null;
}

async function ensureWritingSample(
  submission: SubmissionRow,
  sourceText: string,
  taskType: "lesson" | "test",
) {
  const supabase = createServiceRoleClient();
  const { data: existing } = await supabase
    .from("writing_samples")
    .select("id, child_id, sample_text")
    .eq("task_submission_id", submission.id)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("writing_samples")
    .insert({
      child_id: submission.child_id,
      parent_user_id: submission.parent_user_id,
      title: taskType === "test" ? "Test submission" : "Lesson submission",
      sample_text: sourceText,
      source: "Course task submission",
      written_at: submission.submitted_at.slice(0, 10),
      task_submission_id: submission.id,
    })
    .select("id, child_id, sample_text")
    .single();
  if (!error && data) return data;

  const { data: raced, error: racedError } = await supabase
    .from("writing_samples")
    .select("id, child_id, sample_text")
    .eq("task_submission_id", submission.id)
    .maybeSingle();
  if (racedError || !raced) throw error ?? racedError ?? new Error("Writing sample was not created");
  return raced;
}

async function processReturnedCorrections(
  submission: SubmissionRow,
  issues: ReturnedWritingIssueDraftPayload[],
) {
  if (issues.length === 0) return;
  const supabase = createServiceRoleClient();
  const issueIds = issues.map((issue) => issue.issue_id);
  const [{ data: eligible }, { data: existingAttempts }] = await Promise.all([
    supabase
      .from("writing_issues")
      .select("id")
      .eq("parent_user_id", submission.parent_user_id)
      .eq("child_id", submission.child_id)
      .in("id", issueIds)
      .eq("issue_status", "sent_back_to_child"),
    supabase
      .from("writing_issue_correction_attempts")
      .select("writing_issue_id")
      .eq("task_submission_id", submission.id)
      .in("writing_issue_id", issueIds),
  ]);
  const eligibleIds = new Set((eligible ?? []).map((row) => row.id));
  const existingIds = new Set((existingAttempts ?? []).map((row) => row.writing_issue_id));
  const rows = issues
    .filter((issue) => eligibleIds.has(issue.issue_id) && !existingIds.has(issue.issue_id))
    .map((issue) => {
      const attemptedCorrection = issue.attempted_correction ?? null;
      const evidence = getReturnedCorrectionEvidenceFlags({
        approvedReplacement: issue.approved_replacement,
        attemptedCorrection,
      });
      return {
        writing_issue_id: issue.issue_id,
        child_id: submission.child_id,
        parent_user_id: submission.parent_user_id,
        task_submission_id: submission.id,
        attempted_correction: attemptedCorrection,
        attempt_notes: null,
        corrected_independently: evidence.correctedIndependently,
        reflection: issue.reflection ?? "medium",
        metadata: {
          source_field_key: issue.source_field_key,
          allow_confidence: issue.allow_confidence,
          marked_fixed: evidence.markedFixed,
          retry_mode: issue.retry_mode ?? "try_again",
          reflection_source: issue.reflection ? "child_input" : "default",
          approved_replacement_match: evidence.markedFixed,
        },
      };
    });
  if (rows.length > 0) {
    const { error } = await supabase.from("writing_issue_correction_attempts").insert(rows);
    if (error) throw error;
  }
  const { error } = await supabase
    .from("writing_issues")
    .update({ issue_status: "child_responded", child_responded_at: new Date().toISOString() })
    .in("id", [...eligibleIds])
    .eq("parent_user_id", submission.parent_user_id);
  if (error) throw error;
}

async function runJob(job: JobRow) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("task_submissions")
    .select("id, course_id, task_id, child_id, parent_user_id, submission_text, submitted_at")
    .eq("id", job.submission_id)
    .eq("parent_user_id", job.parent_user_id)
    .single();
  if (error || !data) throw error ?? new Error("Submission was not found");
  const submission = data as SubmissionRow;
  const payload = (job.payload ?? {}) as ProcessingPayload;
  const submittedAnswerText = payload.submissionText?.trim() ?? "";
  const sourceText = buildSpellcheckSourceText({
    draftPayload: payload.draftPayload,
    submissionText: submittedAnswerText,
  });
  const taskType = payload.taskType === "test" ? "test" : "lesson";
  const completionDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.completionDate ?? "")
    ? payload.completionDate!
    : submission.submitted_at.slice(0, 10);

  let writingSampleId: string | null = null;
  if (sourceText) {
    const sample = await ensureWritingSample(submission, sourceText, taskType);
    writingSampleId = sample.id;
    const analysis = await replaceAnalysisForSample(supabase, sample, submission.parent_user_id);
    if (analysis.error) throw analysis.error;
  }

  await detectAndStoreFreeWritingEvidenceCandidates({
    supabase,
    parentUserId: submission.parent_user_id,
    childId: submission.child_id,
    taskSubmissionId: submission.id,
    taskId: submission.task_id,
    taskType,
    draftPayload: payload.draftPayload,
    submissionText: submittedAnswerText,
    writingSampleId,
  });

  const returnedIssues = Array.isArray(payload.returnedWritingIssues)
    ? payload.returnedWritingIssues
    : [];
  await processReturnedCorrections(submission, returnedIssues);

  const { error: draftError } = await supabase.from("task_submission_drafts").upsert(
    {
      task_id: submission.task_id,
      course_id: submission.course_id,
      child_id: submission.child_id,
      parent_user_id: submission.parent_user_id,
      draft_text: submittedAnswerText,
      draft_review_summary: payload.lessonReviewSummary?.trim() || null,
      draft_payload: {
        ...normaliseLessonDraftPayload(payload.draftPayload),
        __writing_issue_feedback: returnedIssues,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "task_id,child_id" },
  );
  if (draftError) throw draftError;

  const dayStart = `${completionDate}T00:00:00.000Z`;
  const [{ count: earlierSubmissions }, { count: earlierCompletions }] = await Promise.all([
    supabase
      .from("task_submissions")
      .select("*", { count: "exact", head: true })
      .eq("child_id", submission.child_id)
      .eq("parent_user_id", submission.parent_user_id)
      .gte("submitted_at", dayStart)
      .lt("submitted_at", submission.submitted_at),
    supabase
      .from("task_completions")
      .select("*", { count: "exact", head: true })
      .eq("child_id", submission.child_id)
      .eq("parent_user_id", submission.parent_user_id)
      .eq("completion_date", completionDate)
      .lt("completed_at", submission.submitted_at),
  ]);
  await maybeAwardDailyCheckInCoins({
    supabase,
    parentUserId: submission.parent_user_id,
    childId: submission.child_id,
    hadCourseLogTodayBeforeSave:
      (earlierSubmissions ?? 0) > 0 || (earlierCompletions ?? 0) > 0,
    assignmentDate: completionDate,
  });
}

export async function processTaskSubmission(submissionId: string) {
  const job = await claimJob(submissionId);
  if (!job) return { status: "not_claimed" as const };
  const supabase = createServiceRoleClient();
  try {
    await runJob(job);
    await supabase
      .from("task_submission_processing_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        processing_started_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return { status: "completed" as const };
  } catch (error) {
    const delay = retryDelaySeconds(job.attempt_count);
    await supabase
      .from("task_submission_processing_jobs")
      .update({
        status: "failed",
        next_retry_at: new Date(Date.now() + delay * 1000).toISOString(),
        processing_started_at: null,
        last_error: sanitizedError(error),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    console.error("[task-submission-processing] job failed", {
      submissionId,
      attempt: job.attempt_count,
      error: sanitizedError(error),
    });
    return { status: "failed" as const };
  }
}

export async function recoverTaskSubmissionJobs(limit = 20) {
  const supabase = createServiceRoleClient();
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000).toISOString();
  await supabase
    .from("task_submission_processing_jobs")
    .update({ status: "failed", next_retry_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("processing_started_at", staleBefore);
  const { data, error } = await supabase
    .from("task_submission_processing_jobs")
    .select("submission_id")
    .in("status", ["pending", "failed"])
    .lte("next_retry_at", new Date().toISOString())
    .lt("attempt_count", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw error;
  const results = await Promise.all((data ?? []).map((row) => processTaskSubmission(row.submission_id)));
  return {
    selected: data?.length ?? 0,
    completed: results.filter((result) => result.status === "completed").length,
    failed: results.filter((result) => result.status === "failed").length,
  };
}
