import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "../lib/writing-engine/whole-writing/context-candidates-v4";
import type { DetailedContextDecisionV4 } from "../lib/writing-engine/whole-writing/context-family-v4";
import type { OrdinaryEvaluationDecision, OrdinaryWritingV3Case, OrdinaryWritingV3Gold } from "./lib/whole-writing-v3-ordinary-evaluation";
import { ordinaryEvaluationFingerprint } from "./lib/whole-writing-v3-ordinary-evaluation";
import {
  bytesSha256, coverageLedger, HOLDOUT_V4_ADMIN_VERSION, inventorySources, lockGold,
  resolvedPassages, reviewPackets, sealAdjudication, sealDecision, sealSelection, sealSimilarityResolution,
  similarityFlags, validateSelections, verifyInventory, verifySingleAuthorScope,
  type AdjudicationRow, type DecisionRow, type InventoryRow, type SelectionRow, type SimilarityFlag,
  type SimilarityResolution, type SourceRow, type UncertainReason,
} from "./lib/whole-writing-v4-holdout-admin";
import { assessStageA, evaluateOrdinaryWritingV4, HOLDOUT_V4_EVALUATOR_POLICY } from "./lib/whole-writing-v4-ordinary-evaluation";

const command = process.argv[2];
const options = new Map(process.argv.slice(3).filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
  const at = arg.indexOf("=");
  return [arg.slice(2, at), arg.slice(at + 1)];
}));
assert(command === "pins" || options.has("root"), "An explicit --root=<private-evaluation-root> is required");
const root = resolve(options.get("root") ?? ".");
const sourceRoot = join(root, "source-intake");
const inventoryPath = join(sourceRoot, "occurrence-inventory.jsonl");
const sourceManifestPath = join(sourceRoot, "source-manifest.json");
const similarityPath = join(sourceRoot, "similarity-flags.jsonl");
const protocolPath = join(root, "governance/approved-protocol.raw.json");
const protocolReceiptPath = join(root, "governance/approved-protocol.receipt.json");
const fixtureMarker = "ENGINEERING_FIXTURE_NOT_HUMAN_HOLDOUT";

function option(name: string): string {
  const value = options.get(name);
  assert(value, `Missing --${name}=...`);
  return value;
}
function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as T; }
    catch { throw new Error(`Malformed JSONL: ${path}:${index + 1}`); }
  });
}
function jsonl(rows: readonly unknown[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
}
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function csv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\n")}\n`;
}
function readCsv(path: string): Record<string, string>[] {
  const input = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  assert(!quoted, `Unclosed CSV quote: ${path}`);
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...body] = rows;
  assert(headers && headers.length > 0, `Empty CSV: ${path}`);
  assert.equal(new Set(headers).size, headers.length, `Duplicate CSV headers: ${path}`);
  return body.filter((cells) => cells.some(Boolean)).map((cells, index) => {
    assert.equal(cells.length, headers.length, `CSV column mismatch: ${path}:${index + 2}`);
    return Object.fromEntries(headers.map((header, column) => [header, cells[column]!])) as Record<string, string>;
  });
}
function csvBoolean(value: string, field: string): boolean {
  assert(value === "TRUE" || value === "FALSE", `${field} must be TRUE or FALSE`);
  return value === "TRUE";
}
function writeOnce(path: string, value: string | Uint8Array) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, value, { flag: "wx" });
}
function writeSealed(commandName: string, sourcePath: string, outPath: string, rows: readonly unknown[]) {
  const content = jsonl(rows);
  const receipt = {
    schemaVersion: 1, command: commandName, sourceSha256: bytesSha256(readFileSync(sourcePath)),
    outputSha256: bytesSha256(content), rowCount: rows.length,
    canonicalFingerprint: ordinaryEvaluationFingerprint(rows),
  };
  assert(!existsSync(outPath) && !existsSync(`${outPath}.receipt.json`), `Sealed output already exists: ${outPath}`);
  writeOnce(outPath, content);
  writeOnce(`${outPath}.receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
}
function verifySealed(commandName: string, sourcePath: string, sealedPath: string) {
  const receipt = JSON.parse(readFileSync(`${sealedPath}.receipt.json`, "utf8")) as { command: string; sourceSha256: string; outputSha256: string; rowCount: number; canonicalFingerprint: string };
  assert.equal(receipt.command, commandName, `Sealed receipt command mismatch: ${sealedPath}`);
  assert.equal(receipt.sourceSha256, bytesSha256(readFileSync(sourcePath)), `Raw intake changed after sealing: ${sealedPath}`);
  assert.equal(receipt.outputSha256, bytesSha256(readFileSync(sealedPath)), `Sealed decisions changed after sealing: ${sealedPath}`);
  const rows = readJsonl<unknown>(sealedPath);
  assert.equal(receipt.rowCount, rows.length, `Sealed row count changed: ${sealedPath}`);
  assert.equal(receipt.canonicalFingerprint, ordinaryEvaluationFingerprint(rows), `Sealed canonical fingerprint changed: ${sealedPath}`);
}
function allFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  return statSync(path).isDirectory() ? readdirSync(path).flatMap((name) => allFiles(join(path, name))) : [path];
}
function referenceTexts(repo: string): { id: string; text: string }[] {
  const v3 = join(repo, "data/whole-writing/v3-ordinary-writing-evaluation");
  const paths = [
    join(v3, "source-intake/occurrence-inventory.jsonl"),
    ...["THERE_THEIR_THEYRE", "TO_TOO_TWO", "YOUR_YOURE", "ITS_ITS"].map((family) => join(repo, `data/whole-writing/g2-context-family-corpora/candidates/${family}.jsonl`)),
    ...allFiles(join(v3, "development-analysis")).filter((path) => /\.(json|jsonl)$/.test(path)),
    ...allFiles(join(repo, "docs/implementation")).filter((path) => /whole-writing-s8-v4.*\.md$/.test(path)),
  ];
  const found = new Map<string, string>();
  function collect(value: unknown, id: string) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach((row, index) => collect(row, `${id}[${index}]`)); return; }
    for (const [key, child] of Object.entries(value)) {
      if (["sourceText", "fieldText", "sentence", "passageText"].includes(key) && typeof child === "string" && child.length >= 20) found.set(`${id}.${key}`, child);
      else if (typeof child === "object") collect(child, `${id}.${key}`);
    }
  }
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, "utf8");
    if (path.endsWith(".md")) {
      for (const [index, line] of raw.split("\n").entries()) {
        for (const match of line.matchAll(/`([^`]{40,})`/g)) found.set(`${path}:${index + 1}`, match[1]!);
      }
      continue;
    }
    if (path.endsWith(".jsonl")) {
      raw.split(/\r?\n/).filter(Boolean).forEach((line, index) => collect(JSON.parse(line), `${path}:${index + 1}`));
    } else collect(JSON.parse(raw), path);
  }
  const unique = new Map<string, { id: string; text: string }>();
  for (const [id, text] of found) {
    const hash = bytesSha256(text.normalize("NFC").toLowerCase().replace(/\s+/g, " "));
    if (!unique.has(hash)) unique.set(hash, { id, text });
  }
  return [...unique.values()];
}
function readInventory(): InventoryRow[] {
  const rows = readJsonl<InventoryRow>(inventoryPath);
  verifyInventory(rows);
  return rows;
}
function verifyProtocol() {
  const raw = readFileSync(protocolPath);
  const receipt = JSON.parse(readFileSync(protocolReceiptPath, "utf8")) as { rawSha256: string; protocolFingerprint: string };
  assert.equal(bytesSha256(raw), receipt.rawSha256, "Approved protocol bytes changed");
  const protocol = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  assert.equal(ordinaryEvaluationFingerprint(protocol), receipt.protocolFingerprint, "Approved protocol fingerprint changed");
  assert.equal(protocol.evaluatorPolicyVersion, HOLDOUT_V4_EVALUATOR_POLICY.version, "Evaluator policy differs from approved protocol");
  assert.equal(protocol.adminVersion, HOLDOUT_V4_ADMIN_VERSION, "Administration version differs from approved protocol");
  for (const candidate of CONTEXT_V4_DEVELOPMENT_CANDIDATES) {
    const pins = protocol.releaseManifestFingerprints as Record<string, string>;
    assert.equal(pins[candidate.manifest.familyKey], candidate.fingerprint, `Frozen release pin changed: ${candidate.manifest.familyKey}`);
  }
  return receipt;
}

