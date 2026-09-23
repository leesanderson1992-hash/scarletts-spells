import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "../lib/writing-engine/whole-writing/context-candidates-v4";
import { ordinaryEvaluationFingerprint, type OrdinaryEvaluationDecision, type OrdinaryWritingV3Case, type OrdinaryWritingV3Gold } from "./lib/whole-writing-v3-ordinary-evaluation";
import {
  bytesSha256, coverageLedger, HOLDOUT_V4_PRIMARY_STRATA, inventorySources, lockGold, resolvedPassages, reviewPackets,
  sealAdjudication, sealDecision, sealSelection, sealSimilarityResolution,
  similarityFlags, subtypeBelongsToConstruction, verifyInventory,
  type DecisionRow, type InventoryRow, type SourceRow,
} from "./lib/whole-writing-v4-holdout-admin";
import { assessStageA, evaluateOrdinaryWritingV4 } from "./lib/whole-writing-v4-ordinary-evaluation";

// In-memory engineering fixtures only. These are never saved as human holdout.
const sources: SourceRow[] = [
  {
    writingSnapshotId: "fixture-snapshot-1", sourceReference: "IN_MEMORY_FIXTURE_1",
    sourceText: "😊 Their coats are here, and you're going to look at its label. It's blue; to me, that's fine.",
    authorId: "fixture-author-1", authoredBy: "ENGINEERING_FIXTURE_NOT_HUMAN_HOLDOUT",
    consentReference: "IN_MEMORY_ONLY", stage: "A",
  },
  {
    writingSnapshotId: "fixture-snapshot-2", sourceReference: "IN_MEMORY_FIXTURE_2",
    sourceText: "There is a note here, but your friend wants two copies.",
    authorId: "fixture-author-2", authoredBy: "ENGINEERING_FIXTURE_NOT_HUMAN_HOLDOUT",
    consentReference: "IN_MEMORY_ONLY", stage: "A",
  },
];
const inventory = inventorySources(sources);
verifyInventory(inventory);
assert.deepEqual(inventorySources([...sources].reverse()), inventory, "Intake ordering must be canonical");
assert.equal(inventory.filter((row) => row.family === "TO_TOO_TWO" && row.sourceReference === "IN_MEMORY_FIXTURE_1").length, 2);
assert(inventory.some((row) => row.startUtf16 === sources[0]!.sourceText.indexOf("Their") && row.startUtf16 === 3 && row.focusSurface === "Their"));
assert(inventory.every((row) => row.sourceText.slice(row.startUtf16, row.endUtf16) === row.focusSurface));

const first = new Set<string>();
const selections = inventory.map((row) => {
  const key = `${row.writingSnapshotId}\0${row.family}`;
  const primaryFocus = !first.has(key);
  first.add(key);
  return sealSelection({ caseId: row.caseId, primaryFocus, selectedBy: "fixture-human", selectionMethod: "FIXTURE_SOURCE_ORDER" });
});
const packets = reviewPackets(inventory, selections);
assert.equal(packets.length, inventory.length);
assert(packets.every((packet) => !Object.hasOwn(packet, "classification") && !Object.hasOwn(packet, "intendedAlternative")));
assert.throws(() => reviewPackets(inventory, [...selections, selections[0]!]), /Duplicate selection/);

