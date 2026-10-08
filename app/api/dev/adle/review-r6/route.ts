import { NextResponse } from "next/server";
import type { ReviewR6GatewayRequest } from "@/app/learn/week/adle/review-r6-actions";
import { reviewR6QaEnabled } from "@/lib/adle/review-v3/dev-r6-scenarios";
import { loadReviewR6QaState, saveReviewR6QaState, validReviewR6QaRun } from "@/lib/adle/review-v3/dev-r6-files";
import { applyReviewR6QaRequest, completeReviewR6QaSpecialist, saveReviewR6QaSpecialistCheckpoint } from "@/lib/adle/review-v3/dev-r6-store";

function allowed(request: Request) {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (!reviewR6QaEnabled(process.env, host)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === host && new URL(origin).protocol === "http:"; }
  catch { return false; }
}
const response = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  if (!allowed(request)) return response({ error: "Not found" }, 404);
  const run = new URL(request.url).searchParams.get("run");
  if (!validReviewR6QaRun(run)) return response({ error: "Invalid QA run" }, 400);
  try { return response(loadReviewR6QaState(run)); }
  catch { return response({ error: "Open a new QA scenario first" }, 404); }
}

export async function POST(request: Request) {
  if (!allowed(request)) return response({ error: "Not found" }, 404);
  try {
    const raw = await request.text();
    if (raw.length > 100_000) return response({ error: "QA request too large" }, 413);
    const body = JSON.parse(raw) as { run?: unknown; command?: unknown; request?: ReviewR6GatewayRequest; checkpoint?: unknown };
    if (!validReviewR6QaRun(body.run)) return response({ error: "Invalid QA run" }, 400);
    const state = loadReviewR6QaState(body.run);
    let result: unknown;
    switch (body.command) {
      case "review":
        if (!body.request || typeof body.request.action !== "string") throw new Error("Missing request");
        result = applyReviewR6QaRequest(state, body.request);
        break;
      case "continue_specialist":
        if (!state.reviewFinalized || state.stage !== "specialist_generation") throw new Error("Review not finalized");
        state.stage = "specialist_lesson";
        result = { ok: true };
        break;
      case "specialist_checkpoint":
        saveReviewR6QaSpecialistCheckpoint(state, body.checkpoint);
        result = { ok: true };
        break;
      case "complete_specialist":
        completeReviewR6QaSpecialist(state);
        result = { ok: true };
        break;
      default: return response({ error: "Unsupported QA command" }, 400);
    }
    saveReviewR6QaState(state);
    return response(result);
  } catch {
    // Never echo request bodies, drafts or parent passphrases into logs/errors.
    return response({ error: "Local fixture transition rejected; reopen the saved run or start a new scenario." }, 409);
  }
}
