import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ordinaryEvaluationFingerprint } from "./lib/whole-writing-v3-ordinary-evaluation";

const ROOT = join(process.cwd(), "data/whole-writing/v3-ordinary-writing-evaluation");
const REVIEWED_AT = "2026-09-10T18:03:04Z";
const WORKBOOK = "human-review/primary-label/raw/TO_TOO_TWO V3 Import-Ready Holdout Review.xlsx";
const CORE = "human-review/primary-label/extracted/TO_TOO_TWO.core-corrected-labels.csv";
const INCIDENTALS = "human-review/primary-label/extracted/TO_TOO_TWO.ttt-incidentals.csv";
const GERUND = "human-review/primary-label/extracted/TO_TOO_TWO.gerund-human-intake.csv";
const EXPECTED = {
  workbook: "5fb3d40d3ff497a921e5f7434b80c30fb213e458e6ea98f59fac2518f8433fd1",
  core: "12d47d09031732337e546bedcbc8084627d482747935aac8710430c63f12b546",
  incidentals: "3c5221358078cec512189de1a23b54489c84d4d20451749faae5b55ef0766f9c",
  gerund: "c53cb86933e6d8d7010bc75a45b2d518c2e692fe98436e4fcba0889197a19ccc",
} as const;
const SUPPORTED = new Set([
  "preposition\0destination_or_recipient_preposition",
  "infinitive\0governed_infinitive",
  "additive\0clause_additive",
  "degree\0adjective_or_manner_degree",
  "numeral\0ordinary_count_numeral",
]);
const PROTECTED = ["fragment", "quotation", "gerund", "run_on", "task_dependent"] as const;
type Row = Record<string, string>;
type Inventory = Readonly<Record<string, unknown> & {
  caseId: string; passageId: string; family: "TO_TOO_TWO"; sourceText: string; focusSurface: string;
  startUtf16: number; endUtf16: number; inventoryFingerprint: string; sourceReference: string;
  authoredByClaim: string; sourceAuthorship: string; identifierGeneration: string;
}>;