function scope(row: InventoryRow) {
  const form = row.focusSurface.toLowerCase().replace(/[’ʼ]/g, "'");
  if (row.family === "THERE_THEIR_THEYRE") return form === "their" ? ["possessive", "possessive_subject_or_object"] : ["existential", "embedded_existential"];
  if (row.family === "TO_TOO_TWO") return form === "two" ? ["numeral", "ordinary_count_numeral"] : form === "to" && row.sourceText.slice(row.endUtf16).startsWith(" me") ? ["preposition", "destination_or_recipient_preposition"] : ["infinitive", "governed_infinitive"];
  if (row.family === "YOUR_YOURE") return form === "your" ? ["possessive", "possessive_subject_or_object"] : ["you_are_contraction", "progressive_contraction"];
  return form === "its" ? ["possessive", "possessive_subject_or_object"] : ["it_is_contraction", "adjectival_contraction"];
}
const primary = inventory.map((row) => {
  const [declaredConstruction, declaredSubtype] = scope(row);
  return sealDecision({
    caseId: row.caseId, decisionId: `fixture-human-${row.caseId}`, reviewerId: "fixture-human", reviewerKind: "HUMAN",
    classification: "VALID", uncertainReason: null, intendedAlternative: null, supportedConstruction: true,
    declaredConstruction: declaredConstruction!, declaredSubtype: declaredSubtype!,
    protectedSetTags: row.focusSurface === "It's" || (row.focusSurface === "to" && row.sourceText.slice(row.endUtf16).startsWith(" me")) ? ["quotation"] : [],
  });
});
function decisionCore(row: DecisionRow): Omit<DecisionRow, "decisionFingerprint"> {
  const { decisionFingerprint, ...core } = row;
  assert(decisionFingerprint.length > 0);
  return core;
}
const review = primary.map((row) => sealDecision({
  ...decisionCore(row),
  decisionId: `fixture-ai-${row.caseId}`, reviewerId: "fixture-ai-model-prompt-fingerprint", reviewerKind: "AI",
}));
const disputed = inventory.find((row) => row.focusSurface === "Their")!;
const reviewWithDisagreement = review.map((row) => row.caseId === disputed.caseId
  ? sealDecision({
    ...decisionCore(row),
    classification: "UNCERTAIN", uncertainReason: "OTHER_UNCERTAIN", intendedAlternative: null,
  }) : row);
assert.throws(() => lockGold({ inventory, selections, primary, review: reviewWithDisagreement, adjudications: [] }), /Unadjudicated substantive disagreement/);
const adjudication = sealAdjudication({
  caseId: disputed.caseId, adjudicationId: `fixture-adjudication-${disputed.caseId}`, adjudicatorId: "fixture-second-human",
  classification: "VALID", uncertainReason: null, intendedAlternative: null, supportedConstruction: true,
  declaredConstruction: "possessive", declaredSubtype: "possessive_subject_or_object", protectedSetTags: [],
});
assert.throws(() => lockGold({ inventory, selections, primary, review: reviewWithDisagreement, adjudications: [{ ...adjudication, adjudicatorId: "fixture-human" }] }), /fingerprint mismatch|self-adjudicate/);
const locked = lockGold({ inventory, selections, primary, review: reviewWithDisagreement, adjudications: [adjudication] });
assert.equal(locked.candidates.length, inventory.length);
assert.equal(locked.gold.length, inventory.length);
assert.deepEqual(locked.adjudicatedCaseIds, [disputed.caseId]);
assert(locked.candidates.every((row) => row.sourceText.slice(row.startUtf16, row.endUtf16) === row.focusSurface));
assert.equal(locked.gold.find((row) => row.caseId === disputed.caseId)!.adjudicationId, adjudication.adjudicationId);
const ledger = coverageLedger(locked.candidates, locked.gold);
assert(ledger.every((row) => row.issues.some((issue) => issue.startsWith("PRIMARY:"))));
assert(ledger.find((row) => row.family === "ITS_ITS")!.issues.some((issue) => issue.includes("perfect_contraction")), "Absent declared subtype must remain in denominator");

const flags = similarityFlags(inventory, [{ id: "development-exact", text: sources[0]!.sourceText }]);
assert(flags.some((row) => row.kind === "EXACT_PASSAGE"));
assert.throws(() => resolvedPassages(flags, []), /Unresolved similarity flags/);
const resolutions = flags.map((row) => sealSimilarityResolution({ passageId: row.passageId, referenceId: row.referenceId, kind: row.kind, resolution: "EXCLUDE", resolvedBy: "fixture-human", reason: "fixture duplicate" }));
assert.equal(resolvedPassages(flags, resolutions).size, 1);

