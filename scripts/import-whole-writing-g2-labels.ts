import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { WHOLE_WRITING_CONTEXT_CORPUS_VERSION, type ContextFamilyKey } from "../lib/writing-engine/whole-writing/context";
import { parseCsv } from "./lib/deterministic-csv";
import { G2_CSV_HEADERS } from "./lib/whole-writing-g2-csv";
import { G2_ADJUDICATION_CSV_HEADERS, G2_SECONDARY_REVIEW_DISAGREEMENT_HEADERS } from "./lib/whole-writing-g2-adjudication-csv";
import {
  buildFinalGold,
  manifestFor,
  readJsonLines,
  recordFingerprint,
  sha256,
  validatePrimaryLabels,
  validateSecondaryReviews,
  type Adjudication,
  type CandidateCase,
  type GoldClassification,
  type IndependentLabel,
  type SecondaryReview,
  type SupportedConstructionStatus,
} from "./lib/whole-writing-g2-corpus";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function outputNew(path: string, records: unknown[]) {
  if (existsSync(path)) throw new Error(`Refusing to overwrite append-only import: ${path}`);
  const content = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
  writeFileSync(path, content, { flag: "wx" });
  return content;
}

function writeReceipt(path: string, input: {
  recordKind: "PRIMARY_HUMAN_LABELS" | "NON_GOLD_REVIEWS" | "ADJUDICATIONS" | "FINAL_GOLD";
  actorId: string;
  recordedAt: string;
  sourcePaths: string[];
  content: string;
  recordFingerprints: string[];
}) {
  const receiptPath = `${path}.receipt.json`;
  if (existsSync(receiptPath)) throw new Error(`Refusing to overwrite append-only receipt: ${receiptPath}`);
  const body = {
    schemaVersion: 1,
    recordKind: input.recordKind,
    dataFile: basename(path),
    dataSha256: sha256(input.content),
    actorId: input.actorId,
    recordedAt: input.recordedAt,
    sourceFiles: input.sourcePaths.map((path) => basename(path)),
    recordCount: input.recordFingerprints.length,
    recordFingerprints: input.recordFingerprints,
  };
  writeFileSync(receiptPath, `${JSON.stringify({ ...body, receiptFingerprint: recordFingerprint(body) }, null, 2)}\n`, { flag: "wx" });
}

function isClassification(value: unknown): value is GoldClassification {
  return value === "VALID" || value === "INVALID" || value === "UNCERTAIN";
}

function isSupport(value: unknown): value is SupportedConstructionStatus {
  return value === "SUPPORTED" || value === "UNSUPPORTED" || value === "UNCERTAIN";
}

