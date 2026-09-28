import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recoverContextShadowJobs, processContextualAdvisoryForSubmission } from "../lib/writing-engine/whole-writing/context-advisory-worker";
import { configureContextShadowTest, testRateCard } from "./context-shadow-test-config";
import { extractWholeWriting, type SourceSnapshot } from "../lib/writing-engine/whole-writing/source";
import { enqueueDisposableProviderProof } from "../lib/writing-engine/whole-writing/context-proof";
import { contextShadowIdentity } from "../lib/writing-engine/whole-writing/context-shadow-policy";
import { fingerprint } from "../lib/writing-engine/baseline/source";

type Row = Record<string, unknown>;
function fixture(text: string, options: { badIdentity?: boolean; deny?: string; orphan?: boolean; ledgerFail?: boolean; authored?: boolean } = {}) {
  const snapshot: SourceSnapshot = { id: randomUUID(), submission_id: randomUUID(), child_id: randomUUID(), parent_user_id: randomUUID(),
    source_purpose: "DISPOSABLE_PROVIDER_PROOF", source_revision: "1", occurred_at: new Date().toISOString(), envelope: { contextAiModeAtCapture: "shadow",
      contextAiShadowCapture: true, contextAdvisoryCapture: false, rawSubmissionText: text,
      draftPayload: options.authored === false ? {} : { answer: text },
      taskContext: { lessonSchema: { blocks: [{ block_id: "answer", block_type: "question_textarea" }] } } } };
  const job = { id: randomUUID(), snapshot_id: snapshot.id, run_key: randomUUID(), claim_token: randomUUID() };
  const tables: Record<string, Row[]> = { writing_context_advisory_control: [{ singleton: true, enabled: false, ai_mode: "shadow" }],
    writing_source_snapshots: [snapshot], writing_occurrences: [], writing_context_ai_rate_cards: [testRateCard],
    writing_context_ai_attempts: [], writing_context_shadow_dispatches: [] };
  const events: string[] = []; let claimed = false; let stopped = false;
  const client = {
    from(table: string) {
      assert(table in tables, `shadow must never write learning/review/reward tables: ${table}`);
      const rows = tables[table]; let write: Row[] | null = null; const filters: [string, unknown][] = [];
      const execute = async (single = false) => {
        if (write) {
          events.push(`write:${table}`);
          if (table === "writing_context_ai_attempts" && options.ledgerFail) return { data: null, error: { message: text } };
          for (const row of write) if (!rows.some((r) => table === "writing_occurrences" ? r.id === row.id :
            r.occurrence_id === row.occurrence_id && r.run_key === row.run_key)) rows.push(row);
        }
        let data = rows.filter((row) => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
        if (table === "writing_occurrences" && options.badIdentity) data = data.map((r) => ({ ...r, extractor_version: "wrong" }));
        return { data: single ? data[0] ?? null : data, error: null };
      };
      const query = { select() { return query; }, eq(key: string, value: unknown) { filters.push([key, value]); return query; },
        in(key: string, value: unknown[]) { filters.push([key, value]); return query; },
        upsert(value: Row | Row[]) { write = Array.isArray(value) ? value : [value]; return query; },
        maybeSingle() { return execute(true); }, then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) { return execute().then(resolve, reject); } };
      return query;
    },
    async rpc(name: string, args: Row = {}) {
      events.push(name);
      if (name === "enqueue_writing_context_shadow") return { data: job.id, error: null };
      if (name === "claim_writing_context_shadow") { if (claimed) return { data: null, error: null }; claimed = true; return { data: job, error: null }; }
      if (name === "record_writing_context_detector_run") return { data: randomUUID(), error: null };
      if (name === "monitor_writing_context_shadow") return { data: !stopped, error: null };
      if (name === "context_shadow_job_eligible") return { data: !options.deny, error: null };
      if (name === "reserve_writing_context_shadow") {
        assert.equal(args.p_job_id, job.id); assert.equal(args.p_claim_token, job.claim_token);
        assert(!String(args.p_window_fingerprint).includes(text));
        if (options.deny || stopped) return { data: { reason: options.deny ?? "AI_CONTROL_DISABLED" }, error: null };
        const id = randomUUID(); tables.writing_context_shadow_dispatches.push({ id, job_id: job.id,
          occurrence_id: args.p_occurrence_id, window_fingerprint: args.p_window_fingerprint, state: "reserved", sent_at: null });
        return { data: { id }, error: null };
      }
      if (name === "begin_writing_context_shadow_dispatch") {
        const d = tables.writing_context_shadow_dispatches.find((d) => d.id === args.p_dispatch_id)!;
        assert.equal(d.state, "reserved"); d.state = "sent"; d.sent_at = new Date().toISOString(); return { data: !stopped, error: null };
      }
      if (name === "finish_writing_context_shadow_dispatch") return { data: true, error: null };
      if (name === "finish_writing_context_shadow_job") {
        assert.equal(args.p_claim_token, job.claim_token); assert(!JSON.stringify(args.p_summary).includes(text)); return { data: true, error: null };
      }
      if (name === "stop_writing_context_shadow") { stopped = true; return { data: true, error: null }; }
      throw new Error(`unexpected RPC: ${name}`);
    },
  } as unknown as SupabaseClient;
  if (options.orphan) {
    const occurrence = extractWholeWriting(snapshot).occurrences.find((o) => o.observedText === "Their")!;
    tables.writing_context_shadow_dispatches.push({ id: randomUUID(), job_id: job.id, occurrence_id: occurrence.id,
      state: "abandoned", sent_at: new Date().toISOString(), window_fingerprint: fingerprint(text) });
  }
  return { client, snapshot, job, tables, events, stopped: () => stopped };
}
async function main() {
  const previousFetch = globalThis.fetch, previousLog = console.error;
  globalThis.fetch = async () => { throw new Error("unconfigured mock"); };
  const restore = configureContextShadowTest(); let calls = 0; const safeLogs: unknown[][] = [];
  console.error = (...args) => { safeLogs.push(args); };
  try {
    assert(contextShadowIdentity(), "Production identity accepted only with all pins");
    const originalEnvironment = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "preview";
    assert.equal(contextShadowIdentity(), null, "Preview cannot authorise Production proof");
    process.env.VERCEL_ENV = originalEnvironment;
    for (const registered of [false, true]) {
      const rpcs: string[] = [];
      const client = { rpc: async (name: string) => {
        rpcs.push(name);
        return name === "context_provider_proof_child" ? { data: registered, error: null } : { data: null, error: null };
      } } as unknown as SupabaseClient;
      assert.equal(await enqueueDisposableProviderProof(client, "synthetic-child", "synthetic-submission"), registered);
      assert.deepEqual(rpcs, registered ? ["context_provider_proof_child", "enqueue_writing_context_shadow"] : ["context_provider_proof_child"]);
    }
    const unavailable = { rpc: async () => ({ data: null, error: { message: "private text" } }) } as unknown as SupabaseClient;
    await assert.rejects(enqueueDisposableProviderProof(unavailable, "child", "submission"), /CONTEXT_PROOF_CLASSIFICATION_UNAVAILABLE/);
    const enqueueFailure = { rpc: async (name: string) => name === "context_provider_proof_child"
      ? { data: true, error: null } : { data: null, error: { message: "private text" } } } as unknown as SupabaseClient;
    assert.equal(await enqueueDisposableProviderProof(enqueueFailure, "child", "submission"), true, "Outbox failure cannot fall through to education");
    assert.equal(calls, 0, "Classification/enqueue never makes a provider call");
    for (const decision of ["VALID", "INVALID", "UNCERTAIN", "BAD_GATE", "MALFORMED", "FAILURE", "TIMEOUT", "WRONG_MODEL"] as const) {
      const f = fixture("Their cat is here."); const before: number = calls;
      globalThis.fetch = async (_url, options) => {
        calls++; const body = JSON.parse(String(options?.body)), data = JSON.parse(body.input[1].content);
        assert.equal(data.source_text, "Their cat is here.");
        assert(!String(options?.body).includes("DISPOSABLE_PROVIDER_PROOF"), "Operational classification does not enter the provider payload");
        for (const id of [f.snapshot.child_id, f.snapshot.parent_user_id, f.snapshot.submission_id])
          assert(!String(options?.body).includes(id), "Application identity never enters provider payload");
        if (decision === "FAILURE") return new Response("private body", { status: 429 });
        if (decision === "TIMEOUT") return new Response(new ReadableStream({ start() {} }));
        const output = { case_id: decision === "BAD_GATE" ? "wrong" : data.case_id,
          decision: ["BAD_GATE", "MALFORMED"].includes(decision) ? "VALID" : decision, focus: data.focus, observed_form: "their",
          expected_form: decision === "INVALID" ? "there" : null,
          reason_category: decision === "INVALID" ? "UNIQUE_REPLACEMENT" : decision === "UNCERTAIN" ? "SEMANTIC_AMBIGUITY" : "SUPPORTED_USE" };
        return new Response(JSON.stringify({ id: "resp-test", model: decision === "WRONG_MODEL" ? "unexpected-model" : "gpt-6-luna", status: "completed", service_tier: "default",
          usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 } },
          output: [{ type: "message", content: [{ type: "output_text", text: decision === "MALFORMED" ? "not-json" : JSON.stringify(output) }] }] }));
      };
      // The synchronous compatibility path is enqueue only.
      assert.equal((await processContextualAdvisoryForSubmission({ client: f.client, submissionId: f.snapshot.submission_id,
        parentUserId: f.snapshot.parent_user_id, childId: f.snapshot.child_id, runKey: "ignored" })).status, "queued");
      assert.equal(calls, before);
      assert.equal((await recoverContextShadowJobs(f.snapshot.submission_id, f.client)).status, "complete");
      assert.equal(calls, before + 1); const attempt = f.tables.writing_context_ai_attempts[0];
      assert.equal(attempt.result_status, ["BAD_GATE", "MALFORMED", "FAILURE", "TIMEOUT", "WRONG_MODEL"].includes(decision) ? "NOT_ASSESSED" : decision);
      if (decision === "WRONG_MODEL") assert(f.stopped());
      if (decision === "TIMEOUT") assert.equal(attempt.failure_kind, "timeout");
      assert.equal(attempt.mode, "shadow"); assert.equal(attempt.provider_called, true);
      assert(!JSON.stringify(attempt).includes("Their cat is here."), "ledger contains fingerprints, never paragraphs");
      assert.equal((await recoverContextShadowJobs(f.snapshot.submission_id, f.client)).status, "idle"); assert.equal(calls, before+1);
    }
    for (const options of [{ deny: "AI_LEARNER_NOT_AUTHORISED" }, { badIdentity: true }, { orphan: true }, { authored: false }]) {
      const f = fixture("Their private-canary is here.", options); const before: number = calls;
      await recoverContextShadowJobs(f.snapshot.submission_id, f.client); assert.equal(calls, before);
      if (options.orphan) assert(f.stopped());
    }
    const missingPurpose = fixture("Their private-canary is here.");
    delete missingPurpose.snapshot.source_purpose;
    const beforeMissing: number = calls;
    await recoverContextShadowJobs(missingPurpose.snapshot.submission_id, missingPurpose.client);
    assert.equal(calls, beforeMissing, "Missing trusted source classification never dispatches");
    const long = fixture(`Their ${"x".repeat(601)}`); const before: number = calls;
    await recoverContextShadowJobs(long.snapshot.submission_id, long.client); assert.equal(calls, before);
    assert.equal(long.tables.writing_context_ai_attempts[0].reason_code, "CONTEXT_WINDOW_TOO_LONG");
    const unknown = fixture("Unicorn private-canary");
    await recoverContextShadowJobs(unknown.snapshot.submission_id, unknown.client); assert.equal(calls, before);
    assert.equal(unknown.tables.writing_context_ai_attempts.length, 0);
    const failedLedger = fixture("Their private-canary is here.", { ledgerFail: true });
    await recoverContextShadowJobs(failedLedger.snapshot.submission_id, failedLedger.client); assert(failedLedger.stopped());
    assert(!JSON.stringify(safeLogs).includes("private-canary"), "exception prose never enters structured logs");
  } finally { restore(); globalThis.fetch = previousFetch; console.error = previousLog; }
  console.log("context shadow worker: enqueue isolation, exact lineage, decisions, failure isolation, no resampling, eligibility and redaction passed");
}
void main();
