import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ordinaryEvaluationFingerprint } from "./lib/whole-writing-v3-ordinary-evaluation";

const ROOT = join(process.cwd(), "data/whole-writing/v3-ordinary-writing-evaluation");
const RAW = "human-review/primary-label/raw/TO_TOO_TWO V3 Import-Ready Holdout Review - Gerund Human Intake.csv";
const EXPECTED_SHA256 = "63fa6fa82d44d7a3efa78f3daeff16be9d68e3c0c47f23e002a7efec9fe4f4cc";
const CONFIRMED_AT = "2026-09-10T18:44:23Z";
const AUTHORSHIP_RESOLUTION_ID = "s8-v3-to-too-two-gerund-authorship-katie-2026-09-10-01";
const DECISION_PROVENANCE_ID = "s8-v3-to-too-two-gerund-primary-review-katie-2026-09-10-01";
const FAMILY_PATTERN = /(?<![\p{L}\p{N}_])(?:too|two|to)(?![\p{L}\p{N}_])/giu;

type CsvRow = Record<string, string>;

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseCsv(text: string) {
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
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/u, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  assert(!quoted, "CSV ends inside quoted field");
  if (field || row.length) { row.push(field.replace(/\r$/u, "")); rows.push(row); }
  return rows;
}

function records(text: string): CsvRow[] {
  const rows = parseCsv(text.replace(/^\uFEFF/u, ""));
  const headers = rows[0];
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row, index) => {
    assert.equal(row.length, headers.length, `row ${index + 2}: width`);
    return Object.fromEntries(headers.map((header, column) => [header, row[column]]));
  });
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(headers: readonly string[], rows: readonly unknown[][]) {
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function main() {
  const write = process.argv.includes("--write");
  const raw = readFileSync(join(ROOT, RAW));
  assert.equal(sha256(raw), EXPECTED_SHA256);
  const sourceRows = records(raw.toString("utf8"));
  assert.equal(sourceRows.length, 10);
  assert(sourceRows.every((row) => row.source_text.trim()), "all ten source passages must be populated");
  assert(sourceRows.every((row) => !row.passage_id && !row.authored_by && !row.authorship_confirmed), "raw blank provenance fields changed unexpectedly");
  assert(sourceRows.every((row) => row.planned_protected_tag === "gerund"));
  assert(sourceRows.every((row) => row.planned_classification === "VALID"));
  assert(sourceRows.every((row) => row.planned_supported_construction.toUpperCase() === "FALSE"));
  assert(sourceRows.every((row) => row.planned_declared_construction === "not_applicable" && row.planned_declared_subtype === "not_applicable"));

  const inventory: Array<Record<string, unknown>> = [];
  const primaryInventory: Array<Record<string, unknown>> = [];
  sourceRows.forEach((row, rowIndex) => {
    const passageId = `v3-to-too-two-gerund-supplement-${String(rowIndex + 1).padStart(4, "0")}`;
    const matches = [...row.source_text.matchAll(FAMILY_PATTERN)];
    assert(matches.length >= 1, `${passageId}: no governed occurrence`);
    matches.forEach((match, occurrenceIndex) => {
      assert.notEqual(match.index, undefined);
      const startUtf16 = match.index!;
      const focusSurface = match[0];
      const endUtf16 = startUtf16 + focusSurface.length;
      const caseId = `${passageId}-to-too-two-${String(occurrenceIndex + 1).padStart(2, "0")}`;
      const primaryFocusPreselected = occurrenceIndex === matches.length - 1;
      const core = {
        schemaVersion: 1 as const,
        sourceFileName: "TO_TOO_TWO V3 Import-Ready Holdout Review - Gerund Human Intake.csv",
        sourceFileSha256: EXPECTED_SHA256,
        sourceRowNumber: rowIndex + 2,
        passageId,
        caseId,
        family: "TO_TOO_TWO" as const,
        sourceText: row.source_text,
        focusSurface,
        startUtf16,
        endUtf16,
        spanValidated: true as const,
        primaryFocusPreselected,
        primarySelectionRule: "HUMAN_GERUND_FOCUS_FROM_SOURCE_ROW",
        sourceReference: row.source_reference,
        authoredByClaim: "Katie Sanderson",
        authorshipConfirmedClaim: "TRUE",
        sourceGroupClaim: row.source_group,
        authorshipResolutionId: AUTHORSHIP_RESOLUTION_ID,
        sourceAuthorship: "HUMAN_AUTHORED" as const,
        identifierGeneration: "AI_ASSISTED" as const,
      };
      assert.equal(core.sourceText.slice(startUtf16, endUtf16), focusSurface);
      const record = { ...core, inventoryFingerprint: ordinaryEvaluationFingerprint(core) };
      inventory.push(record);
      if (primaryFocusPreselected) primaryInventory.push(record);
    });
  });
  assert.equal(inventory.length, 11);
  assert.equal(primaryInventory.length, 10);
  const incidentalInventory = inventory.find((record) => !record.primaryFocusPreselected);
  assert(incidentalInventory, "the additional infinitive occurrence must be inventoried");

  const primaryLabels = primaryInventory.map((record) => {
    const core = {
      schemaVersion: 1 as const,
      primaryLabelId: `primary-${record.caseId}`,
      inventoryFingerprint: record.inventoryFingerprint,
      caseId: record.caseId,
      family: "TO_TOO_TWO" as const,
      declaredConstruction: "not_applicable",
      declaredSubtype: "not_applicable",
      protectedSetTags: ["gerund"],
      classification: "VALID" as const,
      intendedAlternative: null,
      supportedConstruction: false,
      primaryFocusApproved: true,
      labelerId: "Katie Sanderson",
      labeledAt: CONFIRMED_AT,
      notes: "Katie Sanderson authored the passage and confirmed completion of the gerund intake. The row's planned human decision is adopted under the TO_TOO_TWO valid-unsupported sentinel authorization.",
      decisionProvenanceId: DECISION_PROVENANCE_ID,
    };
    return { ...core, primaryLabelFingerprint: ordinaryEvaluationFingerprint(core) };
  });
  const inventoryText = `${inventory.map((record) => JSON.stringify(record)).join("\n")}\n`;
  const labelText = `${primaryLabels.map((record) => JSON.stringify(record)).join("\n")}\n`;
  const nonGoldHeaders = ["schema_version", "case_id", "family", "inventory_fingerprint", "review_classification", "review_intended_alternative", "review_supported_construction", "review_declared_construction", "review_declared_subtype", "review_protected_set_tags_json", "non_gold_review_id", "non_gold_reviewer", "non_gold_review_timestamp_utc", "primary_decisions_visible", "analyser_predictions_visible", "review_notes"];
  const nonGoldText = csv(nonGoldHeaders, primaryLabels.map((label) => [1, label.caseId, label.family, label.inventoryFingerprint, label.classification, "", false, label.declaredConstruction, label.declaredSubtype, JSON.stringify(label.protectedSetTags), `non-gold-${label.caseId}`, "Katie Sanderson", CONFIRMED_AT, true, false, "Katie Sanderson reviewed and copied this human decision."]));
  const pendingHeaders = ["schema_version", "inventory_fingerprint", "passage_id", "case_id", "family", "source_text", "focus_surface", "start_utf16", "end_utf16", "span_validated", "primary_focus_preselected", "source_reference", "authored_by", "classification", "intended_alternative", "supported_construction", "declared_construction", "declared_subtype", "protected_set_tags_json", "primary_focus_approved", "primary_label_id", "primary_labeler", "primary_label_timestamp_utc", "primary_notes"];
  const pendingText = csv(pendingHeaders, [[1, incidentalInventory.inventoryFingerprint, incidentalInventory.passageId, incidentalInventory.caseId, "TO_TOO_TWO", incidentalInventory.sourceText, incidentalInventory.focusSurface, incidentalInventory.startUtf16, incidentalInventory.endUtf16, true, false, incidentalInventory.sourceReference, "Katie Sanderson", "", "", "", "", "", "", false, `primary-${incidentalInventory.caseId}`, "Katie Sanderson", "", ""]]);

  const authorshipCore = { schemaVersion: 1, resolutionId: AUTHORSHIP_RESOLUTION_ID, decidedBy: "Katie Sanderson", decidedAt: CONFIRMED_AT, rawSourceSha256: EXPECTED_SHA256, passageCount: 10, sourceTextAuthorship: "HUMAN_AUTHORED", identifierGeneration: "AI_ASSISTED", analyserPredictionsExposed: false, resolution: "Katie Sanderson confirmed that she completed all ten source passages and adopted the populated planned primary decisions; blank authorship cells in the raw CSV are superseded by this direct attestation." };
  const authorship = { ...authorshipCore, provenanceResolutionFingerprint: ordinaryEvaluationFingerprint(authorshipCore) };
  const manifestCore = { schemaVersion: 1, family: "TO_TOO_TWO", intakeDate: "2026-09-10", rawCsv: { suppliedFileName: "TO_TOO_TWO V3 Import-Ready Holdout Review - Gerund Human Intake.csv", preservedPath: RAW, byteLength: raw.length, sha256: EXPECTED_SHA256 }, passageCount: 10, governedOccurrenceCount: 11, completedPrimaryDecisionCount: 10, pendingIncidentalDecisionCount: 1, inventorySha256: sha256(inventoryText), authorshipResolutionId: AUTHORSHIP_RESOLUTION_ID, analyserPredictionsExposed: false };
  const manifest = { ...manifestCore, sourceManifestFingerprint: ordinaryEvaluationFingerprint(manifestCore) };
  const receiptCore = { schemaVersion: 1, family: "TO_TOO_TWO", importStatus: "GERUND_PRIMARY_COMPLETE_ONE_INCIDENTAL_PENDING", importedGerundPrimaryLabelCount: 10, importedGerundNonGoldReviewCount: 10, pendingIncidentalOccurrenceLabels: 1, gerundInventorySha256: sha256(inventoryText), gerundPrimaryLabelFileSha256: sha256(labelText), gerundPrimaryLabelSetFingerprint: ordinaryEvaluationFingerprint(primaryLabels.map((label) => label.primaryLabelFingerprint)), gerundNonGoldReviewFileSha256: sha256(nonGoldText), pendingIncidentalPacketSha256: sha256(pendingText), sourceManifestFingerprint: manifest.sourceManifestFingerprint, analyserBehaviour: "NOT_EVALUATED" };
  const receipt = { ...receiptCore, receiptFingerprint: ordinaryEvaluationFingerprint(receiptCore) };
  const coverageCore = { schemaVersion: 1, family: "TO_TOO_TWO", totalAnnotatedOccurrences: 1270, completedOccurrencePrimaryLabels: 1269, pendingOccurrencePrimaryLabels: 1, approvedPrimary: 410, primaryByClassification: { VALID: 160, INVALID: 150, UNCERTAIN: 100 }, primaryByConstruction: { preposition: { VALID: 30, INVALID: 30 }, infinitive: { VALID: 30, INVALID: 30 }, additive: { VALID: 30, INVALID: 30 }, degree: { VALID: 30, INVALID: 30 }, numeral: { VALID: 30, INVALID: 30 } }, primaryBySubtype: { destination_or_recipient_preposition: { VALID: 30, INVALID: 30 }, governed_infinitive: { VALID: 30, INVALID: 30 }, clause_additive: { VALID: 30, INVALID: 30 }, adjective_or_manner_degree: { VALID: 30, INVALID: 30 }, ordinary_count_numeral: { VALID: 30, INVALID: 30 } }, protectedPrimaryCounts: { fragment: 20, quotation: 20, gerund: 10, run_on: 20, task_dependent: 20 }, coverageQuotaShortages: [], workflowShortages: [{ gate: "complete_occurrence_labels", shortage: 1, caseId: incidentalInventory.caseId }], humanWorkflow: { gerundPrimaryLabelsComplete: true, gerundPrimaryNonGoldReviewComplete: true, incidentalDecisionComplete: false, finalGoldLocked: false } };
  const coverage = { ...coverageCore, coverageLedgerFingerprint: ordinaryEvaluationFingerprint(coverageCore) };
  const dispositionCore = { schemaVersion: 1, family: "TO_TOO_TWO", disposition: "BLOCKED", blockerType: "UNRESOLVED_HUMAN_AUTHORITY", exactRelease: { releaseKey: "s8-v3-to-too-two", releaseId: "81000000-0000-4000-8000-000000000011", manifestFingerprint: "2f94d99924cd312e934cb0afddb3681e17b31a8ce5dc2b1b03492082029218f8" }, evidence: { rawGerundCsvSha256: EXPECTED_SHA256, gerundSourceManifestFingerprint: manifest.sourceManifestFingerprint, gerundImportReceiptFingerprint: receipt.receiptFingerprint, coverageLedgerFingerprint: coverage.coverageLedgerFingerprint, candidateFingerprint: null, goldFingerprint: null, reportFingerprint: null }, humanWorkflow: coverage.humanWorkflow, failedGates: ["INCIDENTAL_OCCURRENCE_PRIMARY_LABEL_MISSING", "FINAL_GOLD_NOT_LOCKED", "EXACT_RELEASE_EVALUATION_NOT_RUN", "DETERMINISTIC_EVALUATION_REPEAT_NOT_RUN"], failedCases: [{ caseId: incidentalInventory.caseId, reason: "The first TO in passage 02 is inventoried but has no explicit human classification, construction/subtype decision or completed non-gold review." }], metrics: null, analyserBehaviour: "NOT_EVALUATED", familyDeliveryRemainsDisabled: true, publicationPerformed: false, selectionPerformed: false, approvalEventCreated: false, activationPerformed: false };
  const disposition = { ...dispositionCore, dispositionFingerprint: ordinaryEvaluationFingerprint(dispositionCore) };
  const outputs = new Map<string, string>([
    ["human-review/governance/to-too-two-gerund-authorship-resolution.json", `${JSON.stringify(authorship, null, 2)}\n`],
    ["source-intake/to-too-two-gerund-source-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`],
    ["source-intake/occurrence-inventory.to-gerund-supplement.jsonl", inventoryText],
    ["human-review/primary-label/imported/TO_TOO_TWO.gerund-primary-labels.in-progress.jsonl", labelText],
    ["human-review/non-gold/completed/TO_TOO_TWO.gerund-primary.non-gold-review.csv", nonGoldText],
    ["human-review/primary-label/pending/TO_TOO_TWO.gerund-incidental.primary-label-review.csv", pendingText],
    ["human-review/primary-label/imported/TO_TOO_TWO.gerund-primary-labels.in-progress.receipt.json", `${JSON.stringify(receipt, null, 2)}\n`],
    ["source-intake/coverage-ledger.to-too-two-gerund-incidental-pending.json", `${JSON.stringify(coverage, null, 2)}\n`],
    ["dispositions/s8-v3-to-too-two.gerund-incidental-pending.blocked.json", `${JSON.stringify(disposition, null, 2)}\n`],
  ]);
  for (const [relativePath, content] of outputs) {
    const path = join(ROOT, relativePath);
    if (write) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
    else assert.equal(readFileSync(path, "utf8"), content, `${relativePath}: generated evidence differs`);
  }
  console.log(JSON.stringify({ rawCsvSha256: EXPECTED_SHA256, passages: 10, governedOccurrences: 11, importedGerundPrimaryLabels: 10, pendingIncidentalLabels: 1, protectedPrimaryCounts: coverage.protectedPrimaryCounts, coverageQuotaShortages: [], workflowShortages: coverage.workflowShortages, disposition: "BLOCKED", analyserBehaviour: "NOT_EVALUATED", wroteArtifacts: write }, null, 2));
}

main();
