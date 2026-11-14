import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import type { IngDictionaryWordV1 } from "@/lib/adle/ing/contracts";
import { stagingIngReviewExportRows } from "@/lib/teaching-dictionary-manager/ing-review-export";
import { buildLessonPoolWorkbook, readReviewWorkbook } from "@/lib/teaching-dictionary-manager/review-workbook";

const skill = "D4_INF_ING_ENDINGS_REGULAR";
function member(word: string, senseId?: string): IngDictionaryWordV1 {
  return {
    canonicalWordId: word, microSkillKey: skill, senseId, word, base: word.slice(0, -3),
    meaning: "Published meaning", dictationSentence: `I am ${word}.`, audioText: `I am ${word}.`,
    rowStatus: "active", reviewStatus: "approved_for_first_exposure",
    reviewerRef: null, approvalRef: null, sourceRefs: [],
  };
}
const noBlockers = { blockerDetails: [] };
const current = [member("cleaning", "cleaning-verb"), member("asking"), member("walking", "walking-verb"),
  member("jumping"), member("scrolling", "scrolling-verb")];

async function main() {
  const rows = stagingIngReviewExportRows({ current, reviewWords: [
    { wordId: "asking", displayWord: "asking", status: noBlockers,
      overviewCandidate: { issues: [{ message: "Add a reviewed meaning." }] } },
    { wordId: "walking", displayWord: "walking", status: noBlockers, familyMeaningReview: "walk" },
    { wordId: "jumping", displayWord: "jumping", status: { blockerDetails: [
      { code: "WORD_PREFLIGHT_BLOCKED", gate: "content", message: "Fix the example sentence." },
    ] } },
    { wordId: "scrolling", displayWord: "scrolling", status: noBlockers },
    { wordId: "sorting", displayWord: "sorting", status: noBlockers,
      generatedIng: { issues: [{ message: "Add a reviewed sentence." }] } },
  ] });
  assert.deepEqual(rows.map(row => row.wordId), ["jumping", "scrolling", "sorting", "walking"]);
  assert.equal(rows[0].note, "Active in the live lesson pool. Fix the example sentence.");
  assert.match(rows[1].note, /Active.*Recheck the approval/);
  assert.equal(rows[2].note, "Add a reviewed sentence.");
  assert.match(rows[3].note, /Active.*family meaning for “walk” changed/);

  const bytes = await buildLessonPoolWorkbook("Regular -ing", current);
  const buffer = Uint8Array.from(bytes).buffer;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.getWorksheet("Active lesson pool")!;
  assert.deepEqual(sheet.getRows(3, current.length)!.map(row => [row.getCell(1).text, row.getCell(2).text]),
    ["asking", "cleaning", "jumping", "scrolling", "walking"].map(word => [word, "Active"]));
  await assert.rejects(readReviewWorkbook(buffer, skill), /Use the review workbook/);
  console.log("Staging review and full lesson pool exports passed.");
}

void main();
