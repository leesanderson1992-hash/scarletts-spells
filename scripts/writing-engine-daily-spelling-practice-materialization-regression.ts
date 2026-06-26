import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function assertIncludes(source: string, expected: string, label: string) {
  assert.ok(
    source.includes(expected),
    `${label} should include ${JSON.stringify(expected)}.`,
  );
}

function assertNotIncludes(source: string, forbidden: string, label: string) {
  assert.ok(
    !source.includes(forbidden),
    `${label} should not include ${JSON.stringify(forbidden)}.`,
  );
}

function assertMatches(source: string, pattern: RegExp, label: string) {
  assert.match(source, pattern, `${label} did not match ${pattern}.`);
}

function assertNoForbiddenWrites(source: string, label: string) {
  const forbiddenPatterns = [
    /\.from\("learning_item_evidence"\)\s*\.\s*(insert|update|upsert|delete)/,
    /\.from\("learning_items"\)\s*\.\s*(insert|update|upsert|delete)/,
    /\.from\("practice_attempts"\)\s*\.\s*(insert|update|upsert|delete)/,
    /\.from\("writing_issues"\)\s*\.\s*(insert|update|upsert|delete)/,
    /\.from\("spelling_reward_states"\)\s*\.\s*(insert|update|upsert|delete)/,
    /\.from\("spelling_reward_events"\)\s*\.\s*(insert|update|upsert|delete)/,
    /\.from\("child_gold_coin_ledger_events"\)\s*\.\s*(insert|update|upsert|delete)/,
    /\.from\("gold_coin_transfer_requests"\)\s*\.\s*(insert|update|upsert|delete)/,
    /\.from\("spelling_canonical_mappings"\)\s*\.\s*(insert|update|upsert|delete)/,
    /\.from\("micro_skill_catalog"\)\s*\.\s*(insert|update|upsert|delete)/,
    /\.from\("task_completions"\)\s*\.\s*(insert|update|upsert|delete)/,
    /\.from\("task_submissions"\)\s*\.\s*(insert|update|upsert|delete)/,
    /maybeAward/,
    /spelling_reward/i,
    /gold_coin/i,
    /daily_assignments"\)\s*\.\s*update\(\{\s*status/,
  ];

  forbiddenPatterns.forEach((pattern) => {
    assert.doesNotMatch(source, pattern, `${label} must not match ${pattern}.`);
  });
}

function assertCronConfig() {
  const vercelPath = join(repoRoot, "vercel.json");
  assert.ok(existsSync(vercelPath), "vercel.json should exist.");

  const config = JSON.parse(readFileSync(vercelPath, "utf8")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  const cron = config.crons?.find(
    (entry) => entry.path === "/api/internal/daily-spelling-practice/generate",
  );

  assert.ok(cron, "Daily spelling practice cron should be configured.");
  assert.equal(cron?.schedule, "15 6 * * *");
}

function assertRouteAuthAndBoundary() {
  const source = readRepoFile(
    "app/api/internal/daily-spelling-practice/generate/route.ts",
  );

  assertIncludes(source, "runtime = \"nodejs\"", "cron route");
  assertIncludes(source, "dynamic = \"force-dynamic\"", "cron route");
  assertIncludes(source, "process.env.CRON_SECRET", "cron route");
  assertIncludes(source, "authorization", "cron route");
  assertIncludes(source, "bearer", "cron route");
  assertIncludes(source, "timingSafeEqual", "cron route");
  assertIncludes(source, "createServiceRoleClient", "cron route");
  assertIncludes(
    source,
    "runDailySpellingPracticeMaterialization",
    "cron route",
  );
  assertMatches(source, /status:\s*401/, "cron route should reject bad auth");
  assertMatches(source, /status:\s*500/, "cron route should fail closed without secret");
  assertIncludes(source, "Europe/London", "cron route");
  assertIncludes(source, "YYYY-MM-DD", "cron route");
  assertNoForbiddenWrites(source, "cron route");
}

function assertMaterializerBridge() {
  const source = readRepoFile(
    "lib/writing-practice/daily-spelling-practice-materialization.ts",
  );

  assertIncludes(source, "import \"server-only\"", "materializer");
  assertIncludes(
    source,
    "generateDailySpellingPracticeAssignment",
    "materializer",
  );
  assertIncludes(source, ".from(\"learning_items\")", "materializer");
  assertIncludes(source, ".eq(\"is_active\", true)", "materializer");
  assertIncludes(source, ".from(\"children\")", "materializer");
  assertIncludes(source, "is_archived !== true", "materializer");
  assertIncludes(source, "uniqueTargets", "materializer");
  assertIncludes(source, "selectedLearningItemCount", "materializer");
  assertIncludes(source, "appendedItemCount", "materializer");
  assertIncludes(source, "empty_plan", "materializer");
  assertIncludes(source, "blocked_closed_daily_assignment", "materializer");
  assertNoForbiddenWrites(source, "materializer");
}

function assertChildSurfacesStayReadOnly() {
  const childSurfaceFiles = [
    "app/learn/week/page.tsx",
    "app/learn/week/practice/page.tsx",
    "components/learn-week-planner.tsx",
    "components/daily-spelling-practice-viewer.tsx",
    "components/app-shell.tsx",
  ];

  childSurfaceFiles.forEach((path) => {
    const source = readRepoFile(path);
    assertNotIncludes(source, "daily-spelling-practice-generation", path);
    assertNotIncludes(source, "generateDailySpellingPracticeAssignment", path);
    assertNotIncludes(source, "createServiceRoleClient", path);
    assertNotIncludes(source, "daily-spelling-practice-materialization", path);
  });
}

function assertGenerationRemainsBounded() {
  const plannerSource = readRepoFile(
    "lib/writing-practice/daily-spelling-practice-planner.ts",
  );

  assertIncludes(plannerSource, "maxTotalItems: 6", "planner defaults");
  assertIncludes(plannerSource, "maxNewPracticeItems: 2", "planner defaults");
  assertIncludes(
    plannerSource,
    "maxAllowedNewPracticeItems: 3",
    "planner defaults",
  );
  assertIncludes(plannerSource, "dueReviewItems", "planner");
  assertIncludes(plannerSource, "selectedNewPracticeItems", "planner");
}

assertCronConfig();
assertRouteAuthAndBoundary();
assertMaterializerBridge();
assertChildSurfacesStayReadOnly();
assertGenerationRemainsBounded();

console.log("Daily spelling practice materialization regression passed.");
