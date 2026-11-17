import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import type { IngDictionaryWordV1 } from "@/lib/adle/ing/contracts";
import { prefillReviewWorkbookMeanings } from "@/lib/teaching-dictionary-manager/multi-sense-export";
import { ingReviewExportRows } from "@/lib/teaching-dictionary-manager/ing-review-export";
import { buildLessonPoolWorkbook, buildReviewWorkbook, readReviewWorkbook } from "@/lib/teaching-dictionary-manager/review-workbook";

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
  const rows = ingReviewExportRows({ current, reviewWords: [
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

  const mixed = ingReviewExportRows({ current, changes: [member("brushing", "verb")], reviewWords: [
    { wordId: "brushing", displayWord: "brushing", status: noBlockers, reviewRequested: true },
    { wordId: "asking", displayWord: "asking", status: noBlockers, reviewRequested: true,
      overviewCandidate: { issues: [{ message: "Approve the word parts." }] } },
  ] });
  assert.deepEqual(mixed.map(row => row.wordId), ["asking", "brushing"]);
  assert.match(mixed[0].note, /Approve the word parts/);
  assert.equal(mixed[1].note, "Ready to publish.");

  const reviewBytes = await buildReviewWorkbook({
    skill, title: "Regular -ing", notes: new Map(mixed.map(row => [row.wordId, row.note])),
    families: new Map(), requestedSenses: new Map([["asking", "asking-verb"]]),
    bundles: [{ wordId: "asking", displayWord: "asking", sourceSenseReviewedAt: "", analyses: [],
      senseSet: { pronunciations: [], senses: [
        { id: "asking-verb", definition: "Requesting something", partOfSpeech: "verb", pronunciationId: null },
        { id: "asking-noun", definition: "An act of requesting", partOfSpeech: "noun", pronunciationId: null },
      ] } }],
  });
  const reviewBook = new ExcelJS.Workbook();
  await reviewBook.xlsx.load(Uint8Array.from(reviewBytes).buffer);
  const reviewSheet = reviewBook.getWorksheet("Words to review")!;
  const choiceColumn = (reviewSheet.getRow(3).values as string[]).indexOf("Use in lesson");
  assert.deepEqual([4, 5].map(row => reviewSheet.getCell(row, choiceColumn).text), ["Yes", "Review"]);

  const meaningOptions = {
    select: () => meaningOptions, in: () => meaningOptions, is: () => meaningOptions, order: () => meaningOptions,
    range: async () => ({ error: null, data: [
      { canonical_word_id: "asking", definition: "Requesting information or help." },
      { canonical_word_id: "asking", definition: "Older definition." },
    ] }),
  };
  const notes = new Map<string, string>();
  const fallback = await prefillReviewWorkbookMeanings({
    from: () => meaningOptions,
  } as unknown as Parameters<typeof prefillReviewWorkbookMeanings>[0], [
    { wordId: "asking", displayWord: "asking", sourceSenseReviewedAt: "", analyses: [],
      senseSet: { pronunciations: [], senses: [
        { id: "review", definition: "", partOfSpeech: "", pronunciationId: null },
      ] } },
    { wordId: "brushing", displayWord: "brushing", sourceSenseReviewedAt: "2026-11-17T00:00:00Z", analyses: [],
      senseSet: { pronunciations: [], senses: [
        { id: "reviewed", definition: "Cleaning with a brush.", partOfSpeech: "verb", pronunciationId: null },
      ] } },
  ], notes);
  const fallbackBook = new ExcelJS.Workbook();
  const fallbackBytes = await buildReviewWorkbook({ skill, title: "Regular -ing", bundles: fallback, notes, families: new Map() });
  await fallbackBook.xlsx.load(Uint8Array.from(fallbackBytes).buffer);
  const fallbackSheet = fallbackBook.getWorksheet("Words to review")!;
  const columns = fallbackSheet.getRow(3).values as string[];
  assert.equal(fallbackSheet.getCell(4, columns.indexOf("Meaning")).text, "Requesting information or help.");
  assert.equal(fallbackSheet.getCell(4, columns.indexOf("Use in lesson")).text, "Review");
  assert.match(fallbackSheet.getCell(4, columns.indexOf("Needs review")).text, /copied from the word page/);
  assert.equal(fallbackSheet.getCell(5, columns.indexOf("Meaning")).text, "Cleaning with a brush.");

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