const itsRelease = CONTEXT_V4_DEVELOPMENT_CANDIDATES.find((row) => row.manifest.familyKey === "ITS_ITS")!;
const itsCases = locked.candidates.filter((row) => row.family === "ITS_ITS");
const itsGold = locked.gold.filter((row) => row.family === "ITS_ITS");
const itsDecisions = new Map<string, OrdinaryEvaluationDecision>(itsCases.map((row) => [row.caseId, {
  status: row.protectedSetTags.length ? "UNCERTAIN" : "VALID",
  familyKey: "ITS_ITS", observedMember: row.focusSurface.toLowerCase(), alternativeMember: null,
  assessedScope: "ENGINEERING_FIXTURE", reasonCode: "ENGINEERING_FIXTURE", ruleId: "ENGINEERING_FIXTURE",
  analyserVersion: itsRelease.manifest.analyserVersion, manifestFingerprint: itsRelease.fingerprint,
}]));
const report = evaluateOrdinaryWritingV4({
  family: "ITS_ITS", cases: locked.candidates, gold: locked.gold, inventory,
  decisions: itsDecisions, fallbackAttempts: 0, fallbackAccepted: 0,
  uncertaintyReasonCounts: { GENUINE_SEMANTIC_AMBIGUITY: 0, UNSUPPORTED_CONSTRUCTION_OR_MEANING: 0, OTHER_UNCERTAIN: 0 },
  corpusFingerprint: "ENGINEERING_FIXTURE",
});
assert.equal(report.allOccurrences.validRecognition, 1, "Protected VALID must not reduce ordinary valid recognition");
assert.equal(report.allOccurrences.historicV3ValidRecognitionDiagnostic, 0.5);
assert.equal(report.allOccurrences.counts.protectedValid, 1);
assert.equal(report.allOccurrences.counts.protectedAbstention, 1);
assert.equal(report.allOccurrences.protectedFailures, 0);
assert.equal(report.disposition, "BLOCKED", "Engineering fixture cannot qualify a release");

const toRelease = CONTEXT_V4_DEVELOPMENT_CANDIDATES.find((row) => row.manifest.familyKey === "TO_TOO_TWO")!;
const toCases = locked.candidates.filter((row) => row.family === "TO_TOO_TWO");
const toDecisions = new Map<string, OrdinaryEvaluationDecision>(toCases.map((row) => [row.caseId, {
  status: row.protectedSetTags.length ? "UNCERTAIN" : "VALID",
  familyKey: "TO_TOO_TWO", observedMember: row.focusSurface.toLowerCase(), alternativeMember: null,
  assessedScope: "ENGINEERING_FIXTURE", reasonCode: "ENGINEERING_FIXTURE", ruleId: "ENGINEERING_FIXTURE",
  analyserVersion: toRelease.manifest.analyserVersion, manifestFingerprint: toRelease.fingerprint,
}]));
const toReport = evaluateOrdinaryWritingV4({
  family: "TO_TOO_TWO", cases: locked.candidates, gold: locked.gold, inventory,
  decisions: toDecisions, fallbackAttempts: 0, fallbackAccepted: 0,
  uncertaintyReasonCounts: { GENUINE_SEMANTIC_AMBIGUITY: 0, UNSUPPORTED_CONSTRUCTION_OR_MEANING: 0, OTHER_UNCERTAIN: 0 },
  corpusFingerprint: "ENGINEERING_FIXTURE",
});
assert.equal(toReport.allOccurrences.validRecognition, 1, "TO protected VALID conflict must be resolved separately");
assert(toReport.allOccurrences.historicV3ValidRecognitionDiagnostic < 1, "Historic TO diagnostic remains visible");
assert(toReport.issues.includes("FALLBACK_EXERCISE_BELOW_MINIMUM"));

const stageADecisions = new Map(itsDecisions);
const protectedRow = itsCases.find((row) => row.protectedSetTags.length)!;
stageADecisions.set(protectedRow.caseId, { ...stageADecisions.get(protectedRow.caseId)!, status: "VALID" });
const stageA = assessStageA({ cases: itsCases, gold: itsGold, decisions: stageADecisions, family: "ITS_ITS" });
assert.equal(stageA.recommendation, "STOP_FAMILY");
assert(stageA.safetyFindings.some((row) => row.endsWith(":PROTECTED_FAILURE")), "Stage A must inspect incidental protected occurrences");

const tampered = inventory.map((row) => row.caseId === disputed.caseId ? { ...row, focusSurface: "there" } : row);
assert.throws(() => verifyInventory(tampered), /Span mismatch/);

console.log("S8 V4 holdout administration regression passed (in-memory engineering fixtures only).");

