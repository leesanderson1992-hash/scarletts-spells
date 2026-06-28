import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(source: string, expected: string, label: string) {
  assert.ok(
    source.includes(expected),
    `${label} should include ${JSON.stringify(expected)}`,
  );
}

function assertNotIncludes(source: string, forbidden: string, label: string) {
  assert.ok(
    !source.includes(forbidden),
    `${label} should not include ${JSON.stringify(forbidden)}`,
  );
}

const forbiddenTablesAndCalls = [
  '.from("learning_items")',
  '.from("learning_item_evidence")',
  '.from("practice_attempts")',
  '.from("writing_issues")',
  '.from("micro_skill_catalog")',
  '.from("spelling_canonical_mappings")',
  '.from("spelling_reward_states")',
  '.from("spelling_reward_events")',
  '.from("child_gold_coin_ledger_events")',
  '.from("gold_coin_transfer_requests")',
  '.from("task_completions")',
  '.from("task_submissions")',
  "maybeAwardDailyCheckInCoins",
  "maybeAwardTaskCompletionCoins",
  "spelling reward",
  "service-role",
  "createServiceRole",
];

const forbiddenDailyPracticeCopy = [
  "Golden Nugget",
  "Forge",
  "Golden Bar",
  "Vault",
  "Gold Coin",
  "earned",
  "minted",
  "mastered",
  "proficient",
  "moved up",
  "reward",
  "treasure",
];

function testCompletionHelperScope() {
  const source = readRepoFile(
    "lib/writing-practice/daily-spelling-practice-completion.ts",
  );
  const wordTreasureSource = readRepoFile("lib/rewards/word-treasures.ts");

  assertIncludes(source, '.from("daily_assignments")', "completion helper");
  assertIncludes(source, '.from("assignment_items")', "completion helper");
  assertIncludes(
    source,
    "moveGoldenNuggetIntoForgeFromDailyAssignmentItem",
    "completion helper",
  );
  assertIncludes(source, '.eq("parent_user_id", input.parentUserId)', "completion helper");
  assertIncludes(source, '.eq("child_id", input.childId)', "completion helper");
  assertIncludes(source, '.eq("id", input.dailyAssignmentId)', "completion helper");
  assertIncludes(source, '.eq("daily_assignment_id", input.dailyAssignmentId)', "completion helper");
  assertIncludes(source, '.eq("title", DAILY_SPELLING_PRACTICE_ASSIGNMENT_TITLE)', "completion helper");
  assertIncludes(source, '.eq("assignment_generation_source", "learning_items")', "completion helper");
  assertIncludes(source, 'scopedAssignment.status !== "pending"', "completion helper");
  assertIncludes(source, '.eq("domain_module", "spelling")', "completion helper");
  assertIncludes(source, '.eq("item_type", "controlled_spelling")', "completion helper");
  assertIncludes(source, "learning_item_id", "completion helper");
  assertIncludes(source, "target_word", "completion helper");
  assertIncludes(source, 'item.status !== "completed"', "completion helper");
  assertIncludes(source, '.update({ status: "completed" })', "completion helper");
  assertIncludes(source, ".in(\"id\", itemIdsToComplete)", "completion helper");
  assertNotIncludes(source, '.from("daily_assignments")\n      .update', "completion helper");

  assertIncludes(
    wordTreasureSource,
    "export async function moveGoldenNuggetIntoForgeFromDailyAssignmentItem",
    "word treasure helper",
  );
  assertIncludes(wordTreasureSource, '.from("child_word_treasures")', "word treasure helper");
  assertIncludes(
    wordTreasureSource,
    '.from("child_word_treasure_events")',
    "word treasure helper",
  );
  assertIncludes(wordTreasureSource, '.eq("status", "golden_nugget")', "word treasure helper");
  assertIncludes(wordTreasureSource, 'status: "in_forge"', "word treasure helper");
  assertIncludes(wordTreasureSource, 'eventType: "entered_forge"', "word treasure helper");
  assertIncludes(
    wordTreasureSource,
    'sourceType: "daily_assignment_item"',
    "word treasure helper",
  );
  assertNotIncludes(wordTreasureSource, '.from("spelling_reward_states")', "word treasure helper");
  assertNotIncludes(wordTreasureSource, '.from("spelling_reward_events")', "word treasure helper");
  assertNotIncludes(
    wordTreasureSource,
    '.from("child_gold_coin_ledger_events")',
    "word treasure helper",
  );
  assertNotIncludes(wordTreasureSource, '.from("learning_item_evidence")', "word treasure helper");

  for (const forbidden of forbiddenTablesAndCalls) {
    assertNotIncludes(source, forbidden, "completion helper");
  }
}

