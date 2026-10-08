import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/internal/context-recovery/route";

const sessionId = "5f0ff2e1-5d6e-5089-aaef-5fdebc55c4ab";
const url = "https://example.test/api/internal/context-recovery";

async function main() {
  process.env.CONTEXT_RECOVERY_CRON_SECRET = "regression-secret";
  process.env.CONTEXT_TARGETED_ADLE_REPLAY_SESSION_ID = sessionId;
  process.env.VERCEL_ENV = "production";
  const request = (method: "GET" | "POST", body?: unknown, token = "regression-secret") =>
    new NextRequest(url, { method, headers: { authorization: `Bearer ${token}`,
      ...(method === "POST" ? { "content-type": "application/json" } : {}) },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });

  assert.equal((await GET(request("GET", undefined, "wrong"))).status, 401);
  assert.equal((await GET(request("GET"))).status, 409);
  assert.equal((await POST(request("POST", { reviewSessionId: sessionId }, "wrong"))).status, 401);
  assert.equal((await POST(request("POST", { reviewSessionId: "not-a-uuid" }))).status, 409);
  assert.equal((await POST(request("POST", {
    reviewSessionId: "00000000-0000-0000-0000-000000000000",
  }))).status, 409);
  delete process.env.CONTEXT_TARGETED_ADLE_REPLAY_SESSION_ID;
  assert.equal((await POST(request("POST", { reviewSessionId: sessionId }))).status, 409);
  console.log("guarded ADLE replay route: authentication, target binding, and site-wide GET isolation passed");
}

void main();
