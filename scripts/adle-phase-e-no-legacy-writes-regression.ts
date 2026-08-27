import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const runtimeRoots = ["app", "components", "lib"] as const;
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

function runtimeFiles(directory: string): string[] {
  const absolute = resolve(root, directory);
  return readdirSync(absolute).flatMap((entry) => {
    const path = resolve(absolute, entry);
    if (statSync(path).isDirectory()) return runtimeFiles(relative(root, path));
    const extension = path.slice(path.lastIndexOf("."));
    return extensions.has(extension) ? [relative(root, path)] : [];
  });
}

const files = runtimeRoots.flatMap(runtimeFiles).sort();
const sourceByPath = new Map(
  files.map((path) => [path, readFileSync(resolve(root, path), "utf8")]),
);

type InventoryRule = Readonly<{
  token: RegExp;
  allowedPaths: readonly string[];
}>;

const baselineRules: Record<string, InventoryRule> = {
  ensureAdleDailyPlan: {
    token: /\bensureAdleDailyPlan\b/,
    allowedPaths: ["lib/adle/loaders/daily-plan-surface.ts"],
  },
  persistComposedAdleDailyPlan: {
    token: /\bpersistComposedAdleDailyPlan\b/,
    allowedPaths: [
      "app/learn/week/adle/closed-compounds/actions.ts",
      "lib/adle/loaders/compound-word-assignment-loader.ts",
      "lib/adle/loaders/daily-plan-surface.ts",
      "lib/adle/morphology/dynamic-affix-assignment-writer.ts",
      "lib/adle/morphology/dynamic-prefix-assignment-writer.ts",
      "lib/adle/today-assignment-service.ts",
    ],
  },
  genericSnapshotV2Writer: {
    token: /persist_adle_generic_daily_plan_v2/,
    allowedPaths: ["lib/adle/loaders/daily-plan-surface.ts"],
  },
  snapshotNullWriter: {
    token: /persist_adle_composed_daily_plan_v1/,
    allowedPaths: ["lib/adle/loaders/daily-plan-surface.ts"],
  },
  specialistChildRollout: {
    token: /ADLE_SPECIALIST_SNAPSHOT_V3_(?:WRITER_MODE|CURRENT_LEARNER_CHILD_ID)/,
    allowedPaths: ["lib/adle/composable-lesson/specialist-snapshot-writer-rollout.ts"],
  },
  genericChildRollout: {
    token: /ADLE_GENERIC_SNAPSHOT_V3_(?:WRITER_MODE|CURRENT_LEARNER_CHILD_ID)/,
    allowedPaths: ["lib/adle/composable-lesson/generic-snapshot-writer-rollout.ts"],
  },
  retiredClosedCompoundCreation: {
    token: /createClosedCompoundAssignmentAction|buildClosedCompoundAssignmentPlan/,
    allowedPaths: [
      "app/learn/week/adle/closed-compounds/actions.ts",
      "app/learn/week/adle/closed-compounds/page.tsx",
      "lib/adle/morphology/closed-compound-assignment-plan.ts",
      "lib/adle/today-assignment-service.ts",
    ],
  },
};

const inventory = Object.fromEntries(
  Object.entries(baselineRules).map(([name, rule]) => {
    const matches = files.filter((path) => rule.token.test(sourceByPath.get(path) ?? ""));
    const unexpectedPaths = matches.filter((path) => !rule.allowedPaths.includes(path));
    assert.deepEqual(
      unexpectedPaths,
      [],
      `${name} escaped its frozen Phase E baseline allow-list`,
    );
    return [name, { matches, unexpectedPaths }];
  }),
);

const childRoute = sourceByPath.get("app/learn/week/adle/page.tsx") ?? "";
assert.doesNotMatch(childRoute, /ensureAdleDailyPlan|persistComposedAdleDailyPlan/);

process.stdout.write(`${JSON.stringify({
  contractVersion: "adle_phase_e_no_legacy_writes_baseline_v1",
  runtimeFileCount: files.length,
  inventory,
  childRouteReadOnly: true,
}, null, 2)}\n`);
