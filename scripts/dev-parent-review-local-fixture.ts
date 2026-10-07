/** Enrich the disposable parent-review proof submission on local Supabase only. */
import pg from "pg";
import { extractWholeWriting, type SourceSnapshot } from "../lib/writing-engine/whole-writing/source";

const email = process.env.REVIEW_FIXTURE_PARENT_EMAIL ?? "parent-review-local-1791389931499@example.test";
const submissionId = process.env.REVIEW_FIXTURE_SUBMISSION_ID ?? "0c162c92-9254-4944-870e-712bfc3f0376";
const dbUrl = new URL(process.env.LOCAL_SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres");
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname) || dbUrl.port !== "55322" || !email.endsWith("@example.test")) {
  throw new Error("This fixture may run only against local Supabase and a disposable example.test account.");
}

const client = new pg.Client({ connectionString: dbUrl.toString() });
const writing = "I think the libary is a wonderful place. Their are many books to explore, and I can read quietly with my friends.";
const lessonSchema = {
  version: 1, theme: "scarlett-default", title: "Local review proof",
  blocks: [
    { block_id: "written_answer", block_type: "question_textarea", label: "What do you enjoy about the library?", required: true },
    { block_id: "quiz", block_type: "comprehension_quiz_group", label: "Comprehension quiz", questions: [
      { question_id: "quiz_one", prompt: "Where can you find books?", options: [
        { option_id: "library", label: "At the library" }, { option_id: "garden", label: "In the garden" }], correct_option_id: "library" },
    ] },
  ],
};
const draftPayload = {
  written_answer: writing,
  __structured_lesson_response: { answers: [
    { block_id: "written_answer", value: writing },
    { block_id: "quiz", value: { selected_answers: { quiz_one: "garden" }, correctness_by_question: { quiz_one: false },
      score: 0, total_questions: 1, percentage: 0, understanding_band: "review_needed" } },
  ] },
};

async function main() {
  await client.connect();
  try {
    await client.query("begin");
    const { rows: users } = await client.query("select id from auth.users where email=$1", [email]);
    if (users.length !== 1) throw new Error("Disposable parent account is missing.");
    const { rows: submissions } = await client.query(
      "select id,parent_user_id,child_id,task_id,course_id,submitted_at from public.task_submissions where id=$1 and parent_user_id=$2",
      [submissionId, users[0].id]);
    if (submissions.length !== 1) throw new Error("Disposable lesson submission is missing or belongs to another parent.");
    const submission = submissions[0];
    const fixtureDraftPayload = {
      ...draftPayload,
      __structured_lesson_response: {
        ...draftPayload.__structured_lesson_response,
        task_id: submission.task_id,
        child_id: submission.child_id,
        status: "submitted",
        draft_saved_at: null,
        submitted_at: submission.submitted_at,
      },
    };
    const { rows: samples } = await client.query("select id,sample_text from public.writing_samples where task_submission_id=$1", [submissionId]);
    if (samples.length !== 1 || samples[0].sample_text !== writing) throw new Error("Fixture writing has changed; refusing to replace its immutable source.");
    await client.query("update public.course_tasks set lesson_schema=$2::jsonb where id=$1 and task_type='lesson'", [submission.task_id, JSON.stringify(lessonSchema)]);
    await client.query(`insert into public.task_submission_drafts(task_id,course_id,child_id,parent_user_id,draft_text,draft_payload)
      values($1,$2,$3,$4,$5,$6::jsonb)
      on conflict(task_id,child_id) do nothing`,
      [submission.task_id, submission.course_id, submission.child_id, submission.parent_user_id, writing, JSON.stringify(fixtureDraftPayload)]);
    if (process.argv.includes("--reset-draft")) {
      await client.query(`update public.task_submission_drafts
        set draft_payload=$3::jsonb || jsonb_build_object(
          '__field_feedback',coalesce(draft_payload->'__field_feedback','{}'::jsonb),
          '__writing_issue_feedback',coalesce(draft_payload->'__writing_issue_feedback','[]'::jsonb))
        where task_id=$1 and child_id=$2`,
        [submission.task_id, submission.child_id, JSON.stringify(fixtureDraftPayload)]);
    }
    await client.query(`insert into public.authentic_use_controls(child_id,parent_user_id,mode,gold_enabled,proficiency_enabled,activation_cutoff)
      values($1,$2,'enabled',true,true,'2026-01-01T00:00:00Z')
      on conflict(child_id) do update set mode='enabled',gold_enabled=true,proficiency_enabled=true,
        activation_cutoff='2026-01-01T00:00:00Z'`, [submission.child_id, submission.parent_user_id]);
    await client.query("select public.backfill_authentic_use_chains_for_child($1)", [submission.child_id]);
    const envelope = { schemaVersion: 1, authenticUseCapture: true, rawSubmissionText: writing, draftPayload: fixtureDraftPayload,
      structuredPayloads: [{ type: "structured_lesson_response", value: fixtureDraftPayload.__structured_lesson_response }],
      taskContext: { kind: "saved_definition_at_submission", lessonSchema }, captureMetadata: {} };
    await client.query(`insert into public.writing_source_snapshots
      (submission_id,parent_user_id,child_id,task_id,occurred_at,source_purpose,envelope)
      select id,parent_user_id,child_id,task_id,submitted_at,'REAL_LEARNER',$2::jsonb
      from public.task_submissions where id=$1
      on conflict(submission_id) do nothing`, [submission.id, JSON.stringify(envelope)]);
    const { rows: snapshots } = await client.query("select * from public.writing_source_snapshots where submission_id=$1", [submission.id]);
    const snapshot = snapshots[0] as SourceSnapshot;
    const extraction = extractWholeWriting(snapshot);
    if (!extraction.occurrences.some((row) => row.provenance === "learner_response")) throw new Error("No learner writing occurrences were extracted.");
    for (const occurrence of extraction.occurrences) {
      await client.query(`insert into public.writing_occurrences
        (id,snapshot_id,field_path,start_utf16,end_utf16,observed_text,field_hash,provenance,extractor_version)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do nothing`,
        [occurrence.id,snapshot.id,occurrence.fieldKey,occurrence.start,occurrence.end,
          occurrence.observedText,occurrence.textHash,occurrence.provenance,extraction.version]);
    }
    await client.query("commit");
    console.log(JSON.stringify({ submissionId, childId: submission.child_id, occurrences: extraction.occurrences.length,
      reviewUrl: `http://localhost:3000/courses/review/${submissionId}?child=${submission.child_id}` }, null, 2));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
