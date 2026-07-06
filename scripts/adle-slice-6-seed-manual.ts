/**
 * ADLE Slice 6: PERSISTENT manual-QA seed for the 6G browser pass. Creates a
 * real test login (confirmed auth user with a known password) + a child with
 * a full two-part ADLE day (2-word due review + a 5-word homophone lesson)
 * plus one paused word so the parent "Paused spelling words" release UI has
 * something to act on. Local/dev only; leaves the data in place (re-running
 * resets it). Delete with --teardown.
 *
 * Run: node --env-file=.env.local .tmp/.../adle-slice-6-seed-manual.js \
 *        --confirm-local-dev-seed ADLE-SLICE-6-LOCAL-SEED [--teardown]
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { addDays } from "../lib/adle/review-scheduler";
import { loadActiveReviewPolicy } from "../lib/adle/loaders/composer-facts-loader";

const CONFIRM_TOKEN = "ADLE-SLICE-6-LOCAL-SEED";
const TEST_EMAIL = "adle-parent@example.test";
const TEST_PASSWORD = "TestPass123!";
const CHILD_NAME = "Test Scarlett";
const LESSON_SKILL = "D4_HOM_CONTENT_WORD_HOMOPHONES_SEE_SEA";
const REVIEW_SKILL = "D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE";
const PAUSED_SKILL = "D4_HOM_CONTENT_WORD_HOMOPHONES_RIGHT_WRITE";

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
  const teardown = process.argv.includes("--teardown");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local).");
  }
  requireLocal(url);
  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Always start clean (idempotent re-seed): remove any prior test user (its
  // children + ADLE rows cascade).
  const { data: existing } = await client.auth.admin.listUsers();
  for (const user of existing.users) {
    if (user.email === TEST_EMAIL) {
      await client.auth.admin.deleteUser(user.id);
      console.log(`removed prior test user ${user.id}`);
    }
  }
  if (teardown) {
    console.log("teardown complete.");
    return;
  }

  const { data: created, error: createError } = await client.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`create test user: ${createError?.message}`);
  }
  const parentUserId = created.user.id;

  const { data: childRow, error: childError } = await client
    .from("children")
    .insert({ parent_user_id: parentUserId, first_name: CHILD_NAME })
    .select("id")
    .single();
  if (childError || !childRow) {
    throw new Error(`seed child: ${childError?.message}`);
  }
  const childId = (childRow as { id: string }).id;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = addDays(today, -1);
  const policy = await loadActiveReviewPolicy(client);

  // Eight distinct level-1 words: 5 lesson + 2 review + 1 paused.
  const { data: wordData, error: wordError } = await client
    .from("canonical_teaching_dictionary_words")
    .select("id, display_word, canonical_teaching_dictionary_word_banding!inner(complexity_level, row_status)")
    .eq("row_status", "active")
    .eq("canonical_teaching_dictionary_word_banding.row_status", "active")
    .eq("canonical_teaching_dictionary_word_banding.complexity_level", 1)
    .order("display_word", { ascending: true })
    .limit(8);
  if (wordError || !wordData || wordData.length < 8) {
    throw new Error(`load words: ${wordError?.message ?? `only ${wordData?.length ?? 0} words`}`);
  }
  const words = wordData as { id: string; display_word: string }[];
  const lessonWords = words.slice(0, 5);
  const reviewWords = words.slice(5, 7);
  const pausedWord = words[7];

  // Due review bundle (2 words, due today).
  const reviewBundleId = randomUUID();
  await client.from("adle_review_bundles").insert({
    id: reviewBundleId,
    child_id: childId,
    source_ref: `lesson:${childId}:${yesterday}:${REVIEW_SKILL}`,
    interval_index: 0,
    next_due_on: today,
    schedule_policy_version: policy.schedulePolicyVersion,
    bundle_status: "active",
    row_status: "active",
  });
  for (const word of reviewWords) {
    await client.from("adle_review_schedule_words").insert({
      child_id: childId,
      canonical_word_id: word.id,
      bundle_id: reviewBundleId,
      membership_status: "scheduled",
      catch_up_stage: 0,
      reteach_cycle_count: 0,
      taught_on: yesterday,
      row_status: "active",
    });
    await client.from("adle_learning_items").insert({
      child_id: childId,
      canonical_word_id: word.id,
      micro_skill_key: REVIEW_SKILL,
      item_status: "awaiting_review_outcome",
      source_kind: "verified_misspelling",
      source_ref: `seed-review:${word.id}`,
      reteach_priority: false,
      intake_on: yesterday,
      row_status: "active",
    });
  }

  // Five pending lesson items -> the only selectable cluster.
  for (let index = 0; index < lessonWords.length; index += 1) {
    await client.from("adle_learning_items").insert({
      child_id: childId,
      canonical_word_id: lessonWords[index].id,
      micro_skill_key: LESSON_SKILL,
      item_status: "pending",
      source_kind: "verified_misspelling",
      source_ref: `seed-lesson:${lessonWords[index].id}`,
      source_attempt_text: `tricky-${index}`,
      reteach_priority: false,
      intake_on: addDays("2026-06-01", index),
      row_status: "active",
    });
  }

  // One paused word (post-reteach failure): its own completed single-word
  // bundle, membership paused_parent_review, + a paused learning item. Shows
  // in the parent "Paused spelling words" release section.
  const pausedBundleId = randomUUID();
  await client.from("adle_review_bundles").insert({
    id: pausedBundleId,
    child_id: childId,
    source_ref: `lesson:${childId}:${addDays(today, -30)}:${PAUSED_SKILL}`,
    interval_index: 2,
    next_due_on: addDays(today, -10),
    schedule_policy_version: policy.schedulePolicyVersion,
    bundle_status: "completed",
    row_status: "active",
  });
  await client.from("adle_review_schedule_words").insert({
    child_id: childId,
    canonical_word_id: pausedWord.id,
    bundle_id: pausedBundleId,
    membership_status: "paused_parent_review",
    catch_up_stage: 0,
    reteach_cycle_count: 1,
    taught_on: addDays(today, -30),
    row_status: "active",
  });
  await client.from("adle_learning_items").insert({
    child_id: childId,
    canonical_word_id: pausedWord.id,
    micro_skill_key: PAUSED_SKILL,
    item_status: "paused_parent_review",
    source_kind: "review_ejection",
    source_ref: `seed-paused:${pausedWord.id}`,
    source_attempt_text: pausedWord.display_word.replace(/./g, "x"),
    reteach_priority: true,
    ejected_on: addDays(today, -12),
    intake_on: addDays(today, -30),
    row_status: "active",
  });

  console.log("\n=== ADLE Slice 6 manual-QA seed ready ===");
  console.log(`  login email    : ${TEST_EMAIL}`);
  console.log(`  login password : ${TEST_PASSWORD}`);
  console.log(`  child id        : ${childId}`);
  console.log(`  child name      : ${CHILD_NAME}`);
  console.log(`  review words    : ${reviewWords.map((w) => w.display_word).join(", ")} (due today)`);
  console.log(`  lesson words    : ${lessonWords.map((w) => w.display_word).join(", ")} (skill ${LESSON_SKILL})`);
  console.log(`  paused word     : ${pausedWord.display_word} (parent release section)`);
  console.log("\n  Browser flow:");
  console.log("   1. /login  -> sign in with the email/password above");
  console.log(`   2. child session : /learn/week?mode=child&child=${childId}  -> "Open today's plan"`);
  console.log(`      or directly    : /learn/week/adle?mode=child&child=${childId}`);
  console.log(`   3. parent review : /courses/review?child=${childId}  (Paused spelling words section)`);
  console.log("\n  Re-run to reset; --teardown to remove.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
