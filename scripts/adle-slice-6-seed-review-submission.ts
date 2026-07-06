/**
 * ADLE Slice 6: seed a real Review Work submission for the manual-QA child so
 * the live authentic-use hook in approveSubmissionReviewImpl can be exercised
 * end-to-end (approve in the browser -> adle_authentic_use_events rows).
 * Local/dev only; re-runnable (removes prior seeded submission first).
 *
 * The writing sample deliberately contains canonical dictionary words
 * ("see", "sea") plus a non-word ("zzqxblob") to prove the fail-closed
 * no-match path (reported, never credited).
 *
 * Run: node --env-file=.env.local .tmp/.../adle-slice-6-seed-review-submission.js \
 *        --confirm-local-dev-seed ADLE-SLICE-6-LOCAL-SEED
 */

import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "ADLE-SLICE-6-LOCAL-SEED";
const TEST_EMAIL = "adle-parent@example.test";
const SAMPLE_TEXT = "Today I can see the sea. The word zzqxblob is not real.";

function requireLocal(url: string): void {
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.port !== "54321") {
    throw new Error(`Refusing non-local Supabase URL ${url}. Expected localhost:54321.`);
  }
}

async function main(): Promise<void> {
  const token = process.argv.includes("--confirm-local-dev-seed")
    ? process.argv[process.argv.indexOf("--confirm-local-dev-seed") + 1]
    : null;
  if (token !== CONFIRM_TOKEN) {
    throw new Error(`Refusing to run without --confirm-local-dev-seed ${CONFIRM_TOKEN}.`);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env (run with --env-file=.env.local).");
  }
  requireLocal(url);
  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: users } = await client.auth.admin.listUsers();
  const parent = users.users.find((u) => u.email === TEST_EMAIL);
  if (!parent) {
    throw new Error(`No test parent ${TEST_EMAIL}. Run adle-slice-6-seed-manual first.`);
  }
  const { data: childRow, error: childError } = await client
    .from("children")
    .select("id, first_name")
    .eq("parent_user_id", parent.id)
    .eq("first_name", "Test Scarlett")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (childError || !childRow) {
    throw new Error(`No test child. Run adle-slice-6-seed-manual first. ${childError?.message ?? ""}`);
  }
  const child = childRow as { id: string; first_name: string };

  // Clean any prior seeded review course (cascades to task/submission/sample).
  const { data: priorCourses } = await client
    .from("courses")
    .select("id")
    .eq("parent_user_id", parent.id)
    .eq("child_id", child.id)
    .eq("title", "ADLE Review QA course");
  for (const c of (priorCourses ?? []) as { id: string }[]) {
    await client.from("courses").delete().eq("id", c.id);
  }

  const insertReturning = async (table: string, row: Record<string, unknown>): Promise<string> => {
    const { data, error } = await client.from(table).insert(row).select("id").single();
    if (error || !data) {
      throw new Error(`insert ${table}: ${error?.message}`);
    }
    return (data as { id: string }).id;
  };

  const courseId = await insertReturning("courses", {
    parent_user_id: parent.id,
    child_id: child.id,
    title: "ADLE Review QA course",
  });
  const moduleId = await insertReturning("course_modules", {
    course_id: courseId,
    parent_user_id: parent.id,
    title: "ADLE Review QA module",
  });
  const taskId = await insertReturning("course_tasks", {
    course_id: courseId,
    module_id: moduleId,
    parent_user_id: parent.id,
    title: "Write a sentence with the week's words",
    task_type: "test",
  });
  const submissionId = await insertReturning("task_submissions", {
    task_id: taskId,
    course_id: courseId,
    child_id: child.id,
    parent_user_id: parent.id,
    submission_text: SAMPLE_TEXT,
    parent_review_status: "pending",
  });
  await insertReturning("writing_samples", {
    child_id: child.id,
    parent_user_id: parent.id,
    title: "Test submission",
    sample_text: SAMPLE_TEXT,
    source: "Course task submission",
    written_at: new Date().toISOString().slice(0, 10),
    task_submission_id: submissionId,
  });

  console.log("\n=== ADLE Review Work submission seeded ===");
  console.log(`  child id       : ${child.id}`);
  console.log(`  submission id  : ${submissionId}`);
  console.log(`  sample text    : "${SAMPLE_TEXT}"`);
  console.log(`  expect events for canonical words (e.g. see, sea); "zzqxblob" logged unmatched.`);
  console.log("\n  Approve in the browser (parent mode), then check the DB:");
  console.log(`   review detail : /courses/review/${submissionId}?child=${child.id}&mode=parent`);
  console.log(`   queue         : /courses/review?child=${child.id}&mode=parent`);
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
