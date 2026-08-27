import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const extensions = /\.(?:ts|tsx|js|jsx)$/;
const candidates = [
  "components/adle/activities/morphology/shared/morphology-primitives",
  "components/adle/experience/activity-frame",
  "components/adle/interactions/selectable-item",
] as const;

function filesBelow(directory: string): string[] {
  const absolute = resolve(root, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((entry) => {
    const path = resolve(absolute, entry);
    return statSync(path).isDirectory()
      ? filesBelow(relative(root, path))
      : extensions.test(path) ? [relative(root, path)] : [];
  });
}

const runtimeFiles = ["app", "components", "lib"].flatMap(filesBelow).sort();
const canonicalHostFiles = ["components/adle/activities/canonical-renderer-registry.tsx"];
const specialistRendererFiles = [
  "components/adle/morphology/base-word-family-guided-lesson.tsx",
  "components/adle/morphology/closed-compound-guided-lesson.tsx",
  "components/adle/morphology/morphology-guided-lesson.tsx",
];
const historicalReaderFiles = [
  "components/adle-session-runner.tsx",
  "lib/adle/composable-lesson/generic-snapshot-reader.ts",
  "lib/adle/composable-lesson/route-resolution.ts",
  "lib/adle/generic-activity-compatibility.ts",
  "lib/adle/loaders/daily-plan-surface.ts",
];

function importsCandidate(path: string, candidate: string): boolean {
  const source = readFileSync(resolve(root, path), "utf8");
  const basename = candidate.slice(candidate.lastIndexOf("/") + 1);
  return new RegExp(`(?:from\\s+|import\\s*\\()(["'][^"']*(?:${candidate}|${basename})["'])`).test(source);
}

const proof = candidates.map((candidate) => {
  const sourcePath = `${candidate}.tsx`;
  assert.equal(existsSync(resolve(root, sourcePath)), false, `${sourcePath} must be deleted`);
  const runtimeImports = runtimeFiles.filter((path) => importsCandidate(path, candidate));
  const canonicalHostImports = canonicalHostFiles.filter((path) => importsCandidate(path, candidate));
  const specialistRendererImports = specialistRendererFiles.filter((path) => importsCandidate(path, candidate));
  const historicalReaderImports = historicalReaderFiles.filter((path) => importsCandidate(path, candidate));
  assert.deepEqual(runtimeImports, [], `${candidate} still has a Production runtime import`);
  assert.deepEqual(canonicalHostImports, [], `${candidate} is still used by CanonicalActivityHost`);
  assert.deepEqual(specialistRendererImports, [], `${candidate} is still used by a current specialist renderer`);
  assert.deepEqual(historicalReaderImports, [], `${candidate} is still used by a historical reader`);
  return { candidate, runtimeImports, canonicalHostImports, specialistRendererImports, historicalReaderImports };
});

process.stdout.write(`${JSON.stringify({
  contractVersion: "adle_phase_e_e3_runtime_import_proof_v1",
  runtimeFileCount: runtimeFiles.length,
  proof,
}, null, 2)}\n`);
