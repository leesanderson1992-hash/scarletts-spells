import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { CONTEXT_V3_CANDIDATES } from "../lib/writing-engine/whole-writing/context-analyser-release";
import type { ContextFamilyKey } from "../lib/writing-engine/whole-writing/context";
import { ordinaryEvaluationFingerprint } from "./lib/whole-writing-v3-ordinary-evaluation";

const EVALUATION_ROOT = join(process.cwd(), "data/whole-writing/v3-ordinary-writing-evaluation");
const AUTHORSHIP_RESOLUTION_ID = "s8-v3-authorship-resolution-katie-2026-09-10-01";
const EXPECTED_HEADERS = ["passage_id", "source_text", "authored_by", "authorship_confirmed", "source_group"] as const;
const PROTECTED_TAGS = ["fragment", "quotation", "gerund", "run_on", "task_dependent"] as const;

const SOURCES: ReadonlyArray<{ family: ContextFamilyKey; fileName: string }> = [
  {
    family: "THERE_THEIR_THEYRE",
    fileName: "THERE_THEIR_THEYRE.v3-intake-approved-by-katie - THERE_THEIR_THEYRE.v3-intake-approved-by-katie.csv.csv",
  },
  {
    family: "YOUR_YOURE",
    fileName: "Your_Youre.v3-intake-approved-by-katie - THERE_THEIR_THEYRE.v3-intake-approved-by-katie.csv.csv",
  },
  {
    family: "ITS_ITS",
    fileName: "It_s_Its.v3-intake-approved-by-katie - THERE_THEIR_THEYRE.v3-intake-approved-by-katie.csv.csv",
  },
  {
    family: "TO_TOO_TWO",
    fileName: "to_too_two.v3-intake-approved-by-katie - THERE_THEIR_THEYRE.v3-intake-approved-by-katie.csv.csv",
  },
];

type CsvRow = Record<(typeof EXPECTED_HEADERS)[number], string>;

type InventoryCore = Readonly<{
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
}>;

type InventoryRecord = InventoryCore & Readonly<{ inventoryFingerprint: string }>;

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
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      assert.equal(field, "", `Unexpected quote at character ${index}`);
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  assert(!quoted, "CSV ends inside a quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  return rows;
}

function csvCell(value: string | number | boolean) {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | boolean>>) {
  const body = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  writeFileSync(path, `${body}\n`);
}

function familyForSurface(surface: string): ContextFamilyKey {
  const normalised = surface.toLowerCase().replaceAll("’", "'");
  if (["there", "their", "they're"].includes(normalised)) return "THERE_THEIR_THEYRE";
  if (["your", "you're"].includes(normalised)) return "YOUR_YOURE";
  if (["to", "too", "two"].includes(normalised)) return "TO_TOO_TWO";
  if (["its", "it's"].includes(normalised)) return "ITS_ITS";
  throw new Error(`Unknown governed surface: ${surface}`);
}

function slug(family: ContextFamilyKey) {
  return family.toLowerCase().replaceAll("_", "-");
}

