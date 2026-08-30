import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type AuthorityEntry = {
  key: string;
  canonicalDocument: string;
  status: string;
  targetTerminologyScope: boolean;
  requiredIdentifiers: string[];
};

type AuthorityManifest = {
  schemaVersion: number;
  manifestVersion: string;
  authorities: AuthorityEntry[];
  historicalReceipts: string[];
  canonicalTargetDocuments: string[];
};

const repositoryRoot = process.cwd();
const manifestPath = resolve(repositoryRoot, "docs/architecture/adle-authority-manifest.json");
const errors: string[] = [];

function fail(message: string): void {
  errors.push(message);
}

function safePath(relativePath: string): string {
  if (!relativePath.startsWith("docs/") || relativePath.includes("..")) {
    fail(`unsafe or non-document manifest path: ${relativePath}`);
  }
  return resolve(repositoryRoot, relativePath);
}

if (!existsSync(manifestPath)) {
  throw new Error("ADLE authority manifest is missing");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AuthorityManifest;
if (manifest.schemaVersion !== 1) fail(`unsupported manifest schemaVersion: ${manifest.schemaVersion}`);
if (!manifest.manifestVersion?.trim()) fail("manifestVersion is required");

const authorityKeys = new Set<string>();
const historicalReceipts = new Set(manifest.historicalReceipts);
const canonicalDocuments = new Set<string>();

for (const entry of manifest.authorities) {
  if (authorityKeys.has(entry.key)) fail(`duplicate authority key: ${entry.key}`);
  authorityKeys.add(entry.key);

  if (!entry.canonicalDocument) {
    fail(`authority ${entry.key} has no canonicalDocument`);
    continue;
  }

  canonicalDocuments.add(entry.canonicalDocument);
  const documentPath = safePath(entry.canonicalDocument);
  if (!existsSync(documentPath)) {
    fail(`authority ${entry.key} points to missing document: ${entry.canonicalDocument}`);
    continue;
  }

  if (
    historicalReceipts.has(entry.canonicalDocument) &&
    ["ACTIVE_NORMATIVE_CONTRACT", "APPROVED_TARGET_NOT_YET_IMPLEMENTED"].includes(entry.status)
  ) {
    fail(`historical receipt registered as canonical target authority: ${entry.key}`);
  }

  const content = readFileSync(documentPath, "utf8");
  for (const identifier of entry.requiredIdentifiers ?? []) {
    if (!content.includes(identifier)) {
      fail(`authority ${entry.key} owner is missing required identifier: ${identifier}`);
    }
  }
}

for (const receipt of manifest.historicalReceipts) {
  const receiptPath = safePath(receipt);
  if (!existsSync(receiptPath)) fail(`historical receipt is missing: ${receipt}`);
}

const canonicalTargetDocuments = new Set(manifest.canonicalTargetDocuments);
for (const document of canonicalTargetDocuments) {
  const documentPath = safePath(document);
  if (!existsSync(documentPath)) {
    fail(`canonical target document is missing: ${document}`);
    continue;
  }
  if (!canonicalDocuments.has(document)) {
    fail(`canonicalTargetDocuments contains an unregistered owner: ${document}`);
  }
  if (historicalReceipts.has(document)) {
    fail(`historical receipt appears in canonicalTargetDocuments: ${document}`);
  }
}

const forbiddenTargetTerminology: Array<{ label: string; expression: RegExp }> = [
  { label: "legacy state-priced proficiency constants", expression: /0\.1\s*\/\s*0\.4\s*\/\s*1\.0/i },
  { label: "legacy staged mastery ladder", expression: /(?:0\s*[–-]\s*8|Stages?\s+0\s+(?:to|through)\s+8)/i },
  { label: "legacy mastery_score", expression: /\bmastery_score\b/i },
  { label: "legacy role_weight scoring", expression: /\brole_weight\b/i },
  { label: "legacy source_weight scoring", expression: /\bsource_weight\b/i },
  { label: "non-canonical instructional state INDEPENDENT_RETRIEVAL", expression: /\bINDEPENDENT_RETRIEVAL\b/ },
  { label: "non-canonical instructional state TRANSFER_CHECK", expression: /\bTRANSFER_CHECK\b/ },
  { label: "numeric word-complexity Level terminology", expression: /(?:word\s+complexity|complexity)[\s\S]{0,50}\bLevel\s+[123]\b|\bLevel\s+[123]\b[\s\S]{0,50}(?:word\s+complexity|complexity)/i },
  { label: "retired multi-word learning-item ownership", expression: /(?:multi-word|multiple\s+target\s+words)[\s\S]{0,100}learning_item|learning_item[\s\S]{0,100}(?:multi-word|multiple\s+target\s+words)/i }
];

for (const document of canonicalTargetDocuments) {
  const content = readFileSync(safePath(document), "utf8");
  for (const forbidden of forbiddenTargetTerminology) {
    if (forbidden.expression.test(content)) {
      fail(`${document} contains forbidden target terminology: ${forbidden.label}`);
    }
  }
}

const wordProgressionOwner = "docs/contracts/adle-word-progression-and-review-contract.md";
const transitionOwnershipMarkers: Array<{ label: string; expression: RegExp }> = [
  { label: "controlled graduation equation", expression: /ControlledPass\s*=/ },
  { label: "exact one-rung regression table", expression: /DAY_3\s*->\s*DAY_1/ }
];

for (const document of canonicalTargetDocuments) {
  if (document === wordProgressionOwner) continue;
  const content = readFileSync(safePath(document), "utf8");
  for (const marker of transitionOwnershipMarkers) {
    if (marker.expression.test(content)) {
      fail(`${document} redefines ${marker.label}; owner is ${wordProgressionOwner}`);
    }
  }
}

const wordProgressionContent = readFileSync(safePath(wordProgressionOwner), "utf8");
for (const marker of transitionOwnershipMarkers) {
  if (!marker.expression.test(wordProgressionContent)) {
    fail(`${wordProgressionOwner} is missing owned ${marker.label}`);
  }
}

for (const receipt of [
  "docs/contracts/adle-daily-assignment-and-evidence-blueprint-contract.md",
  "docs/implementation/adle-slice-2-review-scheduler-plan.md",
  "docs/implementation/adle-review-r5-legacy-scheduler-compatibility.md",
  "docs/implementation/adle-slice-5-proficiency-engine-plan.md"
]) {
  const content = readFileSync(safePath(receipt), "utf8");
  if (!content.includes("CURRENT_RUNTIME") || !content.includes("HISTORICAL_IMPLEMENTATION_RECEIPT")) {
    fail(`${receipt} must declare CURRENT_RUNTIME + HISTORICAL_IMPLEMENTATION_RECEIPT`);
  }
}

if (errors.length > 0) {
  console.error("ADLE authority documentation check failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `ADLE authority documentation check passed: ${authorityKeys.size} authority keys, ` +
    `${canonicalTargetDocuments.size} canonical target documents, ${historicalReceipts.size} historical receipts.`
);
