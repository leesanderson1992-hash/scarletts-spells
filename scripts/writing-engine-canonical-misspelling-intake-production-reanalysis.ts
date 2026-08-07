/** Controlled production reanalysis for the two explicitly authorised submissions. */
import { createClient } from "@supabase/supabase-js";

import { replaceAnalysisForSample } from "../lib/writing-engine/spelling/legacy-analysis";

const PRODUCTION_HOST = "wwohrqtunajrbwxyssjf.supabase.co";
const CONFIRM = "CANONICAL-MISSPELLING-INTAKE-PRODUCTION-REANALYSIS-V1";
const SUBMISSION_IDS = [
  "d7d2fa00-f01c-497a-9920-462b28e752ad",
  "e5d6ae87-e125-483f-bc56-0da9d6071708",
] as const;
const EXPECTED_SAMPLE_TEXT = "I want to wosh at the jym wen";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function canonicalSummary(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: row.id,
    misspelledWord: row.misspelled_word,
    correctedWord: row.corrected_word,
    positionStart: row.position_start,
    positionEnd: row.position_end,
    notes: row.notes,
  }));
}

function assertExpectedRows(rows: Array<Record<string, unknown>>) {
  const expected = [
    ["wosh", "wash", 10, 14],
    ["jym", "gym", 22, 25],
    ["wen", "when", 26, 29],
  ];
  if (rows.length !== 3) throw new Error(`Expected three rows, received ${rows.length}`);
  rows.forEach((row, index) => {
    const [misspelling, correction, start, end] = expected[index];
    const notes = JSON.parse(String(row.notes ?? "{}")) as {
      detectionSource?: string;
      canonicalDetection?: { canonicalMappingIds?: string[]; canonicalCorrection?: string };
    };
    if (
      row.misspelled_word !== misspelling ||
      row.corrected_word !== correction ||
      row.position_start !== start ||
      row.position_end !== end ||
      notes.detectionSource !== "resolver_visible_canonical" ||
      notes.canonicalDetection?.canonicalCorrection !== correction ||
      !notes.canonicalDetection.canonicalMappingIds?.length
    ) throw new Error(`Unexpected canonical row for ${misspelling}`);
  });
}

async function main() {
  if (!process.argv.includes("--apply") || !process.argv.includes(CONFIRM)) {
    throw new Error(`Mutation requires --apply ${CONFIRM}`);
  }
  if (process.env.WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS !== "enabled") {
    throw new Error("Canonical resolver-visible runtime gate must be exactly enabled");
  }
  const url = required("TARGET_SUPABASE_URL");
  if (new URL(url).hostname !== PRODUCTION_HOST) throw new Error("Refusing non-production host");
  const db = createClient(url, required("TARGET_SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: submissions, error: submissionError } = await db
    .from("task_submissions")
    .select("id,parent_review_status,parent_review_note,parent_reviewed_at,submission_text,child_id,parent_user_id")
    .in("id", [...SUBMISSION_IDS])
    .order("id", { ascending: true });
  if (submissionError || submissions?.length !== SUBMISSION_IDS.length) {
    throw submissionError ?? new Error("Exact authorised submissions were not found");
  }
  for (const submission of submissions) {
    if (
      submission.parent_review_status !== "pending" ||
      submission.parent_review_note !== null ||
      submission.parent_reviewed_at !== null ||
      submission.submission_text !== `Main written answer: ${EXPECTED_SAMPLE_TEXT}`
    ) throw new Error(`Submission preflight changed for ${submission.id}`);
  }

  const { data: samples, error: sampleError } = await db
    .from("writing_samples")
    .select("id,task_submission_id,sample_text,child_id,parent_user_id,review_completed_at,review_completed_by")
    .in("task_submission_id", [...SUBMISSION_IDS])
    .order("task_submission_id", { ascending: true });
  if (sampleError || samples?.length !== SUBMISSION_IDS.length) {
    throw sampleError ?? new Error("Exact authorised writing samples were not found");
  }
  for (const sample of samples) {
    if (
      sample.sample_text !== EXPECTED_SAMPLE_TEXT ||
      sample.review_completed_at !== null ||
      sample.review_completed_by !== null
    ) throw new Error(`Writing sample preflight changed for ${sample.id}`);

    const [{ count: existingRows }, { count: writingIssues }] = await Promise.all([
      db.from("misspelling_instances").select("id", { count: "exact", head: true }).eq("writing_sample_id", sample.id),
      db.from("writing_issues").select("id", { count: "exact", head: true }).eq("task_submission_id", sample.task_submission_id),
    ]);
    if ((existingRows ?? 0) !== 0 || (writingIssues ?? 0) !== 0) {
      throw new Error(`Parent-decision inventory changed for ${sample.task_submission_id}`);
    }
  }

  const results: Array<Record<string, unknown>> = [];
  for (const sample of samples) {
    const analysisSample = { id: sample.id, child_id: sample.child_id, sample_text: sample.sample_text };
    const first = await replaceAnalysisForSample(db as never, analysisSample, sample.parent_user_id);
    if (first.error) throw first.error;
    const { data: firstRows, error: firstRowsError } = await db
      .from("misspelling_instances")
      .select("id,misspelled_word,corrected_word,position_start,position_end,notes")
      .eq("writing_sample_id", sample.id)
      .order("position_start", { ascending: true });
    if (firstRowsError) throw firstRowsError;
    assertExpectedRows((firstRows ?? []) as Array<Record<string, unknown>>);

    const second = await replaceAnalysisForSample(db as never, analysisSample, sample.parent_user_id);
    if (second.error) throw second.error;
    const { data: retryRows, error: retryRowsError } = await db
      .from("misspelling_instances")
      .select("id,misspelled_word,corrected_word,position_start,position_end,notes")
      .eq("writing_sample_id", sample.id)
      .order("position_start", { ascending: true });
    if (retryRowsError) throw retryRowsError;
    assertExpectedRows((retryRows ?? []) as Array<Record<string, unknown>>);
    if (JSON.stringify(canonicalSummary(firstRows ?? [])) !== JSON.stringify(canonicalSummary(retryRows ?? []))) {
      throw new Error(`Retry changed derived analysis for ${sample.task_submission_id}`);
    }
    results.push({ submissionId: sample.task_submission_id, writingSampleId: sample.id, rows: retryRows });
  }

  const { data: after, error: afterError } = await db
    .from("task_submissions")
    .select("id,parent_review_status,parent_review_note,parent_reviewed_at,submission_text")
    .in("id", [...SUBMISSION_IDS])
    .order("id", { ascending: true });
  const expectedSubmissionState = submissions.map((submission) => ({
    id: submission.id,
    parent_review_status: submission.parent_review_status,
    parent_review_note: submission.parent_review_note,
    parent_reviewed_at: submission.parent_reviewed_at,
    submission_text: submission.submission_text,
  }));
  if (afterError || JSON.stringify(after) !== JSON.stringify(expectedSubmissionState)) {
    throw afterError ?? new Error("Reanalysis changed submission review state or source text");
  }

  console.log(JSON.stringify({ status: "production_reanalysis_verified", results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
