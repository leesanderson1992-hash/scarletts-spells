import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const json = (name) => JSON.parse(readFileSync(join(here, name), "utf8"));
const prompt = readFileSync(join(here, "prompt.txt"), "utf8");
const schema = json("response.schema.json");
const config = json("calibration.config.json");
const subset = json("calibration-subset.json");
const families = {
  THERE_THEIR_THEYRE: ["there", "their", "they're"],
  TO_TOO_TWO: ["to", "too", "two"],
  YOUR_YOURE: ["your", "you're"],
  ITS_ITS: ["its", "it's"],
};
const reasonCategories = new Set(schema.properties.reason_category.enum);
const runDir = join(here, "runs", subset.fingerprint);
const resultsPath = join(runDir, "results.jsonl");

export function loadCases() {
  const body = { schemaVersion: subset.schemaVersion, purpose: subset.purpose, selection: subset.selection, sourceFiles: subset.sourceFiles, cases: subset.cases };
  assert.equal(sha256(JSON.stringify(body)), subset.fingerprint, "Subset fingerprint mismatch");
  const candidates = new Map();
  const gold = new Map();
  for (const source of subset.sourceFiles) {
    const path = join(root, source.path);
    const bytes = readFileSync(path);
    assert.equal(sha256(bytes), source.sha256, `Evidence changed: ${source.path}`);
    for (const row of bytes.toString("utf8").trim().split("\n").map(JSON.parse)) {
      (source.path.includes("/candidates/") ? candidates : gold).set(row.caseId, row);
    }
  }
  assert.equal(subset.cases.length, 240);
  assert.equal(new Set(subset.cases.map((row) => row.caseId)).size, 240);
  return subset.cases.map((entry) => {
    const candidate = candidates.get(entry.caseId);
    const expected = gold.get(entry.caseId);
    assert(candidate && expected, entry.caseId);
    assert.equal(candidate.family, entry.family);
    assert.equal(expected.classification, entry.stratum);
    assert.deepEqual(candidate.protectedSetTags, entry.protectedSetTags);
    assert.equal(candidate.candidateFingerprint, entry.candidateFingerprint);
    assert.equal(expected.goldFingerprint, entry.goldFingerprint);
    assert.equal(candidate.sourceText.slice(candidate.startUtf16, candidate.endUtf16), candidate.focusSurface);
    assert.equal(candidate.provenance.licence, "PROJECT_AUTHORED");
    return { entry, candidate, expected };
  });
}

export function requestFor(row, effort) {
  assert(config.reasoning_efforts.includes(effort));
  const { candidate } = row;
  const inputCase = {
    case_id: candidate.caseId,
    family: candidate.family,
    allowed_forms: families[candidate.family],
    dialect: candidate.dialect,
    source_text: candidate.sourceText,
    focus: { start_utf16: candidate.startUtf16, end_utf16: candidate.endUtf16, text: candidate.focusSurface },
  };
  return {
    model: config.model,
    service_tier: config.service_tier,
    reasoning: { mode: config.reasoning_mode, effort },
    max_output_tokens: config.max_output_tokens,
    store: config.store,
    truncation: config.truncation,
    prompt_cache_options: { mode: config.prompt_cache_mode },
    input: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(inputCase) }],
    text: { format: { type: "json_schema", name: "ai_context_calibration_v1", strict: true, schema } },
  };
}