function registerProtocol() {
  const raw = readFileSync(resolve(option("source")));
  const protocol = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  for (const field of ["approvalId", "approvedBy", "evaluatorContractApprovalId", "evaluatorContractReviewedBy", "stageBSourceInstructions", "stageBSelectionRule", "sourceIndependenceAttestation"]) {
    assert(typeof protocol[field] === "string" && (protocol[field] as string).trim().length > 0, `Approved protocol lacks ${field}`);
  }
  for (const field of ["approvalId", "approvedBy", "evaluatorContractApprovalId", "evaluatorContractReviewedBy"]) {
    assert(!/fixture|pending|todo|placeholder|human-issued|identified-human/i.test(protocol[field] as string), `Protocol contains non-approval placeholder: ${field}`);
  }
  assert.notEqual(protocol.approvedBy, protocol.evaluatorContractReviewedBy, "Evaluator contract requires a separately identified reviewer");
  assert.equal(protocol.stageAPrimaryPerFamily, 100, "Stage A size must be 100 per family");
  assert.equal(protocol.stageBPrimaryPerFamily, 300, "Stage B size must be 300 per family");
  assert.equal(protocol.evaluatorPolicyVersion, HOLDOUT_V4_EVALUATOR_POLICY.version, "Evaluator contract version mismatch");
  assert.equal(protocol.adminVersion, HOLDOUT_V4_ADMIN_VERSION, "Administration version mismatch");
  for (const candidate of CONTEXT_V4_DEVELOPMENT_CANDIDATES) {
    const pins = protocol.releaseManifestFingerprints as Record<string, string>;
    assert.equal(pins[candidate.manifest.familyKey], candidate.fingerprint, `Release pin mismatch: ${candidate.manifest.familyKey}`);
  }
  const receipt = { rawSha256: bytesSha256(raw), protocolFingerprint: ordinaryEvaluationFingerprint(protocol) };
  writeOnce(protocolPath, raw);
  writeOnce(protocolReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ command: "register-protocol", ...receipt }));
}
function readSelection(path: string): SelectionRow[] {
  return readJsonl<SelectionRow>(path);
}
function uncertaintyReasonCountsFor(
  candidates: readonly OrdinaryWritingV3Case[], gold: readonly OrdinaryWritingV3Gold[],
  primary: readonly DecisionRow[], adjudications: readonly AdjudicationRow[],
): Record<string, Record<UncertainReason, number>> {
  const allFamilies = CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((row) => row.manifest.familyKey);
  const primaryByCase = new Map(primary.map((row) => [row.caseId, row]));
  const adjudicationByCase = new Map(adjudications.map((row) => [row.caseId, row]));
  const goldByCase = new Map(gold.map((row) => [row.caseId, row]));
  return Object.fromEntries(allFamilies.map((family) => {
    const counts = { GENUINE_SEMANTIC_AMBIGUITY: 0, UNSUPPORTED_CONSTRUCTION_OR_MEANING: 0, OTHER_UNCERTAIN: 0 };
    for (const row of candidates.filter((candidate) => candidate.family === family && candidate.primaryFocus && goldByCase.get(candidate.caseId)?.classification === "UNCERTAIN")) {
      const decision = adjudicationByCase.get(row.caseId) ?? primaryByCase.get(row.caseId);
      assert(decision?.uncertainReason, `Missing reviewed UNCERTAIN reason: ${row.caseId}`);
      counts[decision.uncertainReason] += 1;
    }
    return [family, counts];
  })) as Record<string, Record<UncertainReason, number>>;
}
function eligibleInventory(): InventoryRow[] {
  const flags = readJsonl<SimilarityFlag>(similarityPath);
  const resolutions = readJsonl<SimilarityResolution>(option("resolutions"));
  const excluded = resolvedPassages(flags, resolutions);
  return readInventory().filter((row) => !excluded.has(row.passageId));
}
function verifyReceipt(stage: "A" | "FINAL") {
  const receiptPath = join(root, stage === "A" ? "stage-a/gold-lock.receipt.json" : "gold/final-gold-lock.receipt.json");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as { stage: string; activeFamilies: string[]; sourceInventoryFingerprint: string; sourceManifestSha256: string; eligibleInventoryFingerprint: string; similarityResolutionSha256: string; inputEvidenceSha256: Record<string, string>; uncertaintyReasonCounts: Record<string, Record<UncertainReason, number>>; coverageLedger: unknown; candidateSha256: Record<string, string>; goldSha256: Record<string, string>; receiptFingerprint: string };
  const { receiptFingerprint, ...receiptCore } = receipt;
  assert.equal(ordinaryEvaluationFingerprint(receiptCore), receiptFingerprint, "Gold-lock receipt fingerprint changed");
  assert.equal(receipt.stage, stage, "Gold-lock stage mismatch");
  const base = join(root, stage === "A" ? "stage-a" : "");
  const inventory = readJsonl<InventoryRow>(join(base, "evidence/source-inventory.jsonl"));
  verifyInventory(inventory);
  assert.equal(receipt.sourceInventoryFingerprint, ordinaryEvaluationFingerprint(inventory), "Locked source inventory changed");
  const manifestBytes = readFileSync(join(base, "evidence/source-manifest.json"));
  assert.equal(bytesSha256(manifestBytes), receipt.sourceManifestSha256, "Locked source manifest changed");
  const sourceManifest = JSON.parse(manifestBytes.toString("utf8")) as { sources: { path: string; sha256: string }[] };
  for (const source of sourceManifest.sources) {
    assert(source.path.startsWith("source-intake/raw/") && !source.path.includes(".."), "Unsafe raw source path in manifest");
    assert.equal(bytesSha256(readFileSync(join(root, source.path))), source.sha256, `Raw source bytes changed: ${source.path}`);
  }
  if (stage === "FINAL") assert.equal(receipt.sourceInventoryFingerprint, ordinaryEvaluationFingerprint(readInventory()), "Final source inventory changed after gold lock");
  const resolutionBytes = readFileSync(join(base, "evidence/similarity-resolutions.jsonl"));
  assert.equal(bytesSha256(resolutionBytes), receipt.similarityResolutionSha256, "Similarity resolution evidence changed");
  for (const [name, hash] of Object.entries(receipt.inputEvidenceSha256)) {
    assert.equal(bytesSha256(readFileSync(join(base, `evidence/${name}`))), hash, `Raw or sealed review evidence changed: ${name}`);
  }
  const excluded = resolvedPassages(readJsonl<SimilarityFlag>(join(base, "evidence/similarity-flags.jsonl")), readJsonl<SimilarityResolution>(join(base, "evidence/similarity-resolutions.jsonl")));
  assert.equal(ordinaryEvaluationFingerprint(inventory.filter((row) => !excluded.has(row.passageId))), receipt.eligibleInventoryFingerprint, "Eligible inventory changed after gold lock");
  for (const family of Object.keys(receipt.candidateSha256)) {
    assert.equal(bytesSha256(readFileSync(join(base, `candidates/${family}.jsonl`))), receipt.candidateSha256[family], `${family} candidate bytes changed`);
    assert.equal(bytesSha256(readFileSync(join(base, `gold/${family}.final-gold.jsonl`))), receipt.goldSha256[family], `${family} gold bytes changed`);
  }
  const candidates = CONTEXT_V4_DEVELOPMENT_CANDIDATES.flatMap(({ manifest }) => readJsonl<OrdinaryWritingV3Case>(join(base, `candidates/${manifest.familyKey}.jsonl`)));
  const gold = CONTEXT_V4_DEVELOPMENT_CANDIDATES.flatMap(({ manifest }) => readJsonl<OrdinaryWritingV3Gold>(join(base, `gold/${manifest.familyKey}.final-gold.jsonl`)));
  assert.deepEqual(uncertaintyReasonCountsFor(candidates, gold,
    readJsonl<DecisionRow>(join(base, "evidence/primary.sealed.jsonl")),
    readJsonl<AdjudicationRow>(join(base, "evidence/adjudication.sealed.jsonl"))), receipt.uncertaintyReasonCounts, "Uncertainty-reason counts changed after gold lock");
  assert.deepEqual(coverageLedger(candidates, gold), receipt.coverageLedger, "Coverage ledger changed after gold lock");
  return receipt;
}