// Full-size arithmetic fixture proves that every frozen subtype is enforced,
// protected rows do not inflate primary precision, and four independent
// families can qualify only when every declared quota and safety gate passes.
const arithmeticCandidates: OrdinaryWritingV3Case[] = [];
const arithmeticGold: OrdinaryWritingV3Gold[] = [];
const arithmeticInventory: InventoryRow[] = [];
const arithmeticDecisions = new Map<string, OrdinaryEvaluationDecision>();
for (const release of CONTEXT_V4_DEVELOPMENT_CANDIDATES) {
  const family = release.manifest.familyKey;
  const strata = Object.entries(HOLDOUT_V4_PRIMARY_STRATA[family]);
  const plan = [
    ...strata.flatMap(([subtype, count]) => Array.from({ length: count }, () => ({ subtype, classification: "VALID" as const }))),
    ...strata.flatMap(([subtype, count]) => Array.from({ length: count }, () => ({ subtype, classification: "INVALID" as const }))),
    ...Array.from({ length: 100 }, () => ({ subtype: "not_applicable", classification: "UNCERTAIN" as const })),
  ];
  assert.equal(plan.length, 400);
  for (const [index, item] of plan.entries()) {
    const surface = release.manifest.members[0]!;
    const sourceReference = `IN_MEMORY_ARITHMETIC_FIXTURE:${family}:${index}`;
    const sourceText = `Engineering fixture ${index}: ${surface} appears in this test line.`;
    const inventoried = inventorySources([{
      writingSnapshotId: sourceReference, sourceReference, sourceText,
      authorId: `arithmetic-author-${index % 20}`, authoredBy: "ENGINEERING_FIXTURE_NOT_HUMAN_HOLDOUT",
      consentReference: "IN_MEMORY_ONLY", stage: "B",
    }]);
    assert.equal(inventoried.length, 1);
    const row = inventoried[0]!;
    arithmeticInventory.push(row);
    const construction = item.subtype === "not_applicable" ? "not_applicable"
      : release.manifest.supportedConstructions.find((name) => subtypeBelongsToConstruction(family, name, item.subtype))!;
    const protectedSetTags = item.classification === "UNCERTAIN" && index < 350
      ? [["fragment"], ["quotation"], ["gerund"], ["run_on"], ["task_dependent"]][Math.floor((index - 300) / 10)] as OrdinaryWritingV3Case["protectedSetTags"]
      : [];
    const candidateCore = {
      schemaVersion: 1 as const, passageId: row.passageId, caseId: row.caseId, family,
      sourceText, focusSurface: surface, startUtf16: row.startUtf16, endUtf16: row.endUtf16,
      declaredConstruction: construction, declaredSubtype: item.subtype, primaryFocus: true,
      protectedSetTags, sourceReference, authoredBy: row.authoredBy,
    };
    arithmeticCandidates.push({ ...candidateCore, candidateFingerprint: ordinaryEvaluationFingerprint(candidateCore) });
    const intendedAlternative = item.classification === "INVALID" ? release.manifest.members[1]! : null;
    const goldCore = {
      schemaVersion: 1 as const, caseId: row.caseId, family, classification: item.classification,
      intendedAlternative, supportedConstruction: item.classification !== "UNCERTAIN",
      primaryLabelId: `arithmetic-primary-${row.caseId}`, nonGoldReviewId: `arithmetic-review-${row.caseId}`,
      adjudicationId: null,
    };
    arithmeticGold.push({ ...goldCore, goldFingerprint: ordinaryEvaluationFingerprint(goldCore) });
    arithmeticDecisions.set(row.caseId, {
      status: item.classification, familyKey: family, observedMember: surface,
      alternativeMember: intendedAlternative, assessedScope: "ENGINEERING_FIXTURE",
      reasonCode: "ENGINEERING_FIXTURE", ruleId: "ENGINEERING_FIXTURE",
      analyserVersion: release.manifest.analyserVersion, manifestFingerprint: release.fingerprint,
    });
  }
  const familyDecisions = new Map([...arithmeticDecisions].filter(([caseId]) => arithmeticCandidates.some((row) => row.caseId === caseId && row.family === family)));
  const passing = evaluateOrdinaryWritingV4({
    family, cases: arithmeticCandidates, gold: arithmeticGold, inventory: arithmeticInventory,
    decisions: familyDecisions, fallbackAttempts: family === "THERE_THEIR_THEYRE" || family === "TO_TOO_TWO" ? 10 : 0,
    fallbackAccepted: family === "THERE_THEIR_THEYRE" || family === "TO_TOO_TWO" ? 10 : 0,
    uncertaintyReasonCounts: { GENUINE_SEMANTIC_AMBIGUITY: 10, UNSUPPORTED_CONSTRUCTION_OR_MEANING: 10, OTHER_UNCERTAIN: 80 },
    corpusFingerprint: "IN_MEMORY_ARITHMETIC_FIXTURE_ONLY",
  });
  assert.equal(passing.disposition, "PASS_REVIEWABLE_NOT_PUBLISHED", `${family}: ${passing.issues.join(",")}`);
  assert.equal(passing.allOccurrences.falseValid, 0);
  assert.equal(passing.allOccurrences.wrongAlternatives, 0);
  assert.equal(passing.allOccurrences.protectedFailures, 0);
}
console.log("S8 V4 four-family quota arithmetic regression passed (not approval evidence).");