function importLabels() {
  const packetPath = resolve(argument("--packet"));
  const outputPath = resolve(argument("--output"));
  const labelerId = argument("--labeler-id").trim();
  if (!labelerId) throw new Error("labeler identity cannot be blank");
  const packet = readJsonLines<Record<string, unknown>>(packetPath);
  const labelledAt = new Date().toISOString();
  const labels: IndependentLabel[] = packet.map((row, index) => {
    if (!isClassification(row.classification)) throw new Error(`Row ${index + 1}: classification must be VALID, INVALID or UNCERTAIN`);
    if (!isSupport(row.supportedConstructionStatus)) throw new Error(`Row ${index + 1}: supportedConstructionStatus is invalid`);
    const confidence = Number(row.confidence);
    if (![1, 2, 3, 4, 5].includes(confidence)) throw new Error(`Row ${index + 1}: confidence must be 1 through 5`);
    const intendedAlternative = String(row.intendedAlternative ?? "").trim() || null;
    const rationale = String(row.rationale ?? "").trim();
    if (!rationale) throw new Error(`Row ${index + 1}: rationale is required`);
    if (row.classification === "INVALID" && !intendedAlternative) throw new Error(`Row ${index + 1}: INVALID requires intendedAlternative`);
    if (row.classification !== "INVALID" && intendedAlternative) throw new Error(`Row ${index + 1}: only INVALID can specify intendedAlternative`);
    if (row.classification === "INVALID" && (!manifestFor(String(row.family) as ContextFamilyKey).members.includes(intendedAlternative!) || intendedAlternative === row.observedMember)) throw new Error(`Row ${index + 1}: INVALID alternative must be one different enumerated family member`);
    if (row.classification === "INVALID" && row.supportedConstructionStatus !== "SUPPORTED") throw new Error(`Row ${index + 1}: INVALID must be a supported construction`);
    const withoutFingerprint = {
      schemaVersion: 1 as const,
      labelId: `g2-label:${recordFingerprint([row.packetId, row.caseId, labelerId])}`,
      packetId: String(row.packetId),
      caseId: String(row.caseId),
      family: String(row.family) as ContextFamilyKey,
      labelerId,
      classification: row.classification,
      intendedAlternative,
      supportedConstructionStatus: row.supportedConstructionStatus,
      ambiguityOrExclusionReason: String(row.ambiguityOrExclusionReason ?? "").trim() || null,
      confidence: confidence as 1 | 2 | 3 | 4 | 5,
      rationale,
      labelledAt,
      releaseId: String(row.releaseId),
      familyManifestFingerprint: String(row.familyManifestFingerprint),
      corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
      candidateFingerprint: String(row.candidateFingerprint),
    };
    return { ...withoutFingerprint, labelFingerprint: recordFingerprint(withoutFingerprint) };
  });
  const content = outputNew(outputPath, labels);
  writeReceipt(outputPath, { recordKind: "PRIMARY_HUMAN_LABELS", actorId: labelerId, recordedAt: labelledAt, sourcePaths: [packetPath], content, recordFingerprints: labels.map((label) => label.labelFingerprint) });
  console.log(`Imported ${labels.length} append-only labels for ${labelerId}.`);
}

type GovernedPacketRow = {
  packetId: string;
  caseId: string;
  family: ContextFamilyKey;
  sourceText: string;
  focusSurface: string;
  startUtf16: number;
  endUtf16: number;
  observedMember: string;
  releaseId: string;
  familyManifestFingerprint: string;
  corpusVersion: typeof WHOLE_WRITING_CONTEXT_CORPUS_VERSION;
  candidateFingerprint: string;
};

function exactCell(row: Record<string, string>, name: string, rowNumber: number): string {
  const value = row[name];
  if (value !== value.trim()) throw new Error(`CSV row ${rowNumber}: ${name} has leading or trailing whitespace`);
  return value;
}

