import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { DIS_MIS_PREFIX_SKILL, NEGATIVE_PREFIX_SKILL, RE_PRE_PREFIX_SKILL, prefixWorkbookEnabled,
  SUB_INTER_SUPER_PREFIX_SKILL } from "@/lib/teaching-dictionary-manager/prefix-workbook";
import { UN_PREFIX_SKILL } from "@/lib/teaching-dictionary-manager/prefix-content";
import { FUL_LESS_SKILL } from "@/lib/teaching-dictionary-manager/able-ible-workbook";
import { stagePrefixWorkbookDraft } from "@/lib/teaching-dictionary-manager/prefix-workbook-draft";
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

async function loadReviewFixture(workbook: ExcelJS.Workbook, input: Parameters<typeof buildReviewWorkbook>[0]) {
  await workbook.xlsx.load(Uint8Array.from(await buildReviewWorkbook(input)).buffer);
}

async function workbookUpload(workbook: ExcelJS.Workbook) {
  return Uint8Array.from(Buffer.from(await workbook.xlsx.writeBuffer())).buffer;
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  await loadReviewFixture(workbook, { skill: UN_PREFIX_SKILL, title: "Prefix un-",
    bundles: [fixture, reverseFixture], notes: new Map(), families: new Map() });
  const sheet = workbook.getWorksheet("Words to review")!;
  const serialize = () => workbookUpload(workbook);
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
    } as unknown as Parameters<typeof stagePrefixWorkbookDraft>[0];
    for (let attempt = 0; attempt < 2; attempt++)
      assert.equal(await stagePrefixWorkbookDraft(db, "admin", bundle, UN_PREFIX_SKILL, bundle.analyses[0].senseId, meaning), draftId);
    assert.equal(inserted, 1);
    assert.equal(payload?.routeContents[0].content.meaningBinKey, meaning);
    const part = payload?.canonicalMorphology.parts[0];
    assert(part && typeof part === "object" && "gloss" in part);
    assert.equal(part.gloss, meaning);
  }
  sheet.getCell("E5").value = "Other";
  await assert.rejects(readReviewWorkbook(await serialize(), UN_PREFIX_SKILL), /row 5: choose Not or Reverse/);
  sheet.spliceColumns(5, 1);
  const legacy = await readReviewWorkbook(await serialize(), UN_PREFIX_SKILL);
  assert.equal(legacy.prefixMeanings.size, 0);
  const blank = new ExcelJS.Workbook();
  await loadReviewFixture(blank, { skill: UN_PREFIX_SKILL, title: "Prefix un-",
    bundles: [], notes: new Map(), families: new Map() });
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
    "Part 2 join before": "none", "Relationship kind": "",
  };
  for (const [key, value] of Object.entries(values)) {
    assert(header.indexOf(key) > 0, key);
    blankSheet.getCell(4, header.indexOf(key)).value = value;
  }
  const blankUpload = await workbookUpload(blank);
  const awaitingFamily = await readReviewWorkbook(blankUpload, UN_PREFIX_SKILL);
  assert.deepEqual(awaitingFamily.rowNumbers, [4]);
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
  assert.equal(newWord.analyses[0].relationshipKind, "derived", "Resuming a saved prefix review must not require re-entering the relationship");
  assert.deepEqual(newWord.analyses[0].parts.map(part => part.gloss), ["reverse", "Fasten with a lock."]);
  const mixed = new ExcelJS.Workbook();
  await loadReviewFixture(mixed, { skill: DIS_MIS_PREFIX_SKILL, title: "Prefixes dis- and mis-",
    bundles: [], notes: new Map(), families: new Map() });
  const mixedSheet = mixed.getWorksheet("Words to review")!;
  assert.deepEqual(mixedSheet.getCell("E4").dataValidation.formulae, ['"Not or opposite,Wrongly or badly"']);
  const mixedHeaders = mixedSheet.getRow(3).values as string[];
  for (const [index, word, prefix, base] of [[4, "dislike", "dis", "like"], [5, "misread", "mis", "read"]] as const) {
    for (const [key, value] of Object.entries({
      ...values, Word: word, "Prefix meaning group": "", "Word family": base, "Dictation sentence": `Please ${word} this.`,
      "Part 1 underlying form": prefix, "Part 1 visible letters": prefix, "Part 2 underlying form": base,
      "Part 2 visible letters": base, "Part 2 meaning": "Reviewed base meaning",
    })) mixedSheet.getCell(index, mixedHeaders.indexOf(key)).value = value;
  }
  const mixedUpload = () => workbookUpload(mixed);
  const parsedMixed = await readReviewWorkbook(await mixedUpload(), DIS_MIS_PREFIX_SKILL);
  assert.deepEqual([...parsedMixed.prefixMeanings], [[4, "not_or_opposite"], [5, "wrongly_or_badly"]]);
  assert.deepEqual(parseMultiSenseCsv(parsedMixed.csv).map(word => word.analyses[0].parts[0].gloss),
    ["not or opposite", "wrongly or badly"]);
  mixedSheet.getCell("E4").value = "Wrongly or badly";
  await assert.rejects(readReviewWorkbook(await mixedUpload(), DIS_MIS_PREFIX_SKILL), /row 4: choose Not or opposite/);
  const rePre = new ExcelJS.Workbook();
  await loadReviewFixture(rePre, { skill: RE_PRE_PREFIX_SKILL, title: "Prefixes re- and pre-",
    bundles: [], notes: new Map(), families: new Map() });
  const rePreSheet = rePre.getWorksheet("Words to review")!;
  assert.equal(rePreSheet.getCell("A4").text, "");
  for (const row of [4, 103])
    assert.deepEqual(rePreSheet.getCell(`E${row}`).dataValidation.formulae, ['"Again or back,Before"']);
  const rePreHeaders = rePreSheet.getRow(3).values as string[];
  for (const [row, prefix, label] of [[4, "re", ""], [5, "pre", "Before"]] as const) {
    const word = prefix + "wash";
    for (const [key, value] of Object.entries({
      ...values, Word: word, "Prefix meaning group": label, "Word family": "wash",
      "Dictation sentence": `Please ${word} this.`, "Part 1 underlying form": prefix, "Part 1 visible letters": prefix,
      "Part 2 underlying form": "wash", "Part 2 visible letters": "wash", "Part 2 meaning": "Clean with water.",
    })) rePreSheet.getCell(row, rePreHeaders.indexOf(key)).value = value;
  }
  const rePreUpload = () => workbookUpload(rePre);
  const parsedRePre = await readReviewWorkbook(await rePreUpload(), RE_PRE_PREFIX_SKILL);
  assert.deepEqual([...parsedRePre.prefixMeanings], [[4, "again_back"], [5, "before"]]);
  assert.deepEqual(parseMultiSenseCsv(parsedRePre.csv).map(word => word.analyses[0].parts[0].gloss),
    ["again or back", "before"]);
  rePreSheet.getCell("E5").value = "Again or back";
  await assert.rejects(readReviewWorkbook(await rePreUpload(), RE_PRE_PREFIX_SKILL), /row 5: choose Before/);
  const negatives = new ExcelJS.Workbook();
  await loadReviewFixture(negatives, { skill: NEGATIVE_PREFIX_SKILL, title: "Negative prefixes",
    bundles: [], notes: new Map(), families: new Map() });
  const negativeSheet = negatives.getWorksheet("Words to review")!;
  assert.equal(negativeSheet.getCell("E3").text, "Prefix meaning group");
  for (const row of [4, 103])
    assert.deepEqual(negativeSheet.getCell(`E${row}`).dataValidation.formulae, ['"not,in or upon,make"']);
  const negativeHeaders = negativeSheet.getRow(3).values as string[];
  const forms = [["in", "accurate"], ["im", "perfect"], ["il", "logical"], ["ir", "rational"]] as const;
  for (const [index, [prefix, base]] of forms.entries()) {
    const word = prefix + base;
    for (const [key, value] of Object.entries({
      ...values, Word: word, "Prefix meaning group": index ? "not" : "", "Part 1 meaning": "not",
      "Word family": base, "Dictation sentence": `That is ${word}.`, "Dictation target token index": 2,
      "Part 1 underlying form": prefix, "Part 1 visible letters": prefix,
      "Part 2 underlying form": base, "Part 2 visible letters": base, "Part 2 meaning": "Reviewed base meaning",
    })) if (value !== undefined) negativeSheet.getCell(index + 4, negativeHeaders.indexOf(key)).value = value;
  }
  const negativeUpload = () => workbookUpload(negatives);
  const parsedNegatives = await readReviewWorkbook(await negativeUpload(), NEGATIVE_PREFIX_SKILL);
  assert.deepEqual([...parsedNegatives.prefixMeanings.values()], ["not", "not", "not", "not"]);
  assert.deepEqual(parseMultiSenseCsv(parsedNegatives.csv).map(word => word.analyses[0].parts[0].gloss),
    ["not", "not", "not", "not"]);
  negativeSheet.getCell("E5").value = "il-";
  await assert.rejects(readReviewWorkbook(await negativeUpload(), NEGATIVE_PREFIX_SKILL), /row 5: choose not or in or upon or make/);
  negativeSheet.getCell("E5").value = "not";
  negativeSheet.getCell("A5").value = "imlogical";
  await assert.rejects(readReviewWorkbook(await negativeUpload(), NEGATIVE_PREFIX_SKILL), /row 5: use il- before l/);
  negativeSheet.getCell("A5").value = "imperfect";
  negativeSheet.getCell("E5").value = "in or upon";
  negativeSheet.getCell("E6").value = "make";
  const semanticNegatives = await readReviewWorkbook(await negativeUpload(), NEGATIVE_PREFIX_SKILL);
  assert.deepEqual([...semanticNegatives.prefixMeanings.values()], ["not", "in_or_upon", "make", "not"]);
  assert.deepEqual(parseMultiSenseCsv(semanticNegatives.csv).map(word => word.analyses[0].parts[0].gloss), ["not", "in or upon", "make", "not"]);
  // Old form-only sheets retain their reviewed gloss instead of resetting it to not.
  negativeSheet.getCell("E3").value = "Prefix form";
  for (const [index, [prefix]] of forms.entries()) negativeSheet.getCell(`E${index + 4}`).value = `${prefix}-`;
  const meaningColumn = negativeHeaders.indexOf("Part 1 meaning");
  negativeSheet.getCell(5, meaningColumn).value = "in or upon";
  negativeSheet.getCell(6, meaningColumn).value = "make";
  const legacyNegatives = await readReviewWorkbook(await negativeUpload(), NEGATIVE_PREFIX_SKILL);
  assert.deepEqual([...legacyNegatives.prefixMeanings.values()], ["not", "in_or_upon", "make", "not"]);
  negativeSheet.getCell(5, meaningColumn).value = "";
  await assert.rejects(readReviewWorkbook(await negativeUpload(), NEGATIVE_PREFIX_SKILL), /row 5: choose not or in or upon or make/);
  const groupedPrefixes = new ExcelJS.Workbook();
  await loadReviewFixture(groupedPrefixes, { skill: SUB_INTER_SUPER_PREFIX_SKILL,
    title: "Prefixes sub-, inter- and super-", bundles: [], notes: new Map(), families: new Map() });
  const groupedSheet = groupedPrefixes.getWorksheet("Words to review")!;
  for (const row of [4, 103])
    assert.deepEqual(groupedSheet.getCell(`E${row}`).dataValidation.formulae, ['"Under,Between,Above or beyond"']);
  const groupedHeaders = groupedSheet.getRow(3).values as string[];
  for (const [row, prefix, base, group] of [[4, "sub", "soil", ""], [5, "inter", "school", "Between"],
    [6, "super", "human", "Above or beyond"]] as const) {
    const word = prefix + base;
    for (const [key, value] of Object.entries({
      ...values, Word: word, "Prefix meaning group": group, "Word family": base,
      "Dictation sentence": `That is ${word}.`, "Dictation target token index": 2,
      "Part 1 underlying form": prefix, "Part 1 visible letters": prefix,
      "Part 2 underlying form": base, "Part 2 visible letters": base, "Part 2 meaning": "Reviewed base meaning",
    })) groupedSheet.getCell(row, groupedHeaders.indexOf(key)).value = value;
  }
  const groupedUpload = () => workbookUpload(groupedPrefixes);
  const parsedGroups = await readReviewWorkbook(await groupedUpload(), SUB_INTER_SUPER_PREFIX_SKILL);
  assert.deepEqual([...parsedGroups.prefixMeanings.values()], ["under", "between", "above_beyond"]);
  assert.deepEqual(parseMultiSenseCsv(parsedGroups.csv).map(word => word.analyses[0].parts[0].gloss),
    ["under", "between", "above or beyond"]);
  groupedSheet.getCell("E6").value = "Under";
  await assert.rejects(readReviewWorkbook(await groupedUpload(), SUB_INTER_SUPER_PREFIX_SKILL), /row 6: choose Above or beyond/);
  const suffixWorkbook = new ExcelJS.Workbook();
  await loadReviewFixture(suffixWorkbook, { skill: FUL_LESS_SKILL,
    title: "-ful/-less", bundles: [], notes: new Map(), families: new Map() });
  const suffixSheet = suffixWorkbook.getWorksheet("Words to review")!;
  const suffixHeaders = suffixSheet.getRow(3).values as string[];
  const suffixValues = {
    Word: "helpless", Meaning: "Unable to manage without help.", "Use in lesson": "Yes",
    "Part of speech": "adjective", IPA: "/ˈhelpləs/", "Spoken syllable count": 2,
    "Stress pattern": "primary-unstressed", "Dictation sentence": "The lost kitten looked helpless.",
    "Dictation target token index": 4, "Part 1 kind": "base", "Part 1 underlying form": "help",
    "Part 1 visible letters": "help", "Part 2 kind": "suffix", "Part 2 underlying form": "less",
    "Part 2 visible letters": "less", "Part 2 meaning": "without or not having", "Part 2 join before": "none",
    "Relationship kind": "derived", "Age band": "middle_primary", "Frequency band": "medium",
    "Complexity band": "low", "Has schwa": "Yes",
  };
  for (const [key, value] of Object.entries(suffixValues)) {
    assert(suffixHeaders.indexOf(key) > 0, key);
    suffixSheet.getCell(4, suffixHeaders.indexOf(key)).value = value;
  }
  const suffixUpload = await workbookUpload(suffixWorkbook);
  const pendingSuffix = await readReviewWorkbook(suffixUpload, FUL_LESS_SKILL);
  assert.deepEqual(pendingSuffix.pendingFamilies.map(row => row.base), ["help"]);
  const parsedSuffix = await readReviewWorkbook(suffixUpload, FUL_LESS_SKILL, {
    decisions: [{ row: 4, familyKey: "help" }],
    resolve: async () => ({ base: "help", key: "help", meaning: "Give someone support.", partOfSpeech: "verb", kind: "free_base" }),
  });
  const [suffixWord] = parseMultiSenseCsv(parsedSuffix.csv);
  assert.equal(suffixWord.displayWord, "helpless");
  assert.equal(suffixWord.senseSet.senses[0].pronunciationId, "pronunciation-4");
  assert.equal(parsedSuffix.suffixFacts.get(4)?.has_schwa, "Yes");
  process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "staging";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://qkpjbajicacbrphthibk.supabase.co";
  assert.equal(prefixWorkbookEnabled(RE_PRE_PREFIX_SKILL), true);
  assert.equal(prefixWorkbookEnabled(NEGATIVE_PREFIX_SKILL), true);
  assert.equal(prefixWorkbookEnabled(SUB_INTER_SUPER_PREFIX_SKILL), true);
  process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "production";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://wwohrqtunajrbwxyssjf.supabase.co";
  assert.equal(prefixWorkbookEnabled(DIS_MIS_PREFIX_SKILL), true);
  assert.equal(prefixWorkbookEnabled(RE_PRE_PREFIX_SKILL), true);
  assert.equal(prefixWorkbookEnabled(NEGATIVE_PREFIX_SKILL), true);
  assert.equal(prefixWorkbookEnabled(SUB_INTER_SUPER_PREFIX_SKILL), true);
  assert.equal(prefixWorkbookEnabled(UN_PREFIX_SKILL), true);
  console.log("Prefix workbook choices, blank intake, and lesson draft handoff passed.");
}

void main();
