import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildReviewWorkbook, readReviewWorkbook } from "../lib/teaching-dictionary-manager/review-workbook";
import { parseMultiSenseCsv, type MultiSenseCsvBundle } from "../lib/teaching-dictionary-manager/multi-sense-csv";

const skill = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const bundle = (word: string): MultiSenseCsvBundle => ({
  wordId: "", displayWord: word, sourceSenseReviewedAt: "",
  senseSet: { pronunciations: [{ id: "spoken", ipa: "/pleɪ/", spokenSyllableCount: 1, stressPattern: "primary" }],
    senses: [{ id: "verb", pronunciationId: "spoken", partOfSpeech: "verb", definition: "Take part in a game.",
      dictationSentence: `Please ${word} today.`, dictationTargetTokenIndex: 1 }] },
  analyses: [{ senseId: "verb", parts: [{ id: "base", kind: "base", sourceText: word, surfaceText: word,
    gloss: "Take part in a game.", displayRange: { start: 0, end: word.length } }], joins: [], transformations: [],
    wordSum: `${word} → ${word}`, familyKey: `old-${word}`, componentPartId: "base", relationshipKind: "free_base", requestedSkillKeys: [] }],
});

async function main() {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await buildReviewWorkbook({ skill, title: "Upload regression", bundles: [bundle("play"), bundle("jump")], notes: new Map(), families: new Map() }) as unknown as Parameters<typeof book.xlsx.load>[0]);
  const sheet = book.getWorksheet("Words to review")!;
  const bytes = async () => Uint8Array.from(await book.xlsx.writeBuffer() as unknown as Uint8Array).buffer;
  sheet.getCell("D4").value = "Yes";
  sheet.getCell("D5").value = "No";
  const stale = await readReviewWorkbook(await bytes(), skill, { decisions: [], resolve: async () => null });
  assert.deepEqual(stale.reviewSummary, { meaningRows: 2, selectedMeanings: 1, selectedWords: 1 });
  assert.equal(stale.pendingFamilies.length, 1);
  assert.equal(stale.pendingFamilies[0].base, "play");
  assert.equal(stale.pendingFamilies[0].componentPartId, "base");
  const [reviewed] = parseMultiSenseCsv(stale.csv);
  assert.equal(reviewed.displayWord, "play");
  assert.equal(reviewed.senseSet.senses[0].definition, "Take part in a game.");
  assert.equal(reviewed.analyses[0].familyKey, "", "Unavailable historical keys cannot be approved");
  assert.equal(reviewed.analyses[0].parts[0].gloss, "Take part in a game.");
  await assert.rejects(readReviewWorkbook(await bytes(), skill, { targetRow: 5, decisions: [], resolve: async () => null }), /Workbook row 5 is not marked Yes/);
  await assert.rejects(readReviewWorkbook(await bytes(), skill, { decisions: [{ row: 4, familyKey: "wrong" }], resolve: async () => null }), /choose an approved family/);
  await assert.rejects(readReviewWorkbook(await bytes(), skill, { decisions: [], resolve: async () => { throw new Error("database unavailable"); } }), /database unavailable/);
  const wrongKind = await readReviewWorkbook(await bytes(), skill, { decisions: [], resolve: async () => ({ key: "old-play", base: "play", kind: "bound_root", meaning: "Play.", partOfSpeech: "root" }) });
  assert.equal(wrongKind.pendingFamilies.length, 1, "A root family cannot silently replace a free-base family");
  const good = await readReviewWorkbook(await bytes(), skill, { decisions: [], resolve: async () => ({ key: "old-play", base: "play", kind: "free_base", meaning: "Play.", partOfSpeech: "verb" }) });
  assert.equal(good.pendingFamilies.length, 0);
  assert.equal(parseMultiSenseCsv(good.csv)[0].analyses[0].familyKey, "old-play");
  sheet.getCell("D4").value = "No";
  await assert.rejects(readReviewWorkbook(await bytes(), skill), /No Yes selections were found/);
  console.log("Workbook retry: Yes selections, excluded rows, unavailable families, explicit decisions and read failures passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