function intake() {
  verifyProtocol();
  assert(!existsSync(join(root, "gold/final-gold-lock.receipt.json")), "Final gold is locked; source cannot change");
  const path = resolve(option("source"));
  const raw = readFileSync(path);
  const sourceSha256 = bytesSha256(raw);
  const incoming = readJsonl<SourceRow>(path);
  if (existsSync(join(root, "stage-a/gold-lock.receipt.json"))) {
    assert(incoming.every((row) => row.stage === "B"), "Stage A source is already locked");
  }
  const newInventory = inventorySources(incoming);
  assert.equal(new Set(newInventory.map((row) => row.passageId)).size, incoming.length, "Every source passage must contain a governed occurrence");
  const existing = existsSync(inventoryPath) ? readInventory() : [];
  const combined = [...existing, ...newInventory].sort((a, b) => a.caseId.localeCompare(b.caseId));
  verifyInventory(combined);
  verifySingleAuthorScope(combined);
  assert.equal(new Set(combined.map((row) => row.caseId)).size, combined.length, "Source duplicates an existing case");
  assert.equal(new Set([...existing, ...newInventory].map((row) => row.passageId)).size, new Set(existing.map((row) => row.passageId)).size + new Set(newInventory.map((row) => row.passageId)).size, "Source duplicates an existing passage");
  const manifest = existsSync(sourceManifestPath)
    ? JSON.parse(readFileSync(sourceManifestPath, "utf8")) as { schemaVersion: 1; sources: { path: string; sha256: string; passages: number }[] }
    : { schemaVersion: 1 as const, sources: [] as { path: string; sha256: string; passages: number }[] };
  assert(!manifest.sources.some((row) => row.sha256 === sourceSha256), "Source artifact already ingested");
  const relativeRawPath = `source-intake/raw/${sourceSha256}.jsonl`;
  const referenceRoot = resolve(options.get("reference-root") ?? ".");
  const developmentReferences = referenceTexts(referenceRoot);
  assert(developmentReferences.length > 0, "Development-reference corpus is unavailable; leakage check cannot run");
  const holdoutReferences = [...new Map(combined.map((row) => [row.passageId, row.sourceText]))].map(([passageId, text]) => ({ id: `holdout:${passageId}`, text }));
  const flags = similarityFlags(combined, [...developmentReferences, ...holdoutReferences]);
  manifest.sources.push({ path: relativeRawPath, sha256: sourceSha256, passages: incoming.length });
  mkdirSync(join(sourceRoot, "raw"), { recursive: true });
  writeOnce(join(root, relativeRawPath), raw);
  writeFileSync(inventoryPath, jsonl(combined));
  writeFileSync(similarityPath, jsonl(flags));
  writeFileSync(sourceManifestPath, `${JSON.stringify({ ...manifest, inventoryFingerprint: ordinaryEvaluationFingerprint(combined), similarityFingerprint: ordinaryEvaluationFingerprint(flags) }, null, 2)}\n`);
  console.log(JSON.stringify({ command: "intake", sourceSha256, passages: incoming.length, occurrences: newInventory.length, similarityFlags: flags.length, inventoryFingerprint: ordinaryEvaluationFingerprint(combined) }));
}