function importCsvLabels() {
  const csvPath = resolve(argument("--csv"));
  const packetPath = resolve(argument("--packet"));
  const outputPath = resolve(argument("--output"));
  const labelerId = argument("--labeler-id").trim();
  if (!labelerId) throw new Error("labeler identity cannot be blank");
  const labelledAtInput = argument("--labelled-at");
  const parsedTime = new Date(labelledAtInput);
  if (Number.isNaN(parsedTime.valueOf())) throw new Error("--labelled-at must be an ISO-8601 timestamp");
  const labelledAt = parsedTime.toISOString();
  const csv = parseCsv(readFileSync(csvPath, "utf8"));
  if (JSON.stringify(csv.headers) !== JSON.stringify(G2_CSV_HEADERS)) throw new Error(`CSV headers differ from the governed export: ${JSON.stringify(csv.headers)}`);
  const packet = readJsonLines<GovernedPacketRow>(packetPath);
  if (csv.rows.length !== packet.length) throw new Error(`CSV has ${csv.rows.length} cases; governed packet has ${packet.length}`);
  const csvByCase = new Map<string, { row: Record<string, string>; rowNumber: number }>();
  for (let index = 0; index < csv.rows.length; index += 1) {
    const caseId = exactCell(csv.rows[index], "case_id", index + 2);
    if (!caseId) throw new Error(`CSV row ${index + 2}: case_id is required`);
    if (csvByCase.has(caseId)) throw new Error(`CSV row ${index + 2}: duplicate case_id ${caseId}`);
    csvByCase.set(caseId, { row: csv.rows[index], rowNumber: index + 2 });
  }
  const labels: IndependentLabel[] = packet.map((governed) => {
    const csvEntry = csvByCase.get(governed.caseId);
    if (!csvEntry) throw new Error(`CSV is missing governed case ${governed.caseId}`);
    const { row, rowNumber } = csvEntry;
    const immutable = {
      family: governed.family,
      source_text: governed.sourceText,
      focus_surface: governed.focusSurface,
      start_utf16: String(governed.startUtf16),
      end_utf16: String(governed.endUtf16),
    };
    for (const [name, expected] of Object.entries(immutable)) {
      if (row[name] !== expected) throw new Error(`CSV row ${rowNumber}: immutable ${name} differs for ${governed.caseId}`);
    }
    const classification = exactCell(row, "classification", rowNumber);
    const supportedConstructionStatus = exactCell(row, "supported_construction_status", rowNumber);
    if (!isClassification(classification)) throw new Error(`CSV row ${rowNumber}: classification must be VALID, INVALID or UNCERTAIN`);
    if (!isSupport(supportedConstructionStatus)) throw new Error(`CSV row ${rowNumber}: supported_construction_status must be SUPPORTED, UNSUPPORTED or UNCERTAIN`);
    const intendedAlternative = exactCell(row, "intended_alternative", rowNumber) || null;
    const ambiguityOrExclusionReason = exactCell(row, "ambiguity_or_exclusion_reason", rowNumber) || null;
    const confidenceText = exactCell(row, "confidence", rowNumber);
    if (!["1", "2", "3", "4", "5"].includes(confidenceText)) throw new Error(`CSV row ${rowNumber}: confidence must be 1 through 5`);
    const rationale = exactCell(row, "rationale", rowNumber);
    if (!rationale) throw new Error(`CSV row ${rowNumber}: rationale is required by the governed label form`);
    if (classification === "INVALID" && !intendedAlternative) throw new Error(`CSV row ${rowNumber}: INVALID requires intended_alternative`);
    if (classification !== "INVALID" && intendedAlternative) throw new Error(`CSV row ${rowNumber}: only INVALID can specify intended_alternative`);
    if (classification === "INVALID" && (!manifestFor(governed.family).members.includes(intendedAlternative!) || intendedAlternative === governed.observedMember)) throw new Error(`CSV row ${rowNumber}: INVALID alternative must be one different enumerated family member`);
    if (classification === "INVALID" && supportedConstructionStatus !== "SUPPORTED") throw new Error(`CSV row ${rowNumber}: INVALID must be a supported construction`);
    const body = {
      schemaVersion: 1 as const,
      labelId: `g2-label:${recordFingerprint([governed.packetId, governed.caseId, labelerId])}`,
      packetId: governed.packetId,
      caseId: governed.caseId,
      family: governed.family,
      labelerId,
      classification,
      intendedAlternative,
      supportedConstructionStatus,
      ambiguityOrExclusionReason,
      confidence: Number(confidenceText) as 1 | 2 | 3 | 4 | 5,
      rationale,
      labelledAt,
      releaseId: governed.releaseId,
      familyManifestFingerprint: governed.familyManifestFingerprint,
      corpusVersion: governed.corpusVersion,
      candidateFingerprint: governed.candidateFingerprint,
    };
    return { ...body, labelFingerprint: recordFingerprint(body) };
  });
  for (const caseId of csvByCase.keys()) if (!packet.some((row) => row.caseId === caseId)) throw new Error(`CSV contains unknown case ${caseId}`);
  const content = outputNew(outputPath, labels);
  writeReceipt(outputPath, { recordKind: "PRIMARY_HUMAN_LABELS", actorId: labelerId, recordedAt: labelledAt, sourcePaths: [csvPath, packetPath], content, recordFingerprints: labels.map((label) => label.labelFingerprint) });
  console.log(`Validated and imported ${labels.length} append-only CSV labels for ${labelerId}.`);
}

