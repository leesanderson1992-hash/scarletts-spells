#!/usr/bin/env node
/* Deterministically projects the hash-bound CW-3A approval into publication packages. */
/* eslint-disable @typescript-eslint/no-explicit-any -- source review JSON is validated while projected */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import {
  teachingDictionaryClosureV2SemanticProjection,
  validateAdleCurriculumReleaseManifestV2,
  validateAdleTeachingDictionaryClosureManifestV2,
  type AdleCurriculumReleaseManifestV2,
  type AdleTeachingDictionaryClosureManifestV2,
} from "../lib/adle/curriculum-release-authority";
import { packageSha256, sha256File, stringifyCsv } from "./teaching-dictionary-release-contract";
import { stableUuid } from "./teaching-dictionary-release";

const ROOT = resolve(import.meta.dirname, "..");
const REVIEW_DIR = resolve(ROOT, "data/adle/review/d4-mor/v2");
const RELEASE_ROOT = resolve(ROOT, "docs/implementation/seed-data/teaching-dictionary/releases");
const CANONICAL_DIR = resolve(RELEASE_ROOT, "2026-08-11-compound-word-v2-canonical-v1");
const ROUTE_DIR = resolve(RELEASE_ROOT, "2026-08-11-compound-word-v2-route-releases");
const WORKBOOK = "/Users/katiesanderson/Downloads/compound-word-v2-publication-readiness-review-resolved.xlsx";
const WORKBOOK_SHA = "4d59997206c4faf5c05eac37f9c4dd23d5581d3600327a7a8d0ef758b4c1338f";
const APPROVED_AT = "2026-08-11T20:09:55.000Z";
const REVIEWER = "Katie Sanderson";
const BASE_SHA = "7b326b2feb64ccc58c5dff4b087787605e338348";
const RELEASE_ID = "2026-08-11-compound-word-v2-canonical-v1";
const APPROVAL_REF = "data/adle/review/d4-mor/v2/compound-word-v2-publication-review-approval.json";
const SOURCE_NOTE = `Human-approved Compound Word v2 workbook; ${REVIEWER}, 2026-08-11; workbook SHA-256 ${WORKBOOK_SHA}.`;

const HEADERS: Record<string, string[]> = {
  "canonical_words.csv": ["word_key","normalised_word","display_word","dialect_code","frequency_band","age_band","complexity_band","source_category","source_name","source_url","source_licence","source_use_note","confidence","review_status","row_status"],
  "canonical_word_metadata.csv": ["word_key","syllables","phoneme_hint","grapheme_notes","stress_pattern","has_schwa","morphemes","morphology_notes","irregularity_notes","source_category","source_name","source_url","source_licence","source_use_note","confidence","review_status"],
  "canonical_word_morphology.csv": ["word_key","raw_morpholex_segmentation","raw_morpholex_pos","morphology_parts","feature_keys","morphology_joins","transformation_notes","word_sum","analysis_status","source_category","source_name","source_url","source_licence","source_use_note","confidence","review_status","reviewed_by","reviewed_at","review_notes"],
  "dictation_sentences.csv": ["word_key","display_word","age_band","complexity_band","dictation_sentence","dictation_target_token_index","dictation_target_end_exclusive","exact_governed_answer","audio_text","source_category","source_name","source_url","source_licence","source_use_note","confidence","review_status","reviewed_by","reviewed_at","review_notes"],
  "teaching_content_sources.csv": ["source_key","source_category","source_name","source_url","source_licence","source_use_note","importability_status","legal_review_status"],
};

const existingDictationIds: Record<string, string> = {
  bedroom_en_gb: "b8b32df0-ff92-4ab8-a4ec-7d3723dec378",
  football_en_gb: "293d1797-45b6-4cc5-a6c6-3858ad9307c8",
  playground_en_gb: "d5792ccb-65fc-4217-8700-354a7ef60555",
  rainbow_en_gb: "75062115-e94a-50d2-a46e-e2c6ad82f9ed",
  ice_cream_en_gb: "12eba410-8307-4145-80b4-072b8b274751",
  twenty_one_en_gb: "140df7bc-9b60-4024-8ff2-bfbb4e21d290",
};