function packets() {
  const stage = option("stage");
  assert(stage === "A" || stage === "B", "Packet stage must be A or B");
  const inventory = eligibleInventory().filter((row) => row.stage === stage);
  const selected = readSelection(option("selections"));
  validateSelections(inventory, selected);
  const packets = reviewPackets(inventory, selected);
  const dir = join(root, "human-review", `stage-${stage.toLowerCase()}`);
  writeOnce(join(dir, "selection.jsonl"), jsonl(selected.sort((a, b) => a.caseId.localeCompare(b.caseId))));
  writeOnce(join(dir, "primary.packet.jsonl"), jsonl(packets));
  writeOnce(join(dir, "non-gold.packet.jsonl"), jsonl(packets));
  const blankCsvPacket = csv([
    "caseId", "family", "sourceText", "focusSurface", "startUtf16", "endUtf16", "primaryFocus",
    "sourceReference", "reviewerId", "classification", "intendedAlternative", "supportedConstruction",
    "declaredConstruction", "declaredSubtype", "uncertainReason", "protectedSetTagsJson",
  ], packets.map((row) => ({ ...row, primaryFocus: row.primaryFocus ? "TRUE" : "FALSE", reviewerId: "", classification: "", intendedAlternative: "", supportedConstruction: "", declaredConstruction: "", declaredSubtype: "", uncertainReason: "", protectedSetTagsJson: "[]" })));
  writeOnce(join(dir, "primary.packet.csv"), blankCsvPacket);
  writeOnce(join(dir, "non-gold.packet.csv"), blankCsvPacket);
  console.log(JSON.stringify({ command: "packets", stage, rows: packets.length, packetFingerprint: ordinaryEvaluationFingerprint(packets) }));
}

function selectionTemplate() {
  const stage = option("stage");
  assert(stage === "A" || stage === "B", "Selection stage must be A or B");
  const inventory = eligibleInventory().filter((row) => row.stage === stage).sort((a, b) => a.writingSnapshotId.localeCompare(b.writingSnapshotId) || a.family.localeCompare(b.family) || a.startUtf16 - b.startUtf16);
  const first = new Set<string>();
  const rows = inventory.map((row) => {
    const key = `${row.writingSnapshotId}\0${row.family}`;
    const primaryFocus = !first.has(key);
    first.add(key);
    return { caseId: row.caseId, family: row.family, sourceText: row.sourceText, focusSurface: row.focusSurface,
      startUtf16: row.startUtf16, endUtf16: row.endUtf16,
      primaryFocus: primaryFocus ? "TRUE" : "FALSE", selectedBy: "", selectionMethod: "SOURCE_SIDE_PREDECLARED_SELECTION" };
  });
  const path = join(root, "human-review", `stage-${stage.toLowerCase()}`, "selection.template.csv");
  writeOnce(path, csv(["caseId", "family", "sourceText", "focusSurface", "startUtf16", "endUtf16", "primaryFocus", "selectedBy", "selectionMethod"], rows));
  console.log(JSON.stringify({ command: "selection-template", stage, rows: rows.length, path }));
}

function similarityTemplate() {
  const flags = readJsonl<SimilarityFlag>(similarityPath);
  const path = join(sourceRoot, "similarity-review.template.csv");
  writeOnce(path, csv(["passageId", "referenceId", "kind", "score", "resolution", "resolvedBy", "reason"], flags.map((row) => ({ ...row, resolution: "", resolvedBy: "", reason: "" }))));
  console.log(JSON.stringify({ command: "similarity-template", flags: flags.length, path }));
}