function recordSecondaryReview() {
  const candidatesPath = resolve(argument("--candidates"));
  const labelsPath = resolve(argument("--labels"));
  const decisionsPath = resolve(argument("--disagreements"));
  const outputPath = resolve(argument("--output"));
  const reviewerId = argument("--reviewer-id").trim();
  if (!reviewerId) throw new Error("reviewer identity cannot be blank");
  const reviewedAtDate = new Date(argument("--reviewed-at"));
  if (Number.isNaN(reviewedAtDate.valueOf())) throw new Error("--reviewed-at must be an ISO-8601 timestamp");
  const reviewedAt = reviewedAtDate.toISOString();
  const candidates = readJsonLines<CandidateCase>(candidatesPath);
  const labels = readJsonLines<IndependentLabel>(labelsPath);
  const labelIssues = validatePrimaryLabels(candidates, labels);
  if (labelIssues.length) throw new Error(`Primary labels are not complete: ${JSON.stringify(labelIssues.slice(0, 10))}`);
  const csv = parseCsv(readFileSync(decisionsPath, "utf8"));
  if (JSON.stringify(csv.headers) !== JSON.stringify(G2_SECONDARY_REVIEW_DISAGREEMENT_HEADERS)) throw new Error("Secondary-review disagreement CSV headers differ from the governed format");
  const candidatesById = new Map(candidates.map((item) => [item.caseId, item]));
  const labelsByCase = new Map(labels.map((item) => [item.caseId, item]));
  const decisions = new Map<string, Pick<SecondaryReview, "classification" | "intendedAlternative" | "supportedConstructionStatus" | "rationale">>();
  for (let index = 0; index < csv.rows.length; index += 1) {
    const row = csv.rows[index];
    const rowNumber = index + 2;
    const caseId = exactCell(row, "case_id", rowNumber);
    const candidate = candidatesById.get(caseId);
    const label = labelsByCase.get(caseId);
    if (!candidate || !label) throw new Error(`CSV row ${rowNumber}: unknown case ${caseId}`);
    if (decisions.has(caseId)) throw new Error(`CSV row ${rowNumber}: duplicate case ${caseId}`);
    const classification = exactCell(row, "classification", rowNumber);
    const supportedConstructionStatus = exactCell(row, "supported_construction_status", rowNumber);
    const intendedAlternative = exactCell(row, "intended_alternative", rowNumber) || null;
    const rationale = exactCell(row, "rationale", rowNumber);
    if (!isClassification(classification) || !isSupport(supportedConstructionStatus) || !rationale) throw new Error(`CSV row ${rowNumber}: invalid or incomplete review decision`);
    if (classification === "INVALID" && (!intendedAlternative || !manifestFor(candidate.family).members.includes(intendedAlternative) || intendedAlternative === candidate.observedMember || supportedConstructionStatus !== "SUPPORTED")) throw new Error(`CSV row ${rowNumber}: reviewed INVALID requires one supported alternative`);
    if (classification !== "INVALID" && intendedAlternative) throw new Error(`CSV row ${rowNumber}: only reviewed INVALID can specify intended_alternative`);
    if (classification === label.classification && intendedAlternative === label.intendedAlternative && supportedConstructionStatus === label.supportedConstructionStatus) throw new Error(`CSV row ${rowNumber}: disagreement decision matches the primary label`);
    decisions.set(caseId, { classification, intendedAlternative, supportedConstructionStatus, rationale });
  }
  const reviews: SecondaryReview[] = candidates.map((candidate) => {
    const label = labelsByCase.get(candidate.caseId)!;
    const disagreement = decisions.get(candidate.caseId);
    const decision = disagreement ?? {
      classification: label.classification,
      intendedAlternative: label.intendedAlternative,
      supportedConstructionStatus: label.supportedConstructionStatus,
      rationale: "Non-authoritative secondary review agreed with the primary human decision.",
    };
    const body = {
      schemaVersion: 1 as const,
      reviewId: `g2-review:${recordFingerprint([candidate.caseId, reviewerId, label.labelFingerprint])}`,
      caseId: candidate.caseId,
      family: candidate.family,
      reviewerId,
      reviewerKind: "AI_NON_GOLD_REVIEW" as const,
      reviewedAt,
      primaryLabelFingerprint: label.labelFingerprint,
      disposition: disagreement ? "DISAGREE" as const : "AGREE" as const,
      ...decision,
      releaseId: candidate.releaseId,
      familyManifestFingerprint: candidate.familyManifestFingerprint,
      corpusVersion: candidate.corpusVersion,
      candidateFingerprint: candidate.candidateFingerprint,
    };
    return { ...body, reviewFingerprint: recordFingerprint(body) };
  });
  const content = outputNew(outputPath, reviews);
  writeReceipt(outputPath, { recordKind: "NON_GOLD_REVIEWS", actorId: reviewerId, recordedAt: reviewedAt, sourcePaths: [candidatesPath, labelsPath, decisionsPath], content, recordFingerprints: reviews.map((review) => review.reviewFingerprint) });
  console.log(`Recorded ${reviews.length} non-gold reviews with ${decisions.size} disagreements.`);
}

