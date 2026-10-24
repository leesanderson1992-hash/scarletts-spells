/** Record the owner's reviewed dictionary/structure/family decisions.
 * Lesson copy and redirects retain their independent review gates. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseCsv, stringifyCsv } from "./teaching-dictionary-release-contract";

const root = resolve("data/adle/homophone/convergence-v1");
const approval = "Katie Sanderson approval in Codex chat, 2026-10-23: reviewed dictionary facts, canonical structure, base families and memberships; canonical package 2026-10-23-reviewed-root-homophone-words-v2";

async function edit(name: string, count: number, update: (row: Record<string,string>) => void) {
  const file = resolve(root, name);
  const original = await readFile(file, "utf8");
  const headers = original.slice(0, original.indexOf("\n")).replace(/\r$/, "").split(",");
  const rows = parseCsv(original);
  if (rows.length !== count) throw new Error(`${name}: expected ${count}, saw ${rows.length}`);
  for (const row of rows) update(row);
  await writeFile(file, stringifyCsv(headers, rows));
}

async function main() {
await edit("dictionary-intake-review.csv", 38, row => {
  row.source_importability_status = "importable";
  row.source_legal_review_status = "not_required";
  row.reviewed_by = "Katie Sanderson";
  row.reviewed_at = "2026-10-23";
  row.review_status = "approved_for_first_exposure";
  row.structure_review_status = "approved";
  row.family_review_status = "approved";
  row.content_approval_reference = approval;
  if (row.word === "precede") row.dictation_target_index = "3";
});
await edit("incoming-canonical-structure-review.csv", 38, row => {
  row.structure_review_status = "approved";
  row.family_review_status = "approved";
  row.content_approval_reference = approval;
  if (row.word === "precede") row.dictation_target_index = "3";
});
await edit("incoming-lexical-base-families-review.csv", 38, row => {
  row.structure_review_status = "approved";
  row.reviewed_by = "Katie Sanderson";
  row.approval_reference = approval;
});
await edit("incoming-lexical-base-family-members-review.csv", 38, row => {
  row.structure_review_status = "approved";
  row.reviewed_by = "Katie Sanderson";
  row.approval_reference = approval;
});
await edit("incoming-missing-base-and-expansion-words-review.csv", 5, row => {
  row.review_status = "approved_for_first_exposure";
});
console.log("Recorded approval for 38 dictionary rows, 38 structures, 38 families, 38 memberships and five canonical dependencies.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