function sealSimilarityFile() {
  const source = option("source");
  const rows = readCsv(source).map((row) => sealSimilarityResolution({
    passageId: row.passageId!, referenceId: row.referenceId!, kind: row.kind as SimilarityFlag["kind"],
    resolution: row.resolution as SimilarityResolution["resolution"], resolvedBy: row.resolvedBy!, reason: row.reason!,
  }));
  resolvedPassages(readJsonl<SimilarityFlag>(similarityPath), rows);
  writeSealed("seal-similarity", source, resolve(option("out")), rows.sort((a, b) => a.passageId.localeCompare(b.passageId) || a.referenceId.localeCompare(b.referenceId) || a.kind.localeCompare(b.kind)));
  console.log(JSON.stringify({ command: "seal-similarity", rows: rows.length }));
}

function sealSelectionFile() {
  const source = option("source");
  const rows = readCsv(source).map((row) => {
    assertPacketIdentity(row);
    return sealSelection({
      caseId: row.caseId!, primaryFocus: csvBoolean(row.primaryFocus!, "primaryFocus"),
      selectedBy: row.selectedBy!, selectionMethod: row.selectionMethod!,
    });
  });
  writeSealed("seal-selection", source, resolve(option("out")), rows.sort((a, b) => a.caseId.localeCompare(b.caseId)));
  console.log(JSON.stringify({ command: "seal-selection", rows: rows.length }));
}

function sealReviewFile() {
  const kind = option("kind");
  assert(kind === "HUMAN" || kind === "AI", "Review kind must be HUMAN or AI");
  const source = option("source");
  const rows = readCsv(source).map((row) => {
    assertPacketIdentity(row);
    const reviewerId = row.reviewerId!;
    const caseId = row.caseId!;
    const tags = JSON.parse(row.protectedSetTagsJson || "[]") as DecisionRow["protectedSetTags"];
    assert(Array.isArray(tags), `Protected tags must be a JSON array: ${caseId}`);
    const classification = row.classification as DecisionRow["classification"];
    const intendedAlternative = row.intendedAlternative?.trim() || null;
    return sealDecision({
      caseId,
      decisionId: `v4h-${kind.toLowerCase()}-${bytesSha256(`${kind}\0${reviewerId}\0${caseId}`).slice(0, 24)}`,
      reviewerId, reviewerKind: kind, classification,
      uncertainReason: (row.uncertainReason?.trim() || null) as UncertainReason | null,
      intendedAlternative, supportedConstruction: csvBoolean(row.supportedConstruction!, "supportedConstruction"),
      declaredConstruction: row.declaredConstruction!, declaredSubtype: row.declaredSubtype!, protectedSetTags: tags,
    });
  });
  writeSealed(`seal-review:${kind}`, source, resolve(option("out")), rows.sort((a, b) => a.caseId.localeCompare(b.caseId)));
  console.log(JSON.stringify({ command: "seal-review", kind, rows: rows.length }));
}

function sealAdjudicationFile() {
  const source = option("source");
  const rows = readCsv(source).map((row) => {
    assertPacketIdentity(row);
    const caseId = row.caseId!;
    const adjudicatorId = row.adjudicatorId!;
    const tags = JSON.parse(row.protectedSetTagsJson || "[]") as AdjudicationRow["protectedSetTags"];
    assert(Array.isArray(tags), `Protected tags must be a JSON array: ${caseId}`);
    return sealAdjudication({
      caseId, adjudicationId: `v4h-adjudication-${bytesSha256(`${adjudicatorId}\0${caseId}`).slice(0, 24)}`,
      adjudicatorId, classification: row.classification as AdjudicationRow["classification"],
      uncertainReason: (row.uncertainReason?.trim() || null) as UncertainReason | null,
      intendedAlternative: row.intendedAlternative?.trim() || null,
      supportedConstruction: csvBoolean(row.supportedConstruction!, "supportedConstruction"),
      declaredConstruction: row.declaredConstruction!, declaredSubtype: row.declaredSubtype!, protectedSetTags: tags,
    });
  });
  writeSealed("seal-adjudications", source, resolve(option("out")), rows.sort((a, b) => a.caseId.localeCompare(b.caseId)));
  console.log(JSON.stringify({ command: "seal-adjudications", rows: rows.length }));
}

let packetInventoryByCase: Map<string, InventoryRow> | null = null;
function assertPacketIdentity(row: Record<string, string>) {
  packetInventoryByCase ??= new Map(readInventory().map((candidate) => [candidate.caseId, candidate]));
  const inventory = packetInventoryByCase.get(row.caseId!);
  assert(inventory, `Unknown packet case: ${row.caseId}`);
  assert.equal(row.sourceText, inventory.sourceText, `Reviewed source text changed: ${row.caseId}`);
  assert.equal(row.focusSurface, inventory.focusSurface, `Reviewed focus surface changed: ${row.caseId}`);
  assert.equal(Number(row.startUtf16), inventory.startUtf16, `Reviewed start span changed: ${row.caseId}`);
  assert.equal(Number(row.endUtf16), inventory.endUtf16, `Reviewed end span changed: ${row.caseId}`);
}