function prepareAdjudication() {
  const candidates = readJsonLines<CandidateCase>(resolve(argument("--candidates")));
  const labels = readJsonLines<IndependentLabel>(resolve(argument("--labels")));
  const reviews = readJsonLines<SecondaryReview>(resolve(argument("--reviews")));
  const outputPath = resolve(argument("--output"));
  const issues = [...validatePrimaryLabels(candidates, labels), ...validateSecondaryReviews(candidates, labels, reviews)];
  if (issues.length) throw new Error(`Primary labels or reviews are incomplete: ${JSON.stringify(issues.slice(0, 10))}`);
  const labelsByCase = new Map(labels.map((item) => [item.caseId, item]));
  const reviewsByCase = new Map(reviews.map((item) => [item.caseId, item]));
  const packet = candidates.flatMap((candidate) => {
    const label = labelsByCase.get(candidate.caseId)!;
    const review = reviewsByCase.get(candidate.caseId)!;
    if (review.disposition !== "DISAGREE") return [];
    return [{
      adjudicationPacketId: `g2-adjudication-packet:${recordFingerprint([candidate.family, candidate.caseId, label.labelFingerprint, review.reviewFingerprint])}`,
      caseId: candidate.caseId,
      family: candidate.family,
      sourceText: candidate.sourceText,
      focusSurface: candidate.focusSurface,
      startUtf16: candidate.startUtf16,
      endUtf16: candidate.endUtf16,
      observedMember: candidate.observedMember,
      declaredConstruction: candidate.declaredConstruction,
      protectedSetTags: candidate.protectedSetTags,
      primaryLabel: {
        labelerId: label.labelerId,
        classification: label.classification,
        intendedAlternative: label.intendedAlternative,
        supportedConstructionStatus: label.supportedConstructionStatus,
        ambiguityOrExclusionReason: label.ambiguityOrExclusionReason,
        confidence: label.confidence,
        rationale: label.rationale,
        labelFingerprint: label.labelFingerprint,
      },
      secondaryReview: {
        reviewerId: review.reviewerId,
        reviewerKind: review.reviewerKind,
        classification: review.classification,
        intendedAlternative: review.intendedAlternative,
        supportedConstructionStatus: review.supportedConstructionStatus,
        rationale: review.rationale,
        reviewFingerprint: review.reviewFingerprint,
      },
      candidateFingerprint: candidate.candidateFingerprint,
      releaseId: candidate.releaseId,
      familyManifestFingerprint: candidate.familyManifestFingerprint,
      corpusVersion: candidate.corpusVersion,
      classification: "",
      intendedAlternative: "",
      supportedConstructionStatus: "",
      ambiguityOrExclusionReason: "",
      rationale: "",
    }];
  });
  outputNew(outputPath, packet);
  console.log(`Prepared ${packet.length} disagreement adjudications.`);
}