export function validateResult(parsed, row) {
  const { candidate } = row;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "not_an_object";
  if (Object.keys(parsed).sort().join() !== schema.required.slice().sort().join()) return "result_fields";
  if (parsed.case_id !== candidate.caseId) return "case_id";
  if (!["VALID", "INVALID", "UNCERTAIN"].includes(parsed.decision)) return "decision";
  if (!parsed.focus || typeof parsed.focus !== "object" || Array.isArray(parsed.focus)) return "focus";
  if (Object.keys(parsed.focus).sort().join() !== ["start_utf16", "end_utf16", "text"].sort().join()) return "focus_fields";
  if (!Number.isInteger(parsed.focus.start_utf16) || !Number.isInteger(parsed.focus.end_utf16)) return "focus_span_type";
  if (parsed.focus.start_utf16 !== candidate.startUtf16 || parsed.focus.end_utf16 !== candidate.endUtf16 || parsed.focus.text !== candidate.sourceText.slice(candidate.startUtf16, candidate.endUtf16)) return "focus_span_integrity";
  if (parsed.observed_form !== candidate.observedMember) return "observed_form";
  if (!reasonCategories.has(parsed.reason_category)) return "reason_category";
  if (parsed.decision === "VALID" && parsed.reason_category !== "SUPPORTED_USE") return "reason_category_for_decision";
  if (parsed.decision === "INVALID" && parsed.reason_category !== "UNIQUE_REPLACEMENT") return "reason_category_for_decision";
  if (parsed.decision === "UNCERTAIN" && ["SUPPORTED_USE", "UNIQUE_REPLACEMENT"].includes(parsed.reason_category)) return "reason_category_for_decision";
  if (parsed.decision === "INVALID") {
    if (!families[candidate.family].includes(parsed.expected_form) || parsed.expected_form === candidate.observedMember) return "expected_form";
  } else if (parsed.expected_form !== null) return "unexpected_replacement";
  return null;
}

export function usageAndCost(response) {
  const usage = response.usage ?? {};
  const inputTokens = usage.input_tokens;
  const cachedInputTokens = usage.input_tokens_details?.cached_tokens ?? 0;
  const outputTokens = usage.output_tokens;
  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens ?? null;
  const cacheWriteTokens = usage.input_tokens_details?.cache_write_tokens ?? 0;
  if (![inputTokens, cachedInputTokens, outputTokens, cacheWriteTokens].every((n) => Number.isInteger(n) && n >= 0)) throw new Error("missing_or_invalid_usage");
  if (cachedInputTokens + cacheWriteTokens > inputTokens || (reasoningTokens !== null && (!Number.isInteger(reasoningTokens) || reasoningTokens < 0 || reasoningTokens > outputTokens))) throw new Error("inconsistent_usage");
  if (response.service_tier !== config.service_tier) throw new Error("unexpected_service_tier");
  if (typeof response.model !== "string" || !response.model.startsWith(config.model)) throw new Error("unexpected_model_identifier");
  const rates = config.pricing_usd_per_million_tokens;
  const uncachedInputTokens = inputTokens - cachedInputTokens - cacheWriteTokens;
  const calculatedUsd = (uncachedInputTokens * rates.uncached_input + cachedInputTokens * rates.cached_input + cacheWriteTokens * rates.cache_write_input + outputTokens * rates.output_including_reasoning) / 1_000_000;
  return { inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, reasoningTokens, calculatedUsd };
}

export function safeHttpErrorDiagnostics(headers, body) {
  const allowedHeaders = [
    "retry-after", "x-request-id", "x-ratelimit-limit-requests", "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-requests", "x-ratelimit-remaining-tokens",
    "x-ratelimit-reset-requests", "x-ratelimit-reset-tokens",
    "x-ratelimit-limit-project-tokens", "x-ratelimit-remaining-project-tokens",
    "x-ratelimit-reset-project-tokens",
  ];
  const safeHeaders = Object.fromEntries(allowedHeaders.flatMap((name) => {
    const value = headers.get(name);
    return value && /^[a-zA-Z0-9._ -]{1,100}$/.test(value) ? [[name, value]] : [];
  }));
  const safeCode = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null;
  return { errorType: safeCode(body?.error?.type), errorCode: safeCode(body?.error?.code), headers: safeHeaders };
}

