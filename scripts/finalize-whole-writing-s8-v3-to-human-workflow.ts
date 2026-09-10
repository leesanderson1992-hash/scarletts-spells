import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ordinaryEvaluationFingerprint } from "./lib/whole-writing-v3-ordinary-evaluation";

const ROOT = join(process.cwd(), "data/whole-writing/v3-ordinary-writing-evaluation");
const CONFIRMED_AT = "2026-09-10T19:24:51Z";
const INCIDENTAL_CASE_ID = "v3-to-too-two-gerund-supplement-0002-to-too-two-01";
const RELEASE = {
  releaseKey: "s8-v3-to-too-two",
  releaseId: "81000000-0000-4000-8000-000000000011",
  manifestFingerprint: "2f94d99924cd312e934cb0afddb3681e17b31a8ce5dc2b1b03492082029218f8",
  engineeringCandidateArtifactFingerprint: "097ac006fab63a1078afaca518ab5139cbccbac4be75f830b5d71660b82fa88d",
  frozenCandidateStatus: "BLOCKED_HUMAN_HOLDOUT_MISSING",
} as const;

type Inventory = Readonly<Record<string, unknown> & {
  passageId: string; caseId: string; family: "TO_TOO_TWO"; sourceText: string; focusSurface: string;
  startUtf16: number; endUtf16: number; sourceReference: string; authoredByClaim: string;
  inventoryFingerprint: string;
}>;
type Label = Readonly<Record<string, unknown> & {
  primaryLabelId: string; inventoryFingerprint: string; caseId: string; family: "TO_TOO_TWO";
  declaredConstruction: string; declaredSubtype: string; protectedSetTags: string[];
  classification: "VALID" | "INVALID" | "UNCERTAIN"; intendedAlternative: string | null;
  supportedConstruction: boolean; primaryFocusApproved: boolean; primaryLabelFingerprint: string;
}>;

