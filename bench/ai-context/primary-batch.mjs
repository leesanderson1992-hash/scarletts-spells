import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { requestFor } from "./calibrate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const packageManifest = json(join(root, "data/whole-writing/g2-context-family-corpora/manifest.json"));
const calibrationConfig = json(join(here, "calibration.config.json"));
const calibrationSubset = json(join(here, "calibration-subset.json"));
const families = ["THERE_THEIR_THEYRE", "TO_TOO_TWO", "YOUR_YOURE", "ITS_ITS"];
const calibrationDir = join(here, "batch", calibrationSubset.fingerprint);
const runRoot = join(here, "primary-batch");
const expectedPackageFingerprint = "9201e52e4f7fa32583f6c8ce14575d5d4ae16a9e2bd74bb31f8081192b98e277";
const expectedPromptSha256 = "682fa2635019accc718d791a5c4473b62e48388f7cecb91b4ab29bf7cc17241c";
const expectedSchemaSha256 = "e6d48f8e85bc2e686d5d4829fa878dbd5c20a047cf9305ab2c90bb71501df540";
const expectedConfigSha256 = "3336ce7b851119f50ffd0a292250d4bbc3e01087203832f38b4834fcb7734792";
const expectedCalibrationSubsetFingerprint = "102e70c44d49e55b02e29467c15e6b8779a1dd7028e938c62ee8e384ef9018a1";
const calibrationRawSha256 = "35b173783187748bf5b932fa016b65e176a64401649d2fd8222ed914d478c79d";
const tier1QueueTokens = 5_000_000;
const spendingStopUsd = 2;
const pricing = Object.freeze({ source: "https://developers.openai.com/api/docs/models/gpt-6-luna",
  model: "gpt-6-luna", transport: "batch", usdPerMillionTokens: {
    uncachedInput: 0.05, cachedInput: 0.005, cacheWriteInput: 0.0625, outputIncludingReasoning: 0.25,
  } });

function sourceDescriptor(family, kind) {
  const path = kind === "candidate"
    ? `data/whole-writing/g2-context-family-corpora/candidates/${family}.jsonl`
    : `data/whole-writing/g2-context-family-corpora/gold/${family}.final-gold.jsonl`;
  const locked = calibrationSubset.sourceFiles.find((entry) => entry.path === path);
  assert(locked, `Missing locked ${kind} source for ${family}`);
  const bytes = readFileSync(join(root, path));
  assert.equal(sha(bytes), locked.sha256, `Changed ${kind} source: ${family}`);
  return { path, sha256: locked.sha256, rows: bytes.toString("utf8").trim().split("\n").map(JSON.parse) };
}

export function loadPrimaryCases() {
  assert.equal(packageManifest.packageFingerprint, expectedPackageFingerprint, "G2 package fingerprint changed");
  assert.equal(packageManifest.packageVersion, "G2_CONTEXT_FAMILY_CORPUS_PACKAGE_V1_2026_09_08");
  assert.equal(sha(readFileSync(join(here, "prompt.txt"))), expectedPromptSha256, "Prompt changed");
  assert.equal(sha(JSON.stringify(json(join(here, "response.schema.json")))), expectedSchemaSha256, "Schema changed");
  assert.equal(sha(JSON.stringify(calibrationConfig)), expectedConfigSha256, "Request settings changed");
  assert.equal(calibrationSubset.fingerprint, expectedCalibrationSubsetFingerprint, "Calibration source lock changed");
  assert.equal(calibrationConfig.model, "gpt-6-luna");
  assert.equal(calibrationConfig.store, false);
  const sourceFiles = [];
  const rows = [];
  for (const family of families) {
    const candidates = sourceDescriptor(family, "candidate");
    const gold = sourceDescriptor(family, "gold");
    sourceFiles.push({ path: candidates.path, sha256: candidates.sha256 }, { path: gold.path, sha256: gold.sha256 });
    assert.equal(candidates.rows.length, 400, `${family} candidate count`);
    assert.equal(gold.rows.length, 400, `${family} gold count`);
    const goldById = new Map(gold.rows.map((row) => [row.caseId, row]));
    assert.equal(goldById.size, 400, `${family} duplicate gold ID`);
    const counts = { VALID: 0, INVALID: 0, UNCERTAIN: 0 };
    for (const candidate of candidates.rows) {
      const expected = goldById.get(candidate.caseId);
      assert(expected, `Missing gold: ${candidate.caseId}`);
      assert.equal(candidate.family, family);
      assert.equal(expected.family, family);
      assert.equal(candidate.candidateFingerprint, expected.candidateFingerprint);
      assert.equal(candidate.sourceText.slice(candidate.startUtf16, candidate.endUtf16), candidate.focusSurface);
      assert.equal(candidate.provenance.licence, "PROJECT_AUTHORED");
      assert(Object.hasOwn(counts, expected.classification), `Unexpected gold class: ${candidate.caseId}`);
      counts[expected.classification]++;
      rows.push({ entry: { caseId: candidate.caseId, family,
        candidateFingerprint: candidate.candidateFingerprint, goldFingerprint: expected.goldFingerprint,
        protectedSetTags: candidate.protectedSetTags, stratum: expected.classification }, candidate, expected });
    }
    assert.deepEqual(counts, { VALID: 150, INVALID: 150, UNCERTAIN: 100 }, `${family} gold distribution`);
  }
  assert.equal(rows.length, 1600);
  assert.equal(new Set(rows.map((row) => row.entry.caseId)).size, 1600, "Duplicate full-corpus case ID");
  const corpusFingerprint = sha(JSON.stringify({ packageFingerprint: expectedPackageFingerprint, sourceFiles,
    cases: rows.map((row) => row.entry) }));
  return { rows, sourceFiles, corpusFingerprint };
}

