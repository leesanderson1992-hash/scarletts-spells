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

function extractSourceBlock(
  source: string,
  startMarker: string,
  endMarker: string,
) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  assert.ok(start >= 0, `Expected to find ${startMarker}`);
  assert.ok(end > start, `Expected to find ${endMarker} after ${startMarker}`);

  return source.slice(start, end);
}

function testWeekPageReadsDailyPracticeWithoutGeneration() {
  const pageSource = readRepoFile("app/learn/week/page.tsx");

  assertIncludes(
    pageSource,
    "getDailySpellingPracticeReadModel",
    "/learn/week page",
  );
  assert.match(
    pageSource,
    /const dailySpellingPractice = await withReadBoundaryTimeout\(\s+getDailySpellingPracticeReadModel\(\{\s+supabase,\s+parentUserId: user\.id,\s+childId: selectedChild\.id,\s+practiceDate: today,\s+\}\),\s+2500,\s+\)\.catch\(\(\) => buildMissingDailySpellingPracticeReadModel\(today\)\);/,
    "/learn/week should read the daily spelling practice server-side with a neutral timeout fallback",
  );
  assertIncludes(
    pageSource,
    "async function withReadBoundaryTimeout",
    "/learn/week page",
  );
  assertIncludes(
    pageSource,
    "dailySpellingPractice={dailySpellingPractice}",
    "/learn/week page",
  );
  assertNotIncludes(
    pageSource,
    "daily-spelling-practice-generation",
    "/learn/week page",
  );
  assertNotIncludes(
    pageSource,
    "generateDailySpellingPracticeAssignment",
    "/learn/week page",
  );
  assertNotIncludes(pageSource, "service-role", "/learn/week page");
  assertNotIncludes(pageSource, "createServiceRole", "/learn/week page");
}

function testPlannerAcceptsAndRendersDailyPracticeCard() {
  const plannerSource = readRepoFile("components/learn-week-planner.tsx");

  assertIncludes(
    plannerSource,
    "import type {\n  DailySpellingPracticeReadItem,\n  DailySpellingPracticeReadModel,",
    "LearnWeekPlanner",
  );
  assertIncludes(
    plannerSource,
    "dailySpellingPractice: DailySpellingPracticeReadModel;",
    "LearnWeekPlanner props",
  );
  assertIncludes(
    plannerSource,
    "dailySpellingPractice,",
    "LearnWeekPlanner arguments",
  );
  assertIncludes(
    plannerSource,
    "<DailySpellingPracticeCard",
    "LearnWeekPlanner render",
  );

  const cardRenderIndex = plannerSource.indexOf(
    "<DailySpellingPracticeCard",
  );
  const panelRenderIndex = plannerSource.indexOf("<GoldForgePanel");
  assert.ok(
    cardRenderIndex > 0 && panelRenderIndex > cardRenderIndex,
    "Daily spelling practice card should render before the existing reward panel",
  );
  assertNotIncludes(plannerSource, "service-role", "LearnWeekPlanner");
  assertNotIncludes(plannerSource, "createServiceRole", "LearnWeekPlanner");
}

function testCardCopyAndBehaviorStayDisplayOnly() {
  const plannerSource = readRepoFile("components/learn-week-planner.tsx");
  const dailyPracticeSource = extractSourceBlock(
    plannerSource,
    "function formatDailyPracticeWordCount",
    "export function LearnWeekPlanner",
  );
  const cardSource = extractSourceBlock(
    plannerSource,
    "function DailySpellingPracticeCard",
    "export function LearnWeekPlanner",
  );
  const forbiddenChildCopyTerms = [
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
  const forbiddenInteractions = [
    "<button",
    "onClick",
    "action=",
    "completeCourseTask",
    "submitTaskResponse",
    "moveTaskToDayPlan",
    "clearTaskDayPlan",
  ];
  const forbiddenWritesAndTables = [
    ".insert(",
    ".update(",
    ".upsert(",
    ".delete(",
    ".rpc(",
    "assignment_items",
    "learning_items",
    "learning_item_evidence",
    "practice_attempts",
    "spelling_reward_states",
    "spelling_reward_events",
    "child_gold_coin_ledger_events",
    "gold_coin_transfer_requests",
    "spelling_canonical_mappings",
    "micro_skill_catalog",
    "task_completions",
    "task_submissions",
  ];

  for (const term of forbiddenChildCopyTerms) {
    assertNotIncludes(dailyPracticeSource, term, "daily spelling practice card source");
  }
  for (const interaction of forbiddenInteractions) {
    assertNotIncludes(dailyPracticeSource, interaction, "daily spelling practice card source");
  }
  for (const writeOrTable of forbiddenWritesAndTables) {
    assertNotIncludes(dailyPracticeSource, writeOrTable, "daily spelling practice card source");
  }

  assertIncludes(cardSource, "copy.title", "DailySpellingPracticeCard source");
  assertIncludes(cardSource, "copy.ready", "DailySpellingPracticeCard source");
  assertIncludes(
    dailyPracticeSource,
    "practice.childCopy.dueReview",
    "daily spelling practice card source",
  );
  assertIncludes(
    dailyPracticeSource,
    "practice.childCopy.newPractice",
    "daily spelling practice card source",
  );
  assertIncludes(cardSource, "copy.done", "DailySpellingPracticeCard source");
  assertIncludes(cardSource, "copy.empty", "DailySpellingPracticeCard source");
  assertIncludes(cardSource, "copy.readyForToday", "DailySpellingPracticeCard source");
  assertIncludes(
    cardSource,
    'practice.state === "ready"',
    "DailySpellingPracticeCard source",
  );
  assertIncludes(
    cardSource,
    "supportedItemCount > 0",
    "DailySpellingPracticeCard source",
  );
  assertIncludes(
    cardSource,
    'href={getDailyPracticeViewerPath(childId)}',
    "DailySpellingPracticeCard source",
  );
  assertIncludes(
    cardSource,
    "Open practice",
    "DailySpellingPracticeCard source",
  );
}

function testLegacyPracticeAndAssignmentsRedirectsStayScoped() {
  const practicePage = readRepoFile("app/practice/page.tsx");
  const assignmentsPage = readRepoFile("app/assignments/page.tsx");

  for (const [label, source] of [
    ["/practice", practicePage],
    ["/assignments", assignmentsPage],
  ] as const) {
    assertIncludes(source, 'buildScopedPath("/learn/week", childId, "child")', label);
    assertIncludes(source, 'buildScopedPath("/dashboard", childId, "parent")', label);
    assertIncludes(source, "redirect(destination)", label);
    assertNotIncludes(source, "getDailySpellingPracticeReadModel", label);
    assertNotIncludes(source, "daily-spelling-practice-generation", label);
    assertNotIncludes(source, "service-role", label);
  }
}

function run() {
  testWeekPageReadsDailyPracticeWithoutGeneration();
  testPlannerAcceptsAndRendersDailyPracticeCard();
  testCardCopyAndBehaviorStayDisplayOnly();
  testLegacyPracticeAndAssignmentsRedirectsStayScoped();

  console.log("Daily spelling practice child card regression passed.");
}

run();
