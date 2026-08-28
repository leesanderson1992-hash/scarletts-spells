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
    allowedPaths: [],
  },
  persistComposedAdleDailyPlan: {
    token: /\bpersistComposedAdleDailyPlan\b/,
    allowedPaths: [],
  },
  genericSnapshotV2Writer: {
    token: /persist_adle_generic_daily_plan_v2/,
    allowedPaths: [],
  },
  snapshotNullWriter: {
    token: /persist_adle_composed_daily_plan_v1/,
    allowedPaths: [],
  },
  specialistChildRollout: {
    token: /ADLE_SPECIALIST_SNAPSHOT_V3_(?:WRITER_MODE|CURRENT_LEARNER_CHILD_ID)/,
    allowedPaths: [],
  },
  genericChildRollout: {
    token: /ADLE_GENERIC_SNAPSHOT_V3_(?:WRITER_MODE|CURRENT_LEARNER_CHILD_ID)/,
    allowedPaths: [],
  },
  retiredClosedCompoundCreation: {
    token: /createClosedCompoundAssignmentAction|buildClosedCompoundAssignmentPlan/,
    allowedPaths: [],
  },
  dailySpellingPracticeWriter: {
    token: /generateDailySpellingPracticeAssignment|runDailySpellingPracticeMaterialization|createDailySpellingPracticeAssignment|updateDailySpellingPracticeSourceItems/,
    allowedPaths: [],
  },
  genericSnapshotV2CompilerRuntimeImport: {
    token: /(?:from|import\()\s*["'][^"']*generic-snapshot-compiler["']/,
    allowedPaths: [],
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

const currentWriters = [
  "lib/adle/loaders/base-word-family-pilot-loader.ts",
  "lib/adle/loaders/compound-word-assignment-loader.ts",
  "lib/adle/morphology/dynamic-affix-assignment-writer.ts",
  "lib/adle/morphology/dynamic-prefix-assignment-writer.ts",
] as const;
for (const writerPath of currentWriters) {
  const writer = sourceByPath.get(writerPath) ?? "";
  assert.match(writer, /persistSpecialistSnapshotV3/);
  assert.doesNotMatch(writer, /persistComposedAdleDailyPlan|persist_adle_composed_daily_plan_v1/);
}
const todayWriter = sourceByPath.get("lib/adle/today-assignment-service.ts") ?? "";
assert.match(todayWriter, /compileAndPersistGuardedGenericSnapshotV3/);
assert.doesNotMatch(todayWriter, /configuredProductionGenericSnapshotV3Writer|persistComposedAdleDailyPlan/);
assert.match(
  sourceByPath.get("lib/adle/composable-lesson/generic-snapshot-v3-persistence.ts") ?? "",
  /persist_adle_generic_daily_plan_v3/,
);
assert.match(
  sourceByPath.get("lib/adle/composable-lesson/specialist-snapshot-v3-persistence.ts") ?? "",
  /persist_adle_specialist_daily_plan_v3/,
);

const vercelConfiguration = readFileSync(resolve(root, "vercel.json"), "utf8");
assert.doesNotMatch(vercelConfiguration, /daily-spelling-practice\/generate/);

for (const protectedPath of [
  "app/dashboard/todays-adle-actions.ts",
  "app/learn/week/todays-adle-action.ts",
  "lib/rewards/read-model.ts",
  "lib/rewards/word-treasures.ts",
]) {
  assert.doesNotMatch(
    sourceByPath.get(protectedPath) ?? "",
    /daily-spelling-practice-(?:generation|materialization|planner)/,
    `${protectedPath} must remain independent of the retired writer`,
  );
}

const historicalReaderContracts = {
  genericReader: sourceByPath.get("lib/adle/composable-lesson/generic-snapshot-reader.ts") ?? "",
  dailyPlanSurface: sourceByPath.get("lib/adle/loaders/daily-plan-surface.ts") ?? "",
  routeResolution: sourceByPath.get("lib/adle/composable-lesson/route-resolution.ts") ?? "",
  compatibility: sourceByPath.get("lib/adle/generic-activity-compatibility.ts") ?? "",
  rendererRegistry: sourceByPath.get("components/adle/activities/canonical-renderer-registry.tsx") ?? "",
  baseWordLoader: sourceByPath.get("lib/adle/loaders/base-word-family-pilot-loader.ts") ?? "",
  morphologyResume: sourceByPath.get("lib/adle/morphology/resume.ts") ?? "",
};
assert.match(historicalReaderContracts.genericReader, /source: "snapshot_absent"/);
assert.match(historicalReaderContracts.genericReader, /source: "snapshot_v2"/);
assert.match(historicalReaderContracts.dailyPlanSurface, /resolveGenericLessonSnapshot/);
assert.match(historicalReaderContracts.routeResolution, /resolveLegacy/);
assert.match(historicalReaderContracts.compatibility, /key === "REVIEW_QUICK_SORT"/);
assert.match(historicalReaderContracts.compatibility, /key === "CONTROLLED_SPELLING"/);
assert.match(historicalReaderContracts.compatibility, /MUST_USE_FREEWRITING/);
assert.match(historicalReaderContracts.rendererRegistry, /CompatibilityNoop/);
assert.match(historicalReaderContracts.baseWordLoader, /complete_adle_base_word_family_pilot_v2/);
assert.match(historicalReaderContracts.morphologyResume, /Keep the legacy v1 key stable/);

const r8Authorities = [
  "lib/adle/canonical-intake/exact-id-handoff.ts",
  "lib/adle/canonical-intake/downstream-reconciliation.ts",
  "lib/adle/canonical-intake/governed-source-continuation.ts",
] as const;
for (const authorityPath of r8Authorities) {
  assert.ok(sourceByPath.has(authorityPath), `${authorityPath} must remain a current R8 authority`);
}
const stageFReplay = readFileSync(
  resolve(root, "scripts/returned-correction-stage-f-deferred-route-replay.ts"),
  "utf8",
);
assert.match(stageFReplay, /continueResolvedHistoricalOccurrence/);
assert.match(
  sourceByPath.get("lib/adle/canonical-intake/governed-source-continuation.ts") ?? "",
  /materialize_resolved_stage_f_spelling_occurrence_source/,
);

process.stdout.write(`${JSON.stringify({
  contractVersion: "adle_phase_e_no_legacy_writes_v3_only_r8_preserved_v3",
  runtimeFileCount: files.length,
  inventory,
  childRouteReadOnly: true,
  dailySpellingPracticeWriterRetired: true,
  everyForwardLessonWriterSnapshotsV3: true,
  historicalReadersPreserved: true,
  r8AuthoritiesPreserved: true,
}, null, 2)}\n`);