function importAdjudications() {
  const packetPath = resolve(argument("--packet"));
  const packet = readJsonLines<Record<string, unknown>>(packetPath);
  const outputPath = resolve(argument("--output"));
  const adjudicatorId = argument("--adjudicator-id").trim();
  if (!adjudicatorId) throw new Error("adjudicator identity cannot be blank");
  const adjudicatedAt = new Date().toISOString();
  const records: Adjudication[] = packet.map((row, index) => {
    if (!isClassification(row.classification)) throw new Error(`Row ${index + 1}: classification is invalid`);
    if (!isSupport(row.supportedConstructionStatus)) throw new Error(`Row ${index + 1}: supportedConstructionStatus is invalid`);
    const primaryLabel = row.primaryLabel as { labelerId?: string; labelFingerprint?: string };
    const secondaryReview = row.secondaryReview as { reviewFingerprint?: string };
    if (!primaryLabel?.labelerId || !primaryLabel.labelFingerprint || !secondaryReview?.reviewFingerprint) throw new Error(`Row ${index + 1}: exact primary label and review are required`);
    if (primaryLabel.labelerId === adjudicatorId) throw new Error(`Row ${index + 1}: adjudicator must differ from the primary labeler`);
    const intendedAlternative = String(row.intendedAlternative ?? "").trim() || null;
    if (row.classification === "INVALID" && !intendedAlternative) throw new Error(`Row ${index + 1}: INVALID requires intendedAlternative`);
    if (row.classification === "INVALID" && (!manifestFor(String(row.family) as ContextFamilyKey).members.includes(intendedAlternative!) || intendedAlternative === row.observedMember)) throw new Error(`Row ${index + 1}: INVALID alternative must be one different enumerated family member`);
    if (row.classification === "INVALID" && row.supportedConstructionStatus !== "SUPPORTED") throw new Error(`Row ${index + 1}: INVALID must be a supported construction`);
    const rationale = String(row.rationale ?? "").trim();
    if (!rationale) throw new Error(`Row ${index + 1}: rationale is required`);
    const withoutFingerprint = {
      schemaVersion: 1 as const,
      adjudicationId: `g2-adjudication:${recordFingerprint([row.adjudicationPacketId, adjudicatorId])}`,
      caseId: String(row.caseId),
      family: String(row.family) as ContextFamilyKey,
      adjudicatorId,
      adjudicatedAt,
      sourceLabelFingerprint: primaryLabel.labelFingerprint,
      sourceReviewFingerprint: secondaryReview.reviewFingerprint,
      classification: row.classification,
      intendedAlternative,
      supportedConstructionStatus: row.supportedConstructionStatus,
      ambiguityOrExclusionReason: String(row.ambiguityOrExclusionReason ?? "").trim() || null,
      rationale,
      releaseId: String(row.releaseId),
      familyManifestFingerprint: String(row.familyManifestFingerprint),
      corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
      candidateFingerprint: String(row.candidateFingerprint),
    };
    return { ...withoutFingerprint, adjudicationFingerprint: recordFingerprint(withoutFingerprint) };
  });
  const content = outputNew(outputPath, records);
  writeReceipt(outputPath, { recordKind: "ADJUDICATIONS", actorId: adjudicatorId, recordedAt: adjudicatedAt, sourcePaths: [packetPath], content, recordFingerprints: records.map((record) => record.adjudicationFingerprint) });
  console.log(`Imported ${records.length} append-only adjudications for ${adjudicatorId}.`);
}

