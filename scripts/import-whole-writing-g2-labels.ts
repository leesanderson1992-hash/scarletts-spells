import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { WHOLE_WRITING_CONTEXT_CORPUS_VERSION, type ContextFamilyKey } from "../lib/writing-engine/whole-writing/context";
import { parseCsv } from "./lib/deterministic-csv";
import { G2_CSV_HEADERS } from "./lib/whole-writing-g2-csv";
import {
  buildFinalGold,
  labelsDisagree,
  manifestFor,
  readJsonLines,
  recordFingerprint,
  sha256,
  validateIndependentLabels,
  type Adjudication,
  type CandidateCase,
  type GoldClassification,
  type IndependentLabel,
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
  recordKind: "INDEPENDENT_LABELS" | "ADJUDICATIONS" | "FINAL_GOLD";
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
  writeReceipt(outputPath, { recordKind: "INDEPENDENT_LABELS", actorId: labelerId, recordedAt: labelledAt, sourcePaths: [packetPath], content, recordFingerprints: labels.map((label) => label.labelFingerprint) });
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
  writeReceipt(outputPath, { recordKind: "INDEPENDENT_LABELS", actorId: labelerId, recordedAt: labelledAt, sourcePaths: [csvPath, packetPath], content, recordFingerprints: labels.map((label) => label.labelFingerprint) });
  console.log(`Validated and imported ${labels.length} append-only CSV labels for ${labelerId}.`);
}

function prepareAdjudication() {
  const candidates = readJsonLines<CandidateCase>(resolve(argument("--candidates")));
  const labels = argument("--labels").split(",").flatMap((path) => readJsonLines<IndependentLabel>(resolve(path)));
  const outputPath = resolve(argument("--output"));
  const issues = validateIndependentLabels(candidates, labels);
  if (issues.length) throw new Error(`Independent labels are not complete: ${JSON.stringify(issues.slice(0, 10))}`);
  const labelsByCase = new Map<string, IndependentLabel[]>();
  for (const label of labels) labelsByCase.set(label.caseId, [...(labelsByCase.get(label.caseId) ?? []), label]);
  const packet = candidates.flatMap((candidate) => {
    const pair = labelsByCase.get(candidate.caseId)!;
    if (!labelsDisagree(pair[0], pair[1])) return [];
    return [{
      adjudicationPacketId: `g2-adjudication-packet:${recordFingerprint([candidate.family, candidate.caseId, pair.map((item) => item.labelFingerprint).sort()])}`,
      caseId: candidate.caseId,
      family: candidate.family,
      sourceText: candidate.sourceText,
      focusSurface: candidate.focusSurface,
      startUtf16: candidate.startUtf16,
      endUtf16: candidate.endUtf16,
      observedMember: candidate.observedMember,
      declaredConstruction: candidate.declaredConstruction,
      protectedSetTags: candidate.protectedSetTags,
      labels: pair.map((label) => ({
        labelerId: label.labelerId,
        classification: label.classification,
        intendedAlternative: label.intendedAlternative,
        supportedConstructionStatus: label.supportedConstructionStatus,
        ambiguityOrExclusionReason: label.ambiguityOrExclusionReason,
        confidence: label.confidence,
        rationale: label.rationale,
        labelFingerprint: label.labelFingerprint,
      })),
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
  const packet = readJsonLines<Record<string, unknown>>(resolve(argument("--packet")));
  const outputPath = resolve(argument("--output"));
  const adjudicatorId = argument("--adjudicator-id").trim();
  if (!adjudicatorId) throw new Error("adjudicator identity cannot be blank");
  const adjudicatedAt = new Date().toISOString();
  const records: Adjudication[] = packet.map((row, index) => {
    if (!isClassification(row.classification)) throw new Error(`Row ${index + 1}: classification is invalid`);
    if (!isSupport(row.supportedConstructionStatus)) throw new Error(`Row ${index + 1}: supportedConstructionStatus is invalid`);
    const labels = row.labels as Array<{ labelerId: string; labelFingerprint: string }>;
    if (!Array.isArray(labels) || labels.length !== 2) throw new Error(`Row ${index + 1}: exact source labels are required`);
    if (labels.some((label) => label.labelerId === adjudicatorId)) throw new Error(`Row ${index + 1}: adjudicator must differ from both labelers`);
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
      sourceLabelFingerprints: labels.map((label) => label.labelFingerprint).sort() as [string, string],
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
  writeReceipt(outputPath, { recordKind: "ADJUDICATIONS", actorId: adjudicatorId, recordedAt: adjudicatedAt, sourcePaths: [resolve(argument("--packet"))], content, recordFingerprints: records.map((record) => record.adjudicationFingerprint) });
  console.log(`Imported ${records.length} append-only adjudications for ${adjudicatorId}.`);
}

function verifyGold() {
  const candidates = readJsonLines<CandidateCase>(resolve(argument("--candidates")));
  const labels = argument("--labels").split(",").flatMap((path) => readJsonLines<IndependentLabel>(resolve(path)));
  const adjudicationsPath = argument("--adjudications");
  const adjudications = readJsonLines<Adjudication>(resolve(adjudicationsPath));
  const { gold, issues } = buildFinalGold(candidates, labels, adjudications);
  if (issues.length || gold.length !== candidates.length) throw new Error(`Gold remains blocked: ${JSON.stringify(issues.slice(0, 20))}`);
  const outputPath = resolve(argument("--output"));
  const lockedAt = new Date().toISOString();
  const content = outputNew(outputPath, gold);
  writeReceipt(outputPath, { recordKind: "FINAL_GOLD", actorId: "DETERMINISTIC_GOLD_DERIVATION", recordedAt: lockedAt, sourcePaths: [resolve(argument("--candidates")), ...argument("--labels").split(",").map((path) => resolve(path)), resolve(adjudicationsPath)], content, recordFingerprints: gold.map((record) => record.goldFingerprint) });
  console.log(`Locked ${gold.length} final-gold records with independent-label provenance.`);
}

const command = process.argv[2];
if (command === "label") importLabels();
else if (command === "csv-label") importCsvLabels();
else if (command === "prepare-adjudication") prepareAdjudication();
else if (command === "adjudication") importAdjudications();
else if (command === "gold") verifyGold();
else throw new Error("Usage: label | csv-label | prepare-adjudication | adjudication | gold");
