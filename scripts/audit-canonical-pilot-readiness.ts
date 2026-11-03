/** Validate every reviewed pilot row with the publication contract before rollout. */
import { readFileSync } from "node:fs";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";
import { publicationBlockers } from "../lib/teaching-dictionary-manager/contracts";

const path = "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv";
const rows = parseDictionaryCsv(readFileSync(path, "utf8"));
const report = rows.map((row) => ({ word: row.normalisedWord,
  parseError: row.error ?? null,
  blockers: publicationBlockers(row.payload, row.normalisedWord, { requireCanonicalParts: true }) }));
console.log(JSON.stringify(report, null, 2));
if (rows.length !== 14 || report.some((row) => row.parseError || row.blockers.length))
  process.exitCode = 1;
