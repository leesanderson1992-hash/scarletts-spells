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

const forbiddenRewardAndMasteryTerms = [
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

const forbiddenImports = [
  "service-role",
  "createServiceRole",
  "daily-spelling-practice-generation",
  "generateDailySpellingPracticeAssignment",
];

const forbiddenWritesAndTables = [
  ".insert(",
  ".update(",
  ".upsert(",
  ".delete(",
  ".rpc(",
  "assignment_items",
  "daily_assignments",
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

function testViewerRouteUsesReadModelOnly() {
  const routeSource = readRepoFile("app/learn/week/practice/page.tsx");

  assertIncludes(routeSource, "getDailySpellingPracticeReadModel", "viewer route");
  assertIncludes(
    routeSource,
    "buildMissingDailySpellingPracticeReadModel",
    "viewer route",
  );
  assertIncludes(routeSource, 'mode !== "child"', "viewer route");
  assertIncludes(
    routeSource,
    'buildScopedPath("/dashboard", resolvedSearchParams?.child, "parent")',
    "viewer route",
  );
  assertIncludes(
    routeSource,
    'buildScopedPath("/learn/week", selectedChild.id, "child")',
    "viewer route",
  );
  assertIncludes(routeSource, "DailySpellingPracticeViewer", "viewer route");
  assertIncludes(
    routeSource,
    "item.isSupportedForChildSurface",
    "viewer route",
  );

  for (const forbidden of forbiddenImports) {
    assertNotIncludes(routeSource, forbidden, "viewer route");
  }

  for (const forbidden of forbiddenWritesAndTables) {
    assertNotIncludes(routeSource, forbidden, "viewer route");
  }
}

function testViewerComponentIsLocalOnlyAndNeutral() {
  const viewerSource = readRepoFile("components/daily-spelling-practice-viewer.tsx");
  const readModelSource = readRepoFile(
    "lib/writing-practice/daily-spelling-practice-read-model.ts",
  );

  assertIncludes(viewerSource, '"use client";', "viewer component");
  assertIncludes(viewerSource, "useState", "viewer component");
  assertIncludes(viewerSource, "isSupportedForChildSurface", "viewer component");
  assertIncludes(
    readModelSource,
    'row.item_type === "controlled_spelling"',
    "read model supported item boundary",
  );
  assertIncludes(
    viewerSource,
    "This practice item is not ready here yet.",
    "viewer component unsupported copy",
  );
  assertIncludes(viewerSource, "Back to this week", "viewer component");
  assertIncludes(
    viewerSource,
    "Done for today",
    "viewer component",
  );
  assertIncludes(viewerSource, "<form action={completeAction}>", "viewer completion form");
  assertIncludes(viewerSource, 'name="dailyAssignmentId"', "viewer completion form");

  for (const forbidden of forbiddenImports) {
    assertNotIncludes(viewerSource, forbidden, "viewer component");
  }

  for (const forbidden of forbiddenWritesAndTables) {
    assertNotIncludes(viewerSource, forbidden, "viewer component");
  }

  for (const forbidden of forbiddenRewardAndMasteryTerms) {
    assertNotIncludes(viewerSource, forbidden, "viewer component");
  }
}

function testCardLinksOnlyWhenReadyAndSupported() {
  const plannerSource = readRepoFile("components/learn-week-planner.tsx");
  const cardSource = extractSourceBlock(
    plannerSource,
    "function DailySpellingPracticeCard",
    "export function LearnWeekPlanner",
  );

  assertIncludes(
    cardSource,
    'practice.state === "ready"',
    "daily practice card",
  );
  assertIncludes(cardSource, "supportedItemCount > 0", "daily practice card");
  assertIncludes(
    cardSource,
    'href={getDailyPracticeViewerPath(childId)}',
    "daily practice card",
  );
  assertIncludes(cardSource, "Open practice", "daily practice card");
}

function testLegacyPracticeAndAssignmentsStayRedirectOnly() {
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
    assertNotIncludes(source, "DailySpellingPracticeViewer", label);
    assertNotIncludes(source, "daily-spelling-practice-generation", label);
    assertNotIncludes(source, "service-role", label);
  }
}

function run() {
  testViewerRouteUsesReadModelOnly();
  testViewerComponentIsLocalOnlyAndNeutral();
  testCardLinksOnlyWhenReadyAndSupported();
  testLegacyPracticeAndAssignmentsStayRedirectOnly();

  console.log("Daily spelling practice viewer regression passed.");
}

run();