export function outputText(response) {
  const contents = (response.output ?? []).filter((item) => item.type === "message").flatMap((item) => item.content ?? []);
  if (contents.some((item) => item.type === "refusal")) return { raw: null, error: "refusal" };
  const texts = contents.filter((item) => item.type === "output_text").map((item) => item.text);
  return texts.length === 1 ? { raw: texts[0], error: null } : { raw: null, error: "missing_or_multiple_output_text" };
}

function scoreGroup(records, rows) {
  const byId = new Map(rows.map((row) => [row.entry.caseId, row]));
  const report = {};
  for (const effort of config.reasoning_efforts) {
    const group = records.filter((record) => record.effort === effort);
    assert.equal(group.length, rows.length, `Missing ${effort} results`);
    assert.equal(new Set(group.map((record) => record.caseId)).size, rows.length, `Duplicate ${effort} result`);
    const counts = { correctThreeWay: 0, truePositive: 0, predictedInvalid: 0, validToInvalid: 0, uncertainToInvalid: 0, protectedUncertainToInvalid: 0, wrongReplacementOnInvalid: 0, protectedAbstention: 0, protectedTotal: 0, malformedOrRefused: 0, focusSpanIntegrityFailures: 0 };
    const decisionConfusion = Object.fromEntries(["VALID", "INVALID", "UNCERTAIN"].map((gold) => [gold, { VALID: 0, INVALID: 0, UNCERTAIN: 0, malformed: 0 }]));
    const protectedByTag = Object.fromEntries(["fragment", "quotation", "gerund", "run_on", "task_dependent"].map((tag) => [tag, { total: 0, uncertain: 0, invalid: 0, malformed: 0 }]));
    const latencies = [];
    const tokens = { input: 0, cachedInput: 0, output: 0, reasoning: 0 };
    let calculatedUsd = 0;
    for (const record of group) {
      const row = byId.get(record.caseId);
      assert(row, record.caseId);
      const goldDecision = row.expected.classification;
      const protectedCase = row.entry.protectedSetTags.length > 0;
      if (protectedCase) counts.protectedTotal++;
      for (const tag of row.entry.protectedSetTags) protectedByTag[tag].total++;
      if (record.error) {
        counts.malformedOrRefused++;
        decisionConfusion[goldDecision].malformed++;
        for (const tag of row.entry.protectedSetTags) protectedByTag[tag].malformed++;
        if (record.error === "focus_span_integrity") counts.focusSpanIntegrityFailures++;
      } else {
        const predicted = record.parsed.decision;
        decisionConfusion[goldDecision][predicted]++;
        for (const tag of row.entry.protectedSetTags) {
          if (predicted === "UNCERTAIN") protectedByTag[tag].uncertain++;
          if (predicted === "INVALID") protectedByTag[tag].invalid++;
        }
        if (predicted === goldDecision) counts.correctThreeWay++;
        if (predicted === "INVALID") {
          counts.predictedInvalid++;
          if (goldDecision === "VALID") counts.validToInvalid++;
          if (goldDecision === "UNCERTAIN") {
            counts.uncertainToInvalid++;
            if (protectedCase) counts.protectedUncertainToInvalid++;
          }
          if (goldDecision === "INVALID") {
            if (record.parsed.expected_form === row.expected.expectedAlternative) counts.truePositive++;
            else counts.wrongReplacementOnInvalid++;
          }
        }
        if (protectedCase && predicted === "UNCERTAIN") counts.protectedAbstention++;
      }
      if (Number.isFinite(record.latencyMs)) latencies.push(record.latencyMs);
      if (record.usage) {
        tokens.input += record.usage.inputTokens;
        tokens.cachedInput += record.usage.cachedInputTokens;
        tokens.output += record.usage.outputTokens;
        tokens.reasoning += record.usage.reasoningTokens ?? 0;
        calculatedUsd += record.usage.calculatedUsd;
      }
    }
    latencies.sort((a, b) => a - b);
    const percentile = (p) => latencies.length ? latencies[Math.ceil(p * latencies.length) - 1] : null;
    const goldInvalid = rows.filter((row) => row.expected.classification === "INVALID").length;
    const goldNegative = rows.length - goldInvalid;
    report[effort] = {
      cases: rows.length, ...counts, correctExpectedAlternativeOnGoldInvalid: counts.truePositive, decisionConfusion, protectedByTag,
      threeWayAccuracy: counts.correctThreeWay / rows.length,
      invalidPrecision: counts.predictedInvalid ? counts.truePositive / counts.predictedInvalid : null,
      invalidRecall: counts.truePositive / goldInvalid,
      falsePositiveRateOnValidOrUncertain: (counts.validToInvalid + counts.uncertainToInvalid) / goldNegative,
      falseNegativeRate: (goldInvalid - counts.truePositive) / goldInvalid,
      protectedAbstentionRate: counts.protectedAbstention / counts.protectedTotal,
      malformedOrRefusedRate: counts.malformedOrRefused / rows.length,
      latencyMs: { median: percentile(0.5), p95: percentile(0.95) },
      tokens, calculatedUsd,
    };
  }
  return report;
}

