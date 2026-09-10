import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ContextFamilyKey } from "../lib/writing-engine/whole-writing/context";
import { ordinaryEvaluationFingerprint } from "./lib/whole-writing-v3-ordinary-evaluation";

const ROOT = join(process.cwd(), "data/whole-writing/v3-ordinary-writing-evaluation");
const RAW_WORKBOOK_NAME = "THERE_THEIR_THEYRE Primary Label Review Amended.xlsx";
const RAW_WORKBOOK_RELATIVE_PATH = `human-review/primary-label/raw/${RAW_WORKBOOK_NAME}`;
const MAIN_EXTRACT_RELATIVE_PATH = "human-review/primary-label/extracted/THERE_THEIR_THEYRE.primary-label-review.amended.csv";
const SUPPLEMENT_EXTRACT_RELATIVE_PATH = "human-review/primary-label/extracted/THERE_THEIR_THEYRE.subtype-quota-supplement.csv";
const EXPECTED_WORKBOOK_SHA256 = "b0be515ca523874b342d2789c7a066b2c650f2a7b66df8d09f7b2fb0b38d8614";
const EXPECTED_MAIN_EXTRACT_SHA256 = "879907751858a20e3370a23b3491af879b8b36e4838e2b5f91ca5a1e2d748bf6";
const EXPECTED_SUPPLEMENT_EXTRACT_SHA256 = "40d1b087694a74941d631a44e1438f979eee510e707953af1ffbae4ecaf6ecd1";
const CONFIRMATION_TIMESTAMP = "2026-09-10T11:00:40Z";
const INCIDENTAL_CONFIRMATION_TIMESTAMP = "2026-09-10T11:38:43Z";
const NON_GOLD_REVIEW_CONFIRMATION_TIMESTAMP = "2026-09-10T11:58:40Z";
const SENTINEL_AUTHORIZATION_ID = "s8-v3-unsupported-sentinel-authorization-katie-2026-09-10-01";
const SUPPLEMENT_AUTHORSHIP_RESOLUTION_ID = "s8-v3-supplement-authorship-resolution-katie-2026-09-10-01";
const MAIN_DECISION_PROVENANCE_ID = "s8-v3-there-primary-review-amended-katie-2026-09-10-01";
const SUPPLEMENT_DECISION_PROVENANCE_ID = "s8-v3-there-subtype-supplement-katie-2026-09-10-01";
const INCIDENTAL_DECISION_PROVENANCE_ID = "s8-v3-there-incidental-primary-label-confirmation-katie-2026-09-10-01";
const NON_GOLD_PACKET_ID = "s8-v3-there-non-gold-human-review-2026-09-10-01";
const CONFIRMED_INCIDENTAL_CONTEXT_BY_CASE_ID = new Map([
  ["v3-there-their-theyre-supplement-0014-there-their-theyre-02", "their book reviews"],
  ["v3-there-their-theyre-supplement-0028-there-their-theyre-02", "their own work"],
  ["v3-there-their-theyre-supplement-0040-there-their-theyre-02", "their own work"],
  ["v3-there-their-theyre-supplement-0042-there-their-theyre-02", "their own work"],
  ["v3-there-their-theyre-supplement-0046-there-their-theyre-02", "their group"],
]);
const PROTECTED_TAGS = ["fragment", "quotation", "gerund", "run_on", "task_dependent"] as const;
const FAMILY_MEMBERS: Record<ContextFamilyKey, readonly string[]> = {
  THERE_THEIR_THEYRE: ["there", "their", "they're"],
  YOUR_YOURE: ["your", "you're"],
  TO_TOO_TWO: ["to", "too", "two"],
  ITS_ITS: ["its", "it's"],
};
const SUPPORTED_PAIRS = new Set([
  "existential\u0000embedded_existential",
  "locative\u0000adverbial_locative",
  "possessive\u0000possessive_subject_or_object",
  "they_are_contraction\u0000progressive_contraction",
  "they_are_contraction\u0000adjectival_contraction",
  "they_are_contraction\u0000passive_contraction",
]);
const PRIMARY_REVIEW_HEADERS = [
  "schema_version", "inventory_fingerprint", "source_file_sha256", "source_file_name", "source_row_number",
  "passage_id", "case_id", "family", "source_text", "focus_surface", "start_utf16", "end_utf16",
  "span_validated", "primary_focus_preselected", "primary_selection_rule", "source_reference", "authored_by",
  "authorship_confirmed_claim", "source_group_claim", "authorship_resolution_id", "source_authorship",
  "identifier_generation", "declared_construction", "declared_subtype", "protected_set_tags_json",
  "classification", "intended_alternative", "supported_construction", "primary_focus_approved", "primary_label_id",
  "primary_labeler", "primary_label_timestamp_utc", "primary_notes",
] as const;
const NON_GOLD_REVIEW_HEADERS = [
  "schema_version", "review_packet_id", "primary_decisions_visible", "inventory_fingerprint", "case_id", "family",
  "source_text", "focus_surface", "start_utf16", "end_utf16", "span_validated", "source_reference", "authored_by",
  "source_authorship", "identifier_generation", "review_classification", "review_intended_alternative",
  "review_supported_construction", "review_declared_construction", "review_declared_subtype", "review_protected_set_tags_json",
  "non_gold_review_id", "non_gold_reviewer", "non_gold_review_timestamp_utc", "review_notes",
] as const;

