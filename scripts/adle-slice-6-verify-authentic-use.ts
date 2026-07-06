/**
 * ADLE Slice 6: verify the live authentic-use emission end-to-end against a
 * REAL seeded Review Work submission — by calling the exact function the
 * approve hook awaits (emitAdleAuthenticUseFromApprovedSubmission), with the
 * same args, reading the real writing_samples/misspelling_instances and
 * matching the real canonical dictionary. This is the code path
 * approveSubmissionReviewImpl runs after it marks a submission approved.
 * Local/dev only; idempotent.
 *
 * Run: node --env-file=.env.local .tmp/.../adle-slice-6-verify-authentic-use.js \
 *        --confirm-local-dev-seed ADLE-SLICE-6-LOCAL-SEED
 */

import { createClient } from "@supabase/supabase-js";

import { emitAdleAuthenticUseFromApprovedSubmission } from "../lib/adle/loaders/authentic-use-live-emission";

const CONFIRM_TOKEN = "ADLE-SLICE-6-LOCAL-SEED";
const TEST_EMAIL = "adle-parent@example.test";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`VERIFY FAIL: ${message}`);
  }
}

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

  const { data: userList } = await client.auth.admin.listUsers();
  const parent = (userList?.users ?? []).find((u: { email?: string }) => u.email === TEST_EMAIL);
  if (!parent) throw new Error(`No test parent ${TEST_EMAIL}.`);

  const { data: submissionRow } = await client
    .from("task_submissions")
    .select("id, child_id, parent_review_status")
    .eq("parent_user_id", parent.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!submissionRow) throw new Error("No seeded submission. Run adle-slice-6-seed-review-submission first.");
  const submission = submissionRow as { id: string; child_id: string; parent_review_status: string };

  const countEvents = async (): Promise<number> => {
    const { count, error } = await client
      .from("adle_authentic_use_events")
      .select("id", { count: "exact", head: true })
      .eq("child_id", submission.child_id);
    if (error) throw new Error(`count: ${error.message}`);
    return count ?? 0;
  };

  const before = await countEvents();
  assert(before === 0, `baseline events should be 0, got ${before}`);

  // This mirrors approveSubmissionReviewImpl exactly: after the submission is
  // parent-approved, it awaits this with (userClient, serviceClient,
  // parentUserId, childId, submissionId). Approve the submission first so the
  // state matches the real hook's precondition.
  await client
    .from("task_submissions")
    .update({ parent_review_status: "approved", parent_reviewed_at: new Date().toISOString() })
    .eq("id", submission.id);

  const result = await emitAdleAuthenticUseFromApprovedSubmission({
    userClient: client,
    serviceClient: client,
    parentUserId: parent.id,
    childId: submission.child_id,
    submissionId: submission.id,
  });

  const after = await countEvents();
  const { data: eventRows } = await client
    .from("adle_authentic_use_events")
    .select("canonical_word_id, use_kind, parent_verified, piece_ref, source_ref")
    .eq("child_id", submission.child_id);
  const { data: wordRows } = await client
    .from("canonical_teaching_dictionary_words")
    .select("id, normalised_word")
    .in("id", (eventRows ?? []).map((e) => (e as { canonical_word_id: string }).canonical_word_id));
  const wordById = new Map((wordRows ?? []).map((w) => [(w as { id: string }).id, (w as { normalised_word: string }).normalised_word]));
  const emittedWords = (eventRows ?? [])
    .map((e) => wordById.get((e as { canonical_word_id: string }).canonical_word_id))
    .sort();

  assert(result.insertedEvents >= 1, "at least one event emitted");
  assert(after === result.insertedEvents, `event count (${after}) matches inserted (${result.insertedEvents})`);
  assert(result.unmatchedWords >= 1, "at least one unmatched word reported (e.g. zzqxblob)");
  assert(
    (eventRows ?? []).every(
      (e) => (e as { parent_verified: boolean }).parent_verified && (e as { piece_ref: string }).piece_ref.startsWith("ws:"),
    ),
    "events are parent-verified with a ws: piece ref",
  );

  // Idempotent re-emit (the approve action's guarded batch bridge parity):
  const second = await emitAdleAuthenticUseFromApprovedSubmission({
    userClient: client,
    serviceClient: client,
    parentUserId: parent.id,
    childId: submission.child_id,
    submissionId: submission.id,
  });
  const afterSecond = await countEvents();
  assert(second.insertedEvents === 0, `re-emit inserts 0 (idempotent), got ${second.insertedEvents}`);
  assert(afterSecond === after, "no duplicate events after re-emit");

  console.log("\n=== ADLE Slice 6 live authentic-use verification ===");
  console.log(`  submission        : ${submission.id}`);
  console.log(`  events emitted    : ${result.insertedEvents}`);
  console.log(`  canonical words   : ${emittedWords.join(", ")}`);
  console.log(`  unmatched (logged): ${result.unmatchedWords} (see [adle-authentic-use] log lines above)`);
  console.log(`  re-emit inserted  : ${second.insertedEvents} (idempotent)`);
  console.log("\nadle-slice-6-verify-authentic-use: ALL CHECKS PASSED\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
