import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { serialiseCsv } from "./lib/deterministic-csv";
import { G2_ADJUDICATION_CSV_HEADERS } from "./lib/whole-writing-g2-adjudication-csv";
import { readJsonLines } from "./lib/whole-writing-g2-corpus";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const packetPath = resolve(argument("--packet"));
const outputPath = resolve(argument("--output"));
const packet = readJsonLines<Record<string, unknown>>(packetPath);
const rows = packet.map((record) => {
  const primary = record.primaryLabel as Record<string, unknown>;
  const review = record.secondaryReview as Record<string, unknown>;
  return {
    case_id: String(record.caseId),
    family: String(record.family),
    source_text: String(record.sourceText),
    focus_surface: String(record.focusSurface),
    start_utf16: String(record.startUtf16),
    end_utf16: String(record.endUtf16),
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
    classification: "",
    intended_alternative: "",
    supported_construction_status: "",
    ambiguity_or_exclusion_reason: "",
    rationale: "",
  };
});

writeFileSync(outputPath, serialiseCsv(G2_ADJUDICATION_CSV_HEADERS, rows));
console.log(`Exported ${rows.length} disagreement cases to ${outputPath}.`);