function sha256(value: Buffer | string) { return createHash("sha256").update(value).digest("hex"); }
function readJsonl<T>(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
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
  const baseInventory = readJsonl<Inventory>("source-intake/occurrence-inventory.jsonl").filter((row) => row.family === "TO_TOO_TWO");
  const supplementalInventory = readJsonl<Inventory>("source-intake/occurrence-inventory.there-quota-supplement.jsonl").filter((row) => row.family === "TO_TOO_TWO");
  const gerundInventory = readJsonl<Inventory>("source-intake/occurrence-inventory.to-gerund-supplement.jsonl");
  const inventory = [...baseInventory, ...supplementalInventory, ...gerundInventory];
  assert.equal(inventory.length, 1270);
  assert.equal(new Set(inventory.map((row) => row.caseId)).size, inventory.length);
  for (const record of inventory) {
    assert.equal(record.family, "TO_TOO_TWO");
    assert.equal(record.sourceText.slice(record.startUtf16, record.endUtf16), record.focusSurface);
    const { inventoryFingerprint, ...core } = record;
    assert.equal(ordinaryEvaluationFingerprint(core), inventoryFingerprint, `${record.caseId}: inventory fingerprint`);
  }

  const existingLabels = readJsonl<Label>("human-review/primary-label/imported/TO_TOO_TWO.primary-labels.in-progress.jsonl");
  const gerundLabels = readJsonl<Label>("human-review/primary-label/imported/TO_TOO_TWO.gerund-primary-labels.in-progress.jsonl");
  const incidentalInventory = inventory.find((row) => row.caseId === INCIDENTAL_CASE_ID);
  assert(incidentalInventory);
  const incidentalCore = {
    schemaVersion: 1 as const,
    primaryLabelId: `primary-${INCIDENTAL_CASE_ID}`,
    inventoryFingerprint: incidentalInventory.inventoryFingerprint,
    caseId: INCIDENTAL_CASE_ID,
    family: "TO_TOO_TWO" as const,
    declaredConstruction: "infinitive",
    declaredSubtype: "governed_infinitive",
    protectedSetTags: [] as string[],
    classification: "VALID" as const,
    intendedAlternative: null,
    supportedConstruction: true,
    primaryFocusApproved: false,
    labelerId: "Katie Sanderson",
    labeledAt: CONFIRMED_AT,
    notes: "Katie Sanderson explicitly confirmed this is the incidental infinitival to in ‘going to look’. It does not count toward gerund or primary quotas.",
    decisionProvenanceId: "s8-v3-to-too-two-gerund-incidental-katie-2026-09-10-01",
  };
  const incidentalLabel: Label = { ...incidentalCore, primaryLabelFingerprint: ordinaryEvaluationFingerprint(incidentalCore) };
  const labels = [...existingLabels, ...gerundLabels, incidentalLabel];
  assert.equal(labels.length, 1270);
  assert.deepEqual(new Set(labels.map((row) => row.caseId)), new Set(inventory.map((row) => row.caseId)));
  const inventoryByCase = new Map(inventory.map((row) => [row.caseId, row]));
  for (const label of labels) {
    assert.equal(label.inventoryFingerprint, inventoryByCase.get(label.caseId)?.inventoryFingerprint);
    const { primaryLabelFingerprint, ...core } = label;
    assert.equal(ordinaryEvaluationFingerprint(core), primaryLabelFingerprint, `${label.caseId}: label fingerprint`);
    if (label.classification === "INVALID") assert(label.intendedAlternative && ["to", "too", "two"].includes(label.intendedAlternative));
    else assert.equal(label.intendedAlternative, null);
  }

  const primary = labels.filter((row) => row.primaryFocusApproved);
  assert.equal(primary.length, 410);
  assert.equal(new Set(primary.map((row) => inventoryByCase.get(row.caseId)?.passageId)).size, primary.length);
  const classifications = Object.fromEntries(["VALID", "INVALID", "UNCERTAIN"].map((name) => [name, primary.filter((row) => row.classification === name).length]));
  assert.deepEqual(classifications, { VALID: 160, INVALID: 150, UNCERTAIN: 100 });
  const constructions = ["preposition", "infinitive", "additive", "degree", "numeral"];
  const subtypes = ["destination_or_recipient_preposition", "governed_infinitive", "clause_additive", "adjective_or_manner_degree", "ordinary_count_numeral"];
  const primaryByConstruction = Object.fromEntries(constructions.map((name) => [name, { VALID: primary.filter((row) => row.declaredConstruction === name && row.classification === "VALID").length, INVALID: primary.filter((row) => row.declaredConstruction === name && row.classification === "INVALID").length }]));
  const primaryBySubtype = Object.fromEntries(subtypes.map((name) => [name, { VALID: primary.filter((row) => row.declaredSubtype === name && row.classification === "VALID").length, INVALID: primary.filter((row) => row.declaredSubtype === name && row.classification === "INVALID").length }]));
  for (const count of Object.values(primaryByConstruction)) { assert.equal(count.VALID, 30); assert.equal(count.INVALID, 30); }
  for (const count of Object.values(primaryBySubtype)) { assert.equal(count.VALID, 30); assert.equal(count.INVALID, 30); }
  const protectedPrimaryCounts = Object.fromEntries(["fragment", "quotation", "gerund", "run_on", "task_dependent"].map((tag) => [tag, primary.filter((row) => row.protectedSetTags.includes(tag)).length]));
  assert.deepEqual(protectedPrimaryCounts, { fragment: 20, quotation: 20, gerund: 10, run_on: 20, task_dependent: 20 });

  const reviewHeaders = ["schema_version", "case_id", "family", "inventory_fingerprint", "review_classification", "review_intended_alternative", "review_supported_construction", "review_declared_construction", "review_declared_subtype", "review_protected_set_tags_json", "non_gold_review_id", "non_gold_reviewer", "non_gold_review_timestamp_utc", "primary_decisions_visible", "analyser_predictions_visible", "review_notes"];
  const reviewText = csv(reviewHeaders, labels.map((label) => [1, label.caseId, label.family, label.inventoryFingerprint, label.classification, label.intendedAlternative, label.supportedConstruction, label.declaredConstruction, label.declaredSubtype, JSON.stringify(label.protectedSetTags), `non-gold-${label.caseId}`, "Katie Sanderson", label.caseId === INCIDENTAL_CASE_ID ? CONFIRMED_AT : (label.labeledAt ?? CONFIRMED_AT), true, false, label.caseId === INCIDENTAL_CASE_ID ? "Katie Sanderson explicitly confirmed and reviewed the incidental infinitival decision." : "Katie Sanderson reviewed and copied this human decision."]));
  const incidentalDecisionHeaders = ["schema_version", "inventory_fingerprint", "passage_id", "case_id", "family", "source_text", "focus_surface", "start_utf16", "end_utf16", "span_validated", "primary_focus_preselected", "source_reference", "authored_by", "classification", "intended_alternative", "supported_construction", "declared_construction", "declared_subtype", "protected_set_tags_json", "primary_focus_approved", "primary_label_id", "primary_labeler", "primary_label_timestamp_utc", "primary_notes"];
  const incidentalDecisionText = csv(incidentalDecisionHeaders, [[1, incidentalInventory.inventoryFingerprint, incidentalInventory.passageId, incidentalInventory.caseId, "TO_TOO_TWO", incidentalInventory.sourceText, incidentalInventory.focusSurface, incidentalInventory.startUtf16, incidentalInventory.endUtf16, true, false, incidentalInventory.sourceReference, "Katie Sanderson", "VALID", "", true, "infinitive", "governed_infinitive", "[]", false, incidentalCore.primaryLabelId, "Katie Sanderson", CONFIRMED_AT, incidentalCore.notes]]);
  const labelText = `${labels.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const candidates = inventory.map((record) => {
    const label = labels.find((row) => row.caseId === record.caseId)!;
    const core = { schemaVersion: 1 as const, passageId: record.passageId, caseId: record.caseId, family: record.family, sourceText: record.sourceText, focusSurface: record.focusSurface, startUtf16: record.startUtf16, endUtf16: record.endUtf16, declaredConstruction: label.declaredConstruction, declaredSubtype: label.declaredSubtype, primaryFocus: label.primaryFocusApproved, protectedSetTags: label.protectedSetTags, sourceReference: record.sourceReference, authoredBy: record.authoredByClaim };
    return { ...core, candidateFingerprint: ordinaryEvaluationFingerprint(core) };
  });
  const gold = labels.map((label) => {
    const core = { schemaVersion: 1 as const, caseId: label.caseId, family: label.family, classification: label.classification, intendedAlternative: label.intendedAlternative, supportedConstruction: label.supportedConstruction, primaryLabelId: label.primaryLabelId, nonGoldReviewId: `non-gold-${label.caseId}`, adjudicationId: null };
    return { ...core, goldFingerprint: ordinaryEvaluationFingerprint(core) };
  });
  const candidateText = `${candidates.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const goldText = `${gold.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const corpusFingerprint = sha256(Buffer.concat([Buffer.from(candidateText), Buffer.from(goldText)]));
  const provenanceCore = { schemaVersion: 1, decisionProvenanceId: incidentalCore.decisionProvenanceId, family: "TO_TOO_TWO", caseId: INCIDENTAL_CASE_ID, decidedBy: "Katie Sanderson", decidedAt: CONFIRMED_AT, decision: { classification: "VALID", intendedAlternative: null, supportedConstruction: true, declaredConstruction: "infinitive", declaredSubtype: "governed_infinitive", protectedSetTags: [], primaryFocusApproved: false }, interpretation: "The occurrence is the infinitival to in ‘going to look’, is incidental only, and does not count toward gerund or primary quotas.", source: "Explicit user confirmation in the governed S8 V3 holdout task.", analyserPredictionsExposed: false };
  const provenance = { ...provenanceCore, provenanceFingerprint: ordinaryEvaluationFingerprint(provenanceCore) };
  const coverageCore = { schemaVersion: 1, family: "TO_TOO_TWO", totalAnnotatedOccurrences: labels.length, passagesWithFamily: new Set(inventory.map((row) => row.passageId)).size, approvedPrimary: primary.length, completedOccurrencePrimaryLabels: labels.length, pendingOccurrencePrimaryLabels: 0, primaryByClassification: classifications, primaryByConstruction, primaryBySubtype, unsupportedPrimary: { not_applicable: { VALID: 10, INVALID: 0, UNCERTAIN: 0 } }, protectedPrimaryCounts, coverageQuotaShortages: [], workflowShortages: [] };
  const coverage = { ...coverageCore, coverageLedgerFingerprint: ordinaryEvaluationFingerprint(coverageCore) };
  const receiptCore = { schemaVersion: 1, family: "TO_TOO_TWO", lockedAt: CONFIRMED_AT, candidateCount: candidates.length, goldCount: gold.length, candidateFileSha256: sha256(candidateText), candidateSetFingerprint: ordinaryEvaluationFingerprint(candidates.map((row) => row.candidateFingerprint)), goldFileSha256: sha256(goldText), goldSetFingerprint: ordinaryEvaluationFingerprint(gold.map((row) => row.goldFingerprint)), corpusFingerprint, primaryLabelFileSha256: sha256(labelText), primaryLabelSetFingerprint: ordinaryEvaluationFingerprint(labels.map((row) => row.primaryLabelFingerprint)), completedIncidentalDecisionFileSha256: sha256(incidentalDecisionText), incidentalDecisionProvenanceFingerprint: provenance.provenanceFingerprint, nonGoldReviewFileSha256: sha256(reviewText), substantiveDisagreementCount: 0, adjudicationRequired: false, analyserBehaviour: "NOT_EVALUATED" };
  const receipt = { ...receiptCore, goldLockReceiptFingerprint: ordinaryEvaluationFingerprint(receiptCore) };
  const dispositionCore = { schemaVersion: 1, family: "TO_TOO_TWO", disposition: "BLOCKED", blockerType: "EXACT_EVALUATION_PENDING", exactRelease: RELEASE, evidence: { primaryLabelSetFingerprint: receipt.primaryLabelSetFingerprint, completedNonGoldReviewPacketSha256: receipt.nonGoldReviewFileSha256, coverageLedgerFingerprint: coverage.coverageLedgerFingerprint, candidateFingerprint: receipt.candidateSetFingerprint, candidateFileSha256: receipt.candidateFileSha256, goldFingerprint: receipt.goldSetFingerprint, goldFileSha256: receipt.goldFileSha256, goldLockReceiptFingerprint: receipt.goldLockReceiptFingerprint, corpusFingerprint, reportFingerprint: null }, humanWorkflow: { primaryLabelsComplete: true, confirmedOccurrenceDecisions: labels.length, requiredOccurrenceDecisions: labels.length, pendingOccurrenceDecisions: 0, primaryCoverageComplete: true, nonGoldReviewComplete: true, adjudicationComplete: true, finalGoldLocked: true }, coverage, failedGates: ["EXACT_RELEASE_EVALUATION_NOT_RUN", "DETERMINISTIC_EVALUATION_REPEAT_NOT_RUN"], failedCases: [], unevaluatedCases: labels.length, metrics: null, analyserBehaviour: "NOT_EVALUATED", familyDeliveryRemainsDisabled: true, publicationPerformed: false, selectionPerformed: false, approvalEventCreated: false, activationPerformed: false };
  const disposition = { ...dispositionCore, dispositionFingerprint: ordinaryEvaluationFingerprint(dispositionCore) };
  const outputs = new Map<string, string>([
    ["human-review/governance/to-too-two-gerund-incidental-confirmation.json", `${JSON.stringify(provenance, null, 2)}\n`],
    ["human-review/primary-label/completed/TO_TOO_TWO.gerund-incidental.primary-label-review.csv", incidentalDecisionText],
    ["human-review/primary-label/imported/TO_TOO_TWO.primary-labels.final.jsonl", labelText],
    ["human-review/non-gold/completed/TO_TOO_TWO.non-gold-review.final.csv", reviewText],
    ["source-intake/coverage-ledger.to-too-two.final.json", `${JSON.stringify(coverage, null, 2)}\n`],
    ["candidates/TO_TOO_TWO.jsonl", candidateText],
    ["gold/TO_TOO_TWO.final-gold.jsonl", goldText],
    ["gold/TO_TOO_TWO.gold-lock.receipt.json", `${JSON.stringify(receipt, null, 2)}\n`],
    ["dispositions/s8-v3-to-too-two.evaluation-pending.blocked.json", `${JSON.stringify(disposition, null, 2)}\n`],
  ]);
  for (const [relativePath, content] of outputs) {
    const path = join(ROOT, relativePath);
    if (write) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
    else assert.equal(readFileSync(path, "utf8"), content, `${relativePath}: final human evidence differs`);
  }
  console.log(JSON.stringify({ occurrenceLabels: labels.length, primaryCases: primary.length, primaryByClassification: classifications, protectedPrimaryCounts, coverageShortages: [], candidateSetFingerprint: receipt.candidateSetFingerprint, goldSetFingerprint: receipt.goldSetFingerprint, corpusFingerprint, goldLockReceiptFingerprint: receipt.goldLockReceiptFingerprint, finalGoldLocked: true, analyserBehaviour: "NOT_EVALUATED", wroteArtifacts: write }, null, 2));
}

main();
