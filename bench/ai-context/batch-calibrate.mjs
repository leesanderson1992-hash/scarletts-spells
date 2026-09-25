import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCases, outputText, requestFor, score, usageAndCost, validateResult } from "./calibrate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, "calibration.config.json"), "utf8"));
const subset = JSON.parse(readFileSync(join(here, "calibration-subset.json"), "utf8"));
const promptSha256 = sha(readFileSync(join(here, "prompt.txt")));
const schemaSha256 = sha(JSON.stringify(JSON.parse(readFileSync(join(here, "response.schema.json"), "utf8"))));
const configSha256 = sha(JSON.stringify(config));
const runDir = join(here, "batch", subset.fingerprint);
const inputPath = join(runDir, "input.jsonl");
const manifestPath = join(runDir, "manifest.json");
const statePath = join(runDir, "state.json");
const resultsPath = join(runDir, "batch-results.jsonl");
const rawOutputPath = join(runDir, "raw-output.jsonl");
const submitClaimPath = join(runDir, "submit-claim.json");
const synchronousProvenancePath = join(runDir, "synchronous-provenance.json");
const pricing = Object.freeze({
  source: "https://developers.openai.com/api/docs/pricing",
  model: "gpt-6-luna", transport: "batch", usdPerMillionTokens: {
    uncachedInput: 0.05, cachedInput: 0.005, cacheWriteInput: 0.0625, outputIncludingReasoning: 0.25,
  },
});
const documentedTier1QueueTokens = 5_000_000;
const perRequestTokenOverheadAllowance = 1_000;
const maxBatchRequests = 50_000;
const maxBatchBytes = 200_000_000;