function adjudicationTemplate() {
  const primary = readJsonl<DecisionRow>(option("primary"));
  const review = new Map(readJsonl<DecisionRow>(option("review")).map((row) => [row.caseId, row]));
  const inventory = new Map(readInventory().map((row) => [row.caseId, row]));
  const signature = (row: DecisionRow) => ordinaryEvaluationFingerprint({
    classification: row.classification, uncertainReason: row.uncertainReason, intendedAlternative: row.intendedAlternative,
    supportedConstruction: row.supportedConstruction, declaredConstruction: row.declaredConstruction,
    declaredSubtype: row.declaredSubtype, protectedSetTags: [...row.protectedSetTags].sort(),
  });
  const rows = primary.flatMap((human) => {
    const ai = review.get(human.caseId);
    const source = inventory.get(human.caseId);
    assert(ai && source, `Missing review or inventory for adjudication: ${human.caseId}`);
    if (signature(human) === signature(ai)) return [];
    return [{
      caseId: human.caseId, sourceText: source.sourceText, focusSurface: source.focusSurface,
      startUtf16: source.startUtf16, endUtf16: source.endUtf16,
      primaryDecisionJson: JSON.stringify({ classification: human.classification, uncertainReason: human.uncertainReason, intendedAlternative: human.intendedAlternative, supportedConstruction: human.supportedConstruction, declaredConstruction: human.declaredConstruction, declaredSubtype: human.declaredSubtype, protectedSetTags: human.protectedSetTags }),
      nonGoldDecisionJson: JSON.stringify({ classification: ai.classification, uncertainReason: ai.uncertainReason, intendedAlternative: ai.intendedAlternative, supportedConstruction: ai.supportedConstruction, declaredConstruction: ai.declaredConstruction, declaredSubtype: ai.declaredSubtype, protectedSetTags: ai.protectedSetTags }),
      adjudicatorId: "", classification: "", intendedAlternative: "", supportedConstruction: "",
      declaredConstruction: "", declaredSubtype: "", uncertainReason: "", protectedSetTagsJson: "[]",
    }];
  });
  assert.equal(primary.length, review.size, "Review rows do not match primary rows");
  const path = resolve(option("out"));
  writeOnce(path, csv([
    "caseId", "sourceText", "focusSurface", "startUtf16", "endUtf16", "primaryDecisionJson", "nonGoldDecisionJson",
    "adjudicatorId", "classification", "intendedAlternative", "supportedConstruction", "declaredConstruction", "declaredSubtype", "uncertainReason", "protectedSetTagsJson",
  ], rows));
  console.log(JSON.stringify({ command: "adjudication-template", disagreements: rows.length, path }));
}

