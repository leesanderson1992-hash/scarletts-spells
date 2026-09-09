import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CONTEXT_V3_CANDIDATES } from "../lib/writing-engine/whole-writing/context-analyser-release";
import type { ContextFamilyKey } from "../lib/writing-engine/whole-writing/context";
import { readJsonLines, sha256 } from "./lib/whole-writing-g2-corpus";
import {
  evaluateOrdinaryWritingV3,
  type OrdinaryWritingV3Case,
  type OrdinaryWritingV3Gold,
} from "./lib/whole-writing-v3-ordinary-evaluation";

const familyArg = process.argv.find((argument) => argument.startsWith("--family="))?.slice("--family=".length) as ContextFamilyKey | undefined;
assert(familyArg, "Use --family=THERE_THEIR_THEYRE|YOUR_YOURE|TO_TOO_TWO|ITS_ITS");
const candidate = CONTEXT_V3_CANDIDATES.find((row) => row.manifest.familyKey === familyArg);
assert(candidate, `Unknown V3 family: ${familyArg}`);
const root = process.env.S8_V3_EVALUATION_ROOT ?? "data/whole-writing/v3-ordinary-writing-evaluation";
const candidatePath = join(root, "candidates", `${familyArg}.jsonl`);
const goldPath = join(root, "gold", `${familyArg}.final-gold.jsonl`);
const cases = readJsonLines<OrdinaryWritingV3Case>(candidatePath);
const gold = readJsonLines<OrdinaryWritingV3Gold>(goldPath);
const corpusFingerprint = sha256(Buffer.concat([readFileSync(candidatePath), readFileSync(goldPath)]));
const report = evaluateOrdinaryWritingV3({
  family: familyArg,
  cases,
  gold,
  analyser: candidate.analyse,
  releaseFingerprint: candidate.fingerprint,
  corpusFingerprint,
});

if (process.argv.includes("--write")) {
  const reportRoot = join(root, "reports", candidate.manifest.releaseKey);
  mkdirSync(reportRoot, { recursive: true });
  writeFileSync(join(reportRoot, `${familyArg}.evaluation.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
}
console.log(JSON.stringify(report, null, 2));
if (report.disposition !== "PASS_REVIEWABLE_NOT_PUBLISHED") process.exitCode = 1;
