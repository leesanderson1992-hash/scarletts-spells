import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recoverAdleReviewContextJobs } from "../lib/writing-engine/whole-writing/adle-review-context-worker";
import { configureContextShadowTest, testRateCard } from "./context-shadow-test-config";

type Row = Record<string, unknown>;
function fixture(text: string, options: { cap?: boolean; wrongOwner?: boolean } = {}) {
  const sessionId = randomUUID(), childId = randomUUID(), parentUserId = randomUUID();
  const source = { id: randomUUID(), review_session_id: sessionId, child_id: childId,
    parent_user_id: parentUserId, submitted_text: text,
    source_hash: createHash("sha256").update(text).digest("hex") };
  const job = { id: randomUUID(), source_id: source.id, claim_token: randomUUID() };
  const tables: Record<string, Row[]> = {
    adle_review_context_sources: [source],
    adle_review_sessions: [{ id: sessionId, child_id: childId,
      parent_user_id: options.wrongOwner ? randomUUID() : parentUserId,
      submitted_writing_text: text }],
    writing_context_ai_rate_cards: [testRateCard],
    adle_review_context_dispatches: [], adle_review_context_attempts: [],
    adle_review_context_findings: [],
  };
  let claimed = false, stopped = false, calls = 0;
  const rpcCalls: string[] = [];
  const client = {
    from(table: string) {
      assert(table in tables, `unexpected table ${table}`);
      const filters: [string, unknown][] = [];
      let insert: Row[] | null = null;
      const execute = async (single = false) => {
        if (insert) {
          const saved = insert.map(row => ({ id: randomUUID(), ...row }));
          tables[table].push(...saved);
          return { data: single ? saved[0] : saved, error: null };
        }
        const rows = tables[table].filter(row => filters.every(([key, value]) => row[key] === value));
        return { data: single ? rows[0] ?? null : rows, error: null };
      };
      const query = {
        select() { return query; }, eq(key: string, value: unknown) { filters.push([key, value]); return query; },
        insert(rows: Row | Row[]) { insert = Array.isArray(rows) ? rows : [rows]; return query; },
        maybeSingle() { return execute(true); }, single() { return execute(true); },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          return execute().then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name: string, args: Row = {}) {
      rpcCalls.push(name);
      if (name === "claim_adle_review_context_job") {
        if (claimed) return { data: null, error: null };
        claimed = true; return { data: job, error: null };
      }
      if (name === "monitor_writing_context_shadow") return { data: true, error: null };
      if (name === "reserve_adle_review_context_window") {
        if (options.cap) return { data: { reason: "AI_DAILY_CAP_DEFERRED" }, error: null };
        const dispatch = { id: randomUUID(), job_id: job.id,
          window_fingerprint: args.p_window_fingerprint, sent_at: null, state: "reserved" };
        tables.adle_review_context_dispatches.push(dispatch);
        return { data: { id: dispatch.id }, error: null };
      }
      if (name === "begin_adle_review_context_dispatch") {
        const dispatch = tables.adle_review_context_dispatches.find(d => d.id === args.p_dispatch_id)!;
        dispatch.state = "sent"; dispatch.sent_at = new Date().toISOString();
        return { data: true, error: null };
      }
      if (name === "finish_adle_review_context_dispatch") {
        const dispatch = tables.adle_review_context_dispatches.find(d => d.id === args.p_dispatch_id)!;
        dispatch.state = "finished"; return { data: true, error: null };
      }
      if (name === "finish_adle_review_context_job" || name === "defer_adle_review_context_job")
        return { data: true, error: null };
      if (name === "stop_writing_context_shadow") { stopped = true; return { data: true, error: null }; }
      throw new Error(`unexpected RPC ${name}`);
    },
  } as unknown as SupabaseClient;
  return { client, source, job, tables, rpcCalls, calls: () => calls,
    countCall: () => { calls++; }, stopped: () => stopped };
}

async function main() {
  const restore = configureContextShadowTest();
  const oldFetch = globalThis.fetch;
  const oldLog = console.error;
  console.error = () => {};
  try {
    const held = fixture("I herd the bell at dawn.");
    process.env.CONTEXT_AI_RELEASE_HOLD = "enabled";
    assert.equal((await recoverAdleReviewContextJobs(held.source.review_session_id, held.client)).status, "held");
    assert(!held.rpcCalls.includes("claim_adle_review_context_job"));
    delete process.env.CONTEXT_AI_RELEASE_HOLD;
    for (const text of ["😀 I herd the bell at dawn.", "I went too the station today."]) {
      const f = fixture(text);
      globalThis.fetch = async (_url, options) => {
        f.countCall();
        const body = String(options?.body);
        for (const id of [f.source.id, f.source.review_session_id, f.source.child_id, f.source.parent_user_id])
          assert(!body.includes(id), "provider receives no account or Review metadata");
        const data = JSON.parse(JSON.parse(body).input[1].content);
        assert.equal(data.source_text, text);
        const observed = text.includes("herd") ? "herd" : "too";
        const correction = observed === "herd" ? "heard" : "to";
        const index = data.indexed_words.find(([, word]: [number, string]) => word === observed)?.[0];
        return new Response(JSON.stringify({ id: "resp-synthetic", model: "gpt-6-luna",
          status: "completed", service_tier: "default",
          usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 },
            output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 } },
          output: [{ type: "message", content: [{ type: "output_text",
            text: JSON.stringify({ case_id: data.case_id,
              findings: [{ word_index: index, observed, correction }] }) }] }] }));
      };
      assert.equal((await recoverAdleReviewContextJobs(f.source.review_session_id, f.client)).status, "complete");
      assert.equal(f.calls(), 1);
      assert.equal(f.tables.adle_review_context_attempts.length, 1);
      const finding = f.tables.adle_review_context_findings[0];
      assert.equal(finding.start_utf16, text.indexOf(text.includes("herd") ? "herd" : "too"));
      assert.equal(finding.prefix_text, text.slice(0, Number(finding.start_utf16)));
      assert.equal(finding.observed_text, text.slice(Number(finding.start_utf16), Number(finding.end_utf16)));
      assert.equal((await recoverAdleReviewContextJobs(f.source.review_session_id, f.client)).status, "idle");
      assert.equal(f.calls(), 1, "duplicate recovery never resends");
      assert.equal(f.stopped(), false);
    }
    const capped = fixture("I herd the bell at dawn.", { cap: true });
    globalThis.fetch = async () => { throw new Error("provider must not be called at daily cap"); };
    assert.equal((await recoverAdleReviewContextJobs(capped.source.review_session_id, capped.client)).status, "deferred");
    assert.equal(capped.tables.adle_review_context_attempts.length, 0);
    assert.equal(capped.tables.adle_review_context_dispatches.length, 0);
    assert.equal(capped.stopped(), false);
    const wrongOwner = fixture("I herd the bell at dawn.", { wrongOwner: true });
    assert.equal((await recoverAdleReviewContextJobs(wrongOwner.source.review_session_id, wrongOwner.client)).status, "failed");
    assert(!wrongOwner.rpcCalls.includes("reserve_adle_review_context_window"));
    console.log("ADLE Review context: two accounts, exact UTF-16 spans, duplicate protection, cap deferral, ownership passed");
  } finally { delete process.env.CONTEXT_AI_RELEASE_HOLD;
    restore(); globalThis.fetch = oldFetch; console.error = oldLog; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