function lock() {
  const stage = option("stage");
  assert(stage === "A" || stage === "FINAL", "Lock stage must be A or FINAL");
  verifyProtocol();
  verifySealed("seal-similarity", option("similarity-raw"), option("resolutions"));
  verifySealed("seal-selection", option("selection-raw"), option("selections"));
  verifySealed("seal-review:HUMAN", option("primary-raw"), option("primary"));
  verifySealed("seal-review:AI", option("review-raw"), option("review"));
  verifySealed("seal-adjudications", option("adjudications-raw"), option("adjudications"));
  const rawInventory = readInventory();
  const allInventory = eligibleInventory();
  verifySingleAuthorScope(rawInventory);
  verifySingleAuthorScope(allInventory);
  const inventory = stage === "A" ? allInventory.filter((row) => row.stage === "A") : allInventory;
  const selections = readSelection(option("selections"));
  const primary = readJsonl<DecisionRow>(option("primary"));
  const review = readJsonl<DecisionRow>(option("review"));
  const adjudications = readJsonl<AdjudicationRow>(option("adjudications"));
  const locked = lockGold({ inventory, selections, primary, review, adjudications });
  assert(inventory.every((row) => row.authoredBy !== fixtureMarker), "Engineering fixtures cannot become holdout gold");
  const allFamilies = CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((row) => row.manifest.familyKey);
  const activeFamilies = stage === "A" ? allFamilies : (options.get("families")?.split(",") ?? allFamilies);
  assert(activeFamilies.length > 0 && new Set(activeFamilies).size === activeFamilies.length && activeFamilies.every((family) => allFamilies.includes(family as typeof allFamilies[number])), "Final active-family list is invalid");
  if (stage === "FINAL") {
    verifyReceipt("A");
    for (const family of activeFamilies) {
      const release = CONTEXT_V4_DEVELOPMENT_CANDIDATES.find((row) => row.manifest.familyKey === family)!;
      const stageAReport = JSON.parse(readFileSync(join(root, `stage-a/reports/${release.manifest.releaseKey}/${family}.evaluation.json`), "utf8")) as { recommendation: string; qualification: string };
      assert.equal(stageAReport.qualification, "NOT_A_PASS", `Stage A report is invalid: ${family}`);
      assert.equal(stageAReport.recommendation, "CONTINUE_TO_PREDECLARED_STAGE_B", `Stage A stopped this family: ${family}`);
    }
    for (const family of CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((row) => row.manifest.familyKey)) {
      const stageACandidates = readJsonl<OrdinaryWritingV3Case>(join(root, `stage-a/candidates/${family}.jsonl`));
      const stageAGold = readJsonl<OrdinaryWritingV3Gold>(join(root, `stage-a/gold/${family}.final-gold.jsonl`));
      const finalCandidates = new Map(locked.candidates.filter((row) => row.family === family).map((row) => [row.caseId, row]));
      const finalGold = new Map(locked.gold.filter((row) => row.family === family).map((row) => [row.caseId, row]));
      for (const row of stageACandidates) assert.deepEqual(finalCandidates.get(row.caseId), row, `Stage A candidate changed after exposure: ${row.caseId}`);
      for (const row of stageAGold) assert.deepEqual(finalGold.get(row.caseId), row, `Stage A gold changed after exposure: ${row.caseId}`);
    }
  }
  const ledger = coverageLedger(locked.candidates, locked.gold);
  const uncertaintyReasonCounts = uncertaintyReasonCountsFor(locked.candidates, locked.gold, primary, adjudications);
  if (stage === "FINAL") assert(ledger.filter((row) => activeFamilies.includes(row.family)).every((row) => row.issues.length === 0), `Coverage incomplete: ${JSON.stringify(ledger.filter((row) => activeFamilies.includes(row.family)).map((row) => ({ family: row.family, issues: row.issues })) )}`);
  else for (const row of ledger) {
    assert.equal(row.totalPrimary, 100, `Stage A requires exactly 100 primary cases for ${row.family}`);
    assert(row.counts.VALID >= 40 && row.counts.INVALID >= 40 && row.counts.UNCERTAIN >= 20, `Stage A class balance incomplete for ${row.family}`);
    for (const [name, count] of Object.entries(row.subtype)) {
      assert(count.VALID >= 5 && count.INVALID >= 5, `Stage A subtype exposure incomplete: ${row.family}:${name}`);
    }
    for (const [tag, count] of Object.entries(row.protectedCounts)) assert(count >= 2, `Stage A protected exposure incomplete: ${row.family}:${tag}`);
    assert(row.distinctProtected >= 10, `Stage A needs 10 distinct protected occurrences for ${row.family}`);
    assert(uncertaintyReasonCounts[row.family]!.GENUINE_SEMANTIC_AMBIGUITY >= 2, `Stage A lacks genuine semantic ambiguity: ${row.family}`);
    assert(uncertaintyReasonCounts[row.family]!.UNSUPPORTED_CONSTRUCTION_OR_MEANING >= 2, `Stage A lacks unsupported meaning: ${row.family}`);
  }
  if (stage === "FINAL") for (const family of activeFamilies) {
    assert(uncertaintyReasonCounts[family]!.GENUINE_SEMANTIC_AMBIGUITY >= 10, `Final gold lacks genuine semantic ambiguity: ${family}`);
    assert(uncertaintyReasonCounts[family]!.UNSUPPORTED_CONSTRUCTION_OR_MEANING >= 10, `Final gold lacks unsupported meaning: ${family}`);
  }
  const dir = stage === "A" ? join(root, "stage-a") : root;
  const candidateSha256: Record<string, string> = {};
  const goldSha256: Record<string, string> = {};
  const files: { path: string; content: string }[] = [];
  for (const family of CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((row) => row.manifest.familyKey)) {
    const candidates = locked.candidates.filter((row) => row.family === family).sort((a, b) => a.caseId.localeCompare(b.caseId));
    const gold = locked.gold.filter((row) => row.family === family).sort((a, b) => a.caseId.localeCompare(b.caseId));
    const candidateContent = jsonl(candidates);
    const goldContent = jsonl(gold);
    const candidatePath = join(dir, `candidates/${family}.jsonl`);
    const goldPath = join(dir, `gold/${family}.final-gold.jsonl`);
    files.push({ path: candidatePath, content: candidateContent }, { path: goldPath, content: goldContent });
    candidateSha256[family] = bytesSha256(candidateContent);
    goldSha256[family] = bytesSha256(goldContent);
  }
  const receipt = {
    schemaVersion: 1, adminVersion: HOLDOUT_V4_ADMIN_VERSION, evaluatorPolicyVersion: HOLDOUT_V4_EVALUATOR_POLICY.version,
    stage, activeFamilies, sourceInventoryFingerprint: ordinaryEvaluationFingerprint(rawInventory),
    eligibleInventoryFingerprint: ordinaryEvaluationFingerprint(allInventory),
    sourceManifestSha256: bytesSha256(readFileSync(sourceManifestPath)),
    similarityResolutionSha256: bytesSha256(readFileSync(option("resolutions"))),
    selectionFingerprint: ordinaryEvaluationFingerprint(selections),
    primaryFingerprint: ordinaryEvaluationFingerprint(primary), reviewFingerprint: ordinaryEvaluationFingerprint(review),
    adjudicationFingerprint: ordinaryEvaluationFingerprint(adjudications),
    inputEvidenceSha256: Object.fromEntries([
      ["similarity.raw.csv", "similarity-raw"], ["similarity.sealed.receipt.json", "resolutions-receipt"],
      ["selection.raw.csv", "selection-raw"], ["primary.raw.csv", "primary-raw"],
      ["non-gold.raw.csv", "review-raw"], ["adjudication.raw.csv", "adjudications-raw"],
      ["selection.sealed.jsonl", "selections"], ["primary.sealed.jsonl", "primary"],
      ["non-gold.sealed.jsonl", "review"], ["adjudication.sealed.jsonl", "adjudications"],
      ["selection.sealed.receipt.json", "selections-receipt"], ["primary.sealed.receipt.json", "primary-receipt"],
      ["non-gold.sealed.receipt.json", "review-receipt"], ["adjudication.sealed.receipt.json", "adjudications-receipt"],
    ].map(([name, key]) => [name, bytesSha256(readFileSync(key!.endsWith("-receipt") ? `${option(key!.slice(0, -8))}.receipt.json` : option(key!)))])),
    candidateSha256, goldSha256, adjudicatedCaseIds: locked.adjudicatedCaseIds,
    coverageLedger: ledger, uncertaintyReasonCounts,
  };
  const receiptPath = join(dir, stage === "A" ? "gold-lock.receipt.json" : "gold/final-gold-lock.receipt.json");
  const similarityEvidencePath = join(dir, "evidence/similarity-resolutions.jsonl");
  const evidenceFiles = [
    { path: join(dir, "evidence/source-inventory.jsonl"), content: readFileSync(inventoryPath) },
    { path: join(dir, "evidence/source-manifest.json"), content: readFileSync(sourceManifestPath) },
    { path: join(dir, "evidence/similarity-flags.jsonl"), content: readFileSync(similarityPath) },
    { path: similarityEvidencePath, content: readFileSync(option("resolutions")) },
    ...[
      ["similarity.raw.csv", "similarity-raw"], ["similarity.sealed.receipt.json", "resolutions-receipt"],
      ["selection.raw.csv", "selection-raw"], ["primary.raw.csv", "primary-raw"],
      ["non-gold.raw.csv", "review-raw"], ["adjudication.raw.csv", "adjudications-raw"],
      ["selection.sealed.jsonl", "selections"], ["primary.sealed.jsonl", "primary"],
      ["non-gold.sealed.jsonl", "review"], ["adjudication.sealed.jsonl", "adjudications"],
      ["selection.sealed.receipt.json", "selections-receipt"], ["primary.sealed.receipt.json", "primary-receipt"],
      ["non-gold.sealed.receipt.json", "review-receipt"], ["adjudication.sealed.receipt.json", "adjudications-receipt"],
    ].map(([name, key]) => ({ path: join(dir, `evidence/${name}`), content: readFileSync(key!.endsWith("-receipt") ? `${option(key!.slice(0, -8))}.receipt.json` : option(key!)) })),
  ];
  assert(files.every((file) => !existsSync(file.path)) && evidenceFiles.every((file) => !existsSync(file.path)) && !existsSync(receiptPath), "Gold outputs already exist; lock is immutable");
  for (const file of files) writeOnce(file.path, file.content);
  for (const file of evidenceFiles) writeOnce(file.path, file.content);
  writeOnce(receiptPath, `${JSON.stringify({ ...receipt, receiptFingerprint: ordinaryEvaluationFingerprint(receipt) }, null, 2)}\n`);
  console.log(JSON.stringify({ command: "lock", stage, candidateSha256, goldSha256, receiptFingerprint: ordinaryEvaluationFingerprint(receipt) }));
}