function inventorySource(source: (typeof SOURCES)[number], bytes: Buffer): InventoryRecord[] {
  const sourceSha256 = sha256(bytes);
  const parsed = parseCsv(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
  assert.deepEqual(parsed[0], EXPECTED_HEADERS, `${source.fileName}: unexpected headers`);
  assert.equal(parsed.length, 401, `${source.fileName}: expected 400 passages`);
  const rows = parsed.slice(1).map((values, index) => {
    assert.equal(values.length, EXPECTED_HEADERS.length, `${source.fileName}: row ${index + 2}`);
    return Object.fromEntries(EXPECTED_HEADERS.map((header, column) => [header, values[column]])) as CsvRow;
  });
  const passageIds = new Set<string>();
  const records: InventoryRecord[] = [];
  const governedPattern = /(?<![\p{L}\p{N}_])(?:they[’']re|there|their|you[’']re|your|it[’']s|its|too|two|to)(?![\p{L}\p{N}_])/giu;

  rows.forEach((row, rowIndex) => {
    assert(row.passage_id, `${source.fileName}: missing passage_id at row ${rowIndex + 2}`);
    assert(!passageIds.has(row.passage_id), `${source.fileName}: duplicate passage_id ${row.passage_id}`);
    passageIds.add(row.passage_id);
    assert(row.source_text, `${source.fileName}: missing source_text at row ${rowIndex + 2}`);
    assert.equal(row.authored_by, "Katie Sanderson", `${source.fileName}: unexpected authored_by claim`);
    assert.equal(row.authorship_confirmed, "TRUE", `${source.fileName}: authorship is not confirmed`);

    const familyIndexes = new Map<ContextFamilyKey, number>();
    let foundNominalFamily = false;
    for (const match of row.source_text.matchAll(governedPattern)) {
      assert.notEqual(match.index, undefined);
      const focusSurface = match[0];
      const family = familyForSurface(focusSurface);
      const familyIndex = (familyIndexes.get(family) ?? 0) + 1;
      familyIndexes.set(family, familyIndex);
      const startUtf16 = match.index;
      const endUtf16 = startUtf16 + focusSurface.length;
      assert.equal(row.source_text.slice(startUtf16, endUtf16), focusSurface);
      const primaryFocusPreselected = family === source.family && familyIndex === 1;
      if (primaryFocusPreselected) foundNominalFamily = true;
      const core: InventoryCore = {
        schemaVersion: 1,
        sourceFileName: source.fileName,
        sourceFileSha256: sourceSha256,
        sourceRowNumber: rowIndex + 2,
        passageId: row.passage_id,
        caseId: `${row.passage_id}-${slug(family)}-${String(familyIndex).padStart(2, "0")}`,
        family,
        sourceText: row.source_text,
        focusSurface,
        startUtf16,
        endUtf16,
        spanValidated: true,
        primaryFocusPreselected,
        primarySelectionRule: "FIRST_NOMINAL_FAMILY_OCCURRENCE_IN_SOURCE_ORDER",
        sourceReference: `source-intake/raw/${source.fileName}#row=${rowIndex + 2}`,
        authoredByClaim: row.authored_by,
        authorshipConfirmedClaim: row.authorship_confirmed,
        sourceGroupClaim: row.source_group,
        authorshipResolutionId: AUTHORSHIP_RESOLUTION_ID,
        sourceAuthorship: "HUMAN_AUTHORED",
        identifierGeneration: "AI_ASSISTED",
      };
      records.push({ ...core, inventoryFingerprint: ordinaryEvaluationFingerprint(core) });
    }
    assert(foundNominalFamily, `${source.fileName}: ${row.passage_id} has no nominal-family occurrence`);
  });
  return records;
}

function main() {
  const inputRoot = process.argv.find((argument) => argument.startsWith("--input-root="))?.slice("--input-root=".length);
  const write = process.argv.includes("--write");
  assert(inputRoot, "Use --input-root=<directory containing the four supplied CSV files>");

  const rawRoot = join(EVALUATION_ROOT, "source-intake", "raw");
  const reviewRoot = join(EVALUATION_ROOT, "human-review", "primary-label");
  const sourceRoot = join(EVALUATION_ROOT, "source-intake");
  const allRecords: InventoryRecord[] = [];
  const sourceManifest: Array<Record<string, unknown>> = [];

  for (const source of SOURCES) {
    const inputPath = join(inputRoot, source.fileName);
    const bytes = readFileSync(inputPath);
    const records = inventorySource(source, bytes);
    allRecords.push(...records);
    sourceManifest.push({
      nominalFamily: source.family,
      suppliedFileName: source.fileName,
      preservedPath: `source-intake/raw/${source.fileName}`,
      byteLength: bytes.length,
      sha256: sha256(bytes),
      headers: EXPECTED_HEADERS,
      passageCount: 400,
      allGovernedOccurrenceCount: records.length,
    });
    if (write) {
      mkdirSync(rawRoot, { recursive: true });
      const preservedPath = join(rawRoot, basename(source.fileName));
      try {
        writeFileSync(preservedPath, bytes, { flag: "wx" });
      } catch {
        const existing = readFileSync(preservedPath);
        assert.equal(sha256(existing), sha256(bytes), `${source.fileName}: preserved source changed`);
      }
    }
  }

  assert.equal(new Set(allRecords.map((record) => record.caseId)).size, allRecords.length, "case IDs must be unique");
  assert.equal(new Set(allRecords.filter((record) => record.primaryFocusPreselected).map((record) => `${record.family}:${record.passageId}`)).size,
    allRecords.filter((record) => record.primaryFocusPreselected).length, "at most one primary focus per family and passage");

  const families = CONTEXT_V3_CANDIDATES.map((candidate) => candidate.manifest.familyKey);
  const coverage = Object.fromEntries(families.map((family) => {
    const familyRecords = allRecords.filter((record) => record.family === family);
    const primary = familyRecords.filter((record) => record.primaryFocusPreselected);
    return [family, {
      totalAnnotatedOccurrences: familyRecords.length,
      passagesWithFamily: new Set(familyRecords.map((record) => record.passageId)).size,
      preselectedPrimary: primary.length,
      confirmedPrimaryHumanDecisions: 0,
      confirmedPrimaryByClassification: { VALID: 0, INVALID: 0, UNCERTAIN: 0 },
      confirmedConstructionCounts: {},
      confirmedSubtypeCounts: {},
      confirmedProtectedCounts: Object.fromEntries(PROTECTED_TAGS.map((tag) => [tag, 0])),
      shortages: [
        "400 complete primary human decisions",
        "150 primary VALID decisions",
        "150 primary INVALID decisions",
        "100 primary UNCERTAIN or unsupported decisions",
        "all top-level construction quotas",
        "all subtype quotas",
        "10 confirmed cases in each protected category",
        "separately attributable non-gold review for every occurrence",
        "adjudication for every substantive disagreement",
      ],
    }];
  }));

  const provenanceCore = {
    schemaVersion: 1,
    resolutionId: AUTHORSHIP_RESOLUTION_ID,
    decidedBy: "Katie Sanderson",
    decisionDate: "2026-09-10",
    sourceTextAuthorship: "HUMAN_AUTHORED",
    identifierGeneration: "AI_ASSISTED",
    resolution: "The source_text passages are human-authored. AI was used only to create non-conflicting identifiers.",
    scope: SOURCES.map((source) => source.fileName),
  };
  const provenance = { ...provenanceCore, provenanceResolutionFingerprint: ordinaryEvaluationFingerprint(provenanceCore) };
  const manifestCore = {
    schemaVersion: 1,
    intakeDate: "2026-09-10",
    baselineCommit: "4139430dd8011c41a7e285e50b71312c1839d936",
    branch: "codex/s8-v3-ordinary-holdout-evaluation",
    authorshipResolutionId: AUTHORSHIP_RESOLUTION_ID,
    sources: sourceManifest,
  };
  const manifest = { ...manifestCore, sourceManifestFingerprint: ordinaryEvaluationFingerprint(manifestCore) };

  if (write) {
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(reviewRoot, { recursive: true });
    writeFileSync(join(sourceRoot, "authorship-resolution.json"), `${JSON.stringify(provenance, null, 2)}\n`);
    writeFileSync(join(sourceRoot, "source-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(sourceRoot, "occurrence-inventory.jsonl"), `${allRecords.map((record) => JSON.stringify(record)).join("\n")}\n`);
    writeFileSync(join(sourceRoot, "coverage-ledger.pre-label.json"), `${JSON.stringify({ schemaVersion: 1, coverage }, null, 2)}\n`);

    for (const candidate of CONTEXT_V3_CANDIDATES) {
      const family = candidate.manifest.familyKey;
      const rows = allRecords.filter((record) => record.family === family).map((record) => [
        record.schemaVersion,
        record.inventoryFingerprint,
        record.sourceFileSha256,
        record.sourceFileName,
        record.sourceRowNumber,
        record.passageId,
        record.caseId,
        record.family,
        record.sourceText,
        record.focusSurface,
        record.startUtf16,
        record.endUtf16,
        record.spanValidated,
        record.primaryFocusPreselected,
        record.primarySelectionRule,
        record.sourceReference,
        record.authoredByClaim,
        record.authorshipConfirmedClaim,
        record.sourceGroupClaim,
        record.authorshipResolutionId,
        record.sourceAuthorship,
        record.identifierGeneration,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
      writeCsv(join(reviewRoot, `${family}.primary-label-review.csv`), [
        "schema_version",
        "inventory_fingerprint",
        "source_file_sha256",
        "source_file_name",
        "source_row_number",
        "passage_id",
        "case_id",
        "family",
        "source_text",
        "focus_surface",
        "start_utf16",
        "end_utf16",
        "span_validated",
        "primary_focus_preselected",
        "primary_selection_rule",
        "source_reference",
        "authored_by",
        "authorship_confirmed_claim",
        "source_group_claim",
        "authorship_resolution_id",
        "source_authorship",
        "identifier_generation",
        "declared_construction",
        "declared_subtype",
        "protected_set_tags_json",
        "classification",
        "intended_alternative",
        "supported_construction",
        "primary_focus_approved",
        "primary_label_id",
        "primary_labeler",
        "primary_label_timestamp_utc",
        "primary_notes",
      ], rows);
    }

    const dispositionRoot = join(EVALUATION_ROOT, "dispositions");
    mkdirSync(dispositionRoot, { recursive: true });
    const inventorySha256 = sha256(readFileSync(join(sourceRoot, "occurrence-inventory.jsonl")));
    const coverageLedgerSha256 = sha256(readFileSync(join(sourceRoot, "coverage-ledger.pre-label.json")));
    for (const candidate of CONTEXT_V3_CANDIDATES) {
      const family = candidate.manifest.familyKey;
      const blockedCandidate = JSON.parse(readFileSync(join(EVALUATION_ROOT, "release-candidates", `${candidate.manifest.releaseKey}.blocked.json`), "utf8"));
      const familyCoverage = coverage[family];
      const dispositionCore = {
        schemaVersion: 1,
        family,
        disposition: "BLOCKED",
        blockerType: "EVIDENCE_COVERAGE_AND_UNRESOLVED_HUMAN_AUTHORITY",
        exactRelease: {
          releaseKey: candidate.manifest.releaseKey,
          releaseId: candidate.manifest.releaseId,
          manifestFingerprint: candidate.fingerprint,
          engineeringCandidateArtifactFingerprint: blockedCandidate.artifactFingerprint,
          frozenCandidateStatus: blockedCandidate.status,
        },
        evidence: {
          sourceManifestFingerprint: manifest.sourceManifestFingerprint,
          authorshipResolutionFingerprint: provenance.provenanceResolutionFingerprint,
          occurrenceInventorySha256: inventorySha256,
          coverageLedgerSha256,
          primaryLabelPacketSha256: sha256(readFileSync(join(reviewRoot, `${family}.primary-label-review.csv`))),
          candidateFingerprint: null,
          goldFingerprint: null,
          corpusFingerprint: null,
          reportFingerprint: null,
        },
        humanWorkflow: {
          primaryLabelsComplete: false,
          confirmedPrimaryDecisions: 0,
          requiredPrimaryDecisions: familyCoverage.preselectedPrimary,
          nonGoldReviewComplete: false,
          adjudicationComplete: false,
          finalGoldLocked: false,
        },
        coverage: {
          totalAnnotatedOccurrences: familyCoverage.totalAnnotatedOccurrences,
          passagesWithFamily: familyCoverage.passagesWithFamily,
          preselectedPrimary: familyCoverage.preselectedPrimary,
          classShortfalls: { VALID: 150, INVALID: 150, UNCERTAIN_OR_UNSUPPORTED: 100 },
          constructionShortfalls: Object.fromEntries(candidate.manifest.supportedConstructions.map((name) => [name, { requiredValid: 30, confirmedValid: 0, requiredInvalid: 30, confirmedInvalid: 0 }])),
          subtypeShortfalls: Object.fromEntries(candidate.manifest.supportedSubtypes.map((name) => [name, { requiredValid: 20, confirmedValid: 0, requiredInvalid: 20, confirmedInvalid: 0 }])),
          protectedShortfalls: Object.fromEntries(PROTECTED_TAGS.map((tag) => [tag, { required: 10, confirmed: 0 }])),
        },
        failedGates: [
          "PRIMARY_HUMAN_LABELS_INCOMPLETE",
          "NON_GOLD_REVIEW_INCOMPLETE",
          "ADJUDICATION_NOT_COMPLETED",
          "PRIMARY_CLASS_COVERAGE_UNCONFIRMED",
          "TOP_LEVEL_CONSTRUCTION_COVERAGE_UNCONFIRMED",
          "SUBTYPE_COVERAGE_UNCONFIRMED",
          "PROTECTED_CATEGORY_COVERAGE_UNCONFIRMED",
          "CANDIDATES_NOT_LOCKED",
          "FINAL_GOLD_NOT_LOCKED",
          "EXACT_RELEASE_EVALUATION_NOT_RUN",
          "DETERMINISTIC_EVALUATION_REPEAT_NOT_RUN",
        ],
        failedCases: [],
        unevaluatedCases: familyCoverage.totalAnnotatedOccurrences,
        metrics: null,
        analyserBehaviour: "NOT_EVALUATED",
        familyDeliveryRemainsDisabled: true,
        publicationPerformed: false,
        selectionPerformed: false,
        approvalEventCreated: false,
        activationPerformed: false,
      };
      const disposition = { ...dispositionCore, dispositionFingerprint: ordinaryEvaluationFingerprint(dispositionCore) };
      writeFileSync(join(dispositionRoot, `${candidate.manifest.releaseKey}.holdout-intake.blocked.json`), `${JSON.stringify(disposition, null, 2)}\n`);
    }

    const manifestLines = CONTEXT_V3_CANDIDATES.map((candidate) => {
      const manifest = candidate.manifest;
      return `- \`${manifest.familyKey}\`: release \`${manifest.releaseKey}\`; ID \`${manifest.releaseId}\`; manifest \`${candidate.fingerprint}\`; constructions ${manifest.supportedConstructions.map((value) => `\`${value}\``).join(", ")}; subtypes ${manifest.supportedSubtypes.map((value) => `\`${value}\``).join(", ")}; members ${manifest.members.map((value) => `\`${value}\``).join(", ")}.`;
    }).join("\n");
    writeFileSync(join(EVALUATION_ROOT, "human-review", "PRIMARY-LABEL-INSTRUCTIONS.md"), `# S8 V3 primary human label packet\n\nNo analyser has been run on these passages. Do not expose analyser predictions to the labeler.\n\nThe immutable columns through \`identifier_generation\` must not be edited. The preserved \`source_group_claim\` contains \`AI_GENERATED_APPROVED\`; authorship resolution \`${AUTHORSHIP_RESOLUTION_ID}\` records that this refers to AI-assisted non-conflicting identifier generation, while the prose itself is human-authored by Katie Sanderson.\n\nComplete every mutable column for every occurrence in all four CSVs. \`classification\` must be \`VALID\`, \`INVALID\` or \`UNCERTAIN\`. \`intended_alternative\` must be blank or one lowercase member of the same family. \`supported_construction\`, \`primary_focus_approved\` and every identity/timestamp field must be explicit. Enter \`protected_set_tags_json\` as a JSON array using only ${PROTECTED_TAGS.map((value) => `\`${value}\``).join(", ")}; use \`[]\` when none applies.\n\nFrozen manifest choices:\n\n${manifestLines}\n\nGovernance question requiring identified-human resolution before candidate records can be locked: the schema requires non-empty construction and subtype strings even where no manifest construction applies. Specify the authorised non-applicable values for \`UNCERTAIN\` or unsupported cases; do not invent them from analyser output.\n\nAfter complete primary labels are returned, build a separately attributable non-gold review packet without analyser predictions. Send every substantive disagreement in classification, intended alternative or supported-construction status to a second identified human for adjudication.\n`);
  }

  console.log(JSON.stringify({
    sources: sourceManifest,
    totalPassages: 1600,
    totalOccurrences: allRecords.length,
    coverage,
    wroteArtifacts: write,
  }, null, 2));
}

main();
