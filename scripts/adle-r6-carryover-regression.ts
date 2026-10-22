import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { reviewConundrumDevSnapshot } from "../lib/adle/review-v3/dev-conundrum-snapshot";
import { ensureParentAdleTodayAssignment } from "../lib/adle/today-assignment-service";
import { loadAdleTodaySessionR6 } from "../lib/adle/review-v3/r6-persistence";
import { canResumeOlderAdleSession, type OpenAdleSession } from "../lib/adle/review-v3/r6-session-carryover";

const older: OpenAdleSession = {
  daily_assignment_id: "older", assignment_date: "2026-10-20",
  major_stage: "blocked", review_generation_status: "completed",
};
const newer: OpenAdleSession = {
  daily_assignment_id: "newer", assignment_date: "2026-10-21",
  major_stage: "review", review_generation_status: "ready",
};
const untouched = {
  stage: "challenge_selection", completed_at: null,
  selected_challenge_type: null, writing_started_at: null,
  submitted_writing_text: null,
};
assert.equal(canResumeOlderAdleSession([older, newer], untouched), true);
assert.equal(canResumeOlderAdleSession([older, newer], { ...untouched, writing_started_at: "2026-10-21T10:00:00Z" }), false);
assert.equal(canResumeOlderAdleSession([older, { ...newer, major_stage: "specialist_lesson" }], untouched), false);
assert.equal(canResumeOlderAdleSession([{ ...older, review_generation_status: "ready" }, newer], untouched), false);
assert.equal(canResumeOlderAdleSession([older, newer, newer], untouched), false);

const snapshot = reviewConundrumDevSnapshot();
let olderStage: OpenAdleSession["major_stage"] = "blocked";
let newerProgress = untouched;
const client = { from(table: string) {
  const filters: Record<string, unknown> = {};
  const query = {
    select() { return query; },
    eq(column: string, value: unknown) { filters[column] = value; return query; },
    neq(column: string, value: unknown) { filters[`not:${column}`] = value; return query; },
    order() { return query; },
    async limit() {
      if (table !== "adle_today_session_orchestrations") throw new Error(`Unexpected limit: ${table}`);
      const all = [{ ...older, major_stage: olderStage, state_version: 2,
        blocker_code: "specialist_generation_error:route_metadata" },
      { ...newer, state_version: 0, blocker_code: null }];
      return { data: all.filter((row) => row.major_stage !== filters["not:major_stage"]), error: null };
    },
    async maybeSingle() {
      if (table === "adle_review_sessions") {
        return { data: filters.daily_assignment_id === "newer" ? {
          ...newerProgress, id: "newer-session", assignment_item_id: "newer-item",
        } : { id: "older-session", assignment_item_id: snapshot.assignment.reviewItemId,
          completed_at: "2026-10-20T10:00:00Z" }, error: null };
      }
      if (table === "daily_assignments") return { data: {
        id: filters.id, status: "pending", compiled_review_snapshot: snapshot,
        compiled_lesson_snapshot: null, lesson_route_metadata: null,
      }, error: null };
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return query;
} } as unknown as SupabaseClient;

async function main() {
  const input = { client, parentUserId: "parent", childId: "child", assignmentDate: "2026-10-22" };
  const blocked = await loadAdleTodaySessionR6(input);
  assert.equal(blocked?.assignmentId, "older");
  assert.equal(blocked?.majorStage, "blocked");
  assert.equal(blocked?.review?.complete, true, "the saved Review enables the retry action");
  const userClient = { from(table: string) {
    if (table !== "children") throw new Error(`A new assignment was considered before carry-over: ${table}`);
    const query = { select() { return query; }, eq() { return query; },
      maybeSingle: async () => ({ data: { id: "child" }, error: null }) };
    return query;
  } } as unknown as SupabaseClient;
  const generated = await ensureParentAdleTodayAssignment({
    userClient, serviceClient: client, parentUserId: "parent", childId: "child",
    now: new Date("2026-10-22T09:00:00Z"),
  });
  assert.equal(generated.outcome, "ready");
  if (generated.outcome === "ready") {
    assert.equal(generated.assignmentId, "older", "Generate resumes the older session");
    assert.equal(generated.reused, true);
  }

  olderStage = "specialist_lesson";
  const lesson = await loadAdleTodaySessionR6(input);
  assert.equal(lesson?.assignmentId, "older", "the older lesson stays available while the later Review waits");

  olderStage = "session_complete";
  const next = await loadAdleTodaySessionR6(input);
  assert.equal(next?.assignmentId, "newer", "the untouched Review becomes available after completion");

  olderStage = "blocked";
  newerProgress = { ...untouched, writing_started_at: "2026-10-21T10:00:00Z" };
  const conflict = await loadAdleTodaySessionR6(input);
  assert.equal(conflict?.assignmentId, null);
  assert.equal(conflict?.blockerCode, "multiple_unfinished_adle_today_sessions");
  console.log("ADLE R6 carry-over regression passed");
}

void main();
