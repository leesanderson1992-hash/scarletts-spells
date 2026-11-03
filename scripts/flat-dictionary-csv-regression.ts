import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
const rootHeaders = [...headers, "root_family_key", "root_definition", "root_origin_language",
  "root_pronunciation_applicability", "root_pronunciation_ipa"];
const rootValues = [...values.map((value, index) => index === headers.indexOf("part_1_kind") ? "root" : value),
  "scroll_bound_root_base_family", "move through content", "Latin", "not_applicable", ""];
const root = parseDictionaryCsv(`${csv(rootHeaders)}\n${csv(rootValues)}\n`)[0];
assert.equal(root.error, undefined);
assert.equal(root.payload.rootFamilyReview?.familyKey, "scroll_bound_root_base_family");
assert.equal(root.payload.rootFamilyReview?.pronunciationApplicability, "not_applicable");
const invalidRoot = parseDictionaryCsv(`${csv(rootHeaders)}\n${csv(rootValues.map((value, index) =>
  index === rootHeaders.indexOf("root_pronunciation_ipa") ? "/skrəʊl/" : value))}\n`)[0];
assert.match(invalidRoot.error ?? "", /Bound-root review/);

const pilotPath = resolve("docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv");
const pilot = parseDictionaryCsv(readFileSync(pilotPath, "utf8"));
assert.equal(pilot.length, 14);
assert.deepEqual(pilot.filter((entry) => entry.error).map((entry) => entry.normalisedWord), []);
const vegetable = pilot.find((entry) => entry.normalisedWord === "vegetable")!;
assert.equal(vegetable.payload.rootFamilyReview?.rootDefinition, "To grow or live");
assert.equal(vegetable.payload.rootFamilyReview?.pronunciationApplicability, "not_applicable");
assert.equal(vegetable.payload.rootFamilyReview?.pronunciationIpa, "");
assert.deepEqual(vegetable.payload.canonicalMorphology.parts.map((part) => part.gloss),
  ["To grow or live", "able to be or suitable for"]);
const enjoyable = pilot.find((entry) => entry.normalisedWord === "enjoyable")!;
assert.equal(enjoyable.payload.metadata.stress_pattern, "unstressed-primary-unstressed-unstressed");
assert.deepEqual(enjoyable.payload.canonicalMorphology.parts.map((part) => part.sourceText), ["en", "joy", "able"]);
assert.deepEqual(enjoyable.payload.canonicalMorphology.parts.map((part) => part.gloss),
  ["to cause or to be", "a feeling of great happiness", "able to be or suitable for"]);
console.log("Flat dictionary CSV regression passed.");