type CsvRecord = Record<string, string>;
type InventoryRecord = Readonly<{
  schemaVersion: 1;
  sourceFileName: string;
  sourceFileSha256: string;
  sourceRowNumber: number;
  passageId: string;
  caseId: string;
  family: ContextFamilyKey;
  sourceText: string;
  focusSurface: string;
  startUtf16: number;
  endUtf16: number;
  spanValidated: true;
  primaryFocusPreselected: boolean;
  primarySelectionRule: "FIRST_NOMINAL_FAMILY_OCCURRENCE_IN_SOURCE_ORDER";
  sourceReference: string;
  authoredByClaim: string;
  authorshipConfirmedClaim: string;
  sourceGroupClaim: string;
  authorshipResolutionId: string;
  sourceAuthorship: "HUMAN_AUTHORED";
  identifierGeneration: "AI_ASSISTED";
  inventoryFingerprint: string;
}>;

type PrimaryLabel = Readonly<{
  schemaVersion: 1;
  primaryLabelId: string;
  inventoryFingerprint: string;
  caseId: string;
  family: ContextFamilyKey;
  declaredConstruction: string;
  declaredSubtype: string;
  protectedSetTags: readonly string[];
  classification: "VALID" | "INVALID" | "UNCERTAIN";
  intendedAlternative: string | null;
  supportedConstruction: boolean;
  primaryFocusApproved: boolean;
  labelerId: string;
  labeledAt: string;
  notes: string | null;
  decisionProvenanceId: string;
  primaryLabelFingerprint: string;
}>;

type CandidateRecord = Readonly<{
  schemaVersion: 1;
  passageId: string;
  caseId: string;
  family: ContextFamilyKey;
  sourceText: string;
  focusSurface: string;
  startUtf16: number;
  endUtf16: number;
  declaredConstruction: string;
  declaredSubtype: string;
  primaryFocus: boolean;
  protectedSetTags: readonly string[];
  sourceReference: string;
  authoredBy: string;
  candidateFingerprint: string;
}>;

type GoldRecord = Readonly<{
  schemaVersion: 1;
  caseId: string;
  family: ContextFamilyKey;
  classification: PrimaryLabel["classification"];
  intendedAlternative: string | null;
  supportedConstruction: boolean;
  primaryLabelId: string;
  nonGoldReviewId: string;
  adjudicationId: null;
  goldFingerprint: string;
}>;

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') {
      assert.equal(field, "", `Unexpected quote at character ${index}`);
      quoted = true;
    } else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  assert(!quoted, "CSV ends inside a quoted field");
  if (field !== "" || row.length > 0) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row); }
  return rows;
}

function csvRecords(text: string): CsvRecord[] {
  const rows = parseCsv(text.replace(/^\uFEFF/u, ""));
  const headers = rows[0];
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row, rowIndex) => {
    assert.equal(row.length, headers.length, `CSV row ${rowIndex + 2} width`);
    return Object.fromEntries(headers.map((header, column) => [header, row[column]]));
  });
}

