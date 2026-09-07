import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { runBaseline, type BaselineCase } from "../lib/writing-engine/baseline/analyse";
import { writingBaselineCases } from "./fixtures/writing-baseline-cases";

// No env files, credentials, network calls, database clients or file writes.
// Detailed output is deliberately opt-in because input may be private writing.
try {
  const args = process.argv.slice(2);
  let inputPath: string | undefined;
  let details = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--details") details = true;
    else if (args[index] === "--input" && args[index + 1] && !args[index + 1].startsWith("--")) inputPath = args[++index];
    else throw new Error("Usage: tsx scripts/writing-baseline.ts [--input cases.json] [--details]");
  }
  const cases: BaselineCase[] = inputPath ? JSON.parse(readFileSync(inputPath, "utf8")) : writingBaselineCases;
  const reports = runBaseline(cases);
  let checkoutRevision: string | null = null;
  try { checkoutRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* Exported trees may have no Git metadata. */ }
  const summaries = reports.map((report, index) => ({ caseIndex: index, ...report.summary }));
  console.log(JSON.stringify({
    mode: "OFFLINE_READ_ONLY",
    corpus: inputPath ? "supplied_sparse_labels" : "synthetic_acceptance_controls",
    coverage: "low_level_spelling_detector_and_pure_authentic_use_extractor_only",
    checkoutRevision,
    limitations: ["No canonical mapping database or full live analysis pipeline", "All context NOT_ASSESSED; no Authentic Use qualification", "No finding is not a validity judgment", "Timing excludes module loading and cold index construction", "Checkout revision does not identify uncommitted dependency edits"],
    summaries,
    ...(details ? { reports } : {}),
  }, null, 2));
} catch (error) {
  // JSON parse errors can include raw learner text; do not echo their message.
  console.error(error instanceof SyntaxError ? "Invalid input JSON" : error instanceof Error ? error.message : "Baseline failed");
  process.exitCode = 1;
}
