import assert from "node:assert/strict";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";
import { auditCanonicalMorphology } from "../lib/teaching-dictionary-manager/canonical-morphology";

const headers = ["display_word", "definition", "dictation_sentence", "written_syllable_breakdown",
  "age_band", "frequency_band", "complexity_band", "syllables", "phoneme_hint", "stress_pattern", "raw_morpholex_pos",
  "source_category", "source_name", "source_use_note", "confidence",
  "part_1_kind", "part_1_underlying_form", "part_1_visible_letters", "part_1_meaning",
  "part_2_kind", "part_2_underlying_form", "part_2_visible_letters", "part_2_meaning",
  "part_2_join_before", "part_2_spelling_change_explanation"];
const values = ["scrolling", "Moving through content on a screen.", "She was scrolling through the page.",
  "scroll·ing", "upper_primary", "medium", "medium", "2", "/ˈskrəʊlɪŋ/", "primary-unstressed", "verb",
  "internal_authored", "Scarlett's Spells", "Reviewed teaching definition and morphology.", "high",
  "base", "scroll", "scroll", "move through content on a screen",
  "suffix", "ing", "ing", "an action in progress", "none", ""];
const csv = (cells: string[]) => cells.map((value) => `"${value.replaceAll('"', '""')}"`).join(",");
const parse = (row = values) => parseDictionaryCsv(`${csv(headers)}\n${csv(row)}\n`)[0];
const errorOf = (row: string[]) => parse(row).error ?? "";
const valid = parse();
assert.equal(valid.error, undefined);
assert.equal(valid.normalisedWord, "scrolling");
assert.equal(valid.payload.writtenSyllableBreakdown, "scroll·ing");
const hyphenated = parse(values.map((value, index) =>
  index === headers.indexOf("written_syllable_breakdown") ? "scroll-ing" : value));
assert.equal(hyphenated.error, undefined);
assert.equal(hyphenated.payload.writtenSyllableBreakdown, "scroll·ing");
assert.equal(hyphenated.writtenSyllableBreakdown, "scroll·ing");
assert.equal(valid.payload.canonicalMorphology.wordSum, "scroll + ing → scrolling");
assert.equal(valid.payload.canonicalMorphology.analysisStatus, "approved");
assert.equal(auditCanonicalMorphology({ parts: valid.payload.canonicalMorphology.parts,
  joins: valid.payload.canonicalMorphology.joins, displayWord: "scrolling", linkedToFamily: false }).status, "canonical");
assert.match(errorOf(values.map((value, index) => index === headers.indexOf("part_2_underlying_form") ? "" : value)), /Part 2 needs/);
assert.match(errorOf(values.map((value, index) => index === headers.indexOf("part_2_visible_letters") ? "ed" : value)), /spell/);
assert.match(errorOf(values.map((value, index) => index === headers.indexOf("age_band") ? "in_review" : value)), /reviewed age band/);
assert.match(errorOf(values.map((value, index) => index === headers.indexOf("source_name") ? "" : value)), /Source name/);
assert.match(errorOf(values.map((value, index) => index === headers.indexOf("source_category") ? "" : value)), /Source category/);
assert.match(errorOf(values.map((value, index) => index === headers.indexOf("confidence") ? "" : value)), /Confidence/);
assert.match(errorOf(values.map((value, index) => index === headers.indexOf("stress_pattern") ? "primary" : value)), /Stress pattern/);

const changed = values.map((value, index) => index === headers.indexOf("display_word") ? "ability"
  : index === headers.indexOf("part_1_underlying_form") ? "able"
  : index === headers.indexOf("part_1_visible_letters") ? "abil"
  : index === headers.indexOf("part_2_underlying_form") ? "ity"
  : index === headers.indexOf("part_2_visible_letters") ? "ity"
  : value);
assert.match(parse(changed).error ?? "", /spelling-change explanation/);
console.log("Flat dictionary CSV regression passed.");