export function calibrationTokenEnvelope() {
  const raw = readFileSync(join(calibrationDir, "raw-output.jsonl"));
  assert.equal(sha(raw), calibrationRawSha256, "Calibration raw output changed");
  const inputs = readFileSync(join(calibrationDir, "input.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  const inputBytes = new Map(inputs.filter((item) => item.body?.reasoning?.effort === "low")
    .map((item) => [item.custom_id, Buffer.byteLength(JSON.stringify(item.body))]));
  const records = raw.toString("utf8").trim().split("\n").map(JSON.parse)
    .filter((record) => record.custom_id?.endsWith("__low"));
  assert.equal(inputBytes.size, 240);
  assert.equal(records.length, 240);
  assert.equal(new Set(records.map((record) => record.custom_id)).size, 240);
  let measuredInputTokens = 0;
  let measuredBodyBytes = 0;
  let maximumObservedTokensPerBodyByte = 0;
  for (const record of records) {
    const bytes = inputBytes.get(record.custom_id);
    const tokens = record.response?.body?.usage?.input_tokens;
    assert(Number.isInteger(bytes) && bytes > 0 && Number.isInteger(tokens) && tokens > 0,
      "Calibration input-token accounting unavailable");
    measuredInputTokens += tokens;
    measuredBodyBytes += bytes;
    maximumObservedTokensPerBodyByte = Math.max(maximumObservedTokensPerBodyByte, tokens / bytes);
  }
  assert.equal(measuredInputTokens, 116129, "Calibration measured input usage changed");
  return { calibrationInputTokens: measuredInputTokens, calibrationBodyBytes: measuredBodyBytes,
    maximumObservedTokensPerBodyByte, conservativeMultiplier: 3 };
}

export function buildPrimaryBatch() {
  const { rows, sourceFiles, corpusFingerprint } = loadPrimaryCases();
  const lines = [];
  const entries = [];
  let requestBodyBytes = 0;
  for (const row of rows) {
    const body = requestFor(row, "low");
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.reasoning.effort, "low");
    assert.equal(body.store, false);
    assert.equal(body.service_tier, "default");
    assert(!Object.hasOwn(body, "tools"));
    const bodyText = JSON.stringify(body);
    const bytes = Buffer.byteLength(bodyText);
    assert(bytes <= calibrationConfig.max_request_utf8_bytes, `Oversized request: ${row.entry.caseId}`);
    requestBodyBytes += bytes;
    const customId = `ai-context-primary-v1__${row.entry.caseId}__low`;
    lines.push(JSON.stringify({ custom_id: customId, method: "POST", url: "/v1/responses", body }));
    entries.push({ customId, caseId: row.entry.caseId, family: row.entry.family,
      goldDecision: row.expected.classification, effort: "low",
      candidateFingerprint: row.entry.candidateFingerprint, goldFingerprint: row.entry.goldFingerprint,
      bodySha256: sha(bodyText) });
  }
  const input = `${lines.join("\n")}\n`;
  const inputBytes = Buffer.byteLength(input);
  const envelope = calibrationTokenEnvelope();
  const estimatedQueuedInputTokens = Math.ceil(requestBodyBytes * envelope.calibrationInputTokens / envelope.calibrationBodyBytes);
  const conservativeQueuedInputTokens = Math.ceil(requestBodyBytes * envelope.maximumObservedTokensPerBodyByte * envelope.conservativeMultiplier);
  const coarseBytePlusOverhead = requestBodyBytes + entries.length * 1_000;
  const inputAllowanceTokens = entries.length * calibrationConfig.conservative_input_token_allowance_per_request;
  const worstOutputTokens = entries.length * calibrationConfig.max_output_tokens;
  const rates = pricing.usdPerMillionTokens;
  const estimatedOutputTokens = entries.length * 47021 / 240;
  const estimatedUsd = (estimatedQueuedInputTokens * rates.uncachedInput + estimatedOutputTokens * rates.outputIncludingReasoning) / 1_000_000;
  const maximumUsd = (inputAllowanceTokens * rates.cacheWriteInput + worstOutputTokens * rates.outputIncludingReasoning) / 1_000_000;
  const priorCalculatedUsd = 0.02984870 + 0.04651435;
  assert.equal(entries.length, 1600);
  assert.equal(new Set(entries.map((entry) => entry.customId)).size, 1600);
  assert(inputBytes < 200_000_000 && entries.length <= 50_000, "Batch file/request limit exceeded");
  assert(conservativeQueuedInputTokens < tier1QueueTokens, "Conservative Tier-1 queue estimate exceeded");
  assert(priorCalculatedUsd + maximumUsd <= spendingStopUsd, "$2 experimental spending stop exceeded");
  const manifest = { version: "ai-context-primary-v1", provider: "openai", transport: "batch",
    model: "gpt-6-luna", reasoningEffort: "low", corpusFingerprint,
    g2PackageFingerprint: expectedPackageFingerprint, sourceFiles,
    promptSha256: expectedPromptSha256, schemaSha256: expectedSchemaSha256,
    calibrationConfigSha256: expectedConfigSha256,
    inputSha256: sha(input), endpoint: "/v1/responses", completionWindow: "24h", pricing,
    preflight: { requests: entries.length, inputBytes, requestBodyBytes, estimatedQueuedInputTokens,
      conservativeQueuedInputTokens, coarseBytePlusOverhead, tier1QueueTokens,
      tokenEnvelope: envelope, inputAllowanceTokens, worstOutputTokens,
      estimatedOutputTokens, estimatedUsd, maximumUsd, priorCalculatedUsd, spendingStopUsd }, entries };
  return { input, manifest };
}

