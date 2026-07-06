/**
 * ADLE Slice 6: guarded live smoke test — validates the real loader/ensure/
 * completion SQL against a local dev database (what the fixture regressions
 * cannot cover: column names, RLS, FK/uniqueness constraints, JSON round
 * trips). Seeds a throwaway child, drives the actual code paths, asserts the
 * rows landed, checks idempotence, then deletes the child (everything
 * cascades). Local/dev only.
 *
 * Run: node --env-file=.env.local .tmp/.../adle-slice-6-live-smoke.js \
 *        --confirm-local-dev-smoke ADLE-SLICE-6-LOCAL-SMOKE
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { onLessonCompleted, onReviewSessionCompleted, type ReviewItemOutcome } from "../lib/adle/composer-completions";
import type { DueItemKind } from "../lib/adle/review-due-queue";
import { addDays } from "../lib/adle/review-scheduler";
import {
  ensureAdleDailyPlan,
  getAdleDailyPlanReadModel,
} from "../lib/adle/loaders/daily-plan-surface";
import { loadActiveReviewPolicy } from "../lib/adle/loaders/composer-facts-loader";
import {
  bundleFromRow,
  learningItemFromRow,
  scheduleWordFromRow,
  type LearningItemRow,
  type ReviewBundleRow,
  type ScheduleWordRow,
} from "../lib/adle/loaders/rows";
import {
  persistAuthenticUseEvents,
  persistLessonCompletion,
  persistReviewSessionCompletion,
} from "../lib/adle/loaders/session-completion-loader";
import { authenticUseBridge, extractAuthenticUseCandidates } from "../lib/adle/authentic-use";

const CONFIRM_TOKEN = "ADLE-SLICE-6-LOCAL-SMOKE";
const LESSON_SKILL = "D4_HOM_CONTENT_WORD_HOMOPHONES_SEE_SEA";
const REVIEW_SKILL = "D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`SMOKE FAIL: ${message}`);
  }
}

function requireLocal(url: string): void {
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.port !== "54321") {
    throw new Error(`Refusing non-local Supabase URL ${url}. Expected localhost:54321.`);
  }
}

async function pick<T>(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  context: string,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
  return (data ?? []) as T[];
}

async function main(): Promise<void> {
  const token = process.argv.includes("--confirm-local-dev-smoke")
    ? process.argv[process.argv.indexOf("--confirm-local-dev-smoke") + 1]
    : null;
  if (token !== CONFIRM_TOKEN) {
    throw new Error(`Refusing to run without --confirm-local-dev-smoke ${CONFIRM_TOKEN}.`);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local).");
  }
  requireLocal(url);
  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // The parent auth.users row is seeded by the caller (children FK ->
  // auth.users; GoTrue's admin API is flaky against a local stack) and passed
  // in here; the caller also deletes it after cleanup.
  const parent = process.argv.includes("--parent-user-id")
    ? process.argv[process.argv.indexOf("--parent-user-id") + 1]
    : null;
  if (!parent) {
    throw new Error("Missing --parent-user-id <uuid> (seed the parent auth.users row first).");
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = addDays(today, -1);
  let childId: string | null = null;

  try {
    // --- Seed a throwaway child -------------------------------------------
    const { data: childRow, error: childError } = await client
      .from("children")
      .insert({ parent_user_id: parent, first_name: "ADLE Smoke" })
      .select("id")
      .single();
    if (childError || !childRow) {
      throw new Error(`seed child: ${childError?.message}`);
    }
    childId = (childRow as { id: string }).id;
    console.log(`seeded child ${childId} (parent ${parent})`);

    // Real canonical words: 5 for the lesson, 2 for the review.
    const words = await pick<{ id: string; display_word: string }>(
      client
        .from("canonical_teaching_dictionary_words")
        .select("id, display_word, canonical_teaching_dictionary_word_banding!inner(complexity_level, row_status)")
        .eq("row_status", "active")
        .eq("canonical_teaching_dictionary_word_banding.row_status", "active")
        .eq("canonical_teaching_dictionary_word_banding.complexity_level", 1)
        .order("display_word", { ascending: true })
        .limit(7),
      "words",
    );
    assert(words.length === 7, `need 7 level-1 words, got ${words.length}`);
    const lessonWords = words.slice(0, 5);
    const reviewWords = words.slice(5, 7);
    const policy = await loadActiveReviewPolicy(client);

    // Review bundle due today + its scheduled words.
    const bundleId = randomUUID();
    {
      const { error } = await client.from("adle_review_bundles").insert({
        id: bundleId,
        child_id: childId,
        source_ref: `lesson:${childId}:${yesterday}:${REVIEW_SKILL}`,
        interval_index: 0,
        next_due_on: today,
        schedule_policy_version: policy.schedulePolicyVersion,
        bundle_status: "active",
        row_status: "active",
      });
      if (error) throw new Error(`seed bundle: ${error.message}`);
    }
    for (const word of reviewWords) {
      const { error: swError } = await client.from("adle_review_schedule_words").insert({
        child_id: childId,
        canonical_word_id: word.id,
        bundle_id: bundleId,
        membership_status: "scheduled",
        catch_up_stage: 0,
        reteach_cycle_count: 0,
        taught_on: yesterday,
        row_status: "active",
      });
      if (swError) throw new Error(`seed schedule word: ${swError.message}`);
      // awaiting_review_outcome item so the loader resolves the review word's
      // micro-skill but the word is not a lesson candidate.
      const { error: liError } = await client.from("adle_learning_items").insert({
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
      if (liError) throw new Error(`seed review item: ${liError.message}`);
    }

    // Five pending lesson items -> the only selectable cluster (fills 5 slots).
    for (let index = 0; index < lessonWords.length; index += 1) {
      const { error } = await client.from("adle_learning_items").insert({
        child_id: childId,
        canonical_word_id: lessonWords[index].id,
        micro_skill_key: LESSON_SKILL,
        item_status: "pending",
        source_kind: "verified_misspelling",
        source_ref: `seed-lesson:${lessonWords[index].id}`,
        source_attempt_text: `wrong-${index}`,
        reteach_priority: false,
        intake_on: addDays("2026-06-01", index),
        row_status: "active",
      });
      if (error) throw new Error(`seed lesson item: ${error.message}`);
    }

    // --- Ensure today's plan (compose -> persist) -------------------------
    const assignmentId = await ensureAdleDailyPlan({
      userClient: client,
      serviceClient: client,
      parentUserId: parent,
      childId,
      planDate: today,
    });
    assert(assignmentId !== null, "ensureAdleDailyPlan produced a plan (non-empty day)");
    console.log(`ensured ADLE Daily Plan assignment ${assignmentId}`);

    const readModel = await getAdleDailyPlanReadModel({
      userClient: client,
      parentUserId: parent,
      childId,
      planDate: today,
      assignmentId,
    });
    assert(readModel.state === "ready", `read model ready (got ${readModel.state})`);
    assert(readModel.partOne.present, "Part 1 present (review)");
    assert(readModel.partTwo.present, "Part 2 present (lesson)");
    const lessonProduction = readModel.partTwo.items.filter((item) => item.sectionKey === "lesson_production");
    assert(lessonProduction.length === 5, `5 lesson production items (got ${lessonProduction.length})`);
    console.log(
      `plan read model: Part 1 ${readModel.partOne.items.length} items, Part 2 ${readModel.partTwo.items.length} items`,
    );

    // --- Idempotence: re-ensure is a noop on the same header --------------
    const reEnsured = await ensureAdleDailyPlan({
      userClient: client,
      serviceClient: client,
      parentUserId: parent,
      childId,
      planDate: today,
    });
    assert(reEnsured === assignmentId, "re-ensure returns the same assignment (idempotent)");
    const headerCount = await pick<{ id: string }>(
      client
        .from("daily_assignments")
        .select("id")
        .eq("child_id", childId)
        .eq("assignment_date", today)
        .eq("title", "ADLE Daily Plan"),
      "daily_assignments",
    );
    assert(headerCount.length === 1, `exactly one ADLE header after re-ensure (got ${headerCount.length})`);

    // --- Part 1 completion (review) ---------------------------------------
    const productionItems = readModel.partOne.items.filter(
      (item) => item.sectionKey === "review_production" && item.canonicalWordId !== null,
    );
    const microSkillKeyByWordId = new Map<string, string>();
    const reviewOutcomes: ReviewItemOutcome[] = productionItems.map((item, index) => {
      if (item.microSkillKey) microSkillKeyByWordId.set(item.canonicalWordId as string, item.microSkillKey);
      return {
        canonicalWordId: item.canonicalWordId as string,
        bundleId: (item.promptData as { bundleId: string }).bundleId,
        kind: (item.promptData as { dueKind: DueItemKind }).dueKind,
        passed: index === 0, // one pass, one fail -> exercises catch-up
        attemptText: index === 0 ? "correct" : "wrongattempt",
      };
    });

    const bundleRows = await pick<ReviewBundleRow>(
      client
        .from("adle_review_bundles")
        .select("id, child_id, source_ref, interval_index, next_due_on, schedule_policy_version, bundle_status, row_status")
        .eq("child_id", childId)
        .eq("row_status", "active"),
      "adle_review_bundles",
    );
    const scheduleWordRows = await pick<ScheduleWordRow>(
      client
        .from("adle_review_schedule_words")
        .select(
          "child_id, canonical_word_id, bundle_id, membership_status, catch_up_stage, next_retest_due_on, failed_review_on, pre_retirement_check_due_on, last_28_day_review_on, reteach_cycle_count, taught_on, row_status",
        )
        .eq("child_id", childId)
        .eq("row_status", "active"),
      "adle_review_schedule_words",
    );
    const reviewResult = onReviewSessionCompleted(policy, {
      childId,
      completedOn: today,
      sourceRef: `review:${childId}:${today}`,
      bundles: bundleRows.map(bundleFromRow),
      scheduleWords: scheduleWordRows.map(scheduleWordFromRow),
      outcomes: reviewOutcomes,
      microSkillKeyByWordId,
    });
    await persistReviewSessionCompletion(client, {
      updatedBundles: reviewResult.updatedBundles,
      updatedScheduleWords: reviewResult.updatedScheduleWords,
      outcomeEvents: reviewResult.outcomeEvents,
      itemIntakes: reviewResult.itemIntakes,
      pausedItems: [],
      reopenedItems: [],
    });

    const outcomeEventRows = await pick<{ event_type: string; attempt_text: string | null }>(
      client
        .from("adle_review_outcome_events")
        .select("event_type, attempt_text")
        .eq("child_id", childId)
        .eq("occurred_on", today),
      "adle_review_outcome_events",
    );
    assert(
      outcomeEventRows.some((row) => row.event_type === "review_pass") &&
        outcomeEventRows.some((row) => row.event_type === "review_fail"),
      "review pass + fail outcome events landed",
    );
    assert(
      outcomeEventRows.some((row) => row.event_type === "review_fail" && row.attempt_text === "wrongattempt"),
      "raw attempt text persisted on the failed outcome event",
    );
    const catchUp = await pick<{ canonical_word_id: string }>(
      client
        .from("adle_review_schedule_words")
        .select("canonical_word_id")
        .eq("child_id", childId)
        .eq("membership_status", "catch_up")
        .eq("row_status", "active"),
      "adle_review_schedule_words:catch_up",
    );
    assert(catchUp.length === 1, `failed word entered catch-up (got ${catchUp.length})`);
    console.log(`Part 1 recorded: ${outcomeEventRows.length} outcome events, 1 word in catch-up`);

    // --- Part 2 completion (lesson) ---------------------------------------
    const lessonItemRows = await pick<LearningItemRow>(
      client
        .from("adle_learning_items")
        .select(
          "id, child_id, canonical_word_id, micro_skill_key, item_status, source_kind, source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status",
        )
        .eq("child_id", childId)
        .eq("row_status", "active"),
      "adle_learning_items",
    );
    const lessonSourceRef = `lesson:${childId}:${today}:${LESSON_SKILL}`;
    const lessonResult = onLessonCompleted(policy, {
      childId,
      microSkillKey: LESSON_SKILL,
      completedOn: today,
      sourceRef: lessonSourceRef,
      bundleId: randomUUID(),
      producedWords: lessonProduction.map((item, index) => ({
        canonicalWordId: item.canonicalWordId as string,
        attemptText: item.targetWord ?? "",
        correct: index < 4, // 4 correct, 1 missed
      })),
      learningItems: lessonItemRows.map(learningItemFromRow),
    });
    await persistLessonCompletion(client, lessonResult);

    const taughtRows = await pick<{ source_ref: string }>(
      client
        .from("adle_taught_word_history")
        .select("source_ref")
        .eq("child_id", childId)
        .eq("source_ref", lessonSourceRef),
      "adle_taught_word_history",
    );
    assert(taughtRows.length === 5, `5 taught events for the lesson (got ${taughtRows.length})`);
    const newBundles = await pick<{ next_due_on: string }>(
      client
        .from("adle_review_bundles")
        .select("next_due_on")
        .eq("child_id", childId)
        .eq("source_ref", lessonSourceRef)
        .eq("row_status", "active"),
      "adle_review_bundles:new",
    );
    assert(
      newBundles.length === 1 && newBundles[0].next_due_on === addDays(today, 1),
      "successful lesson words entered a 1-day review bundle",
    );
    const newScheduleWords = await pick<{ canonical_word_id: string }>(
      client
        .from("adle_review_schedule_words")
        .select("canonical_word_id, bundle_id")
        .eq("child_id", childId)
        .eq("bundle_id", lessonResult.bundle?.bundleId ?? "none"),
      "adle_review_schedule_words:new",
    );
    assert(newScheduleWords.length === 4, `4 successful words scheduled, 1 missed excluded (got ${newScheduleWords.length})`);
    console.log(`Part 2 recorded: 5 taught events, new 1-day bundle with 4 words`);

    // --- Live authentic-use persistence SQL (uniqueness-guard tolerance) ---
    const candidates = extractAuthenticUseCandidates({
      childId,
      writingSampleId: `smoke-${childId}`,
      sampleText: `${lessonWords[0].display_word} ${reviewWords[0].display_word} zzqxnotaword`,
      occurredOn: today,
      flaggedMisspellings: [],
    });
    const dictMap = new Map(words.map((word) => [word.display_word.toLowerCase().replace(/[^a-z]/g, ""), word.id]));
    const bridged = authenticUseBridge(candidates, dictMap, `${today}T00:00:00Z`);
    const firstInsert = await persistAuthenticUseEvents(client, bridged.events, `${today}T00:00:00Z`);
    const secondInsert = await persistAuthenticUseEvents(client, bridged.events, `${today}T00:00:00Z`);
    assert(bridged.events.length >= 1, "at least one authentic-use event matched a canonical word");
    assert(firstInsert === bridged.events.length, `first emission inserts all matched events (got ${firstInsert})`);
    assert(secondInsert === 0, "re-emission is idempotent (uniqueness guard tolerated, 0 new rows)");
    assert(bridged.unmatched.some((u) => u.observedWord === "zzqxnotaword"), "unmatched token reported, never guessed");
    console.log(`authentic-use: ${firstInsert} event(s) emitted, re-emit inserted ${secondInsert} (idempotent)`);

    console.log("\nadle-slice-6-live-smoke: ALL CHECKS PASSED");
  } finally {
    if (childId !== null) {
      const { error } = await client.from("children").delete().eq("id", childId);
      if (error) {
        console.error(`CLEANUP WARNING: failed to delete child ${childId}: ${error.message}`);
      } else {
        console.log(`cleaned up child ${childId} (ADLE + assignment rows cascade-deleted)`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