function testRouteActionIsThinAndScoped() {
  const source = readRepoFile("app/learn/week/practice/actions.ts");
  const broadLearnActionsSource = readRepoFile("app/learn/actions.ts");

  assertIncludes(source, '"use server";', "completion action");
  assertIncludes(source, "supabase.auth.getUser()", "completion action");
  assertIncludes(source, 'mode !== "child"', "completion action");
  assertIncludes(source, "getActiveChildrenForUser", "completion action");
  assertIncludes(source, "selectChildById", "completion action");
  assertIncludes(source, "completeDailySpellingPracticeItems", "completion action");
  assertIncludes(source, 'revalidatePath("/learn/week")', "completion action");
  assertIncludes(source, 'revalidatePath("/learn/week/practice")', "completion action");
  assertIncludes(
    source,
    'buildScopedPath("/learn/week/practice", selectedChild.id, "child")',
    "completion action",
  );
  assertNotIncludes(source, '.from("assignment_items")', "completion action");
  assertNotIncludes(source, '.from("daily_assignments")', "completion action");
  assertNotIncludes(
    broadLearnActionsSource,
    "completeDailySpellingPractice",
    "broad learn actions",
  );

  for (const forbidden of forbiddenTablesAndCalls) {
    assertNotIncludes(source, forbidden, "completion action");
  }
}

function testViewerCompletionFormAndReadModelState() {
  const viewerSource = readRepoFile("components/daily-spelling-practice-viewer.tsx");
  const routeSource = readRepoFile("app/learn/week/practice/page.tsx");
  const readModelSource = readRepoFile(
    "lib/writing-practice/daily-spelling-practice-read-model.ts",
  );

  assertIncludes(viewerSource, "<form action={completeAction}>", "viewer");
  assertIncludes(viewerSource, "isLastItem ? (", "viewer");
  assertIncludes(viewerSource, 'name="dailyAssignmentId"', "viewer");
  assertIncludes(viewerSource, 'name="practiceDate"', "viewer");
  assertIncludes(viewerSource, "Done for today", "viewer");
  assertIncludes(
    routeSource,
    'practice.state === "ready" && supportedItems.length > 0',
    "viewer route",
  );
  assertIncludes(routeSource, "completeDailySpellingPracticeAction", "viewer route");
  assertIncludes(
    routeSource,
    "completeAction={completeDailySpellingPracticeAction}",
    "viewer route",
  );
  assertIncludes(
    readModelSource,
    'supportedItems.every((item) => item.status === "completed")',
    "read model item completion state",
  );
}

function testForbiddenCopyAndLegacyRedirects() {
  const viewerSource = readRepoFile("components/daily-spelling-practice-viewer.tsx");
  const plannerSource = readRepoFile("components/learn-week-planner.tsx");
  const practicePage = readRepoFile("app/practice/page.tsx");
  const assignmentsPage = readRepoFile("app/assignments/page.tsx");

  for (const forbidden of forbiddenDailyPracticeCopy) {
    assertNotIncludes(viewerSource, forbidden, "viewer source");
  }

  assertIncludes(plannerSource, "Open practice", "daily practice card");

  for (const [label, source] of [
    ["/practice", practicePage],
    ["/assignments", assignmentsPage],
  ] as const) {
    assertIncludes(source, 'buildScopedPath("/learn/week", childId, "child")', label);
    assertIncludes(source, "redirect(destination)", label);
    assertNotIncludes(source, "DailySpellingPracticeViewer", label);
    assertNotIncludes(source, "completeDailySpellingPractice", label);
  }
}

function run() {
  testCompletionHelperScope();
  testRouteActionIsThinAndScoped();
  testViewerCompletionFormAndReadModelState();
  testForbiddenCopyAndLegacyRedirects();

  console.log("Daily spelling practice completion regression passed.");
}

run();