function importCsvAdjudications() {
  const csvPath = resolve(argument("--csv"));
  const packetPath = resolve(argument("--packet"));
  const outputPath = resolve(argument("--output"));
  const adjudicatorId = argument("--adjudicator-id").trim();
  if (!adjudicatorId) throw new Error("adjudicator identity cannot be blank");
  const adjudicatedAtDate = new Date(argument("--adjudicated-at"));
  if (Number.isNaN(adjudicatedAtDate.valueOf())) throw new Error("--adjudicated-at must be an ISO-8601 timestamp");
  const adjudicatedAt = adjudicatedAtDate.toISOString();
  const csv = parseCsv(readFileSync(csvPath, "utf8"));
  if (JSON.stringify(csv.headers) !== JSON.stringify(G2_ADJUDICATION_CSV_HEADERS)) throw new Error("Adjudication CSV headers differ from the governed export");
  const packet = readJsonLines<Record<string, unknown>>(packetPath);
  if (csv.rows.length !== packet.length) throw new Error(`CSV has ${csv.rows.length} cases; governed adjudication packet has ${packet.length}`);
  const csvByCase = new Map<string, { row: Record<string, string>; rowNumber: number }>();
  for (let index = 0; index < csv.rows.length; index += 1) {
    const caseId = exactCell(csv.rows[index], "case_id", index + 2);
    if (!caseId || csvByCase.has(caseId)) throw new Error(`CSV row ${index + 2}: case_id is missing or duplicated`);
    csvByCase.set(caseId, { row: csv.rows[index], rowNumber: index + 2 });
  }
  const records: Adjudication[] = packet.map((governed) => {
    const caseId = String(governed.caseId);
    const entry = csvByCase.get(caseId);
    if (!entry) throw new Error(`CSV is missing governed disagreement ${caseId}`);
    const { row, rowNumber } = entry;
    const primary = governed.primaryLabel as Record<string, unknown>;
    const review = governed.secondaryReview as Record<string, unknown>;
    const immutable = {
      family: String(governed.family),
      source_text: String(governed.sourceText),
      focus_surface: String(governed.focusSurface),
      start_utf16: String(governed.startUtf16),
      end_utf16: String(governed.endUtf16),
      primary_labeler_id: String(primary.labelerId),
      primary_classification: String(primary.classification),
      primary_intended_alternative: String(primary.intendedAlternative ?? ""),
      primary_supported_construction_status: String(primary.supportedConstructionStatus),
      primary_ambiguity_or_exclusion_reason: String(primary.ambiguityOrExclusionReason ?? ""),
      primary_confidence: String(primary.confidence),
      primary_rationale: String(primary.rationale),
      secondary_review_classification: String(review.classification),
      secondary_review_intended_alternative: String(review.intendedAlternative ?? ""),
      secondary_review_supported_construction_status: String(review.supportedConstructionStatus),
      secondary_review_rationale: String(review.rationale),
    };
    for (const [name, expected] of Object.entries(immutable)) if (row[name] !== expected) throw new Error(`CSV row ${rowNumber}: immutable ${name} differs for ${caseId}`);
    if (row.primary_labeler_id === adjudicatorId) throw new Error(`CSV row ${rowNumber}: adjudicator must differ from the primary labeler`);
    const classification = exactCell(row, "classification", rowNumber);
    const supportedConstructionStatus = exactCell(row, "supported_construction_status", rowNumber);
    const intendedAlternative = exactCell(row, "intended_alternative", rowNumber) || null;
    const ambiguityOrExclusionReason = exactCell(row, "ambiguity_or_exclusion_reason", rowNumber) || null;
    const rationale = exactCell(row, "rationale", rowNumber);
    if (!isClassification(classification) || !isSupport(supportedConstructionStatus) || !rationale) throw new Error(`CSV row ${rowNumber}: final adjudication is invalid or incomplete`);
    if (classification === "INVALID" && (!intendedAlternative || !manifestFor(String(governed.family) as ContextFamilyKey).members.includes(intendedAlternative) || intendedAlternative === governed.observedMember || supportedConstructionStatus !== "SUPPORTED")) throw new Error(`CSV row ${rowNumber}: INVALID requires one uniquely supported family alternative`);
    if (classification !== "INVALID" && intendedAlternative) throw new Error(`CSV row ${rowNumber}: only INVALID can specify intended_alternative`);
    const body = {
      schemaVersion: 1 as const,
      adjudicationId: `g2-adjudication:${recordFingerprint([governed.adjudicationPacketId, adjudicatorId])}`,
      caseId,
      family: String(governed.family) as ContextFamilyKey,
      adjudicatorId,
      adjudicatedAt,
      sourceLabelFingerprint: String(primary.labelFingerprint),
      sourceReviewFingerprint: String(review.reviewFingerprint),
      classification,
      intendedAlternative,
      supportedConstructionStatus,
      ambiguityOrExclusionReason,
      rationale,
      releaseId: String(governed.releaseId),
      familyManifestFingerprint: String(governed.familyManifestFingerprint),
      corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
      candidateFingerprint: String(governed.candidateFingerprint),
    };
    return { ...body, adjudicationFingerprint: recordFingerprint(body) };
  });
  const content = outputNew(outputPath, records);
  writeReceipt(outputPath, { recordKind: "ADJUDICATIONS", actorId: adjudicatorId, recordedAt: adjudicatedAt, sourcePaths: [csvPath, packetPath], content, recordFingerprints: records.map((record) => record.adjudicationFingerprint) });
  console.log(`Validated and imported ${records.length} append-only CSV adjudications for ${adjudicatorId}.`);
}

