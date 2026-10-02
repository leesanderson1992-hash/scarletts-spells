#!/usr/bin/env node

import fs from "node:fs/promises";

const [sourcePath, destinationPath, reviewer, reviewedAt] = process.argv.slice(2);
if (!sourcePath || !destinationPath || !reviewer || !/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt ?? "")) {
  throw new Error("Usage: approve-adle-comparative-dictionary-review.mjs <source.json> <approved.json> <reviewer> <YYYY-MM-DD>");
}

const workbook = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const expected = {
  "Canonical word review": 25,
  "Linguistic morphology & word sums": 25,
  "Dictation review": 25,
  "Sources & licence": 6,
};
for (const [sheet, count] of Object.entries(expected)) {
  const matrix = workbook[sheet];
  if (!Array.isArray(matrix) || matrix.length - 1 !== count) {
    throw new Error(`${sheet}: expected ${count} review rows`);
  }
  const headers = matrix[0];
  const index = (name) => headers.indexOf(name);
  if (index("reviewed_by") < 0 || index("reviewed_at") < 0) throw new Error(`${sheet}: missing provenance`);
  for (const row of matrix.slice(1)) {
    for (const [column, value] of row.entries()) {
      const field = headers[column];
      if (field === "analysis_status" || field === "final_decision" || field.endsWith("_review")) {
        if (value !== "in_review" && value !== "approved") throw new Error(`${sheet}: unexpected ${field}=${value}`);
        row[column] = "approved";
      }
    }
    row[index("reviewed_by")] = reviewer;
    row[index("reviewed_at")] = reviewedAt;
  }
}
const overview = workbook["Overview & instructions"];
const overviewByTopic = new Map(overview.slice(1).map((row) => [row[0], row]));
overviewByTopic.get("Candidate status")[1] = `${reviewer} approved the 25 factual entries, morphology, dictation and source-use review on ${reviewedAt}.`;
overviewByTopic.get("Pronunciation")[1] = "Approved including the adjective sense of close and six IPA/CMU syllable comparisons; preserve source evidence.";
overviewByTopic.get("Release")[1] = "Approved content only. Stage and verify the identical package before production; lesson activation is separate.";
await fs.writeFile(destinationPath, `${JSON.stringify(workbook)}\n`, "utf8");
console.log(JSON.stringify({ status: "approved_review_data", reviewer, reviewedAt, rows: expected }));
