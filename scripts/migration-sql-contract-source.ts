import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const activeBaselinePath =
  "supabase/migrations/20260525123937_baseline_current_production_schema.sql";
const archiveDirectory = "supabase/migrations_archive/pre_baseline_2026_05";

export function readArchivedMigrationOrActiveBaseline(filename: string): string {
  const paths = [`${archiveDirectory}/${filename}`, activeBaselinePath];
  const path = paths.find((candidate) => existsSync(candidate));

  assert.ok(
    path,
    `Expected SQL contract source in active baseline or archive for ${filename}.`,
  );

  return readFileSync(path, "utf8");
}
