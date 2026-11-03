import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";
import { OVERVIEW_CSV_COLUMNS, projectOverviewCsvRows, renderOverviewCsv } from
  "../lib/teaching-dictionary-manager/overview-csv";
import { overviewSourceHash } from "../lib/teaching-dictionary-manager/overview-source-hash";
import { selectOverviewFamilies } from "../lib/teaching-dictionary-manager/overview-family-selection";

const familySelection = selectOverviewFamilies(
  ["joy-word", "veget-word", "unlinked-word", "historical-word", "conflict-word"],
  [
    { canonical_word_id: "joy-word", family_key: "joy", revision: 2 },
    { canonical_word_id: "joy-word", family_key: "joy", revision: 1 },
    { canonical_word_id: "veget-word", family_key: "veget", revision: 3 },
    { canonical_word_id: "conflict-word", family_key: "joy", revision: 2 },
    { canonical_word_id: "conflict-word", family_key: "veget", revision: 3 },
  ],
  new Map([
    ["joy", { family_key: "joy", revision: 2, base_kind: "free_base", base_lemma: "joy",
      base_meaning: "happiness", base_part_of_speech: "noun", review_status: "approved" }],
    ["veget", { family_key: "veget", revision: 3, base_kind: "bound_root", base_lemma: "veget",
      base_meaning: "To grow or live", base_part_of_speech: "bound_root", review_status: "approved" }],
  ]),
  new Map([["veget:3", { family_key: "veget", revision: 3, root_definition: "To grow or live",
    origin_language: "Latin", pronunciation_applicability: "not_applicable", pronunciation_ipa: null }]]),
  new Set(["historical-word"]),
);
assert.equal(familySelection.get("joy-word")?.familyKey, "joy",
  "another word's family must not create a false conflict");
assert.equal(familySelection.get("veget-word")?.kind, "bound_root");
assert.equal(familySelection.get("veget-word")?.rootPronunciationApplicability, "not_applicable");
assert.equal(familySelection.has("unlinked-word"), false);
assert.match(familySelection.get("historical-word")?.reviewIssue ?? "", /Historical family link/);
assert.deepEqual(familySelection.get("conflict-word")?.linkedFamilyRefs, ["joy@2", "veget@3"]);
assert.match(familySelection.get("conflict-word")?.reviewIssue ?? "", /Multiple approved family links retained/);

