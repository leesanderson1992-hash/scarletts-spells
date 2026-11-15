import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { UN_PREFIX_SKILL } from "@/lib/teaching-dictionary-manager/prefix-content";
import { stageUnPrefixWorkbookDraft } from "@/lib/teaching-dictionary-manager/prefix-workbook-draft";
import { buildReviewWorkbook, readReviewWorkbook } from "@/lib/teaching-dictionary-manager/review-workbook";
import { parseMultiSenseCsv, type MultiSenseCsvBundle } from "@/lib/teaching-dictionary-manager/multi-sense-csv";
import type { WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";

const fixture: MultiSenseCsvBundle = {
  wordId: "", displayWord: "untidy", sourceSenseReviewedAt: "",
  senseSet: {
    pronunciations: [{ id: "standard", ipa: "/ʌnˈtaɪdi/", spokenSyllableCount: 3, stressPattern: "unstressed-primary-unstressed" }],
    senses: [{ id: "adjective", pronunciationId: "standard", partOfSpeech: "adjective",
      definition: "Not neat or ordered.", dictationSentence: "The untidy desk needed sorting.", dictationTargetTokenIndex: 1 }],
  },
  analyses: [{
    senseId: "adjective", parts: [
      { id: "prefix", kind: "prefix", sourceText: "un", surfaceText: "un", gloss: "not", displayRange: { start: 0, end: 2 } },
      { id: "base", kind: "base", sourceText: "tidy", surfaceText: "tidy", gloss: "Neat and ordered.", displayRange: { start: 2, end: 6 } },
    ], joins: [{ afterPartId: "prefix", beforePartId: "base", joinType: "none" }],
    transformations: [], wordSum: "un + tidy → untidy", familyKey: "tidy", componentPartId: "base",
    relationshipKind: "derived", requestedSkillKeys: [],
  }],
};
const reverseFixture = structuredClone(fixture);
reverseFixture.displayWord = "unlock";
Object.assign(reverseFixture.senseSet.senses[0], {
  partOfSpeech: "verb", definition: "Open something that is locked.", dictationSentence: "Please unlock the door.",
});
Object.assign(reverseFixture.senseSet.pronunciations[0], { ipa: "/ʌnˈlɒk/", spokenSyllableCount: 2, stressPattern: "unstressed-primary" });
Object.assign(reverseFixture.analyses[0], { familyKey: "lock", wordSum: "un + lock → unlock" });
Object.assign(reverseFixture.analyses[0].parts[1], { sourceText: "lock", surfaceText: "lock", gloss: "Fasten with a lock." });

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildReviewWorkbook({ skill: UN_PREFIX_SKILL, title: "Prefix un-",
    bundles: [fixture, reverseFixture], notes: new Map(), families: new Map() }));
  const sheet = workbook.getWorksheet("Words to review")!;
  const serialize = async () => Uint8Array.from(await workbook.xlsx.writeBuffer()).buffer;
  assert.equal(sheet.getCell("E3").text, "Prefix meaning group");
  assert.equal(sheet.getCell("E4").text, "Not");
  assert.deepEqual(sheet.getCell("E4").dataValidation.formulae, ['"Not,Reverse"']);
  sheet.getCell("D4").value = "Yes";
  sheet.getCell("D5").value = "Yes";
  sheet.getCell("E5").value = "Reverse";
  const parsed = await readReviewWorkbook(await serialize(), UN_PREFIX_SKILL);
  assert.deepEqual([...parsed.prefixMeanings], [[4, "not"], [5, "reverse"]]);
  const bundles = parseMultiSenseCsv(parsed.csv);
  assert.deepEqual(bundles.map(bundle => bundle.analyses[0].parts[0].gloss), ["not", "reverse"]);
  for (const [index, bundle] of bundles.entries()) {
    const meaning = parsed.prefixMeanings.get(parsed.rowNumbers[index])!;
    let payload: WordDraftPayload | undefined;
    let inserted = 0;
    const draftId = "saved-draft";
    const db = {
      from(table: string) {
        const rows: Record<string, () => unknown> = {
          canonical_teaching_dictionary_prefix_profiles: () => ({ id: "profile", source_row_hash: "hash",
            meaning_bins: [{ id: "not" }, { id: "reverse" }] }),
          canonical_teaching_dictionary_words: () => ({ normalised_word: bundle.displayWord, dialect_code: "en-GB" }),
          canonical_teaching_dictionary_word_metadata: () => null,
          teaching_dictionary_current_sense_family_memberships: () => [],
          teaching_dictionary_manager_drafts: () => payload ? { id: draftId, payload } : null,
        };
        const query = {
          select: () => query, eq: () => query, order: () => query, limit: () => query,
          single: async () => ({ data: table === "teaching_dictionary_manager_drafts" ? { id: draftId } : rows[table](), error: null }),
          maybeSingle: async () => ({ data: rows[table](), error: null }),
          then: (resolve: (value: unknown) => void) => resolve({ data: rows[table](), error: null }),
          insert: (row: { payload: WordDraftPayload }) => { payload = row.payload; inserted++; return query; },
        };
        return query;
      },
      rpc: async (method: string, args: { p_draft: string }) => {
        assert.equal(method, "stage_teaching_dictionary_route_draft");
        assert.equal(args.p_draft, draftId);
        return { data: ["saved-route"], error: null };
      },
    } as unknown as Parameters<typeof stageUnPrefixWorkbookDraft>[0];
    for (let attempt = 0; attempt < 2; attempt++)
      assert.equal(await stageUnPrefixWorkbookDraft(db, "admin", bundle, bundle.analyses[0].senseId, meaning), draftId);
    assert.equal(inserted, 1);
    assert.equal(payload?.routeContents[0].content.meaningBinKey, meaning);
    assert.equal(payload?.canonicalMorphology.parts[0].gloss, meaning);
  }
  sheet.getCell("E5").value = "Other";
  await assert.rejects(readReviewWorkbook(await serialize(), UN_PREFIX_SKILL), /row 5: choose Not or Reverse/);
  sheet.spliceColumns(5, 1);
  const legacy = await readReviewWorkbook(await serialize(), UN_PREFIX_SKILL);
  assert.equal(legacy.prefixMeanings.size, 0);
  const blank = new ExcelJS.Workbook();
  await blank.xlsx.load(await buildReviewWorkbook({ skill: UN_PREFIX_SKILL, title: "Prefix un-",
    bundles: [], notes: new Map(), families: new Map() }));
  const blankSheet = blank.getWorksheet("Words to review")!;
  assert.equal(blankSheet.getCell("A4").text, "");
  for (const row of [4, 103])
    assert.deepEqual(blankSheet.getCell(`E${row}`).dataValidation.formulae, ['"Not,Reverse"']);
  const header = blankSheet.getRow(3).values as string[];
  const values = {
    "Word": "unlock", "Meaning": "Open something that is locked.", "Part of speech": "verb",
    "Use in lesson": "Yes", "Prefix meaning group": "Reverse",
    "IPA": "/ʌnˈlɒk/", "Spoken syllable count": 2, "Stress pattern": "unstressed-primary",
    "Dictation sentence": "Please unlock the door.", "Dictation target token index": 1,
    "Part 1 kind": "prefix", "Part 1 underlying form": "un", "Part 1 visible letters": "un",
    "Part 2 kind": "base", "Part 2 underlying form": "lock", "Part 2 visible letters": "lock",
    "Part 2 join before": "none", "Relationship kind": "derived",
  };
  for (const [key, value] of Object.entries(values)) {
    assert(header.indexOf(key) > 0, key);
    blankSheet.getCell(4, header.indexOf(key)).value = value;
  }
  const blankUpload = Uint8Array.from(await blank.xlsx.writeBuffer()).buffer;
  const awaitingFamily = await readReviewWorkbook(blankUpload, UN_PREFIX_SKILL);
  assert.deepEqual(awaitingFamily.rowNumbers, []);
  assert.deepEqual(awaitingFamily.pendingFamilies.map(task => [task.row, task.base]), [[4, "lock"]]);
  const parsedBlank = await readReviewWorkbook(blankUpload, UN_PREFIX_SKILL, {
    targetRow: 4, decisions: [{ row: 4, familyKey: "lock" }],
    resolve: async (base, decision) => ({ key: decision.familyKey!, base, meaning: "Fasten with a lock.",
      partOfSpeech: "verb", kind: "free_base" }),
  });
  assert.deepEqual(parsedBlank.rowNumbers, [4]);
  assert.deepEqual([...parsedBlank.prefixMeanings], [[4, "reverse"]]);
  const [newWord] = parseMultiSenseCsv(parsedBlank.csv);
  assert.equal(newWord.wordId, "");
  assert.equal(newWord.senseSet.senses[0].id, "meaning-4");
  assert.equal(newWord.senseSet.senses[0].pronunciationId, "pronunciation-4");
  assert.deepEqual(newWord.analyses[0].parts.map(part => part.gloss), ["reverse", "Fasten with a lock."]);
  console.log("Prefix workbook choices, blank intake, and lesson draft handoff passed.");
}

void main();