// Exercise the file/command boundary in an isolated temporary directory. The
// raw fixture and its derived artifacts are removed; no approval corpus exists.
const temporary = mkdtempSync(join(tmpdir(), "s8-v4-holdout-admin-fixture-"));
try {
  const protocolPath = join(temporary, "protocol.json");
  const sourcePath = join(temporary, "source.jsonl");
  const evaluationRoot = join(temporary, "evaluation");
  writeFileSync(protocolPath, `${JSON.stringify({
    approvalId: "regression-authority-001", approvedBy: "Test Operator A",
    evaluatorContractApprovalId: "regression-authority-002", evaluatorContractReviewedBy: "Test Operator B",
    adminVersion: "S8_V4_HOLDOUT_ADMIN_V1_2026_09_23",
    evaluatorPolicyVersion: "S8_V4_ORDINARY_WRITING_EVALUATOR_V1_PROTECTED_VALID_SEPARATE",
    stageAPrimaryPerFamily: 100, stageBPrimaryPerFamily: 300,
    stageBSourceInstructions: "fixture only", stageBSelectionRule: "fixture only",
    sourceIndependenceAttestation: "fixture only",
    releaseManifestFingerprints: Object.fromEntries(CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((row) => [row.manifest.familyKey, row.fingerprint])),
  })}\n`);
  writeFileSync(sourcePath, `${sources.map((row) => JSON.stringify(row)).join("\n")}\n`);
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/whole-writing-s8-v4-holdout-admin.ts", ...args], {
      cwd: process.cwd(), encoding: "utf8", timeout: 120_000,
    });
    assert.equal(result.status, 0, `CLI failed: ${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
  };
  run("register-protocol", `--root=${evaluationRoot}`, `--source=${protocolPath}`);
  run("intake", `--root=${evaluationRoot}`, `--source=${sourcePath}`, `--reference-root=${process.cwd()}`);
  const rawPreserved = readFileSync(join(evaluationRoot, "source-intake/raw", `${bytesSha256(readFileSync(sourcePath))}.jsonl`));
  assert.deepEqual(rawPreserved, readFileSync(sourcePath), "Intake must preserve source bytes exactly");
  run("similarity-template", `--root=${evaluationRoot}`);
  const actualInventory = readFileSync(join(evaluationRoot, "source-intake/occurrence-inventory.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(actualInventory.length, inventory.length);
  const failedPacket = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/whole-writing-s8-v4-holdout-admin.ts", "selection-template", `--root=${evaluationRoot}`, "--stage=A"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 30_000,
  });
  assert.notEqual(failedPacket.status, 0, "Packets must require resolved similarity evidence");
  const csvCell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const writeCsv = (path: string, columns: string[], rows: Record<string, unknown>[]) => writeFileSync(path,
    `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\n")}\n`);
  const similarity = readFileSync(join(evaluationRoot, "source-intake/similarity-flags.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const similarityCsv = join(temporary, "similarity.completed.csv");
  const similaritySealed = join(temporary, "similarity.sealed.jsonl");
  writeCsv(similarityCsv, ["passageId", "referenceId", "kind", "score", "resolution", "resolvedBy", "reason"],
    similarity.map((row) => ({ ...row, resolution: "INDEPENDENT_CONFIRMED", resolvedBy: "Test Operator A", reason: "temporary regression case" })));
  run("seal-similarity", `--root=${evaluationRoot}`, `--source=${similarityCsv}`, `--out=${similaritySealed}`);
  run("selection-template", `--root=${evaluationRoot}`, "--stage=A", `--resolutions=${similaritySealed}`);
  const selectionsCsv = join(temporary, "selection.completed.csv");
  const selectionsSealed = join(temporary, "selection.sealed.jsonl");
  const primarySeen = new Set<string>();
  writeCsv(selectionsCsv, ["caseId", "family", "sourceText", "focusSurface", "startUtf16", "endUtf16", "primaryFocus", "selectedBy", "selectionMethod"],
    actualInventory.map((row) => {
      const key = `${row.writingSnapshotId}\0${row.family}`;
      const primaryFocus = !primarySeen.has(key);
      primarySeen.add(key);
      return { ...row, primaryFocus: primaryFocus ? "TRUE" : "FALSE", selectedBy: "Test Operator A", selectionMethod: "REGRESSION_SOURCE_ORDER" };
    }));
  run("seal-selection", `--root=${evaluationRoot}`, `--source=${selectionsCsv}`, `--out=${selectionsSealed}`);
  run("packets", `--root=${evaluationRoot}`, "--stage=A", `--selections=${selectionsSealed}`, `--resolutions=${similaritySealed}`);
  const reviewColumns = ["caseId", "family", "sourceText", "focusSurface", "startUtf16", "endUtf16", "primaryFocus", "sourceReference", "reviewerId", "classification", "intendedAlternative", "supportedConstruction", "declaredConstruction", "declaredSubtype", "uncertainReason", "protectedSetTagsJson"];
  const humanCsv = join(temporary, "human.completed.csv");
  const aiCsv = join(temporary, "ai.completed.csv");
  const reviewRows = actualInventory.map((row) => {
    const [declaredConstruction, declaredSubtype] = scope(row);
    return { ...row, primaryFocus: "TRUE", classification: "VALID", intendedAlternative: "", supportedConstruction: "TRUE", declaredConstruction, declaredSubtype, uncertainReason: "", protectedSetTagsJson: "[]" };
  });
  writeCsv(humanCsv, reviewColumns, reviewRows.map((row) => ({ ...row, reviewerId: "Test Operator A" })));
  writeCsv(aiCsv, reviewColumns, reviewRows.map((row) => ({ ...row, reviewerId: "test-ai-model-prompt-hash" })));
  const humanSealed = join(temporary, "human.sealed.jsonl");
  const aiSealed = join(temporary, "ai.sealed.jsonl");
  run("seal-review", `--root=${evaluationRoot}`, "--kind=HUMAN", `--source=${humanCsv}`, `--out=${humanSealed}`);
  run("seal-review", `--root=${evaluationRoot}`, "--kind=AI", `--source=${aiCsv}`, `--out=${aiSealed}`);
  run("adjudication-template", `--root=${evaluationRoot}`, `--primary=${humanSealed}`, `--review=${aiSealed}`, `--out=${join(temporary, "adjudication.packet.csv")}`);
  run("seal-adjudications", `--root=${evaluationRoot}`, `--source=${join(temporary, "adjudication.packet.csv")}`, `--out=${join(temporary, "adjudication.sealed.jsonl")}`);
  assert.equal(readFileSync(join(temporary, "adjudication.sealed.jsonl"), "utf8"), "");
  assert.equal(JSON.parse(readFileSync(`${humanSealed}.receipt.json`, "utf8")).sourceSha256, bytesSha256(readFileSync(humanCsv)));
  const inadequateLock = spawnSync(process.execPath, [
    "--conditions=react-server", "--import", "tsx", "scripts/whole-writing-s8-v4-holdout-admin.ts", "lock",
    `--root=${evaluationRoot}`, "--stage=A", `--selections=${selectionsSealed}`, `--primary=${humanSealed}`,
    `--review=${aiSealed}`, `--adjudications=${join(temporary, "adjudication.sealed.jsonl")}`,
    `--resolutions=${similaritySealed}`, `--similarity-raw=${similarityCsv}`, `--selection-raw=${selectionsCsv}`,
    `--primary-raw=${humanCsv}`, `--review-raw=${aiCsv}`, `--adjudications-raw=${join(temporary, "adjudication.packet.csv")}`,
  ], { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 });
  assert.notEqual(inadequateLock.status, 0, "Engineering fixture must block gold lock");
  assert.match(inadequateLock.stderr, /Engineering fixtures cannot become holdout gold/);
  assert.equal(existsSync(join(evaluationRoot, "stage-a/gold-lock.receipt.json")), false, "Failed lock must not write a success receipt");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log("S8 V4 holdout CLI isolation regression passed (temporary fixtures removed).");