function paths(manifest) {
  const dir = join(runRoot, manifest.corpusFingerprint);
  return { dir, input: join(dir, "input.jsonl"), manifest: join(dir, "manifest.json"), state: join(dir, "state.json"),
    uploadClaim: join(dir, "upload-claim.json"), submitClaim: join(dir, "submit-claim.json") };
}
function writeOnce(path, content) {
  if (existsSync(path)) assert.equal(readFileSync(path, "utf8"), content, `Locked generated file differs: ${path}`);
  else writeFileSync(path, content, { flag: "wx", mode: 0o600 });
}
function writeState(path, next) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  renameSync(temporary, path);
}
function state(path) { return existsSync(path) ? json(path) : null; }
function prepared() {
  const { input, manifest } = buildPrimaryBatch();
  const p = paths(manifest);
  assert.equal(readFileSync(p.input, "utf8"), input, "Primary input changed");
  assert.deepEqual(json(p.manifest), manifest, "Primary manifest changed");
  return { input, manifest, p };
}
function approval(manifest) {
  assert.equal(process.env.AI_CONTEXT_PRIMARY_BATCH_APPROVED, manifest.inputSha256,
    "Exact primary input SHA-256 approval required");
  assert(process.env.OPENAI_API_KEY, "OPENAI_API_KEY required");
}
function safeError(body) {
  const clean = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null;
  return { type: clean(body?.error?.type), code: clean(body?.error?.code) };
}
async function api(path, options = {}) {
  const response = await fetch(`https://api.openai.com/v1${path}`, { ...options,
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    const error = safeError(await response.json().catch(() => null));
    throw new Error(`OpenAI HTTP ${response.status}; type=${error.type ?? "unknown"}; code=${error.code ?? "unknown"}`);
  }
  return response;
}
export function validateFile(file, manifest) {
  assert(file && file.object === "file", "Unexpected uploaded File object");
  assert(typeof file.id === "string" && file.id.length > 0 && file.id.length <= 256 &&
    file.id.trim() === file.id && !/[\u0000-\u001f\u007f]/.test(file.id), "Unexpected uploaded file ID");
  assert.equal(file.purpose, "batch");
  assert.equal(file.filename, "input.jsonl");
  assert.equal(file.bytes, manifest.preflight.inputBytes);
  return file.id;
}
export function reconcileFile(current, file, remoteBytes, input, manifest) {
  assert.equal(current?.phase, "uploading");
  assert.equal(current.inputSha256, manifest.inputSha256);
  const fileId = validateFile(file, manifest);
  const remote = Buffer.from(remoteBytes);
  assert.equal(remote.length, Buffer.byteLength(input));
  assert.equal(sha(remote), manifest.inputSha256, "Remote input fingerprint differs");
  assert(remote.equals(Buffer.from(input)), "Remote input bytes differ");
  const lines = remote.toString("utf8").trimEnd().split("\n");
  assert.equal(lines.length, 1600);
  const expected = new Set(manifest.entries.map((entry) => entry.customId));
  const actual = new Set();
  for (const line of lines) {
    const item = JSON.parse(line);
    assert(expected.has(item.custom_id) && !actual.has(item.custom_id), "Remote request identity mismatch");
    actual.add(item.custom_id);
    assert.equal(item.body.reasoning.effort, "low");
  }
  assert.equal(actual.size, 1600);
  return { ...current, phase: "uploaded", inputFileId: fileId, uploadedAt: new Date().toISOString(),
    reconciledFromUncertainUpload: true, remoteInputSha256: sha(remote), remoteInputBytes: remote.length };
}

async function upload() {
  const { input, manifest, p } = prepared(); approval(manifest);
  assert(!state(p.state) && !existsSync(p.uploadClaim), "Upload already claimed; do not retry");
  const claimedAt = new Date().toISOString();
  writeFileSync(p.uploadClaim, `${JSON.stringify({ inputSha256: manifest.inputSha256, claimedAt })}\n`, { flag: "wx", mode: 0o600 });
  writeState(p.state, { phase: "uploading", inputSha256: manifest.inputSha256, claimedAt });
  const form = new FormData();
  form.set("purpose", "batch");
  form.set("file", new Blob([Buffer.from(input)], { type: "application/jsonl" }), "input.jsonl");
  const file = await (await api("/files", { method: "POST", body: form })).json();
  const inputFileId = validateFile(file, manifest);
  writeState(p.state, { phase: "uploaded", inputSha256: manifest.inputSha256, inputFileId,
    uploadedAt: new Date().toISOString(), reconciledFromUncertainUpload: false });
  return { phase: "uploaded", inputFileId };
}
async function reconcileUpload() {
  const { input, manifest, p } = prepared(); approval(manifest);
  const current = state(p.state);
  assert.equal(current?.phase, "uploading", "No uncertain upload to reconcile");
  const list = await (await api("/files?purpose=batch&limit=100")).json();
  assert.equal(list.has_more, false, "Paginated file list; manual reconciliation required");
  const claimed = Date.parse(current.claimedAt) / 1000;
  assert(Number.isFinite(claimed));
  const candidates = (list.data ?? []).filter((file) => file.purpose === "batch" && file.filename === "input.jsonl" &&
    file.bytes === manifest.preflight.inputBytes && file.created_at >= claimed - 60 && file.created_at <= claimed + 600);
  assert.equal(candidates.length, 1, `Expected one plausible uploaded file; found ${candidates.length}`);
  const candidate = candidates[0];
  const remote = Buffer.from(await (await api(`/files/${encodeURIComponent(candidate.id)}/content`)).arrayBuffer());
  const next = reconcileFile(current, candidate, remote, input, manifest);
  writeState(p.state, next);
  return { phase: next.phase, inputFileId: next.inputFileId, remoteInputSha256: next.remoteInputSha256 };
}
async function submit() {
  const { manifest, p } = prepared(); approval(manifest);
  const current = state(p.state);
  assert(current?.phase === "uploaded" && current.inputSha256 === manifest.inputSha256, "No verified upload");
  assert(!existsSync(p.submitClaim), "Batch submission already claimed; do not retry");
  const documentedLimit = Number(process.env.AI_CONTEXT_BATCH_QUEUE_LIMIT_TOKENS);
  assert(Number.isSafeInteger(documentedLimit) && documentedLimit === tier1QueueTokens &&
    manifest.preflight.conservativeQueuedInputTokens < documentedLimit,
    "Explicit documented Tier-1 Batch queue-limit attestation required");
  const claimedAt = new Date().toISOString();
  writeFileSync(p.submitClaim, `${JSON.stringify({ inputSha256: manifest.inputSha256,
    inputFileId: current.inputFileId, claimedAt })}\n`, { flag: "wx", mode: 0o600 });
  writeState(p.state, { ...current, phase: "submitting", submitClaimedAt: claimedAt,
    documentedQueueLimitTokensAttested: documentedLimit });
  const body = { input_file_id: current.inputFileId, endpoint: "/v1/responses", completion_window: "24h",
    metadata: { benchmark: "ai-context-primary-v1", corpus: manifest.corpusFingerprint.slice(0, 24),
      input: manifest.inputSha256.slice(0, 24) } };
  const batch = await (await api("/batches", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body) })).json();
  assert(/^batch_[a-zA-Z0-9_-]+$/.test(batch.id ?? "") && batch.input_file_id === current.inputFileId &&
    batch.endpoint === "/v1/responses" && batch.completion_window === "24h", "Unexpected created Batch identity");
  writeState(p.state, { ...current, phase: "submitted", submitClaimedAt: claimedAt,
    documentedQueueLimitTokensAttested: documentedLimit, batchId: batch.id, batchStatus: batch.status });
  return { phase: "submitted", batchId: batch.id, inputFileId: current.inputFileId, status: batch.status };
}
async function status() {
  const { manifest, p } = prepared(); approval(manifest);
  const current = state(p.state);
  assert(/^batch_[a-zA-Z0-9_-]+$/.test(current?.batchId ?? ""), "No recorded Batch ID");
  const batch = await (await api(`/batches/${encodeURIComponent(current.batchId)}`)).json();
  assert.equal(batch.id, current.batchId);
  assert.equal(batch.input_file_id, current.inputFileId);
  assert.equal(batch.endpoint, "/v1/responses");
  assert.equal(batch.completion_window, "24h");
  const next = { ...current, batchStatus: batch.status, requestCounts: batch.request_counts ?? null,
    createdAt: batch.created_at ?? null, expiresAt: batch.expires_at ?? null,
    errors: batch.errors?.data?.map((entry) => ({ code: entry.code ?? null, param: entry.param ?? null })) ?? null,
    checkedAt: new Date().toISOString() };
  writeState(p.state, next);
  return { batchId: next.batchId, inputFileId: next.inputFileId, status: next.batchStatus,
    endpoint: batch.endpoint, completionWindow: batch.completion_window,
    requestCounts: next.requestCounts, createdAt: next.createdAt, expiresAt: next.expiresAt, errors: next.errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv[2] ?? "prepare";
  if (command === "prepare") {
    const { input, manifest } = buildPrimaryBatch();
    const p = paths(manifest);
    mkdirSync(p.dir, { recursive: true, mode: 0o700 });
    writeOnce(p.input, input);
    writeOnce(p.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ corpusFingerprint: manifest.corpusFingerprint,
      inputSha256: manifest.inputSha256, preflight: manifest.preflight }, null, 2));
  } else if (command === "verify") {
    const { manifest } = prepared();
    console.log(JSON.stringify({ verified: true, corpusFingerprint: manifest.corpusFingerprint,
      inputSha256: manifest.inputSha256, preflight: manifest.preflight }, null, 2));
  } else if (command === "upload") console.log(JSON.stringify(await upload()));
  else if (command === "reconcile-upload") console.log(JSON.stringify(await reconcileUpload()));
  else if (command === "submit") console.log(JSON.stringify(await submit()));
  else if (command === "status") console.log(JSON.stringify(await status()));
  else throw new Error("Use prepare, verify, upload, reconcile-upload, submit, or status");
}
