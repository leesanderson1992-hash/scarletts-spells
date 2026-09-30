import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recoverContextShadowJobs, processContextualAdvisoryForSubmission } from "../lib/writing-engine/whole-writing/context-advisory-worker";
import { configureContextShadowTest, testRateCard } from "./context-shadow-test-config";
import { extractWholeWriting, type SourceSnapshot } from "../lib/writing-engine/whole-writing/source";
import { enqueueDisposableProviderProof } from "../lib/writing-engine/whole-writing/context-proof";
import { contextShadowIdentity } from "../lib/writing-engine/whole-writing/context-shadow-policy";
import { fingerprint } from "../lib/writing-engine/baseline/source";
import type { ContextProofFaultAction } from "../lib/writing-engine/whole-writing/context-proof-fault";

type Row = Record<string, unknown>;
function fixture(text: string, options: { badIdentity?: boolean; deny?: string; orphan?: boolean; ledgerFail?: boolean; authored?: boolean;
  adult?: boolean; proofPassage?: boolean;
  fault?: ContextProofFaultAction; faultDenied?: boolean; killAtBarrier?: boolean; unreleased?: boolean;
  faultLostAtBarrier?: boolean; faultExpiresInMs?: number; rpcFailure?: string; throwTable?: string } = {}) {
  const snapshot: SourceSnapshot = { id: randomUUID(), submission_id: randomUUID(), child_id: randomUUID(), parent_user_id: randomUUID(),
    source_purpose: options.adult ? "REAL_LEARNER" : "DISPOSABLE_PROVIDER_PROOF", source_revision: "1", occurred_at: new Date().toISOString(), envelope: { contextAiModeAtCapture: "shadow",
      contextAiShadowCapture: true, contextAdvisoryCapture: false, rawSubmissionText: text,
      draftPayload: options.adult || options.authored === false ? {} : { answer: text },
      taskContext: { lessonSchema: { blocks: [{ block_id: "answer", block_type: "question_textarea" }] } } } };
  const job = { id: randomUUID(), snapshot_id: snapshot.id, run_key: randomUUID(), claim_token: randomUUID() };
  const tables: Record<string, Row[]> = { writing_context_advisory_control: [{ singleton: true, enabled: false, ai_mode: "shadow" }],
    writing_source_snapshots: [snapshot], writing_occurrences: [], writing_context_ai_rate_cards: [testRateCard],
    writing_context_shadow_policy: [{ singleton: true, dispatch_scope: options.proofPassage ? "DISPOSABLE_PROVIDER_PROOF" : "DENY",
      execution_policy_kind: options.proofPassage ? "DISPOSABLE_BOOTSTRAP" : "MEASURED",
      proof_scan_kind: options.proofPassage ? "PASSAGE" : "FOUR_FAMILY" }],
    writing_context_ai_attempts: [], writing_context_shadow_dispatches: [], writing_context_passage_findings: [] };
  const events: string[] = []; let claimed = false; let stopped = false;
  const client = {
    from(table: string) {
      if (table === options.throwTable) throw new Error(text);
      assert(table in tables, `shadow must never write learning/review/reward tables: ${table}`);
      const rows = tables[table]; let write: Row[] | null = null; const filters: [string, unknown][] = [];
      const execute = async (single = false) => {
        if (write) {
          events.push(`write:${table}`);
          if (table === "writing_context_ai_attempts" && options.ledgerFail) return { data: null, error: { message: text } };
          for (const row of write) if (!rows.some((r) => table === "writing_occurrences" ? r.id === row.id :
            r.occurrence_id === row.occurrence_id && r.run_key === row.run_key)) rows.push({ id: row.id ?? randomUUID(), ...row });
        }
        let data = rows.filter((row) => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
        if (table === "writing_occurrences" && options.badIdentity) data = data.map((r) => ({ ...r, extractor_version: "wrong" }));
        return { data: single ? data[0] ?? null : data, error: null };
      };
      const query = { select() { return query; }, eq(key: string, value: unknown) { filters.push([key, value]); return query; },
        limit() { return query; },
        in(key: string, value: unknown[]) { filters.push([key, value]); return query; },
        insert(value: Row | Row[]) { write = Array.isArray(value) ? value : [value]; return query; },
        upsert(value: Row | Row[]) { write = Array.isArray(value) ? value : [value]; return query; },
        maybeSingle() { return execute(true); }, then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) { return execute().then(resolve, reject); } };
      return query;
    },
    async rpc(name: string, args: Row = {}) {
      events.push(name);
      if (name === options.rpcFailure) return { data: null, error: { message: text } };
      if (name === "enqueue_writing_context_shadow") return { data: job.id, error: null };
      if (name === "claim_writing_context_shadow") { if (claimed) return { data: null, error: null }; claimed = true; return { data: job, error: null }; }
      if (name === "record_writing_context_detector_run") return { data: randomUUID(), error: null };
      if (name === "monitor_writing_context_shadow") return { data: !stopped, error: null };
      if (name === "bind_writing_context_proof_fault") return { data: options.faultDenied ? { kind: "DENIED" } : options.fault
        ? { kind: "BOUND", action: options.fault, expires_at: new Date(Date.now()+(options.faultExpiresInMs??60000)).toISOString() } : { kind: "NONE" }, error: null };
      if (name === "stop_failed_writing_context_bootstrap") { stopped = true; return { data: true, error: null }; }
      if (name === "reconcile_writing_context_shadow") return { data: true, error: null };
      if (name === "record_writing_context_proof_fault_phase") {
        events.push(`phase:${args.p_phase}`);if(options.killAtBarrier) stopped=true;
        return {data:true,error:null};
      }
      if (name === "writing_context_proof_fault_status") return {data:{authorised:!options.faultLostAtBarrier,released:!options.unreleased},error:null};
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
        if(stopped) return {data:false,error:null};
        const d = tables.writing_context_shadow_dispatches.find((d) => d.id === args.p_dispatch_id)!;
        assert.equal(d.state, "reserved"); d.state = "sent"; d.sent_at = new Date().toISOString(); return { data: !stopped, error: null };
      }
      if (name === "finish_writing_context_shadow_dispatch") {
        const d=tables.writing_context_shadow_dispatches.find(d=>d.id===args.p_dispatch_id);
        if(d) d.state=d.sent_at?'finished':'cancelled';
        return { data: true, error: null };
      }
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
  const previousFetch = globalThis.fetch, previousLog = console.error, previousInfo = console.info;
  globalThis.fetch = async () => { throw new Error("unconfigured mock"); };
  const restore = configureContextShadowTest(); let calls = 0; const safeLogs: unknown[][] = [], diagnostics: unknown[][] = [];
  console.error = (...args) => { safeLogs.push(args); };
  console.info = (...args) => { diagnostics.push(args); };
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
    const adult = fixture("The moon was full, and their was peace.", { adult: true });
    const adultBefore = calls;
    globalThis.fetch = async (_url, options) => {
      calls++;
      const body = JSON.parse(String(options?.body));
      const sent = JSON.parse(body.input[1].content);
      assert.equal(sent.source_text, "The moon was full, and their was peace.");
      assert(!String(options?.body).includes(adult.snapshot.child_id));
      assert(!String(options?.body).includes(adult.snapshot.parent_user_id));
      assert(!String(options?.body).includes("DISPOSABLE_PROVIDER_PROOF"));
      return new Response(JSON.stringify({ id: "resp-adult-local", model: "gpt-6-luna", status: "completed", service_tier: "default",
        usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 20,
          output_tokens_details: { reasoning_tokens: 5 } },
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ case_id: sent.case_id,
          findings: [{ word_index: sent.indexed_words.find((pair: [number, string]) => pair[1] === "their")?.[0], observed: "their", correction: "there" }] }) }] }] }));
    };
    assert.equal((await recoverContextShadowJobs(adult.snapshot.submission_id, adult.client)).status, "complete");
    assert.equal(calls, adultBefore + 1, "adult passage uses one pinned request");
    assert.equal(adult.tables.writing_context_ai_attempts[0].result_status, "SCANNED");
    assert.equal(adult.tables.writing_context_passage_findings.length, 1);
    assert.equal(adult.tables.writing_context_passage_findings[0].correction, "there");
    assert.equal((await recoverContextShadowJobs(adult.snapshot.submission_id, adult.client)).status, "idle");
    assert.equal(calls, adultBefore + 1, "recovery never resends the accepted scan");
    const proofPassage = fixture("I herd the bell at dawn.", { proofPassage: true });
    const proofBefore = calls;
    globalThis.fetch = async (_url, options) => {
      calls++;
      const sent = JSON.parse(JSON.parse(String(options?.body)).input[1].content);
      assert.equal(sent.source_text, "I herd the bell at dawn.");
      assert(!String(options?.body).includes(proofPassage.snapshot.child_id));
      return new Response(JSON.stringify({ id: "resp-proof-local", model: "gpt-6-luna", status: "completed", service_tier: "default",
        usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 20,
          output_tokens_details: { reasoning_tokens: 5 } },
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ case_id: sent.case_id,
          findings: [{ word_index: sent.indexed_words.find((pair: [number, string]) => pair[1] === "herd")?.[0], observed: "herd", correction: "heard" }] }) }] }] }));
    };
    assert.equal((await recoverContextShadowJobs(proofPassage.snapshot.submission_id, proofPassage.client)).status, "complete");
    assert.equal(calls, proofBefore + 1, "registered proof scans outside the original four families");
    assert.deepEqual(diagnostics.map((entry) => (entry[1] as {code: string}).code), [
      "PRE_RESERVATION_IDENTITY_CHECK", "PRE_RESERVATION_RATE_CARD_CHECK",
      "PRE_RESERVATION_ELIGIBILITY_CHECK", "PRE_RESERVATION_READY_FOR_RESERVATION",
    ]);
    assert(proofPassage.events.indexOf("context_shadow_job_eligible") < proofPassage.events.indexOf("reserve_writing_context_shadow"));
    assert.equal(proofPassage.tables.writing_context_ai_attempts[0].family_key, "PASSAGE_SCAN");
    assert.equal(proofPassage.tables.writing_context_passage_findings[0].correction, "heard");
    const checkRejection = async (f: ReturnType<typeof fixture>, expectedCodes: string[]) => {
      const beforeCalls = calls, beforeDiagnostics = diagnostics.length;
      assert.equal((await recoverContextShadowJobs(f.snapshot.submission_id, f.client)).status, "failed");
      assert.equal(calls, beforeCalls, "pre-reservation rejection cannot invoke HTTP");
      assert(!f.events.includes("reserve_writing_context_shadow"), "pre-reservation rejection cannot reserve");
      assert.equal(f.tables.writing_context_shadow_dispatches.length, 0);
      assert.equal(f.tables.writing_context_ai_attempts.length, 0);
      assert(f.stopped(), "generic failure latch remains active");
      assert(f.events.includes("stop_failed_writing_context_bootstrap"));
      assert(f.events.includes("stop_writing_context_shadow"));
      assert.deepEqual(diagnostics.slice(beforeDiagnostics).map((entry) => (entry[1] as {code: string}).code), expectedCodes);
    };
    const originalRuntimeFingerprint = process.env.CONTEXT_AI_RUNTIME_FINGERPRINT;
    process.env.CONTEXT_AI_RUNTIME_FINGERPRINT = "f".repeat(64);
    try {
      await checkRejection(fixture("I herd the private-canary bell.", { proofPassage: true }), [
        "PRE_RESERVATION_IDENTITY_CHECK", "PRE_RESERVATION_IDENTITY_REJECTED",
        "PRE_RESERVATION_RATE_CARD_CHECK",
      ]);
      const rejected = diagnostics.at(-2)?.[1] as {checks: Record<string, boolean>};
      assert.equal(rejected.checks.runtime_fingerprint_match, false);
    } finally { process.env.CONTEXT_AI_RUNTIME_FINGERPRINT = originalRuntimeFingerprint; }
    const originalCardFingerprint = process.env.CONTEXT_AI_RATE_CARD_FINGERPRINT;
    process.env.CONTEXT_AI_RATE_CARD_FINGERPRINT = "f".repeat(64);
    try {
      await checkRejection(fixture("I herd the private-canary bell.", { proofPassage: true }), [
        "PRE_RESERVATION_IDENTITY_CHECK", "PRE_RESERVATION_RATE_CARD_CHECK", "PRE_RESERVATION_RATE_CARD_REJECTED",
      ]);
      const rejected = diagnostics.at(-1)?.[1] as {checks: Record<string, boolean>};
      assert.equal(rejected.checks.rate_card_fingerprint_match, false);
    } finally { process.env.CONTEXT_AI_RATE_CARD_FINGERPRINT = originalCardFingerprint; }
    await checkRejection(fixture("I herd the private-canary bell.", { proofPassage: true, deny: "AI_PROOF_SCOPE_DENIED" }), [
      "PRE_RESERVATION_IDENTITY_CHECK", "PRE_RESERVATION_RATE_CARD_CHECK",
      "PRE_RESERVATION_ELIGIBILITY_CHECK", "PRE_RESERVATION_ELIGIBILITY_REJECTED",
    ]);
    const eligibilityRejected = diagnostics.at(-1)?.[1] as {checks: Record<string, boolean>};
    assert.equal(eligibilityRejected.checks.eligibility_rpc_ok, true);
    assert.equal(eligibilityRejected.checks.eligibility_allowed, false);
    await checkRejection(fixture("I herd the private-canary bell.", { proofPassage: true,
      rpcFailure: "context_shadow_job_eligible" }), [
      "PRE_RESERVATION_IDENTITY_CHECK", "PRE_RESERVATION_RATE_CARD_CHECK",
      "PRE_RESERVATION_ELIGIBILITY_CHECK", "PRE_RESERVATION_ELIGIBILITY_REJECTED",
    ]);
    const eligibilityUnavailable = diagnostics.at(-1)?.[1] as {checks: Record<string, boolean>};
    assert.equal(eligibilityUnavailable.checks.eligibility_rpc_ok, false);
    assert.equal(eligibilityUnavailable.checks.eligibility_allowed, false);
    await checkRejection(fixture("I herd the private-canary bell.", { proofPassage: true,
      throwTable: "writing_context_ai_rate_cards" }), [
      "PRE_RESERVATION_IDENTITY_CHECK", "PRE_RESERVATION_RATE_CARD_CHECK", "PRE_RESERVATION_UNEXPECTED_EXCEPTION",
    ]);
    const loggerFailure = fixture("I herd the private-canary bell.", { proofPassage: true, deny: "AI_PROOF_SCOPE_DENIED" });
    console.info = () => { throw new Error("private-canary"); };
    try {
      const beforeCalls = calls;
      assert.equal((await recoverContextShadowJobs(loggerFailure.snapshot.submission_id, loggerFailure.client)).status, "failed");
      assert.equal(calls, beforeCalls);
      assert(loggerFailure.stopped());
      assert(!loggerFailure.events.includes("reserve_writing_context_shadow"));
    } finally { console.info = (...args) => { diagnostics.push(args); }; }
    for (const [prefix, event] of diagnostics) {
      assert.equal(prefix, "[context-shadow-pre-reservation]");
      assert.deepEqual(Object.keys(event as object).sort(), ["checks", "code"]);
      assert(Object.values((event as {checks: Record<string, boolean>}).checks).every((value) => typeof value === "boolean"));
    }
    assert(!JSON.stringify(diagnostics).includes("private-canary"));
    assert(!JSON.stringify(diagnostics).includes("disposable-key-never-sent"));
    const proof429 = fixture("I herd the bell at dawn.", { proofPassage: true });
    const proof429Before = calls;
    globalThis.fetch = async () => { calls++; return new Response("provider-private", { status: 429 }); };
    assert.equal((await recoverContextShadowJobs(proof429.snapshot.submission_id, proof429.client)).status, "failed");
    assert.equal(calls, proof429Before + 1);
    assert(proof429.stopped(), "a proof transport failure latches the bootstrap instead of offering adult retry");
    const adult429 = fixture("Their house was quiet.", { adult: true });
    const before429 = calls;
    globalThis.fetch = async () => { calls++; return new Response("provider-private", { status: 429 }); };
    assert.equal((await recoverContextShadowJobs(adult429.snapshot.submission_id, adult429.client)).status, "retryable");
    assert.equal(calls, before429 + 1);
    assert.equal(adult429.tables.writing_context_ai_attempts[0].result_status, "NOT_ASSESSED");
    assert(!adult429.stopped(), "definite 429 leaves the owner-controlled retry available");
    const adultLong = fixture(`An adult wrote ${"ordinary words ".repeat(500)}`, { adult: true });
    const beforeLong = calls;
    assert.equal((await recoverContextShadowJobs(adultLong.snapshot.submission_id, adultLong.client)).status, "manual_review");
    assert.equal(calls, beforeLong, "oversize writing is never sent or partially scanned");
    assert(!adultLong.stopped(), "a long passage leaves the release available for other submissions");
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
    for(const fault of ['SIMULATE_TIMEOUT','SIMULATE_429','SIMULATE_5XX'] as const) {
      const f=fixture('Their cat is here.',{fault});const before: number=calls;
      const outcome=await recoverContextShadowJobs(f.snapshot.submission_id,f.client);
      assert.equal(outcome.status,'complete');assert.equal(calls,before,'Simulation invokes no HTTP');
      assert(!f.events.includes('begin_writing_context_shadow_dispatch'),'Simulation invokes no admission');
      const attempt=f.tables.writing_context_ai_attempts[0];
      assert.equal(attempt.reason_code,`AI_PROOF_${fault.replace('SIMULATE_','SIMULATED_')}`);
      assert.equal(attempt.result_status,'NOT_ASSESSED');assert.equal(attempt.transport_attempted,false);assert.equal(attempt.provider_called,false);
      for(const key of ['returned_model','provider_request_id','provider_response_id','input_tokens','output_tokens','calculated_cost_usd']) assert.equal(attempt[key],null);
      assert.equal(f.tables.writing_context_shadow_dispatches[0].state,'cancelled');assert(f.stopped());
    }
    // Fake responses are confined to this local regression, never the hosted hooks.
    globalThis.fetch=async(_url,options)=>{
      calls++;const data=JSON.parse(JSON.parse(String(options?.body)).input[1].content);
      return new Response(JSON.stringify({id:'resp-local-timing',model:'gpt-6-luna',status:'completed',service_tier:'default',
        usage:{input_tokens:100,input_tokens_details:{cached_tokens:0},output_tokens:20,output_tokens_details:{reasoning_tokens:5}},
        output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({case_id:data.case_id,decision:'VALID',focus:data.focus,
          observed_form:'their',expected_form:null,reason_category:'SUPPORTED_USE'})}]}]}));
    };
    for(const fault of ['PAUSE_BEFORE_ADMISSION','PAUSE_AFTER_FETCH','PAUSE_BEFORE_RECEIPT','INTERRUPT_AFTER_FETCH'] as const) {
      const f=fixture('Their cat is here.',{fault,killAtBarrier:true}),before: number=calls;
      const outcome=await recoverContextShadowJobs(f.snapshot.submission_id,f.client);
      assert.equal(calls,before+(fault==='PAUSE_BEFORE_ADMISSION'?0:1));
      if(fault==='INTERRUPT_AFTER_FETCH') {
        assert.equal(outcome.status,'proof_interrupted');assert.equal(f.tables.writing_context_ai_attempts.length,0);
        assert(!f.events.includes('finish_writing_context_shadow_job'),'Interrupted lease left for canonical recovery');
      } else {
        assert.equal(outcome.status,'complete');
        const attempt=f.tables.writing_context_ai_attempts[0];
        assert.equal(attempt.result_status,fault==='PAUSE_BEFORE_ADMISSION'?'NOT_ASSESSED':'VALID');
        if(fault!=='PAUSE_BEFORE_ADMISSION') assert.equal(attempt.calculated_cost_usd,'0.00002000');
      }
      assert(f.stopped());
    }
    const deniedFault=fixture('Their cat is here.',{faultDenied:true}),beforeFault: number=calls;
    await recoverContextShadowJobs(deniedFault.snapshot.submission_id,deniedFault.client);
    assert.equal(calls,beforeFault);assert(deniedFault.stopped());assert.equal(deniedFault.tables.writing_context_ai_attempts[0].reason_code,'AI_PROOF_HOOK_UNAVAILABLE');
    const lostReceiptBarrier=fixture('Their cat is here.',{fault:'PAUSE_BEFORE_RECEIPT',faultLostAtBarrier:true}),beforeLost: number=calls;
    await recoverContextShadowJobs(lostReceiptBarrier.snapshot.submission_id,lostReceiptBarrier.client);
    assert.equal(calls,beforeLost+1);assert(lostReceiptBarrier.stopped());
    const knownFailure=lostReceiptBarrier.tables.writing_context_ai_attempts[0];
    assert.equal(knownFailure.reason_code,'AI_PROOF_HOOK_UNAVAILABLE');assert.equal(knownFailure.result_status,'NOT_ASSESSED');
    assert.equal(knownFailure.input_tokens,100);assert.equal(knownFailure.calculated_cost_usd,'0.00002000','Known usage survives a failed receipt barrier');
    const unreleased=fixture('Their cat is here.',{fault:'PAUSE_BEFORE_RECEIPT',unreleased:true,faultExpiresInMs:1000}),beforeWait: number=calls;
    const waitStarted=Date.now();await recoverContextShadowJobs(unreleased.snapshot.submission_id,unreleased.client);
    assert.equal(calls,beforeWait+1);assert(unreleased.stopped());assert(Date.now()-waitStarted<2500,'Lost release is bounded by signed expiry');
    assert.equal(unreleased.tables.writing_context_ai_attempts[0].calculated_cost_usd,'0.00002000');
    assert.equal(unreleased.tables.writing_context_ai_attempts[0].reason_code,'AI_PROOF_HOOK_UNAVAILABLE');
    const lostSimulation=fixture('Their cat is here.',{fault:'SIMULATE_429',faultLostAtBarrier:true}),beforeSim: number=calls;
    await recoverContextShadowJobs(lostSimulation.snapshot.submission_id,lostSimulation.client);
    assert.equal(calls,beforeSim);assert(lostSimulation.stopped());
    assert.equal(lostSimulation.tables.writing_context_ai_attempts[0].reason_code,'AI_PROOF_HOOK_UNAVAILABLE');
    for (const rpcFailure of ['enqueue_writing_context_shadow','reconcile_writing_context_shadow','claim_writing_context_shadow']) {
      const early=fixture('Their private-canary is here.',{rpcFailure}),beforeEarly: number=calls;
      const outcome=await recoverContextShadowJobs(rpcFailure==='reconcile_writing_context_shadow'?undefined:early.snapshot.submission_id,early.client);
      assert.equal(outcome.status,'failed');assert(early.stopped());assert.equal(calls,beforeEarly);
      assert(!early.events.includes('finish_writing_context_shadow_job'),'No fictitious claim is finished');
    }
    const failedLedger = fixture("Their private-canary is here.", { ledgerFail: true });
    await recoverContextShadowJobs(failedLedger.snapshot.submission_id, failedLedger.client); assert(failedLedger.stopped());
    assert(!JSON.stringify(safeLogs).includes("private-canary"), "exception prose never enters structured logs");
  } finally { restore(); globalThis.fetch = previousFetch; console.error = previousLog; console.info = previousInfo; }
  console.log("context shadow worker: enqueue isolation, exact lineage, decisions, failure isolation, no resampling, eligibility and redaction passed");
}
void main();