function sha256(value: Buffer | string) { return createHash("sha256").update(value).digest("hex"); }
function parseCsv(text: string) {
  const out: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/u, "")); out.push(row); row = []; field = ""; }
    else field += c;
  }
  assert(!quoted);
  if (field || row.length) { row.push(field.replace(/\r$/u, "")); out.push(row); }
  return out;
}
function records(text: string): Row[] {
  const rows = parseCsv(text.replace(/^\uFEFF/u, "")); const headers = rows[0];
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row) => {
    assert.equal(row.length, headers.length); return Object.fromEntries(headers.map((header, i) => [header, row[i]]));
  });
}
function bool(value: string) { assert(["true", "false"].includes(value.toLowerCase())); return value.toLowerCase() === "true"; }
function csvCell(value: unknown) { const text = value === null || value === undefined ? "" : String(value); return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function csv(headers: readonly string[], rows: readonly unknown[][]) { return `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`; }

function main() {
  const write = process.argv.includes("--write");
  const workbookBytes = readFileSync(join(ROOT, WORKBOOK));
  const coreBytes = readFileSync(join(ROOT, CORE));
  const incidentalBytes = readFileSync(join(ROOT, INCIDENTALS));
  const gerundBytes = readFileSync(join(ROOT, GERUND));
  assert.equal(sha256(workbookBytes), EXPECTED.workbook); assert.equal(sha256(coreBytes), EXPECTED.core);
  assert.equal(sha256(incidentalBytes), EXPECTED.incidentals); assert.equal(sha256(gerundBytes), EXPECTED.gerund);

  const baseInventory = readFileSync(join(ROOT, "source-intake/occurrence-inventory.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Inventory).filter((row) => row.family === "TO_TOO_TWO");
  const supplementalInventory = readFileSync(join(ROOT, "source-intake/occurrence-inventory.there-quota-supplement.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Inventory).filter((row) => row.family === "TO_TOO_TWO");
  const baseByCase = new Map(baseInventory.map((row) => [row.caseId, row]));
  const supplementalBySpan = new Map(supplementalInventory.map((row) => [`${row.sourceText}\0${row.startUtf16}\0${row.endUtf16}`, row]));
  const coreRows = records(coreBytes.toString("utf8")); const incidentalRows = records(incidentalBytes.toString("utf8")); const gerundRows = records(gerundBytes.toString("utf8"));
  assert.equal(coreRows.length, 1209); assert.equal(incidentalRows.length, 50); assert.equal(gerundRows.length, 10);
  assert(gerundRows.every((row) => !row.source_text && !row.authored_by && !row.authorship_confirmed));

  const validateDecision = (decision: { caseId: string; classification: string; intendedAlternative: string | null; supportedConstruction: boolean; declaredConstruction: string; declaredSubtype: string; protectedSetTags: string[] }) => {
    assert(["VALID", "INVALID", "UNCERTAIN"].includes(decision.classification), decision.caseId);
    assert(decision.protectedSetTags.every((tag) => (PROTECTED as readonly string[]).includes(tag)), decision.caseId);
    if (decision.classification === "INVALID") { assert(decision.intendedAlternative && ["to", "too", "two"].includes(decision.intendedAlternative)); }
    else assert.equal(decision.intendedAlternative, null);
    if (decision.supportedConstruction) assert(SUPPORTED.has(`${decision.declaredConstruction}\0${decision.declaredSubtype}`), decision.caseId);
    else { assert.equal(decision.declaredConstruction, "not_applicable"); assert.equal(decision.declaredSubtype, "not_applicable"); assert(["VALID", "UNCERTAIN"].includes(decision.classification)); }
  };
  const makeLabel = (inventory: Inventory, row: Row, id: string, notes: string) => {
    assert.equal(inventory.sourceText.slice(inventory.startUtf16, inventory.endUtf16), inventory.focusSurface);
    const core = {
      schemaVersion: 1, primaryLabelId: id, inventoryFingerprint: inventory.inventoryFingerprint, caseId: inventory.caseId,
      family: inventory.family, declaredConstruction: row.declared_construction, declaredSubtype: row.declared_subtype,
      protectedSetTags: JSON.parse(row.protected_set_tags_json) as string[], classification: row.classification,
      intendedAlternative: row.intended_alternative || null, supportedConstruction: bool(row.supported_construction),
      primaryFocusApproved: bool(row.primary_focus_approved), labelerId: "Katie Sanderson", labeledAt: REVIEWED_AT,
      notes, decisionProvenanceId: "s8-v3-to-too-two-primary-review-katie-2026-09-10-01",
    };
    validateDecision(core); return { ...core, primaryLabelFingerprint: ordinaryEvaluationFingerprint(core) };
  };
  const labels = coreRows.map((row) => {
    const inventory = baseByCase.get(row.case_id); assert(inventory, row.case_id);
    assert.equal(row.inventory_fingerprint, inventory.inventoryFingerprint); assert.equal(row.source_text, inventory.sourceText);
    assert.equal(row.focus_surface, inventory.focusSurface); assert.equal(Number(row.start_utf16), inventory.startUtf16); assert.equal(Number(row.end_utf16), inventory.endUtf16);
    return makeLabel(inventory, row, row.primary_label_id, `Katie Sanderson reviewed and adopted the workbook decision. Prior AI labeler metadata was stale. ${row.primary_notes}`);
  });
  for (const row of incidentalRows) {
    const inventory = supplementalBySpan.get(`${row.source_text}\0${row.start_utf16}\0${row.end_utf16}`); assert(inventory, row.source_supplement_id);
    labels.push(makeLabel(inventory, row, `primary-${inventory.caseId}`, "Katie Sanderson reviewed and adopted this valid non-primary incidental decision."));
  }
  assert.equal(labels.length, 1259); assert.equal(new Set(labels.map((row) => row.caseId)).size, labels.length);
  const primary = labels.filter((row) => row.primaryFocusApproved); assert.equal(primary.length, 400);
  assert.equal(new Set(primary.map((row) => [...baseInventory, ...supplementalInventory].find((item) => item.caseId === row.caseId)!.passageId)).size, 400);
  const classificationCounts = Object.fromEntries(["VALID", "INVALID", "UNCERTAIN"].map((value) => [value, primary.filter((row) => row.classification === value).length]));
  assert.deepEqual(classificationCounts, { VALID: 150, INVALID: 150, UNCERTAIN: 100 });
  const constructionCounts = Object.fromEntries(["preposition", "infinitive", "additive", "degree", "numeral"].map((name) => [name, { VALID: primary.filter((row) => row.declaredConstruction === name && row.classification === "VALID").length, INVALID: primary.filter((row) => row.declaredConstruction === name && row.classification === "INVALID").length }]));
  for (const count of Object.values(constructionCounts)) { assert.equal(count.VALID, 30); assert.equal(count.INVALID, 30); }
  const protectedCounts = Object.fromEntries(PROTECTED.map((tag) => [tag, primary.filter((row) => row.protectedSetTags.includes(tag)).length]));
  assert.deepEqual(protectedCounts, { fragment: 20, quotation: 20, gerund: 0, run_on: 20, task_dependent: 20 });

  const labelText = `${labels.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const reviewHeaders = ["schema_version", "case_id", "family", "inventory_fingerprint", "review_classification", "review_intended_alternative", "review_supported_construction", "review_declared_construction", "review_declared_subtype", "review_protected_set_tags_json", "non_gold_review_id", "non_gold_reviewer", "non_gold_review_timestamp_utc", "primary_decisions_visible", "analyser_predictions_visible", "review_notes"];
  const reviewText = csv(reviewHeaders, labels.map((row) => [1, row.caseId, row.family, row.inventoryFingerprint, row.classification, row.intendedAlternative, row.supportedConstruction, row.declaredConstruction, row.declaredSubtype, JSON.stringify(row.protectedSetTags), `non-gold-${row.caseId}`, "Katie Sanderson", REVIEWED_AT, true, false, "Katie Sanderson reviewed and copied this human decision."]));
  const gerundIntakeHeaders = ["schema_version", "intake_slot_id", "source_reference", "source_text", "authored_by", "authorship_confirmed", "classification", "intended_alternative", "supported_construction", "declared_construction", "declared_subtype", "protected_set_tags_json", "primary_focus_approved", "primary_labeler", "primary_label_timestamp_utc", "primary_notes"];
  const gerundIntakeText = csv(gerundIntakeHeaders, gerundRows.map((row, index) => [1, `to-too-two-gerund-${String(index + 1).padStart(3, "0")}`, row.source_reference, "", "", "", "", "", "", "", "", "", "", "", "", ""]));
  const authorizationCore = { schemaVersion: 1, authorizationId: "s8-v3-to-too-two-valid-unsupported-sentinel-katie-2026-09-10-01", authorizedBy: "Katie Sanderson", authorizedAt: REVIEWED_AT, family: "TO_TOO_TWO", declaredConstruction: "not_applicable", declaredSubtype: "not_applicable", permittedClassifications: ["VALID", "UNCERTAIN"], requiredSupportedConstruction: false, requiredIntendedAlternative: null, source: "Explicit user authorization in the current governed holdout task." };
  const authorization = { ...authorizationCore, authorizationFingerprint: ordinaryEvaluationFingerprint(authorizationCore) };
  const manifestCore = { schemaVersion: 1, intakeDate: "2026-09-10", family: "TO_TOO_TWO", rawWorkbook: { suppliedFileName: "TO_TOO_TWO V3 Import-Ready Holdout Review.xlsx", preservedPath: WORKBOOK, byteLength: workbookBytes.length, sha256: EXPECTED.workbook }, extractedSheets: [{ sheetName: "Core Corrected Labels", path: CORE, rowCount: 1209, sha256: EXPECTED.core }, { sheetName: "TTT TO Incidentals", path: INCIDENTALS, rowCount: 50, sha256: EXPECTED.incidentals }, { sheetName: "Gerund Human Intake", path: GERUND, rowCount: 10, sha256: EXPECTED.gerund }], primaryHuman: "Katie Sanderson", priorAiLabelerMetadataStatus: "STALE_REPLACED_BY_HUMAN_ATTESTATION", analyserPredictionsExposed: false };
  const manifest = { ...manifestCore, sourceManifestFingerprint: ordinaryEvaluationFingerprint(manifestCore) };
  const receiptCore = { schemaVersion: 1, family: "TO_TOO_TWO", importStatus: "CURRENT_OCCURRENCES_COMPLETE_GERUND_SOURCE_PENDING", importedLabelCount: labels.length, importedPrimaryCount: primary.length, currentInventoryOccurrenceCount: 1259, pendingExistingOccurrenceLabels: 0, requiredAdditionalHumanGerundPrimaryCases: 10, primaryHuman: "Katie Sanderson", sourceManifestFingerprint: manifest.sourceManifestFingerprint, primaryLabelFileSha256: sha256(labelText), primaryLabelSetFingerprint: ordinaryEvaluationFingerprint(labels.map((row) => row.primaryLabelFingerprint)), nonGoldReviewFileSha256: sha256(reviewText), pendingGerundIntakeSha256: sha256(gerundIntakeText), sentinelAuthorizationFingerprint: authorization.authorizationFingerprint, analyserBehaviour: "NOT_EVALUATED" };
  const receipt = { ...receiptCore, receiptFingerprint: ordinaryEvaluationFingerprint(receiptCore) };
  const coverageCore = { schemaVersion: 1, family: "TO_TOO_TWO", currentAnnotatedOccurrences: 1259, currentPrimaryCases: 400, primaryByClassification: classificationCounts, primaryByConstruction: constructionCounts, protectedPrimaryCounts: protectedCounts, coverageShortages: [{ gate: "protected:gerund", required: 10, present: 0, shortage: 10 }], humanWorkflow: { currentOccurrencePrimaryLabelsComplete: true, currentOccurrenceNonGoldReviewComplete: true, adjudicationRequiredForCurrentDecisions: false, additionalHumanSourceRequired: true, finalGoldLocked: false } };
  const coverage = { ...coverageCore, coverageLedgerFingerprint: ordinaryEvaluationFingerprint(coverageCore) };
  const dispositionCore = { schemaVersion: 1, family: "TO_TOO_TWO", disposition: "BLOCKED", blockerType: "EVIDENCE_COVERAGE", exactRelease: { releaseKey: "s8-v3-to-too-two", releaseId: "81000000-0000-4000-8000-000000000011", manifestFingerprint: "2f94d99924cd312e934cb0afddb3681e17b31a8ce5dc2b1b03492082029218f8" }, evidence: { sourceManifestFingerprint: manifest.sourceManifestFingerprint, primaryLabelReceiptFingerprint: receipt.receiptFingerprint, coverageLedgerFingerprint: coverage.coverageLedgerFingerprint, candidateFingerprint: null, goldFingerprint: null, reportFingerprint: null }, humanWorkflow: coverage.humanWorkflow, failedGates: ["GERUND_PROTECTED_COVERAGE_SHORTAGE_10", "FINAL_GOLD_NOT_LOCKED", "EXACT_RELEASE_EVALUATION_NOT_RUN", "DETERMINISTIC_EVALUATION_REPEAT_NOT_RUN"], metrics: null, analyserBehaviour: "NOT_EVALUATED", familyDeliveryRemainsDisabled: true, publicationPerformed: false, selectionPerformed: false, approvalEventCreated: false, activationPerformed: false };
  const disposition = { ...dispositionCore, dispositionFingerprint: ordinaryEvaluationFingerprint(dispositionCore) };
  const outputs = new Map<string, string>([
    ["human-review/governance/to-too-two-valid-unsupported-sentinel-authorization.json", `${JSON.stringify(authorization, null, 2)}\n`],
    ["source-intake/to-too-two-review-source-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`],
    ["human-review/primary-label/imported/TO_TOO_TWO.primary-labels.in-progress.jsonl", labelText],
    ["human-review/primary-label/imported/TO_TOO_TWO.primary-labels.in-progress.receipt.json", `${JSON.stringify(receipt, null, 2)}\n`],
    ["human-review/non-gold/completed/TO_TOO_TWO.non-gold-review.current-inventory.csv", reviewText],
    ["human-review/primary-label/pending/TO_TOO_TWO.gerund-protected-source-and-label-intake.csv", gerundIntakeText],
    ["source-intake/coverage-ledger.to-too-two-primary-label-in-progress.json", `${JSON.stringify(coverage, null, 2)}\n`],
    ["dispositions/s8-v3-to-too-two.primary-label-in-progress.blocked.json", `${JSON.stringify(disposition, null, 2)}\n`],
  ]);
  for (const [relativePath, content] of outputs) { const path = join(ROOT, relativePath); if (write) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); } else assert.equal(readFileSync(path, "utf8"), content, `${relativePath}: generated evidence differs`); }
  console.log(JSON.stringify({ importedLabels: labels.length, primaryCases: primary.length, primaryByClassification: classificationCounts, primaryByConstruction: constructionCounts, protectedPrimaryCounts: protectedCounts, missingHumanGerundPrimaryCases: 10, primaryHuman: "Katie Sanderson", analyserBehaviour: "NOT_EVALUATED", disposition: "BLOCKED", wroteArtifacts: write }, null, 2));
}

main();