function evaluate() {
  verifyProtocol();
  const stage = option("stage");
  assert(stage === "A" || stage === "FINAL", "Evaluation stage must be A or FINAL");
  const receipt = verifyReceipt(stage);
  const base = stage === "A" ? join(root, "stage-a") : root;
  const excluded = resolvedPassages(readJsonl<SimilarityFlag>(join(base, "evidence/similarity-flags.jsonl")), readJsonl<SimilarityResolution>(join(base, "evidence/similarity-resolutions.jsonl")));
  const inventory = readJsonl<InventoryRow>(join(base, "evidence/source-inventory.jsonl")).filter((row) => !excluded.has(row.passageId) && (stage === "FINAL" || row.stage === "A"));
  const summary = [];
  const reportsToWrite: { path: string; content: string }[] = [];
  for (const candidate of CONTEXT_V4_DEVELOPMENT_CANDIDATES) {
    const family = candidate.manifest.familyKey;
    if (stage === "FINAL" && !receipt.activeFamilies.includes(family)) {
      summary.push({ family, reportPath: null, disposition: "BLOCKED_STAGE_A_OR_NOT_QUALIFIED", fallbackAttempts: 0, fallbackAccepted: 0 });
      continue;
    }
    const candidatePath = join(base, `candidates/${family}.jsonl`);
    const goldPath = join(base, `gold/${family}.final-gold.jsonl`);
    const cases = readJsonl<OrdinaryWritingV3Case>(candidatePath);
    const gold = readJsonl<OrdinaryWritingV3Gold>(goldPath);
    const runFrozenCandidate = (): DetailedContextDecisionV4[] => {
      const output: DetailedContextDecisionV4[] = [];
      for (let index = 0; index < cases.length; index += 20) {
        output.push(...candidate.analyseBatch(cases.slice(index, index + 20).map((row) => ({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 }))));
      }
      return output;
    };
    const details = runFrozenCandidate();
    const repeated = runFrozenCandidate();
    const traceFingerprint = ordinaryEvaluationFingerprint(details);
    assert.equal(traceFingerprint, ordinaryEvaluationFingerprint(repeated), `V4 evaluation is not deterministic: ${family}`);
    const decisions = new Map<string, OrdinaryEvaluationDecision>();
    cases.forEach((row, index) => {
      assert(details[index]?.decision, `No V4 decision for ${row.caseId}`);
      decisions.set(row.caseId, details[index]!.decision!);
    });
    const attempts = details.filter((row) => row.trace.fallback !== null).length;
    const accepted = details.filter((row) => row.trace.fallback?.accepted).length;
    const report = stage === "A"
      ? assessStageA({ cases, gold, decisions, family })
      : evaluateOrdinaryWritingV4({ family, cases, gold, inventory, decisions, fallbackAttempts: attempts, fallbackAccepted: accepted, uncertaintyReasonCounts: receipt.uncertaintyReasonCounts[family]!, corpusFingerprint: bytesSha256(Buffer.concat([readFileSync(candidatePath), readFileSync(goldPath)])) });
    const reportPath = join(base, `reports/${candidate.manifest.releaseKey}/${family}.evaluation.json`);
    reportsToWrite.push({ path: reportPath, content: `${JSON.stringify({ ...report, repeatability: { status: "CANONICAL_TRACE_FINGERPRINT_IDENTICAL", traceFingerprint } }, null, 2)}\n` });
    summary.push({ family, reportPath, disposition: "recommendation" in report ? report.recommendation : report.disposition, fallbackAttempts: attempts, fallbackAccepted: accepted });
  }
  assert(reportsToWrite.every((row) => !existsSync(row.path)), "One or more reports already exist; evaluation writes once");
  for (const report of reportsToWrite) writeOnce(report.path, report.content);
  console.log(JSON.stringify({ command: "evaluate", stage, summary }, null, 2));
}

switch (command) {
  case "pins": console.log(JSON.stringify({
    adminVersion: HOLDOUT_V4_ADMIN_VERSION,
    evaluatorPolicyVersion: HOLDOUT_V4_EVALUATOR_POLICY.version,
    releaseManifestFingerprints: Object.fromEntries(CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((row) => [row.manifest.familyKey, row.fingerprint])),
  }, null, 2)); break;
  case "register-protocol": registerProtocol(); break;
  case "intake": intake(); break;
  case "similarity-template": similarityTemplate(); break;
  case "seal-similarity": sealSimilarityFile(); break;
  case "selection-template": selectionTemplate(); break;
  case "seal-selection": sealSelectionFile(); break;
  case "packets": packets(); break;
  case "seal-review": sealReviewFile(); break;
  case "adjudication-template": adjudicationTemplate(); break;
  case "seal-adjudications": sealAdjudicationFile(); break;
  case "lock": lock(); break;
  case "evaluate": evaluate(); break;
  default: throw new Error("Usage: holdout-admin <pins|register-protocol|intake|similarity-template|seal-similarity|selection-template|seal-selection|packets|seal-review|adjudication-template|seal-adjudications|lock|evaluate> --root=... [command options]");
}