function json(path: string): any { return JSON.parse(readFileSync(path, "utf8")); }
function canonicalKey(surface: string): string { return `${surface.toLowerCase().replace(/[ -]+/g, "_")}_en_gb`; }
function stringify(value: unknown): string { return typeof value === "string" ? value : JSON.stringify(value ?? ""); }
function approvedSource(row: Record<string, any>): Record<string, any> {
  return { ...row, source_category: "internal_authored", source_name: "Katie Sanderson approved Compound Word v2 workbook", source_url: `local:${WORKBOOK_SHA}`, source_licence: "internal/project-authored", source_use_note: SOURCE_NOTE, confidence: "high", review_status: "approved_for_first_exposure" };
}
function writeJson(path: string, value: unknown): void { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }

async function main(): Promise<void> {
  const approval = json(resolve(REVIEW_DIR, "compound-word-v2-publication-review-approval.json"));
  const candidate = json(resolve(REVIEW_DIR, "compound-word-v2-publication-candidate.json"));
  if (await sha256File(WORKBOOK) !== WORKBOOK_SHA || approval.source_workbook.sha256 !== WORKBOOK_SHA || approval.rows.length !== 14 || approval.rows.some((row: any) => !String(row.decision).startsWith("APPROVE"))) throw new Error("approval/workbook binding mismatch");
  mkdirSync(resolve(CANONICAL_DIR, "package"), { recursive: true });
  mkdirSync(ROUTE_DIR, { recursive: true });
  copyFileSync(WORKBOOK, resolve(CANONICAL_DIR, "approved-workbook.xlsx"));

  const finalByWord = new Map(approval.rows.map((row: any) => [row.whole_word, row]));
  const proposed = candidate.proposed_canonical_words as any[];
  const csv: Record<string, any[]> = Object.fromEntries(Object.keys(HEADERS).map((name) => [name, []]));
  for (const proposal of proposed) {
    const word = proposal.canonical_words_csv.display_word;
    const final = finalByWord.get(word) as any | undefined;
    csv["canonical_words.csv"].push({ ...approvedSource(proposal.canonical_words_csv), row_status: "active" });
    csv["canonical_word_metadata.csv"].push(approvedSource({ ...proposal.canonical_word_metadata_csv, grapheme_notes: "Approved British-English pronunciation metadata." }));
    const morphology = approvedSource({ ...proposal.canonical_word_morphology_csv, raw_morpholex_segmentation: "", raw_morpholex_pos: "", morphology_parts: stringify(proposal.canonical_word_morphology_csv.morphology_parts), feature_keys: stringify(proposal.canonical_word_morphology_csv.feature_keys), morphology_joins: stringify(proposal.canonical_word_morphology_csv.morphology_joins), analysis_status: "approved", reviewed_by: REVIEWER, reviewed_at: APPROVED_AT, review_notes: "Approved in the hash-bound Compound Word v2 curriculum review." });
    csv["canonical_word_morphology.csv"].push(morphology);
    const dictation = approvedSource({ ...proposal.dictation_sentences_csv, dictation_sentence: final?.final_dictation_sentence ?? proposal.dictation_sentences_csv.dictation_sentence, dictation_target_end_exclusive: final?.dictation_target_end_exclusive ?? proposal.dictation_sentences_csv.dictation_target_end_exclusive, exact_governed_answer: word, audio_text: final?.final_dictation_sentence ?? proposal.dictation_sentences_csv.audio_text, reviewed_by: REVIEWER, reviewed_at: APPROVED_AT, review_notes: "Approved in the hash-bound Compound Word v2 curriculum review." });
    csv["dictation_sentences.csv"].push(dictation);
  }
  csv["teaching_content_sources.csv"].push({ source_key: "compound_word_v2_human_approval_2026_08_11", source_category: "internal_authored", source_name: "Katie Sanderson approved Compound Word v2 workbook", source_url: `local:${WORKBOOK_SHA}`, source_licence: "internal/project-authored", source_use_note: SOURCE_NOTE, importability_status: "importable", legal_review_status: "not_required" });
  for (const [name, rows] of Object.entries(csv)) writeFileSync(resolve(CANONICAL_DIR, "package", name), stringifyCsv(HEADERS[name], rows));

  const requiredFiles = Object.keys(HEADERS);
  const fileSha256 = Object.fromEntries(await Promise.all(requiredFiles.map(async (name) => [name, await sha256File(resolve(CANONICAL_DIR, "package", name))])));
  const manifestBase: any = {
    schemaVersion: "canonical_word_release_manifest_v2", releaseId: RELEASE_ID, packageType: "canonical_word_batch_v1", packageSchemaVersion: "v2", workbookSha256: WORKBOOK_SHA, sourceCommit: BASE_SHA,
    requiredMigrationVersions: ["20260724140000","20260726150000","20260726170000","20260726173000","20260726174000","20260811210000"], fileSha256,
    rowCounts: { sources: 1, words: proposed.length, metadata: proposed.length, morphology: proposed.length, dictations: proposed.length, repairs: 0, deferredRepairIntents: 0 },
    reviewerSummary: { reviewers: [REVIEWER], reviewedDates: ["2026-08-11"] }, sourceApprovalSummary: { importable: 1, legalPassedOrNotRequired: 1 },
    expectedTargetTables: ["canonical_teaching_dictionary_import_batches","canonical_teaching_dictionary_sources","canonical_teaching_dictionary_words","canonical_teaching_dictionary_word_metadata","canonical_teaching_dictionary_word_morphology","canonical_teaching_dictionary_dictation_sentences"],
    prohibitedTableFamilies: ["learner","assignment","evidence","proficiency","reward","word_treasure"], deferredRepairIntentFile: null, deferredRepairIntentsSha256: null,
  };
  writeJson(resolve(CANONICAL_DIR, "package", "release-manifest.json"), { ...manifestBase, packageSha256: packageSha256(manifestBase) });

  const idByKey = new Map<string, string>();
  for (const row of candidate.rows) {
    if (row.whole_canonical_word_id) idByKey.set(canonicalKey(row.whole_word), row.whole_canonical_word_id);
    row.components.forEach((component: any) => { if (component.canonical_word_id) idByKey.set(canonicalKey(component.display_surface), component.canonical_word_id); });
  }
  proposed.forEach((row) => idByKey.set(row.canonical_words_csv.word_key, stableUuid("word", row.canonical_words_csv.word_key)));

  const structures = candidate.rows.map((source: any) => {
    const final = finalByWord.get(source.whole_word) as any;
    if (!final) throw new Error(`missing final approval: ${source.whole_word}`);
    const components = source.components.map((component: any, index: number) => ({ ordinal: index + 1, canonicalWordId: idByKey.get(canonicalKey(component.display_surface)), displaySurface: component.display_surface, meaning: final.final_component_meanings[index], sense: final.final_component_meanings[index] }));
    if (components.some((component: any) => !component.canonicalWordId)) throw new Error(`missing component identity: ${source.whole_word}`);
    return { wholeWordKey: canonicalKey(source.whole_word), wholeCanonicalWordId: idByKey.get(canonicalKey(source.whole_word)), microSkillKey: source.micro_skill_key, displayForm: source.whole_word, components, joins: source.ordered_joins, childFriendlyMeaning: final.final_whole_meaning, componentToWholeRelationship: final.final_relationship, assignmentEligible: final.assignment_eligible, transferEligible: true, dictation: { sentence: final.final_dictation_sentence, targetStart: final.dictation_target_start, targetEndExclusive: final.dictation_target_end_exclusive, exactGovernedAnswer: source.whole_word }, morphologyProvenance: source.structure_provenance, approvalRef: APPROVAL_REF };
  });
  const structureManifest = { schemaVersion: 1, authorityKey: "compound-word-v2-approved-14-2026-08-11", approvalRefs: [APPROVAL_REF, `sha256:${WORKBOOK_SHA}`].sort(), structures };
  writeJson(resolve(ROUTE_DIR, "compound-structure-authority.json"), structureManifest);

  const closureKeys = new Set<string>(structures.flatMap((structure: any) => [structure.wholeWordKey, ...structure.components.map((component: any) => canonicalKey(component.displaySurface))]));
  const closureWords = [...closureKeys].sort().map((wordKey) => {
    const proposal = proposed.find((row) => row.canonical_words_csv.word_key === wordKey);
    const structure = structures.find((row: any) => row.wholeWordKey === wordKey);
    const display = proposal?.canonical_words_csv.display_word ?? candidate.rows.flatMap((row: any) => [{ key: canonicalKey(row.whole_word), value: row.whole_word }, ...row.components.map((component: any) => ({ key: canonicalKey(component.display_surface), value: component.display_surface }))]).find((entry: any) => entry.key === wordKey)?.value;
    return { wordKey, normalisedWord: display.toLowerCase(), displayWord: display, dialectCode: "en-GB", dictation: structure ? { sentence: structure.dictation.sentence, targetStart: structure.dictation.targetStart, targetEndExclusive: structure.dictation.targetEndExclusive, exactGovernedAnswer: structure.dictation.exactGovernedAnswer, audioText: structure.dictation.sentence } : null };
  });
  const closure: AdleTeachingDictionaryClosureManifestV2 = { schemaVersion: 2, authorityKey: "compound-word-v2-dictionary-closure-2026-08-11", approvalRefs: [APPROVAL_REF, `sha256:${WORKBOOK_SHA}`].sort(), capabilities: ["canonical_word_identity_display","canonical_dictation_target_span"], words: closureWords };
  const closureValidation = validateAdleTeachingDictionaryClosureManifestV2(closure); if (!closureValidation.valid) throw new Error(closureValidation.errors.join(","));
  writeJson(resolve(ROUTE_DIR, "teaching-dictionary-closure-v2.json"), closure);
  const bindings = closureWords.map((word) => ({ wordKey: word.wordKey, canonicalWordId: idByKey.get(word.wordKey), dictationSentenceId: word.dictation ? existingDictationIds[word.wordKey] ?? stableUuid("dictation_sentence_release", `${RELEASE_ID}:${word.wordKey}`) : null }));
  writeJson(resolve(ROUTE_DIR, "source-bindings.json"), bindings);

  const commonContent = { childFriendlyExplanation: "Big words are easier when you find the smaller meaning parts: base words, prefixes, suffixes, compounds, roots, or related words.", memoryTip: "", commonMisconceptions: "Child may spell the whole word by sound, lose the base word, change an affix unnecessarily, or miss a stable root/meaning chunk.", firstExposureProgression: ["Introduce the meaning part; identify it in a clear model word; mark the boundary; explain what the part means or does; then spell from parts."], reviewProofreadingProgression: ["Review: Use mixed morphology retrieval and ask the child to explain the base, prefix, suffix, compound, root, or related word that supports the spelling. Proofreading: In proofreading, ask the child to box the meaning parts and check that the base/root spelling has been preserved where the rule says it should."], exampleSelectionGuidance: "Start with transparent compounds where both words are familiar; avoid ambiguous compounds or unusual hyphenation at first.", contrastPolicyGuidance: "Contrast related morphemes only after the target part is secure. Avoid teaching several prefixes, suffixes, or roots together unless the comparison is the lesson target." };
  const content = [
    { microSkillKey: "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS", authorityKey: "compound-word-v2-closed-teaching-content-2026-08-11", content: { contentVersionId: "f499b30e-f2a4-55c9-8682-d13c4aa0b76d", contentVersion: "human_reviewed_v1", teachingObjective: "Child can use meaning parts to spell closed compound words.", ...commonContent, ruleExplanation: "Some compound words are written as one joined word; children should preserve both base words in the spelling.", guidedPracticeProgression: ["Use words where the target base, affix, root, compound part, or related-word cue for closed compound words is clear. Prompt the child to find the meaning part first, then spell and join the parts."] } },
    { microSkillKey: "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED", authorityKey: "compound-word-v2-separated-hyphenated-teaching-content-2026-08-11", content: { contentVersionId: "220766f8-421c-5a0d-82e5-fad2050a77ac", contentVersion: "human_reviewed_v1", teachingObjective: "Child can use meaning parts to spell separate or hyphenated compound words.", ...commonContent, ruleExplanation: "Some compound words are written as separate words or with a hyphen; children should preserve both word parts and use the correct spacing or hyphen.", guidedPracticeProgression: ["Use words where the target base, affix, root, compound part, or related-word cue for separate or hyphenated compound words is clear. Prompt the child to find the meaning part first, then spell and join the parts."] } },
  ].map((item) => ({ schemaVersion: 1, ...item, approvalRefs: [APPROVAL_REF, `sha256:${WORKBOOK_SHA}`].sort() }));
  content.forEach((value, index) => writeJson(resolve(ROUTE_DIR, index ? "teaching-content-separated-hyphenated.json" : "teaching-content-closed.json"), value));

  const structureFingerprint = fingerprintSnapshotValue({ schemaVersion: 1, structures });
  const closureFingerprint = fingerprintSnapshotValue(teachingDictionaryClosureV2SemanticProjection(closure));
  for (const item of content) {
    const contentFingerprint = fingerprintSnapshotValue({ schemaVersion: 1, microSkillKey: item.microSkillKey, ...item.content });
    const release: AdleCurriculumReleaseManifestV2 = { schemaVersion: 2, releaseKey: `compound-word-v2-${item.microSkillKey.toLowerCase()}-2026-08-11`, route: { routeId: "compound_word_lab", routeVersion: "v2", activationRouteKey: "compound_word_lab:v2", payloadVersion: 2 }, approvalRefs: [APPROVAL_REF, `sha256:${WORKBOOK_SHA}`].sort(), microSkills: [{ microSkillKey: item.microSkillKey, dependencies: [
      { authorityType: "compound_structure", authorityKey: structureManifest.authorityKey, authoritySchemaVersion: 1, semanticFingerprint: structureFingerprint },
      { authorityType: "teaching_content", authorityKey: item.authorityKey, authoritySchemaVersion: 1, semanticFingerprint: contentFingerprint },
      { authorityType: "teaching_dictionary_closure", authorityKey: closure.authorityKey, authoritySchemaVersion: 2, semanticFingerprint: closureFingerprint },
    ] }] };
    const validation = validateAdleCurriculumReleaseManifestV2(release); if (!validation.valid) throw new Error(validation.errors.join(","));
    const file = item.microSkillKey.endsWith("CLOSED_COMPOUNDS") ? "route-release-closed.json" : "route-release-separated-hyphenated.json";
    writeJson(resolve(ROUTE_DIR, file), release);
  }
  writeJson(resolve(ROUTE_DIR, "carry-forward-audit.json"), { schemaVersion: 1, reviewedAt: APPROVED_AT, decision: "excluded_pending_new_human_semantic_review", doesNotBlockApproved14: true, rows: [
    { wholeWord: "breakthrough", existingV1Sufficient: false, blocker: "missing reviewed component_to_whole_relationship" },
    { wholeWord: "sunshine", existingV1Sufficient: false, blocker: "missing reviewed component_to_whole_relationship" },
    { wholeWord: "weekend", existingV1Sufficient: false, blocker: "missing reviewed component_to_whole_relationship and canonical identities for week and end" },
  ] });
  writeJson(resolve(ROUTE_DIR, "package-manifest.json"), { schemaVersion: 1, baseSha: BASE_SHA, approvalArtifact: APPROVAL_REF, workbookSha256: WORKBOOK_SHA, counts: { approvedStructures: structures.length, closureWords: closureWords.length, newCanonicalWords: proposed.length, teachingContentAuthorities: content.length, routeReleases: content.length, activationRevisions: 0 }, productionDark: true });
  console.log(JSON.stringify({ newCanonicalWords: proposed.length, structures: structures.length, closureWords: closureWords.length, routeReleases: 2 }, null, 2));
}

void main();
