import { existsSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { WHOLE_WRITING_CONTEXT_CORPUS_VERSION, type ContextFamilyKey } from "../lib/writing-engine/whole-writing/context";
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
else if (command === "prepare-adjudication") prepareAdjudication();
else if (command === "adjudication") importAdjudications();
else if (command === "gold") verifyGold();
else throw new Error("Usage: label | prepare-adjudication | adjudication | gold");
