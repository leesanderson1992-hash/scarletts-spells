import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { CONTEXT_FAMILY_MANIFESTS } from "../lib/writing-engine/whole-writing/context";
import { serialiseCsv } from "./lib/deterministic-csv";
import { G2_CSV_ANSWER_HEADERS, G2_CSV_HEADERS, G2_CSV_PACKET_EXPORT_VERSION } from "./lib/whole-writing-g2-csv";
import {
  G2_PACKAGE_VERSION,
  readJsonLines,
  recordFingerprint,
  sha256,
} from "./lib/whole-writing-g2-corpus";

type PacketRow = {
  packetId: string;
  caseId: string;
  family: string;
  sourceText: string;
  focusSurface: string;
  startUtf16: number;
  endUtf16: number;
};

const repositoryRoot = resolve(import.meta.dirname, "..");
const corpusRoot = join(repositoryRoot, "data/whole-writing/g2-context-family-corpora");
const outputRoot = join(corpusRoot, "packets-csv");
const packageManifest = JSON.parse(readFileSync(join(corpusRoot, "manifest.json"), "utf8")) as {
  packageVersion: string;
  packageFingerprint: string;
};
if (packageManifest.packageVersion !== G2_PACKAGE_VERSION) throw new Error("Governed package version mismatch");
mkdirSync(outputRoot, { recursive: true });

const files: Array<Record<string, unknown>> = [];
for (const familyManifest of CONTEXT_FAMILY_MANIFESTS) {
  for (const packetLabel of ["a", "b"] as const) {
    const sourceName = `${familyManifest.familyKey}.label-packet-${packetLabel}.jsonl`;
    const sourcePath = join(corpusRoot, "packets", sourceName);
    const sourceContent = readFileSync(sourcePath, "utf8");
    const packetRows = readJsonLines<PacketRow>(sourcePath);
    const csvRows = packetRows.map((row) => ({
      case_id: row.caseId,
      family: row.family,
      source_text: row.sourceText,
      focus_surface: row.focusSurface,
      start_utf16: String(row.startUtf16),
      end_utf16: String(row.endUtf16),
      classification: "",
      intended_alternative: "",
      supported_construction_status: "",
      ambiguity_or_exclusion_reason: "",
      confidence: "",
      rationale: "",
    }));
    const csv = serialiseCsv(G2_CSV_HEADERS, csvRows);
    const outputName = `${familyManifest.familyKey}.labeler-${packetLabel}.csv`;
    writeFileSync(join(outputRoot, outputName), csv);
    files.push({
      family: familyManifest.familyKey,
      labelerPacket: packetLabel.toUpperCase(),
      packetId: packetRows[0]?.packetId,
      sourceJsonl: `packets/${sourceName}`,
      sourceJsonlSha256: sha256(sourceContent),
      csv: `packets-csv/${outputName}`,
      csvSha256: sha256(csv),
      rowCount: packetRows.length,
    });
  }
}

const manifestBody = {
  schemaVersion: 1,
  exportVersion: G2_CSV_PACKET_EXPORT_VERSION,
  sourcePackageVersion: packageManifest.packageVersion,
  sourcePackageFingerprint: packageManifest.packageFingerprint,
  encoding: "UTF-8",
  dialect: "RFC4180-compatible, CRLF rows, every cell quoted",
  headers: G2_CSV_HEADERS,
  answerHeaders: G2_CSV_ANSWER_HEADERS,
  permittedValues: {
    classification: ["VALID", "INVALID", "UNCERTAIN"],
    supported_construction_status: ["SUPPORTED", "UNSUPPORTED", "UNCERTAIN"],
    confidence: ["1", "2", "3", "4", "5"],
  },
  hiddenGovernedFieldsRestoredOnImport: ["packetId", "releaseId", "familyManifestFingerprint", "corpusVersion", "candidateFingerprint"],
  files,
};
writeFileSync(join(outputRoot, "manifest.json"), `${JSON.stringify({ ...manifestBody, exportFingerprint: recordFingerprint(manifestBody) }, null, 2)}\n`);
console.log("Exported eight blinded G2 CSV packets: Labeler A and Labeler B for four families.");