function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function writeOnce(path, content) {
  if (existsSync(path)) assert.equal(readFileSync(path, "utf8"), content, `Locked generated file differs: ${path}`);
  else writeFileSync(path, content, { flag: "wx", mode: 0o600 });
}
function writeState(state) {
  const temp = `${statePath}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  renameSync(temp, statePath);
}
function state() { return existsSync(statePath) ? readJson(statePath) : null; }
function approved(inputSha256) {
  assert.equal(process.env.AI_CONTEXT_BATCH_APPROVED, inputSha256, "Batch approval fingerprint required");
  assert(process.env.OPENAI_API_KEY, "OPENAI_API_KEY required");
}
function safeError(body) {
  const clean = (s) => typeof s === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(s) ? s : null;
  return { type: clean(body?.error?.type), code: clean(body?.error?.code) };
}
async function api(path, options = {}) {
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const error = safeError(await response.json().catch(() => null));
    throw new Error(`OpenAI HTTP ${response.status}; type=${error.type ?? "unknown"}; code=${error.code ?? "unknown"}`);
  }
  return response;
}

export function customId(caseId, effort) {
  assert(/^g2-[a-z0-9-]+$/.test(caseId));
  assert(["none", "low", "medium"].includes(effort));
  return `ai-context-cal-v1__${caseId}__${effort}`;
}

export function buildBatch(rows = loadCases()) {
  const entries = [];
  const lines = [];
  let requestBodyBytes = 0;
  for (const row of rows) for (const effort of config.reasoning_efforts) {
    const body = requestFor(row, effort);
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.store, false);
    assert(!Object.hasOwn(body, "tools"));
    const id = customId(row.entry.caseId, effort);
    const bodyString = JSON.stringify(body);
    requestBodyBytes += Buffer.byteLength(bodyString);
    lines.push(JSON.stringify({ custom_id: id, method: "POST", url: "/v1/responses", body }));
    entries.push({ customId: id, caseId: row.entry.caseId, effort,
      candidateFingerprint: row.entry.candidateFingerprint, goldFingerprint: row.entry.goldFingerprint,
      bodySha256: sha(bodyString) });
  }
  const input = `${lines.join("\n")}\n`;
  const inputBytes = Buffer.byteLength(input);
  const queueUpperEstimate = requestBodyBytes + entries.length * perRequestTokenOverheadAllowance;
  const billingInputAllowanceTokens = entries.length * config.conservative_input_token_allowance_per_request;
  const worstOutputTokens = entries.length * config.max_output_tokens;
  const rates = pricing.usdPerMillionTokens;
  const maximumUsd = (billingInputAllowanceTokens * rates.cacheWriteInput + worstOutputTokens * rates.outputIncludingReasoning) / 1_000_000;
  assert.equal(entries.length, 720);
  assert.equal(new Set(entries.map((entry) => entry.customId)).size, entries.length);
  assert(entries.length <= maxBatchRequests && inputBytes <= maxBatchBytes, "Batch request/file limit exceeded");
  assert(queueUpperEstimate < documentedTier1QueueTokens, "Documented Tier-1 queue limit exceeded");
  const manifest = {
    version: "ai-context-cal-v1", transport: "batch", provider: config.provider,
    requestedModel: config.model, subsetFingerprint: subset.fingerprint,
    promptSha256, schemaSha256, configSha256, inputSha256: sha(input),
    endpoint: "/v1/responses", completionWindow: "24h", pricing,
    preflight: { requests: entries.length, inputBytes, requestBodyBytes,
      measuredPromptTokens: null, perRequestTokenOverheadAllowance,
      queueUpperEstimateTokens: queueUpperEstimate, documentedTier1QueueTokens,
      billingInputAllowanceTokens, worstOutputTokens, maximumUsd },
    entries,
  };
  return { input, manifest };
}

export function batchUsageAndCost(response) {
  const standard = usageAndCost(response);
  const rates = pricing.usdPerMillionTokens;
  const uncached = standard.inputTokens - standard.cachedInputTokens - standard.cacheWriteTokens;
  return { ...standard, calculatedUsd: (
    uncached * rates.uncachedInput + standard.cachedInputTokens * rates.cachedInput +
    standard.cacheWriteTokens * rates.cacheWriteInput + standard.outputTokens * rates.outputIncludingReasoning
  ) / 1_000_000, priceSchedule: pricing };
}

export function validateBatchOutputLines(outputTextLines, manifest, rows = loadCases(), batchId = "batch_test") {
  const byId = new Map(manifest.entries.map((entry) => [entry.customId, entry]));
  const rowById = new Map(rows.map((row) => [row.entry.caseId, row]));
  const seen = new Set();
  const records = [];
  for (const line of outputTextLines.trim().split("\n").filter(Boolean)) {
    const item = JSON.parse(line);
    const entry = byId.get(item.custom_id);
    assert(entry, `Unexpected custom_id: ${item.custom_id}`);
    assert(!seen.has(item.custom_id), `Duplicate custom_id: ${item.custom_id}`);
    seen.add(item.custom_id);
    assert.equal(item.error, null, `Provider error for ${item.custom_id}`);
    assert.equal(item.response?.status_code, 200, `Non-200 result for ${item.custom_id}`);
    const response = item.response.body;
    const row = rowById.get(entry.caseId);
    assert(row && entry.candidateFingerprint === row.entry.candidateFingerprint && entry.goldFingerprint === row.entry.goldFingerprint);
    const usage = batchUsageAndCost(response);
    const extracted = outputText(response);
    let parsed = null;
    let error = extracted.error;
    if (!error) {
      try { parsed = JSON.parse(extracted.raw); }
      catch { error = "invalid_json"; }
      if (parsed) assert.equal(parsed.case_id, entry.caseId, `Returned case identity mismatch for ${item.custom_id}`);
      if (!error) error = validateResult(parsed, row);
    }
    records.push({ transport: "batch", provider: config.provider, requestedModel: config.model,
      returnedModel: response.model, effort: entry.effort, caseId: entry.caseId,
      subsetFingerprint: manifest.subsetFingerprint, promptSha256: manifest.promptSha256,
      schemaSha256: manifest.schemaSha256, configSha256: manifest.configSha256,
      batchId, customId: entry.customId, batchRequestId: item.id ?? null,
      responseId: response.id ?? null, httpRequestId: item.response.request_id ?? null,
      returnedServiceTier: response.service_tier, responseStatus: response.status,
      rawStructuredResult: extracted.raw, parsed, error, usage,
      providerUsage: response.usage, latencyMs: null,
      expected: { decision: row.expected.classification, expectedForm: row.expected.expectedAlternative,
        protectedSetTags: row.entry.protectedSetTags },
    });
  }
  assert.equal(seen.size, manifest.entries.length, `Missing ${manifest.entries.length - seen.size} batch responses`);
  return records;
}

function prepare() {
  const { input, manifest } = buildBatch();
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  writeOnce(inputPath, input);
  writeOnce(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const syncPath = join(here, "runs", subset.fingerprint, "results.jsonl");
  if (existsSync(syncPath)) {
    const bytes = readFileSync(syncPath);
    writeOnce(synchronousProvenancePath, `${JSON.stringify({ transport: "synchronous", resultsSha256: sha(bytes),
      records: bytes.toString("utf8").trim().split("\n").filter(Boolean).length,
      note: "Existing synchronous evidence remains in its original ignored runs directory; not included in Batch scoring." }, null, 2)}\n`);
  }
  const existing = state();
  if (existing) assert.equal(existing.inputSha256, manifest.inputSha256, "Batch state/input mismatch");
  return manifest;
}

function verified() {
  const { input, manifest } = buildBatch();
  assert.equal(readFileSync(inputPath, "utf8"), input, "Batch input differs from locked request bodies");
  assert.deepEqual(readJson(manifestPath), manifest, "Batch manifest differs from locked evidence");
  if (existsSync(synchronousProvenancePath)) {
    const syncPath = join(here, "runs", subset.fingerprint, "results.jsonl");
    assert.equal(readJson(synchronousProvenancePath).resultsSha256, sha(readFileSync(syncPath)), "Preserved synchronous evidence changed");
  }
  return manifest;
}

function synchronousSpend() {
  const path = join(here, "runs", subset.fingerprint, "results.jsonl");
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean)
    .reduce((total, line) => total + (JSON.parse(line).usage?.calculatedUsd ?? 0), 0);
}

function checkSpend(manifest) {
  const combined = synchronousSpend() + manifest.preflight.maximumUsd;
  assert(combined <= config.calibration_spend_ceiling_usd, "Overall $2 experimental spend ceiling exceeded");
  return combined;
}

async function upload() {
  const manifest = verified(); approved(manifest.inputSha256); checkSpend(manifest);
  assert(!state(), "Batch upload/submission state already exists");
  // An exclusive claim remains after an uncertain network result; never upload or submit twice automatically.
  writeFileSync(statePath, `${JSON.stringify({ phase: "uploading", inputSha256: manifest.inputSha256, claimedAt: new Date().toISOString() })}\n`, { flag: "wx", mode: 0o600 });
  const form = new FormData();
  form.set("purpose", "batch");
  form.set("file", new Blob([readFileSync(inputPath)], { type: "application/jsonl" }), "input.jsonl");
  const response = await (await api("/files", { method: "POST", body: form })).json();
  assert(/^file_[a-zA-Z0-9_-]+$/.test(response.id ?? "") && response.purpose === "batch", "Unexpected uploaded file identity");
  writeState({ phase: "uploaded", inputSha256: manifest.inputSha256, inputFileId: response.id, uploadedAt: new Date().toISOString() });
  return { phase: "uploaded", inputFileId: response.id };
}

async function submit() {
  const manifest = verified(); approved(manifest.inputSha256); checkSpend(manifest);
  const current = state();
  assert(current?.phase === "uploaded" && current.inputSha256 === manifest.inputSha256, "No unique uploaded input available");
  const available = Number(process.env.AI_CONTEXT_BATCH_AVAILABLE_QUEUE_TOKENS);
  assert(Number.isSafeInteger(available) && available >= manifest.preflight.queueUpperEstimateTokens && available <= documentedTier1QueueTokens,
    "Explicit live available Batch queue-token attestation required");
  // Claim before the network request. If it times out, manual provider reconciliation is required.
  writeFileSync(submitClaimPath, `${JSON.stringify({ inputSha256: manifest.inputSha256, inputFileId: current.inputFileId,
    claimedAt: new Date().toISOString() })}\n`, { flag: "wx", mode: 0o600 });
  writeState({ ...current, phase: "submitting", submitClaimedAt: new Date().toISOString(), availableQueueTokensAttested: available });
  const body = { input_file_id: current.inputFileId, endpoint: "/v1/responses", completion_window: "24h",
    metadata: { benchmark: "ai-context-cal-v1", subset: subset.fingerprint.slice(0, 24), input: manifest.inputSha256.slice(0, 24) } };
  const batch = await (await api("/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  assert(/^batch_[a-zA-Z0-9_-]+$/.test(batch.id ?? "") && batch.input_file_id === current.inputFileId && batch.endpoint === "/v1/responses", "Unexpected created Batch identity");
  writeState({ ...current, phase: "submitted", submitClaimedAt: new Date().toISOString(),
    availableQueueTokensAttested: available, batchId: batch.id, batchStatus: batch.status });
  return { phase: "submitted", batchId: batch.id, batchStatus: batch.status };
}

async function status() {
  const manifest = verified(); approved(manifest.inputSha256);
  const current = state();
  assert(/^batch_[a-zA-Z0-9_-]+$/.test(current?.batchId ?? ""), "No recorded Batch ID; do not create another job");
  const batch = await (await api(`/batches/${current.batchId}`)).json();
  assert.equal(batch.id, current.batchId);
  assert.equal(batch.input_file_id, current.inputFileId);
  assert.equal(batch.endpoint, "/v1/responses");
  const next = { ...current, batchStatus: batch.status, outputFileId: batch.output_file_id ?? null,
    errorFileId: batch.error_file_id ?? null, requestCounts: batch.request_counts ?? null,
    createdAt: batch.created_at ?? null, completedAt: batch.completed_at ?? null, checkedAt: new Date().toISOString() };
  writeState(next);
  return { batchId: next.batchId, batchStatus: next.batchStatus, requestCounts: next.requestCounts };
}

async function collect() {
  const manifest = verified(); approved(manifest.inputSha256);
  await status();
  const current = state();
  assert.equal(current.batchStatus, "completed", "Batch not completed");
  assert(current.outputFileId, "Completed Batch has no output file");
  assert.equal(current.requestCounts?.total, manifest.entries.length);
  assert.equal(current.requestCounts?.completed, manifest.entries.length);
  assert.equal(current.requestCounts?.failed, 0);
  assert(!existsSync(resultsPath), "Batch results already collected");
  const output = await (await api(`/files/${current.outputFileId}/content`)).text();
  assert(Buffer.byteLength(output) < 20_000_000, "Batch output size limit exceeded");
  writeOnce(rawOutputPath, output);
  if (current.errorFileId) {
    const errors = await (await api(`/files/${current.errorFileId}/content`)).text();
    assert.equal(errors.trim(), "", "Batch error file is nonempty; no scoring performed");
  }
  const records = validateBatchOutputLines(output, manifest, loadCases(), current.batchId);
  const batchTurnaroundMs = Number.isInteger(current.createdAt) && Number.isInteger(current.completedAt)
    ? (current.completedAt - current.createdAt) * 1000 : null;
  for (const record of records) {
    record.batchCreatedAt = current.createdAt;
    record.batchCompletedAt = current.completedAt;
    record.batchTurnaroundMs = batchTurnaroundMs;
  }
  const totalUsd = records.reduce((sum, record) => sum + record.usage.calculatedUsd, 0);
  assert(synchronousSpend() + totalUsd <= config.calibration_spend_ceiling_usd, "Overall $2 spend ceiling exceeded");
  writeOnce(resultsPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  writeState({ ...current, phase: "collected", collectedAt: new Date().toISOString(), totalCalculatedUsd: totalUsd });
  return { batchId: current.batchId, responses: records.length, totalCalculatedUsd: totalUsd };
}

function offlineScore() {
  const manifest = verified();
  const current = state();
  assert(current?.phase === "collected" && current.inputSha256 === manifest.inputSha256, "Batch not collected");
  const records = readFileSync(resultsPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  assert.equal(records.length, manifest.entries.length);
  const ids = new Set(manifest.entries.map((entry) => entry.customId));
  const byId = new Map(manifest.entries.map((entry) => [entry.customId, entry]));
  assert.equal(new Set(records.map((record) => record.customId)).size, ids.size);
  for (const record of records) {
    assert(ids.has(record.customId) && record.batchId === current.batchId && record.transport === "batch");
    assert.equal(record.caseId, byId.get(record.customId).caseId);
    assert.equal(record.effort, byId.get(record.customId).effort);
    assert.equal(record.subsetFingerprint, manifest.subsetFingerprint);
    assert.equal(record.promptSha256, manifest.promptSha256);
    assert.equal(record.schemaSha256, manifest.schemaSha256);
    assert.equal(record.configSha256, manifest.configSha256);
    assert(record.usage?.priceSchedule?.transport === "batch");
  }
  return score(records, loadCases());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv[2] ?? "prepare";
  if (command === "prepare") {
    const manifest = prepare();
    console.log(JSON.stringify({ inputPath, manifestPath, inputSha256: manifest.inputSha256,
      preflight: manifest.preflight, synchronousCalculatedUsd: synchronousSpend(),
      maximumCombinedUsd: checkSpend(manifest) }, null, 2));
  } else if (command === "verify") {
    const manifest = verified();
    console.log(JSON.stringify({ verified: true, inputSha256: manifest.inputSha256, preflight: manifest.preflight }, null, 2));
  } else if (command === "upload") console.log(JSON.stringify(await upload()));
  else if (command === "submit") console.log(JSON.stringify(await submit()));
  else if (command === "status") console.log(JSON.stringify(await status()));
  else if (command === "collect") console.log(JSON.stringify(await collect()));
  else if (command === "score") console.log(JSON.stringify(offlineScore(), null, 2));
  else throw new Error("Use prepare, verify, upload, submit, status, collect, or score");
}