const pilot = parseDictionaryCsv(readFileSync(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv", "utf8"));
const reviewed = pilot.find((row) => row.normalisedWord === "enjoyable")!;
function fromPilot(row: (typeof pilot)[number]) {
  const payload = row.payload;
  return {
    canonical_word_id: row.canonicalWordId!, source_row_hash: row.sourceRowHash!,
    normalised_word: row.normalisedWord, display_word: payload.displayWord,
    affected_micro_skills: payload.skillKeys.join("; "), definition: payload.definition,
    dictation_sentence: payload.dictationSentence, dictation_target_token_index: payload.dictationTargetTokenIndex,
    written_syllable_breakdown: row.writtenSyllableBreakdown,
    age_band: payload.ageBand, frequency_band: payload.frequencyBand,
    complexity_band: payload.complexityBand, ...payload.metadata,
    raw_morpholex_segmentation: payload.canonicalMorphology.rawSegmentation,
    raw_morpholex_pos: payload.canonicalMorphology.rawPartOfSpeech,
    morphology_parts: payload.canonicalMorphology.parts,
    morphology_joins: payload.canonicalMorphology.joins,
    __morphology_transformations: payload.canonicalMorphology.transformations ?? [],
    analysis_status: "approved", morphology_review_notes: payload.canonicalMorphology.reviewNotes,
    source_category: payload.provenance.sourceCategory, source_name: payload.provenance.sourceName,
    source_url: payload.provenance.sourceUrl, source_licence: payload.provenance.sourceLicence,
    source_use_note: payload.provenance.sourceUseNote, confidence: payload.provenance.confidence,
    __overview_missing_facts: "", missing_facts: "Route-only choice missing",
    route_content_json: { staleRouteCopy: true },
  };
}
const typed = fromPilot(reviewed);
const legacy = { ...typed, canonical_word_id: "b467f987-4b04-402f-b6a5-725d8e680267",
  normalised_word: "available", display_word: "available",
  morphology_parts: [{ text: "avail", type: "base" }, { text: "able", type: "suffix" }],
  morphology_joins: ["plus"], __morphology_transformations: [],
};
const applicable = fromPilot(pilot.find((row) => row.normalisedWord === "applicable")!);
const vegetable = fromPilot(pilot.find((row) => row.normalisedWord === "vegetable")!);
const rows = projectOverviewCsvRows([typed, { ...typed, routeId: "base_word_lab" }, legacy,
  applicable, vegetable],
  new Map([[typed.canonical_word_id, { kind: "free_base", familyKey: "joy_noun_base_family",
    revision: 1, basePartOfSpeech: "noun", baseLemma: "joy", baseMeaning: "a feeling of great happiness" }],
  [legacy.canonical_word_id, { kind: "free_base", familyKey: "avail_verb_base_family",
    revision: 1, basePartOfSpeech: "verb", baseLemma: "avail", baseMeaning: "To make use of something helpful or offered." }],
  [vegetable.canonical_word_id, {
    kind: "bound_root", familyKey: "veget_bound_root_base_family", revision: 1,
    basePartOfSpeech: "bound_root",
    baseLemma: "veget", baseMeaning: "To grow or live",
    rootDefinition: "To grow or live", rootOriginLanguage: "Latin",
    rootPronunciationApplicability: "not_applicable", rootPronunciationIpa: "",
  }]]));
assert.equal(rows.length, 4, "a word with multiple routes has one Overview row");
assert.equal(rows[0].analysis_status, "approved");
assert.equal(rows[0].review_group, "ready");
assert.equal(rows[0].part_1_kind, "prefix");
assert.equal(rows[0].part_2_underlying_form, "joy");
assert.equal(rows[0].part_3_meaning, "able to be or suitable for");
assert.equal(rows[0].base_family_key, "joy_noun_base_family");
assert.equal(rows[0].current_approved_family_links, "joy_noun_base_family@1");
assert(!String(rows[0].missing_facts).includes("Route-only"));
assert.match(String(rows[0].tdm_source_overview_hash), /^[a-f0-9]{64}$/);
assert.equal(rows[0].tdm_source_overview_hash, overviewSourceHash(typed));
assert.notEqual(rows[0].tdm_source_overview_hash, overviewSourceHash({ ...typed, definition: "Changed later" }));
assert.equal(rows[1].analysis_status, "in_review");
assert.equal(rows[1].review_group, "legacy_aliases");
assert.equal(rows[1].part_1_kind, "base");
assert.equal(rows[1].part_1_meaning, "To make use of something helpful or offered.");
assert.equal(rows[1].part_2_join_before, "");
assert.match(String(rows[1].missing_facts), /Review word parts: legacy_aliases/);
assert.equal(rows[2].part_1_underlying_form, "apply");
assert.equal(rows[2].part_1_visible_letters, "applic");
assert.match(String(rows[2].part_1_spelling_change_explanation), /y/i);
assert.equal(rows[3].root_family_key, "veget_bound_root_base_family");
assert.equal(rows[3].root_pronunciation_applicability, "not_applicable");
assert(!OVERVIEW_CSV_COLUMNS.some((name) => name.includes("json") || name === "morphology_parts"));

const csv = renderOverviewCsv(rows);
assert(!csv.includes("staleRouteCopy"), "route JSON is never included in the Overview sheet");
const imported = parseDictionaryCsv(csv);
assert.equal(imported.length, 4);
assert.equal(imported[0].error, undefined);
assert.equal(imported[0].exportVersion, "2");
assert.equal(imported[0].sourceOverviewHash, rows[0].tdm_source_overview_hash);
assert.equal(imported[0].sourceFamilyKey, "joy_noun_base_family");
assert.equal(imported[0].sourceFamilyRevision, 1);
assert.equal(imported[0].sourceFamilyLinks, "joy_noun_base_family@1");
assert.equal(imported[0].unchanged, true);
assert.equal(imported[0].payload.writtenSyllableBreakdown, reviewed.writtenSyllableBreakdown);
assert.equal(imported[0].payload.freeBaseFamilyReview?.familyKey, "joy_noun_base_family");
assert.match(imported[1].error ?? "", /needs its role, underlying form, visible letters and meaning/);
assert.equal(imported[2].error, undefined);
assert.equal(imported[2].payload.canonicalMorphology.transformations?.length, 1);
assert.equal(imported[3].error, undefined);
assert.equal(imported[3].payload.rootFamilyReview?.pronunciationApplicability, "not_applicable");
const missingJoins = projectOverviewCsvRows([{ ...typed, morphology_joins: [] }],
  new Map([[typed.canonical_word_id, { kind: "free_base", familyKey: "joy_noun_base_family",
    revision: 1, basePartOfSpeech: "noun", baseLemma: "joy",
    baseMeaning: "a feeling of great happiness" }]]))[0];
assert.equal(missingJoins.review_group, "join_count");
assert.equal(missingJoins.analysis_status, "in_review", "a suggested join is never approved automatically");
assert.equal(missingJoins.part_2_join_before, "none");
assert.equal(missingJoins.part_3_join_before, "none");
assert.match(String(missingJoins.review_action), /Check the suggested no-space joins/);
const unsafeJoins = projectOverviewCsvRows([{
  ...typed, display_word: "en-joyable", morphology_joins: [],
}], new Map([[typed.canonical_word_id, { kind: "free_base",
  familyKey: "joy_noun_base_family", basePartOfSpeech: "noun" }]]))[0];
assert.equal(unsafeJoins.part_2_join_before, "", "a visible separator needs manual review");
const edited = parseDictionaryCsv(csv.replace("en·joy·a·ble", "en·joy·ab·le"));
assert.equal(edited[0].unchanged, false);
assert.equal(edited[0].payload.writtenSyllableBreakdown, "en·joy·ab·le");
console.log("Overview-only dictionary CSV regression passed.");
