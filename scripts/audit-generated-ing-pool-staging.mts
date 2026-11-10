/** Read-only audit of the canonical -ing pool. Run with react-server conditions. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { ING_MICRO_SKILLS } from "../lib/adle/ing/contracts";
import { previewIngOverviewRelease } from "../lib/teaching-dictionary-manager/ing-overview-release-preview";

process.loadEnvFile(".env.staging.local");
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0],
  "qkpjbajicacbrphthibk");
assert.equal(new URL(process.env.SUPABASE_STAGING_DB_URL ?? "").username.split(".").at(-1),
  "qkpjbajicacbrphthibk");
process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "staging";

const { loadLessonReadiness } = await import("../lib/teaching-dictionary-manager/lesson-preflight");
const { loadRouteWordStatuses } = await import("../lib/teaching-dictionary-manager/route-word-status-service");
const lessons = await loadLessonReadiness({ routeId: "ing_endings_word_lab" });
const audits = await Promise.all(ING_MICRO_SKILLS.map(async skill => {
  const lesson = lessons.find(row => row.routeId === "ing_endings_word_lab" && row.microSkillKey === skill);
  assert(lesson, `LESSON_MISSING:${skill}`);
  const result = await loadRouteWordStatuses({ routeId: "ing_endings_word_lab",
    microSkillKey: skill, lesson });
  return { skill, result };
}));
const report = audits.map(({ skill, result }) => ({
  skill, associated: result.counts.candidates,
  overviewReady: result.words.filter(row => row.overviewCandidate?.status === "ready").length,
  generated: result.counts.generatedReadyIng,
  approvedGenerated: result.counts.approvedGeneratedIng,
  requiredForPool: 6,
}));
const pool = previewIngOverviewRelease(audits.flatMap(({ result }) =>
  result.words.flatMap(row => row.approvedIngWord ? [row.approvedIngWord] : [])),
  "staging:ing:overview-preview");
const rows = audits.flatMap(({ skill, result }) => result.words.map(row => {
  const issues = [...new Map([...(row.overviewCandidate?.issues ?? []),
    ...(row.generatedIng?.issues ?? [])].map(issue => [issue.code, issue])).values()];
  return {
  word: row.displayWord, skill, senseId: row.selectedSenseId ?? "",
  meaning: row.selectedSenseDefinition ?? "",
  overviewStatus: row.overviewCandidate?.status ?? "unavailable",
  recipeStatus: row.generatedIng?.status ?? "unavailable",
  approvedForPool: Boolean(row.approvedIngWord),
  missingFacts: issues.map(issue => issue.code).join("; "),
  missingFactDetails: issues.map(issue => issue.message).join("; "),
  repairTargets: issues.map(issue => issue.href).join("; "),
  reviewUrl: `/admin/teaching-dictionary/${row.wordId}`,
  };
}));
const output = process.argv.find(arg => arg.startsWith("--csv="))?.slice(6);
if (output) {
  const columns = ["word", "skill", "senseId", "meaning", "overviewStatus", "recipeStatus",
    "approvedForPool", "missingFacts", "missingFactDetails", "repairTargets", "reviewUrl"] as const;
  const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  writeFileSync(output, [columns.join(","), ...rows.map(row => columns.map(column => csv(row[column])).join(","))].join("\n") + "\n");
}
console.log(JSON.stringify({ environment: "staging", report, reviewRows: rows.length,
  csvWritten: Boolean(output), pool: pool.status === "ready"
    ? { status: pool.status, packageSha256: pool.package.packageSha256, counts: pool.counts }
    : { status: pool.status, missing: pool.missing, counts: pool.counts } }));