export function score(records, rows) {
  const overall = scoreGroup(records, rows);
  const byFamily = Object.fromEntries(Object.keys(families).map((family) => {
    const familyRows = rows.filter((row) => row.entry.family === family);
    const ids = new Set(familyRows.map((row) => row.entry.caseId));
    return [family, scoreGroup(records.filter((record) => ids.has(record.caseId)), familyRows)];
  }));
  return { overall, byFamily };
}

function readExisting() {
  return existsSync(resultsPath) ? readFileSync(resultsPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
}

function preflight(rows) {
  const requests = rows.flatMap((row) => config.reasoning_efforts.map((effort) => requestFor(row, effort)));
  const maxBytes = Math.max(...requests.map((request) => Buffer.byteLength(JSON.stringify(request), "utf8")));
  assert(maxBytes <= config.max_request_utf8_bytes, `Request exceeds byte ceiling: ${maxBytes}`);
  const rates = config.pricing_usd_per_million_tokens;
  const conservativeMaxUsd = requests.length * (config.conservative_input_token_allowance_per_request * rates.cache_write_input + config.max_output_tokens * rates.output_including_reasoning) / 1_000_000;
  assert(conservativeMaxUsd <= config.calibration_spend_ceiling_usd, "Budget envelope exceeds calibration ceiling");
  return { cases: rows.length, requests: requests.length, maxRequestUtf8Bytes: maxBytes, maxOutputTokensPerRequest: config.max_output_tokens, conservativeMaxUsd, spendCeilingUsd: config.calibration_spend_ceiling_usd, promptSha256: sha256(prompt), schemaSha256: sha256(JSON.stringify(schema)), subsetFingerprint: subset.fingerprint, configSha256: sha256(JSON.stringify(config)), apiCallsMade: false };
}

async function execute(rows) {
  assert.equal(process.env.AI_CONTEXT_CALIBRATION_APPROVED, subset.fingerprint, "Explicit approval fingerprint required");
  const key = process.env.OPENAI_API_KEY;
  assert(key, "OPENAI_API_KEY required");
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const existing = readExisting();
  const done = new Set(existing.filter((record) => record.usage).map((record) => `${record.caseId}:${record.effort}`));
  let spent = existing.reduce((sum, record) => sum + (record.usage?.calculatedUsd ?? 0), 0);
  const rates = config.pricing_usd_per_million_tokens;
  const worstNextUsd = (config.conservative_input_token_allowance_per_request * rates.cache_write_input + config.max_output_tokens * rates.output_including_reasoning) / 1_000_000;
  for (const [index, row] of rows.entries()) {
    const efforts = config.reasoning_efforts.map((_, offset) => config.reasoning_efforts[(index + offset) % config.reasoning_efforts.length]);
    for (const effort of efforts) {
      if (done.has(`${row.entry.caseId}:${effort}`)) continue;
      assert(spent + worstNextUsd <= config.calibration_spend_ceiling_usd, "Calibration spend ceiling reached");
      const request = requestFor(row, effort);
      const started = performance.now();
      let response;
      let httpStatus = null;
      let transportError = null;
      let httpErrorDiagnostics = null;
      try {
        const result = await fetch(config.endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(request), signal: AbortSignal.timeout(120_000) });
        httpStatus = result.status;
        if (result.ok) response = await result.json();
        else {
          transportError = `http_${result.status}`;
          httpErrorDiagnostics = safeHttpErrorDiagnostics(result.headers, await result.json().catch(() => null));
        }
      } catch (error) {
        transportError = error?.name === "TimeoutError" ? "timeout" : "transport_error";
      }
      const latencyMs = performance.now() - started;
      let usage = null;
      let rawStructuredResult = null;
      let parsed = null;
      let error = transportError;
      if (response) {
        try { usage = usageAndCost(response); }
        catch (cause) { error = cause.message; }
        if (!error) {
          if (response.status !== "completed") error = response.status === "incomplete" ? "incomplete" : "response_not_completed";
          else {
            const extracted = outputText(response);
            rawStructuredResult = extracted.raw;
            error = extracted.error;
            if (!error) {
              try { parsed = JSON.parse(rawStructuredResult); }
              catch { error = "invalid_json"; }
              if (!error) error = validateResult(parsed, row);
            }
          }
        }
      }
      const record = {
        transport: "synchronous", caseId: row.entry.caseId, family: row.entry.family, effort, provider: config.provider,
        requestedModel: config.model, returnedModel: response?.model ?? null,
        requestedServiceTier: config.service_tier, returnedServiceTier: response?.service_tier ?? null,
        responseId: response?.id ?? null, responseStatus: response?.status ?? null, httpStatus,
        promptSha256: sha256(prompt), schemaSha256: sha256(JSON.stringify(schema)), configSha256: sha256(JSON.stringify(config)), subsetFingerprint: subset.fingerprint,
        candidateFingerprint: row.entry.candidateFingerprint, goldFingerprint: row.entry.goldFingerprint,
        settings: { service_tier: config.service_tier, reasoning: request.reasoning, max_output_tokens: config.max_output_tokens, store: false, truncation: config.truncation, prompt_cache_options: request.prompt_cache_options },
        expected: { decision: row.expected.classification, expectedForm: row.expected.expectedAlternative, protectedSetTags: row.entry.protectedSetTags },
        rawStructuredResult, parsed, error, httpErrorDiagnostics, latencyMs, usage, providerUsage: response?.usage ?? null, completedAt: new Date().toISOString(),
      };
      appendFileSync(resultsPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      spent += usage?.calculatedUsd ?? 0;
      if (!usage || ["unexpected_model_identifier", "unexpected_service_tier", "missing_or_invalid_usage", "inconsistent_usage"].includes(error)) throw new Error(`Stopped after ${row.entry.caseId}:${effort}: ${error ?? "usage_unavailable"}`);
    }
  }
  const report = score(readExisting().filter((record) => record.usage), rows);
  writeFileSync(join(runDir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ completed: true, runDir, totalCalculatedUsd: spent }));
}

const command = process.argv[2] ?? "verify";
if (fileURLToPath(import.meta.url) !== resolve(process.argv[1] ?? "")) {
  // Imported by an offline test; no command is run.
} else {
  const rows = loadCases();
  if (command === "verify") console.log(JSON.stringify(preflight(rows), null, 2));
  else if (command === "score") console.log(JSON.stringify(score(readExisting().filter((record) => record.usage), rows), null, 2));
  else if (command === "execute") { preflight(rows); await execute(rows); }
  else throw new Error("Use verify, score, or execute");
}
