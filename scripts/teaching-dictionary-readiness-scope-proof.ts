/** Read-only integration proof against an explicitly configured database. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadLessonReadiness } from "../lib/teaching-dictionary-manager/lesson-preflight";

async function main() {
  if (!process.argv.includes("--live-readonly")) {
    throw new Error("Pass --live-readonly with an explicitly configured database");
  }
  const all = await loadLessonReadiness();
  const scopes: Parameters<typeof loadLessonReadiness>[0][] = [
    { wordId: "2b11de62-dad4-5b67-aba4-585ddfd7253d" },
    { wordId: "3729b83b-98b8-5ede-8db3-67150a8e1364" },
    { routeId: "dynamic_prefix_word_lab", microSkillKey: "D4_MOR_PREFIXES_UN" },
  ];
  for (const routeId of ["compound_word_lab", "ing_endings_word_lab", "homophone_word_lab", "comparative_superlative_word_lab"]) {
    const row = all.find(row => row.routeId === routeId);
    assert(row, `Missing registered route: ${routeId}`);
    scopes.push({ routeId, microSkillKey: row.microSkillKey });
  }
  const results = [];
  for (const scope of scopes) {
    const scoped = await loadLessonReadiness(scope);
    assert(scoped.length > 0);
    for (const row of scoped) {
      const expected = all.find(candidate => candidate.routeId === row.routeId && candidate.microSkillKey === row.microSkillKey);
      assert(expected);
      assert.deepEqual(row, expected, `${row.routeId}:${row.microSkillKey} must preserve the entire group and compiler result`);
    }
    results.push({ scope, groups: scoped.map(row => ({
      route: row.routeId, skill: row.microSkillKey, members: row.words.length,
      compilerReady: row.compilerReady, fingerprint: row.preflightFingerprint,
    })) });
  }
  mkdirSync(".tmp", { recursive: true });
  writeFileSync(".tmp/word-performance-equivalence.json", JSON.stringify({ passed: true, results }, null, 2));
  console.log("PASS: scoped readiness matches full registry readiness for every built route kind, including every member, review, compiler witness, activation and fingerprint");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
