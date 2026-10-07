import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recoverContextShadowJobs } from "../lib/writing-engine/whole-writing/context-advisory-worker";
import { recoverAdleReviewContextJobs } from "../lib/writing-engine/whole-writing/adle-review-context-worker";
import { contextShadowPreviewHeld } from "../lib/writing-engine/whole-writing/context-shadow-policy";

async function main() {
  const oldVercelEnv = process.env.VERCEL_ENV;
  const oldContextEnv = process.env.CONTEXT_AI_ENVIRONMENT;
  try {
  process.env.VERCEL_ENV = "preview";
  process.env.CONTEXT_AI_ENVIRONMENT = "production";
  assert.equal(contextShadowPreviewHeld(), true);
  const forbiddenClient = new Proxy({}, { get() { throw new Error("Preview touched Production scanner data"); } }) as SupabaseClient;
  assert.equal((await recoverContextShadowJobs(undefined, forbiddenClient)).status, "held");
  assert.equal((await recoverAdleReviewContextJobs(undefined, forbiddenClient)).status, "held");
  delete process.env.CONTEXT_AI_ENVIRONMENT;
  assert.equal(contextShadowPreviewHeld(), true);
  process.env.CONTEXT_AI_ENVIRONMENT = "staging";
  assert.equal(contextShadowPreviewHeld(), false);
  console.log("Preview scanner hold: Production and unconfigured previews cannot claim jobs");
  } finally {
  if (oldVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = oldVercelEnv;
  if (oldContextEnv === undefined) delete process.env.CONTEXT_AI_ENVIRONMENT;
  else process.env.CONTEXT_AI_ENVIRONMENT = oldContextEnv;
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