function verifyGold() {
  const candidates = readJsonLines<CandidateCase>(resolve(argument("--candidates")));
  const labelsPath = resolve(argument("--labels"));
  const reviewsPath = resolve(argument("--reviews"));
  const labels = readJsonLines<IndependentLabel>(labelsPath);
  const reviews = readJsonLines<SecondaryReview>(reviewsPath);
  const adjudicationsPath = argument("--adjudications");
  const adjudications = readJsonLines<Adjudication>(resolve(adjudicationsPath));
  const { gold, issues } = buildFinalGold(candidates, labels, reviews, adjudications);
  if (issues.length || gold.length !== candidates.length) throw new Error(`Gold remains blocked: ${JSON.stringify(issues.slice(0, 20))}`);
  const outputPath = resolve(argument("--output"));
  const lockedAt = new Date().toISOString();
  const content = outputNew(outputPath, gold);
  writeReceipt(outputPath, { recordKind: "FINAL_GOLD", actorId: "DETERMINISTIC_GOLD_DERIVATION", recordedAt: lockedAt, sourcePaths: [resolve(argument("--candidates")), labelsPath, reviewsPath, resolve(adjudicationsPath)], content, recordFingerprints: gold.map((record) => record.goldFingerprint) });
  console.log(`Locked ${gold.length} final-gold records with primary-label, non-gold-review and adjudication provenance.`);
}

const command = process.argv[2];
if (command === "label") importLabels();
else if (command === "csv-label") importCsvLabels();
else if (command === "secondary-review") recordSecondaryReview();
else if (command === "prepare-adjudication") prepareAdjudication();
else if (command === "adjudication") importAdjudications();
else if (command === "adjudication-csv") importCsvAdjudications();
else if (command === "gold") verifyGold();
else throw new Error("Usage: label | csv-label | secondary-review | prepare-adjudication | adjudication | adjudication-csv | gold");