function csvCell(value: string | number | boolean) {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvText(headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | boolean>>) {
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function normaliseMember(value: string) {
  return value.trim().toLowerCase().replaceAll("’", "'");
}

function parseBoolean(value: string, field: string) {
  assert(["true", "false"].includes(value.toLowerCase()), `${field}: expected boolean, received ${value}`);
  return value.toLowerCase() === "true";
}

function familyForSurface(surface: string): ContextFamilyKey {
  const member = normaliseMember(surface);
  for (const [family, members] of Object.entries(FAMILY_MEMBERS) as Array<[ContextFamilyKey, readonly string[]]>) {
    if (members.includes(member)) return family;
  }
  throw new Error(`Unknown governed member ${surface}`);
}

function slug(family: ContextFamilyKey) {
  return family.toLowerCase().replaceAll("_", "-");
}

function labelWithFingerprint(core: Omit<PrimaryLabel, "primaryLabelFingerprint">): PrimaryLabel {
  return { ...core, primaryLabelFingerprint: ordinaryEvaluationFingerprint(core) };
}

function validateLabel(label: PrimaryLabel, inventory: InventoryRecord) {
  assert.equal(label.caseId, inventory.caseId);
  assert.equal(label.family, inventory.family);
  assert.equal(label.inventoryFingerprint, inventory.inventoryFingerprint);
  assert.equal(label.primaryLabelId.trim(), label.primaryLabelId, `${label.caseId}: label ID whitespace`);
  assert.equal(label.primaryLabelId, `primary-${label.caseId}`, `${label.caseId}: label ID pattern`);
  assert(label.labelerId.trim(), `${label.caseId}: missing labeler`);
  assert(!Number.isNaN(Date.parse(label.labeledAt)), `${label.caseId}: invalid timestamp`);
  const { primaryLabelFingerprint, ...labelCore } = label;
  assert.equal(ordinaryEvaluationFingerprint(labelCore), primaryLabelFingerprint);
  assert(label.protectedSetTags.every((tag) => (PROTECTED_TAGS as readonly string[]).includes(tag)), `${label.caseId}: protected tag`);
  assert.equal(new Set(label.protectedSetTags).size, label.protectedSetTags.length, `${label.caseId}: duplicate protected tag`);
  const member = normaliseMember(inventory.focusSurface);
  if (label.classification === "INVALID") {
    assert(label.intendedAlternative, `${label.caseId}: INVALID alternative missing`);
    assert((FAMILY_MEMBERS[label.family] as readonly string[]).includes(label.intendedAlternative), `${label.caseId}: alternative outside family`);
    assert.notEqual(label.intendedAlternative, member, `${label.caseId}: alternative equals observed member`);
  } else assert.equal(label.intendedAlternative, null, `${label.caseId}: non-INVALID alternative must be null`);
  if (label.supportedConstruction) {
    assert(SUPPORTED_PAIRS.has(`${label.declaredConstruction}\u0000${label.declaredSubtype}`), `${label.caseId}: unsupported construction pair`);
    assert.notEqual(label.classification, "UNCERTAIN", `${label.caseId}: supported UNCERTAIN decision`);
  } else {
    assert.equal(label.classification, "UNCERTAIN", `${label.caseId}: unsupported decision must be UNCERTAIN`);
    assert.equal(label.declaredConstruction, "not_applicable", `${label.caseId}: unsupported construction sentinel`);
    assert.equal(label.declaredSubtype, "not_applicable", `${label.caseId}: unsupported subtype sentinel`);
  }
}

function main() {
  const write = process.argv.includes("--write");
  const rawWorkbookPath = join(ROOT, RAW_WORKBOOK_RELATIVE_PATH);
  const mainExtractPath = join(ROOT, MAIN_EXTRACT_RELATIVE_PATH);
  const supplementExtractPath = join(ROOT, SUPPLEMENT_EXTRACT_RELATIVE_PATH);
  const rawWorkbook = readFileSync(rawWorkbookPath);
  const mainExtract = readFileSync(mainExtractPath);
  const supplementExtract = readFileSync(supplementExtractPath);
  assert.equal(sha256(rawWorkbook), EXPECTED_WORKBOOK_SHA256);
  assert.equal(sha256(mainExtract), EXPECTED_MAIN_EXTRACT_SHA256);
  assert.equal(sha256(supplementExtract), EXPECTED_SUPPLEMENT_EXTRACT_SHA256);

  const baseInventory = readFileSync(join(ROOT, "source-intake/occurrence-inventory.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as InventoryRecord);
  const baseThereInventory = baseInventory.filter((record) => record.family === "THERE_THEIR_THEYRE");
  const baseByCase = new Map(baseThereInventory.map((record) => [record.caseId, record]));
  const mainRows = csvRecords(mainExtract.toString("utf8"));
  assert.equal(mainRows.length, 472);
  assert.equal(new Set(mainRows.map((row) => row.case_id)).size, mainRows.length);
  assert.deepEqual(new Set(mainRows.map((row) => row.case_id)), new Set(baseThereInventory.map((record) => record.caseId)));

  const mainLabels = mainRows.map((row) => {
    const inventory = baseByCase.get(row.case_id);
    assert(inventory, row.case_id);
    assert.equal(row.inventory_fingerprint, inventory.inventoryFingerprint);
    assert.equal(row.source_text, inventory.sourceText);
    assert.equal(row.focus_surface, inventory.focusSurface);
    assert.equal(Number(row.start_utf16), inventory.startUtf16);
    assert.equal(Number(row.end_utf16), inventory.endUtf16);
    assert.equal(row.source_authorship, "HUMAN_AUTHORED");
    assert.equal(row.identifier_generation, "AI_ASSISTED");
    const classification = row.classification as PrimaryLabel["classification"];
    assert(["VALID", "INVALID", "UNCERTAIN"].includes(classification));
    const protectedSetTags = JSON.parse(row.protected_set_tags_json) as string[];
    const intendedAlternative = row.intended_alternative ? normaliseMember(row.intended_alternative) : null;
    const core: Omit<PrimaryLabel, "primaryLabelFingerprint"> = {
      schemaVersion: 1,
      primaryLabelId: row.primary_label_id,
      inventoryFingerprint: inventory.inventoryFingerprint,
      caseId: inventory.caseId,
      family: inventory.family,
      declaredConstruction: row.declared_construction,
      declaredSubtype: row.declared_subtype,
      protectedSetTags,
      classification,
      intendedAlternative,
      supportedConstruction: parseBoolean(row.supported_construction, `${inventory.caseId}:supported_construction`),
      primaryFocusApproved: parseBoolean(row.primary_focus_approved, `${inventory.caseId}:primary_focus_approved`),
      labelerId: row.primary_labeler,
      labeledAt: row.primary_label_timestamp_utc,
      notes: row.primary_notes || null,
      decisionProvenanceId: MAIN_DECISION_PROVENANCE_ID,
    };
    const label = labelWithFingerprint(core);
    validateLabel(label, inventory);
    return label;
  });

  const supplementalRows = csvRecords(supplementExtract.toString("utf8"));
  assert.equal(supplementalRows.length, 52);
  assert.equal(new Set(supplementalRows.map((row) => row.supplement_id)).size, 52);
  const governedPattern = /(?<![\p{L}\p{N}_])(?:they[’']re|there|their|you[’']re|your|it[’']s|its|too|two|to)(?![\p{L}\p{N}_])/giu;
  const supplementalInventory: InventoryRecord[] = [];
  const supplementalTargetBySourceRow = new Map<number, InventoryRecord>();
  supplementalRows.forEach((row, rowIndex) => {
    const sourceRowNumber = rowIndex + 2;
    const passageId = `v3-there-their-theyre-supplement-${String(rowIndex + 1).padStart(4, "0")}`;
    const familyIndexes = new Map<ContextFamilyKey, number>();
    let firstThere: InventoryRecord | null = null;
    for (const match of row.human_authored_passage.matchAll(governedPattern)) {
      assert.notEqual(match.index, undefined);
      const focusSurface = match[0];
      const family = familyForSurface(focusSurface);
      const familyIndex = (familyIndexes.get(family) ?? 0) + 1;
      familyIndexes.set(family, familyIndex);
      const startUtf16 = match.index!;
      const endUtf16 = startUtf16 + focusSurface.length;
      assert.equal(row.human_authored_passage.slice(startUtf16, endUtf16), focusSurface);
      const core = {
        schemaVersion: 1 as const,
        sourceFileName: RAW_WORKBOOK_NAME,
        sourceFileSha256: EXPECTED_WORKBOOK_SHA256,
        sourceRowNumber,
        passageId,
        caseId: `${passageId}-${slug(family)}-${String(familyIndex).padStart(2, "0")}`,
        family,
        sourceText: row.human_authored_passage,
        focusSurface,
        startUtf16,
        endUtf16,
        spanValidated: true as const,
        primaryFocusPreselected: family === "THERE_THEIR_THEYRE" && familyIndex === 1,
        primarySelectionRule: "FIRST_NOMINAL_FAMILY_OCCURRENCE_IN_SOURCE_ORDER" as const,
        sourceReference: `${RAW_WORKBOOK_RELATIVE_PATH}#sheet=Subtype%20Quota%20Supplement&row=${sourceRowNumber}&supplement_id=${row.supplement_id}`,
        authoredByClaim: "Katie Sanderson",
        authorshipConfirmedClaim: "TRUE",
        sourceGroupClaim: "NOT_SUPPLIED_IN_WORKBOOK",
        authorshipResolutionId: SUPPLEMENT_AUTHORSHIP_RESOLUTION_ID,
        sourceAuthorship: "HUMAN_AUTHORED" as const,
        identifierGeneration: "AI_ASSISTED" as const,
      };
      const inventory = { ...core, inventoryFingerprint: ordinaryEvaluationFingerprint(core) };
      supplementalInventory.push(inventory);
      if (inventory.primaryFocusPreselected) firstThere = inventory;
    }
    assert(firstThere, `${row.supplement_id}: no THERE/THEIR/THEY'RE target`);
    assert.equal(normaliseMember(firstThere.focusSurface), normaliseMember(row.observed_member_in_ai_draft), `${row.supplement_id}: target member mismatch`);
    supplementalTargetBySourceRow.set(sourceRowNumber, firstThere);
  });
  assert.equal(supplementalInventory.length, 107);
  assert.equal(supplementalInventory.filter((record) => record.family === "THERE_THEIR_THEYRE").length, 57);
  assert.equal(supplementalInventory.filter((record) => record.family === "TO_TOO_TWO").length, 50);
  assert.equal(new Set([...baseInventory, ...supplementalInventory].map((record) => record.caseId)).size, baseInventory.length + supplementalInventory.length);

  const supplementalLabels = supplementalRows.map((row, rowIndex) => {
    const inventory = supplementalTargetBySourceRow.get(rowIndex + 2)!;
    const classification = row.target_classification as PrimaryLabel["classification"];
    assert(["VALID", "INVALID"].includes(classification), `${row.supplement_id}: target classification`);
    const intendedAlternative = row.intended_alternative_if_invalid ? normaliseMember(row.intended_alternative_if_invalid) : null;
    const core: Omit<PrimaryLabel, "primaryLabelFingerprint"> = {
      schemaVersion: 1,
      primaryLabelId: `primary-${inventory.caseId}`,
      inventoryFingerprint: inventory.inventoryFingerprint,
      caseId: inventory.caseId,
      family: inventory.family,
      declaredConstruction: "they_are_contraction",
      declaredSubtype: row.target_subtype,
      protectedSetTags: [],
      classification,
      intendedAlternative,
      supportedConstruction: true,
      primaryFocusApproved: true,
      labelerId: "Katie Sanderson",
      labeledAt: CONFIRMATION_TIMESTAMP,
      notes: row.notes || null,
      decisionProvenanceId: SUPPLEMENT_DECISION_PROVENANCE_ID,
    };
    const label = labelWithFingerprint(core);
    validateLabel(label, inventory);
    return label;
  });

  const allThereInventory = [...baseThereInventory, ...supplementalInventory.filter((record) => record.family === "THERE_THEIR_THEYRE")];
  const provisionalThereLabels = [...mainLabels, ...supplementalLabels];
  assert.equal(provisionalThereLabels.length, 524);
  const provisionalLabeledCases = new Set(provisionalThereLabels.map((label) => label.caseId));
  const issuedThere = allThereInventory.filter((record) => !provisionalLabeledCases.has(record.caseId));
  const pendingTo = supplementalInventory.filter((record) => record.family === "TO_TOO_TWO");
  assert.equal(issuedThere.length, 5);
  assert.deepEqual(new Set(issuedThere.map((record) => record.caseId)), new Set(CONFIRMED_INCIDENTAL_CONTEXT_BY_CASE_ID.keys()));
  for (const record of issuedThere) {
    assert.equal(record.focusSurface.toLowerCase(), "their", `${record.caseId}: confirmed incidental surface`);
    assert(record.sourceText.includes(CONFIRMED_INCIDENTAL_CONTEXT_BY_CASE_ID.get(record.caseId)!), `${record.caseId}: confirmed incidental context`);
  }
  assert.equal(pendingTo.length, 50);
  const incidentalLabels = issuedThere.map((inventory) => {
    const core: Omit<PrimaryLabel, "primaryLabelFingerprint"> = {
      schemaVersion: 1,
      primaryLabelId: `primary-${inventory.caseId}`,
      inventoryFingerprint: inventory.inventoryFingerprint,
      caseId: inventory.caseId,
      family: inventory.family,
      declaredConstruction: "possessive",
      declaredSubtype: "possessive_subject_or_object",
      protectedSetTags: [],
      classification: "VALID",
      intendedAlternative: null,
      supportedConstruction: true,
      primaryFocusApproved: false,
      labelerId: "Katie Sanderson",
      labeledAt: INCIDENTAL_CONFIRMATION_TIMESTAMP,
      notes: "Katie Sanderson confirmed this neighbouring occurrence is a valid incidental possessive use; it is not a primary-focus case.",
      decisionProvenanceId: INCIDENTAL_DECISION_PROVENANCE_ID,
    };
    const label = labelWithFingerprint(core);
    validateLabel(label, inventory);
    return label;
  });
  const allThereLabels = [...provisionalThereLabels, ...incidentalLabels];
  assert.equal(allThereLabels.length, 529);
  assert.equal(new Set(allThereLabels.map((label) => label.caseId)).size, allThereLabels.length);
  assert.equal(new Set(allThereLabels.map((label) => label.caseId)).size, allThereInventory.length);

  const primaryLabels = allThereLabels.filter((label) => label.primaryFocusApproved);
  assert.equal(primaryLabels.length, 452);
  assert.equal(new Set(primaryLabels.map((label) => allThereInventory.find((record) => record.caseId === label.caseId)!.passageId)).size, primaryLabels.length);
  const classificationCounts = Object.fromEntries(["VALID", "INVALID", "UNCERTAIN"].map((classification) => [classification, primaryLabels.filter((label) => label.classification === classification).length]));
  assert.deepEqual(classificationCounts, { VALID: 180, INVALID: 172, UNCERTAIN: 100 });
  const constructionCounts = Object.fromEntries(["existential", "locative", "possessive", "they_are_contraction"].map((construction) => [construction, {
    VALID: primaryLabels.filter((label) => label.declaredConstruction === construction && label.classification === "VALID").length,
    INVALID: primaryLabels.filter((label) => label.declaredConstruction === construction && label.classification === "INVALID").length,
  }]));
  const subtypeNames = ["embedded_existential", "adverbial_locative", "possessive_subject_or_object", "progressive_contraction", "adjectival_contraction", "passive_contraction"];
  const subtypeCounts = Object.fromEntries(subtypeNames.map((subtype) => [subtype, {
    VALID: primaryLabels.filter((label) => label.declaredSubtype === subtype && label.classification === "VALID").length,
    INVALID: primaryLabels.filter((label) => label.declaredSubtype === subtype && label.classification === "INVALID").length,
  }]));
  const protectedPrimaryCounts = Object.fromEntries(PROTECTED_TAGS.map((tag) => [tag, primaryLabels.filter((label) => label.protectedSetTags.includes(tag)).length]));
  for (const counts of Object.values(constructionCounts)) { assert(counts.VALID >= 30); assert(counts.INVALID >= 30); }
  for (const counts of Object.values(subtypeCounts)) { assert(counts.VALID >= 20); assert(counts.INVALID >= 20); }
  for (const count of Object.values(protectedPrimaryCounts)) assert(count >= 10);

  const sentinelAuthorizationCore = {
    schemaVersion: 1,
    authorizationId: SENTINEL_AUTHORIZATION_ID,
    authorizedBy: "Katie Sanderson",
    authorizedAt: CONFIRMATION_TIMESTAMP,
    scope: Object.keys(FAMILY_MEMBERS),
    declaredConstructionSentinel: "not_applicable",
    declaredSubtypeSentinel: "not_applicable",
    permittedOnlyWhen: { classification: "UNCERTAIN", supportedConstruction: false, intendedAlternative: null },
    source: "Explicit user authorization in the S8 V3 ordinary-writing holdout evaluation task.",
  };
  const sentinelAuthorization = { ...sentinelAuthorizationCore, authorizationFingerprint: ordinaryEvaluationFingerprint(sentinelAuthorizationCore) };
  const supplementAuthorshipCore = {
    schemaVersion: 1,
    resolutionId: SUPPLEMENT_AUTHORSHIP_RESOLUTION_ID,
    decidedBy: "Katie Sanderson",
    decidedAt: CONFIRMATION_TIMESTAMP,
    sourceWorkbookSha256: EXPECTED_WORKBOOK_SHA256,
    sourceTextAuthorship: "HUMAN_AUTHORED",
    identifierGeneration: "AI_ASSISTED",
    analyserPredictionsExposed: false,
    targetClassificationAndSubtypeStatus: "PRIMARY_HUMAN_DECISION",
    resolution: "Katie Sanderson confirmed that all 52 supplemental passages were independently human-authored without analyser predictions and that the target classification and subtype fields are her human decisions.",
  };
  const supplementAuthorship = { ...supplementAuthorshipCore, provenanceResolutionFingerprint: ordinaryEvaluationFingerprint(supplementAuthorshipCore) };
  const primaryDecisionProvenanceCore = {
    schemaVersion: 1,
    family: "THERE_THEIR_THEYRE",
    canonicalPrimaryHuman: "Katie Sanderson",
    identityAliases: { KatieSanderson: "Katie Sanderson" },
    decisions: [
      {
        decisionProvenanceId: MAIN_DECISION_PROVENANCE_ID,
        sourceWorkbookSha256: EXPECTED_WORKBOOK_SHA256,
        sourceSheet: "THERE_THEIR_THEYRE Primary Labe",
        recordCount: mainLabels.length,
        sourceLabelerId: "KatieSanderson",
        resolvedHuman: "Katie Sanderson",
        sourceTimestamp: mainLabels[0].labeledAt,
      },
      {
        decisionProvenanceId: SUPPLEMENT_DECISION_PROVENANCE_ID,
        sourceWorkbookSha256: EXPECTED_WORKBOOK_SHA256,
        sourceSheet: "Subtype Quota Supplement",
        recordCount: supplementalLabels.length,
        sourceLabelerId: "Katie Sanderson",
        resolvedHuman: "Katie Sanderson",
        confirmationTimestamp: CONFIRMATION_TIMESTAMP,
      },
      {
        decisionProvenanceId: INCIDENTAL_DECISION_PROVENANCE_ID,
        source: "Explicit Katie Sanderson decision in the current task.",
        recordCount: incidentalLabels.length,
        resolvedHuman: "Katie Sanderson",
        confirmationTimestamp: INCIDENTAL_CONFIRMATION_TIMESTAMP,
        decisions: {
          classification: "VALID",
          declaredConstruction: "possessive",
          declaredSubtype: "possessive_subject_or_object",
          supportedConstruction: true,
          primaryFocusApproved: false,
        },
      },
    ],
    analyserPredictionsExposed: false,
    nonGoldReviewerMustBeSeparatelyAttributable: true,
  };
  const primaryDecisionProvenance = { ...primaryDecisionProvenanceCore, provenanceFingerprint: ordinaryEvaluationFingerprint(primaryDecisionProvenanceCore) };
  const supplementalInventoryText = `${supplementalInventory.map((record) => JSON.stringify(record)).join("\n")}\n`;
  const supplementManifestCore = {
    schemaVersion: 1,
    intakeDate: "2026-09-10",
    nominalFamily: "THERE_THEIR_THEYRE",
    rawWorkbook: {
      suppliedFileName: RAW_WORKBOOK_NAME,
      preservedPath: RAW_WORKBOOK_RELATIVE_PATH,
      byteLength: rawWorkbook.length,
      sha256: EXPECTED_WORKBOOK_SHA256,
    },
    extractedSheets: [
      { sheetName: "THERE_THEIR_THEYRE Primary Labe", path: MAIN_EXTRACT_RELATIVE_PATH, rowCount: 472, sha256: EXPECTED_MAIN_EXTRACT_SHA256 },
      { sheetName: "Subtype Quota Supplement", path: SUPPLEMENT_EXTRACT_RELATIVE_PATH, rowCount: 52, sha256: EXPECTED_SUPPLEMENT_EXTRACT_SHA256 },
    ],
    formulaCellCount: 0,
    supplementalPassageCount: 52,
    supplementalOccurrenceCounts: { THERE_THEIR_THEYRE: 57, TO_TOO_TWO: 50, YOUR_YOURE: 0, ITS_ITS: 0 },
    supplementalInventorySha256: sha256(supplementalInventoryText),
    supplementAuthorshipResolutionId: SUPPLEMENT_AUTHORSHIP_RESOLUTION_ID,
    sentinelAuthorizationId: SENTINEL_AUTHORIZATION_ID,
  };
  const supplementManifest = { ...supplementManifestCore, supplementalSourceManifestFingerprint: ordinaryEvaluationFingerprint(supplementManifestCore) };
  const primaryLabelText = `${allThereLabels.map((label) => JSON.stringify(label)).join("\n")}\n`;
  const reviewRows = (records: InventoryRecord[]) => records.map((record) => [
    record.schemaVersion, record.inventoryFingerprint, record.sourceFileSha256, record.sourceFileName, record.sourceRowNumber,
    record.passageId, record.caseId, record.family, record.sourceText, record.focusSurface, record.startUtf16, record.endUtf16,
    record.spanValidated, record.primaryFocusPreselected, record.primarySelectionRule, record.sourceReference, record.authoredByClaim,
    record.authorshipConfirmedClaim, record.sourceGroupClaim, record.authorshipResolutionId, record.sourceAuthorship,
    record.identifierGeneration, "", "", "", "", "", "", "", "", "", "", "",
  ]);
  const issuedThereText = csvText(PRIMARY_REVIEW_HEADERS, reviewRows(issuedThere));
  const pendingToText = csvText(PRIMARY_REVIEW_HEADERS, reviewRows(pendingTo));
  const labelsByCaseId = new Map(allThereLabels.map((label) => [label.caseId, label]));
  const nonGoldReviewRows = allThereInventory.map((record) => {
    const label = labelsByCaseId.get(record.caseId);
    assert(label, `${record.caseId}: primary label for reviewed occurrence`);
    return [
    record.schemaVersion, NON_GOLD_PACKET_ID, "TRUE", record.inventoryFingerprint, record.caseId, record.family,
    record.sourceText, record.focusSurface, record.startUtf16, record.endUtf16, record.spanValidated, record.sourceReference,
    record.authoredByClaim, record.sourceAuthorship, record.identifierGeneration, label.classification, label.intendedAlternative ?? "",
    label.supportedConstruction, label.declaredConstruction, label.declaredSubtype, JSON.stringify(label.protectedSetTags),
    `non-gold-${record.caseId}`, "Katie Sanderson", NON_GOLD_REVIEW_CONFIRMATION_TIMESTAMP,
    "Katie Sanderson reviewed and copied this human decision.",
    ];
  });
  const nonGoldReviewPacketText = csvText(NON_GOLD_REVIEW_HEADERS, nonGoldReviewRows);
  const nonGoldReviewInstructions = `# S8 V3 THERE_THEIR_THEYRE non-gold review receipt\n\nKatie Sanderson attested on ${NON_GOLD_REVIEW_CONFIRMATION_TIMESTAMP} that she reviewed and copied every human decision in this 529-occurrence packet. The packet contains no analyser prediction.\n\nAll review decisions match the primary decision set, so no substantive disagreement exists and no adjudication is required.\n\nUse \`not_applicable/not_applicable\` only for an \`UNCERTAIN\` occurrence with unsupported construction and no intended alternative.\n`;
  const candidates: CandidateRecord[] = allThereInventory.map((record) => {
    const label = labelsByCaseId.get(record.caseId)!;
    const core = {
      schemaVersion: 1 as const,
      passageId: record.passageId,
      caseId: record.caseId,
      family: record.family,
      sourceText: record.sourceText,
      focusSurface: record.focusSurface,
      startUtf16: record.startUtf16,
      endUtf16: record.endUtf16,
      declaredConstruction: label.declaredConstruction,
      declaredSubtype: label.declaredSubtype,
      primaryFocus: label.primaryFocusApproved,
      protectedSetTags: label.protectedSetTags,
      sourceReference: record.sourceReference,
      authoredBy: record.authoredByClaim,
    };
    assert.equal(core.sourceText.slice(core.startUtf16, core.endUtf16), core.focusSurface);
    return { ...core, candidateFingerprint: ordinaryEvaluationFingerprint(core) };
  });
  const gold: GoldRecord[] = allThereLabels.map((label) => {
    const core = {
      schemaVersion: 1 as const,
      caseId: label.caseId,
      family: label.family,
      classification: label.classification,
      intendedAlternative: label.intendedAlternative,
      supportedConstruction: label.supportedConstruction,
      primaryLabelId: label.primaryLabelId,
      nonGoldReviewId: `non-gold-${label.caseId}`,
      adjudicationId: null,
    };
    return { ...core, goldFingerprint: ordinaryEvaluationFingerprint(core) };
  });
  assert.equal(candidates.length, 529);
  assert.equal(gold.length, candidates.length);
  assert.deepEqual(new Set(gold.map((record) => record.caseId)), new Set(candidates.map((record) => record.caseId)));
  const candidateText = `${candidates.map((record) => JSON.stringify(record)).join("\n")}\n`;
  const goldText = `${gold.map((record) => JSON.stringify(record)).join("\n")}\n`;
  const corpusFingerprint = sha256(Buffer.concat([Buffer.from(candidateText), Buffer.from(goldText)]));
  const goldLockReceiptCore = {
    schemaVersion: 1,
    family: "THERE_THEIR_THEYRE",
    lockedAt: NON_GOLD_REVIEW_CONFIRMATION_TIMESTAMP,
    candidateCount: candidates.length,
    goldCount: gold.length,
    candidateFileSha256: sha256(candidateText),
    candidateSetFingerprint: ordinaryEvaluationFingerprint(candidates.map((record) => record.candidateFingerprint)),
    goldFileSha256: sha256(goldText),
    goldSetFingerprint: ordinaryEvaluationFingerprint(gold.map((record) => record.goldFingerprint)),
    corpusFingerprint,
    primaryLabelSetFingerprint: ordinaryEvaluationFingerprint(allThereLabels.map((label) => label.primaryLabelFingerprint)),
    nonGoldReviewFileSha256: sha256(nonGoldReviewPacketText),
    substantiveDisagreementCount: 0,
    adjudicationRequired: false,
    analyserBehaviour: "NOT_EVALUATED",
  };
  const goldLockReceipt = { ...goldLockReceiptCore, goldLockReceiptFingerprint: ordinaryEvaluationFingerprint(goldLockReceiptCore) };
  const primaryLabelReceiptCore = {
    schemaVersion: 1,
    family: "THERE_THEIR_THEYRE",
    importStatus: "COMPLETE_PRIMARY_LABELS",
    importedLabelCount: allThereLabels.length,
    requiredOccurrenceLabelCount: allThereInventory.length,
    pendingOccurrenceLabelCount: 0,
    approvedPrimaryCount: primaryLabels.length,
    rawWorkbookSha256: EXPECTED_WORKBOOK_SHA256,
    mainDecisionProvenanceId: MAIN_DECISION_PROVENANCE_ID,
    supplementDecisionProvenanceId: SUPPLEMENT_DECISION_PROVENANCE_ID,
    incidentalDecisionProvenanceId: INCIDENTAL_DECISION_PROVENANCE_ID,
    primaryDecisionProvenanceFingerprint: primaryDecisionProvenance.provenanceFingerprint,
    primaryLabelFileSha256: sha256(primaryLabelText),
    primaryLabelSetFingerprint: ordinaryEvaluationFingerprint(allThereLabels.map((label) => label.primaryLabelFingerprint)),
    issuedIncidentalPrimaryLabelPacketSha256: sha256(issuedThereText),
    nonGoldReviewPacketSha256: sha256(nonGoldReviewPacketText),
    analyserBehaviour: "NOT_EVALUATED",
  };
  const primaryLabelReceipt = { ...primaryLabelReceiptCore, receiptFingerprint: ordinaryEvaluationFingerprint(primaryLabelReceiptCore) };
  const coverageCore = {
    schemaVersion: 1,
    statusAt: CONFIRMATION_TIMESTAMP,
    supplementalSourceManifestFingerprint: supplementManifest.supplementalSourceManifestFingerprint,
    coverage: {
      THERE_THEIR_THEYRE: {
        totalAnnotatedOccurrences: allThereInventory.length,
        passagesWithFamily: new Set(allThereInventory.map((record) => record.passageId)).size,
        approvedPrimary: primaryLabels.length,
        completedOccurrencePrimaryLabels: allThereLabels.length,
        pendingOccurrencePrimaryLabels: 0,
        primaryByClassification: classificationCounts,
        primaryByConstruction: constructionCounts,
        primaryBySubtype: subtypeCounts,
        protectedPrimaryCounts,
        coverageQuotaShortages: [],
        workflowShortages: [],
      },
      TO_TOO_TWO: {
        supplementalAnnotatedOccurrences: pendingTo.length,
        supplementalPassagesWithFamily: new Set(pendingTo.map((record) => record.passageId)).size,
        supplementalPrimaryFocuses: 0,
        supplementalOccurrencePrimaryLabelsComplete: 0,
        supplementalOccurrencePrimaryLabelsPending: pendingTo.length,
      },
    },
  };
  const coverage = { ...coverageCore, coverageLedgerFingerprint: ordinaryEvaluationFingerprint(coverageCore) };
  const coverageText = `${JSON.stringify(coverage, null, 2)}\n`;
  const frozenCandidate = JSON.parse(readFileSync(join(ROOT, "release-candidates/s8-v3-there-their-theyre.blocked.json"), "utf8"));
  const dispositionCore = {
    schemaVersion: 1,
    family: "THERE_THEIR_THEYRE",
    disposition: "BLOCKED",
    blockerType: "EXACT_EVALUATION_PENDING",
    exactRelease: {
      releaseKey: frozenCandidate.releaseKey,
      releaseId: frozenCandidate.releaseId,
      manifestFingerprint: frozenCandidate.manifestFingerprint,
      engineeringCandidateArtifactFingerprint: frozenCandidate.artifactFingerprint,
      frozenCandidateStatus: frozenCandidate.status,
    },
    evidence: {
      rawWorkbookSha256: EXPECTED_WORKBOOK_SHA256,
      supplementalSourceManifestFingerprint: supplementManifest.supplementalSourceManifestFingerprint,
      supplementalInventorySha256: sha256(supplementalInventoryText),
      primaryLabelReceiptFingerprint: primaryLabelReceipt.receiptFingerprint,
      coverageLedgerFingerprint: coverage.coverageLedgerFingerprint,
      issuedIncidentalPrimaryLabelPacketSha256: sha256(issuedThereText),
      completedNonGoldReviewPacketSha256: sha256(nonGoldReviewPacketText),
      candidateFingerprint: goldLockReceipt.candidateSetFingerprint,
      candidateFileSha256: goldLockReceipt.candidateFileSha256,
      goldFingerprint: goldLockReceipt.goldSetFingerprint,
      goldFileSha256: goldLockReceipt.goldFileSha256,
      goldLockReceiptFingerprint: goldLockReceipt.goldLockReceiptFingerprint,
      corpusFingerprint,
      reportFingerprint: null,
    },
    humanWorkflow: {
      primaryLabelsComplete: true,
      confirmedOccurrenceDecisions: allThereLabels.length,
      requiredOccurrenceDecisions: allThereInventory.length,
      pendingOccurrenceDecisions: 0,
      primaryCoverageComplete: true,
      nonGoldReviewComplete: true,
      adjudicationComplete: true,
      finalGoldLocked: true,
    },
    coverage: coverage.coverage.THERE_THEIR_THEYRE,
    failedGates: ["EXACT_RELEASE_EVALUATION_NOT_RUN", "DETERMINISTIC_EVALUATION_REPEAT_NOT_RUN"],
    failedCases: [],
    unevaluatedCases: allThereInventory.length,
    metrics: null,
    analyserBehaviour: "NOT_EVALUATED",
    familyDeliveryRemainsDisabled: true,
    publicationPerformed: false,
    selectionPerformed: false,
    approvalEventCreated: false,
    activationPerformed: false,
  };
  const disposition = { ...dispositionCore, dispositionFingerprint: ordinaryEvaluationFingerprint(dispositionCore) };

  const outputs = new Map<string, string>([
    ["human-review/governance/unsupported-sentinel-authorization.json", `${JSON.stringify(sentinelAuthorization, null, 2)}\n`],
    ["human-review/governance/supplement-authorship-resolution.json", `${JSON.stringify(supplementAuthorship, null, 2)}\n`],
    ["human-review/primary-label/imported/THERE_THEIR_THEYRE.primary-label-decision-provenance.json", `${JSON.stringify(primaryDecisionProvenance, null, 2)}\n`],
    ["source-intake/supplemental-there-quota-source-manifest.json", `${JSON.stringify(supplementManifest, null, 2)}\n`],
    ["source-intake/occurrence-inventory.there-quota-supplement.jsonl", supplementalInventoryText],
    ["human-review/primary-label/imported/THERE_THEIR_THEYRE.primary-labels.in-progress.jsonl", primaryLabelText],
    ["human-review/primary-label/imported/THERE_THEIR_THEYRE.primary-labels.in-progress.receipt.json", `${JSON.stringify(primaryLabelReceipt, null, 2)}\n`],
    ["human-review/primary-label/issued/THERE_THEIR_THEYRE.supplement-incidental.primary-label-review.csv", issuedThereText],
    ["human-review/primary-label/pending/TO_TOO_TWO.supplement-incidental.primary-label-review.csv", pendingToText],
    ["human-review/non-gold/completed/THERE_THEIR_THEYRE.non-gold-review.csv", nonGoldReviewPacketText],
    ["human-review/non-gold/NON-GOLD-REVIEW-INSTRUCTIONS.md", nonGoldReviewInstructions],
    ["candidates/THERE_THEIR_THEYRE.jsonl", candidateText],
    ["gold/THERE_THEIR_THEYRE.final-gold.jsonl", goldText],
    ["gold/THERE_THEIR_THEYRE.gold-lock.receipt.json", `${JSON.stringify(goldLockReceipt, null, 2)}\n`],
    ["source-intake/coverage-ledger.primary-label-in-progress.json", coverageText],
    ["dispositions/s8-v3-there-their-theyre.primary-label-in-progress.blocked.json", `${JSON.stringify(disposition, null, 2)}\n`],
  ]);
  for (const [relativePath, content] of outputs) {
    const path = join(ROOT, relativePath);
    if (write) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
    else assert.equal(readFileSync(path, "utf8"), content, `${relativePath}: generated evidence differs`);
  }

  console.log(JSON.stringify({
    rawWorkbookSha256: EXPECTED_WORKBOOK_SHA256,
    supplementalPassages: supplementalRows.length,
    supplementalOccurrences: supplementalInventory.length,
    supplementalOccurrenceCounts: supplementManifest.supplementalOccurrenceCounts,
    importedThereLabels: allThereLabels.length,
    pendingThereLabels: 0,
    pendingToLabels: pendingTo.length,
    approvedTherePrimary: primaryLabels.length,
    nonGoldReviewPacketRows: nonGoldReviewRows.length,
    candidateCount: candidates.length,
    goldCount: gold.length,
    corpusFingerprint,
    primaryClassificationCounts: classificationCounts,
    constructionCounts,
    subtypeCounts,
    protectedPrimaryCounts,
    disposition: "BLOCKED",
    analyserBehaviour: "NOT_EVALUATED",
    wroteArtifacts: write,
  }, null, 2));
}

main();
