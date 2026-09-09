import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { recordFingerprint, sha256 } from "./lib/whole-writing-g2-corpus";
import { CONTEXT_YOUR_TO_CANDIDATES_V2 } from "../lib/writing-engine/whole-writing/context-analyser-release";

type MutablePin = { fingerprint: string; manifestFingerprint: string; manifest: { releaseId: string }; sourceDependencies: Record<string, string>; lockedFiles: Record<string, string>; packageFingerprint: string };

const root = resolve(import.meta.dirname, "..");
const original = join(root, "data/whole-writing/g2-context-family-corpora");
const temp = mkdtempSync(join(tmpdir(), "s8-your-to-release-proof-"));
const corpus = join(temp, "corpus");
cpSync(original, corpus, { recursive: true });
const run = (args: string[], repository = root) => spawnSync(join(root, "node_modules/.bin/tsx"), [join(repository, "scripts/evaluate-whole-writing-g2-corpus.ts"), ...args], { cwd: repository, env: { ...process.env, G2_CORPUS_ROOT: corpus }, encoding: "utf8" });
const outputs = (directory: string): Record<string, string> => Object.fromEntries(readdirSync(directory, { recursive: true }).filter((f) => String(f).endsWith(".json")).map((f) => [String(f), sha256(readFileSync(join(directory, String(f))))]));
try {
  // Legacy executable/provenance still reproduce both locked reports exactly.
  const baseline = run([]); assert.equal(baseline.status, 2, baseline.stderr);
  for (const c of CONTEXT_YOUR_TO_CANDIDATES_V2) {
    const path = `reports/${c.manifest.familyKey}.evaluation.json`;
    assert.equal(readFileSync(join(corpus, path), "utf8"), readFileSync(join(original, path), "utf8"));
  }
  for (const c of CONTEXT_YOUR_TO_CANDIDATES_V2) {
    const flag = c.manifest.familyKey === "YOUR_YOURE" ? "--your-v2" : "--to-v2";
    const expectedExit = c.manifest.familyKey === "YOUR_YOURE" ? 0 : 2;
    const directory = join(corpus, "release-evaluations", c.manifest.releaseKey);
    const saved = outputs(directory);
    for (let i = 0; i < 2; i += 1) {
      const result = run([flag]); assert.equal(result.status, expectedExit, result.stderr); assert.deepEqual(outputs(directory), saved);
    }
    const pinPath = join(directory, "release.json"); const raw = readFileSync(pinPath, "utf8");
    for (const mutate of [
      (p: MutablePin) => { p.fingerprint = "stale"; },
      (p: MutablePin) => { p.manifestFingerprint = "stale"; p.fingerprint = recordFingerprint(p, "fingerprint"); },
      (p: MutablePin) => { p.manifest.releaseId = "unknown"; p.fingerprint = recordFingerprint(p, "fingerprint"); },
      (p: MutablePin) => { p.sourceDependencies["context-your-to-syntax-v2.ts"] = "tampered"; p.fingerprint = recordFingerprint(p, "fingerprint"); },
      (p: MutablePin) => { delete p.lockedFiles[`gold/${c.manifest.familyKey}.final-gold.jsonl`]; p.fingerprint = recordFingerprint(p, "fingerprint"); },
      (p: MutablePin) => { p.packageFingerprint = "stale"; p.fingerprint = recordFingerprint(p, "fingerprint"); },
    ]) {
      const pin = JSON.parse(raw); mutate(pin); writeFileSync(pinPath, JSON.stringify(pin));
      const result = run([flag]); assert.equal(result.status, 1, result.stdout + result.stderr);
      writeFileSync(pinPath, raw); assert.deepEqual(outputs(directory), saved, "Rejected pin must not replace evidence");
    }
    for (const relative of Object.keys(JSON.parse(raw).lockedFiles)) {
      const file = join(corpus, relative); const originalBytes = readFileSync(file);
      writeFileSync(file, Buffer.concat([originalBytes, Buffer.from("\n")]));
      const result = run([flag]); assert.equal(result.status, 1, relative);
      writeFileSync(file, originalBytes); assert.deepEqual(outputs(directory), saved);
    }
  }
  // Tamper the executable/helper only inside a disposable repository copy.
  const isolated = join(temp, "repository"); mkdirSync(isolated);
  cpSync(join(root, "lib"), join(isolated, "lib"), { recursive: true });
  cpSync(join(root, "scripts/lib"), join(isolated, "scripts/lib"), { recursive: true });
  cpSync(join(root, "scripts/evaluate-whole-writing-g2-corpus.ts"), join(isolated, "scripts/evaluate-whole-writing-g2-corpus.ts"));
  cpSync(join(root, "package.json"), join(isolated, "package.json"));
  const migration = "supabase/migrations/20260907120000_add_whole_writing_context_validation.sql";
  mkdirSync(dirname(join(isolated, migration)), { recursive: true }); cpSync(join(root, migration), join(isolated, migration));
  symlinkSync(join(root, "node_modules"), join(isolated, "node_modules"));
  const helper = join(isolated, "lib/writing-engine/whole-writing/context-your-to-syntax-v2.ts");
  writeFileSync(helper, readFileSync(helper, "utf8") + "\n// source tamper proof\n");
  for (const flag of ["--your-v2", "--to-v2"]) { const result = run([flag], isolated); assert.equal(result.status, 1); assert.match(result.stderr, /Candidate analyser source mismatch/); }
  assert.equal(run(["--your-v2", "--to-v2"]).status, 1);
  console.log("S8 YOUR/TO V2 evaluation: exact V1 reports, repeated byte-identical V2 outputs, pin/dependency/locked-input/source tampering and isolated cleanup passed.");
} finally { rmSync(temp, { recursive: true, force: true }); }
