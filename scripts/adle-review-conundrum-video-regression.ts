import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalSnapshotJson } from "../lib/adle/composable-lesson/canonical-fingerprint";
import { CONUNDRUM_VIDEO_BLOCKER, frozenConundrumVideo } from "../lib/adle/review-v3/conundrum-video";
import type { ReviewSnapshotJsonValue } from "../lib/adle/review-v3/contracts";
import { GOVERNED_CONUNDRUM_FIXTURE, reviewConundrumDevSnapshot } from "../lib/adle/review-v3/dev-conundrum-snapshot";
import { compileReviewSnapshotR6, type CompileReviewR6Input } from "../lib/adle/review-v3/r6-snapshot-compiler";
import { loadAdleTodaySessionR6 } from "../lib/adle/review-v3/r6-persistence";
import { validateCompiledReviewSnapshotV3 } from "../lib/adle/review-v3/snapshot-validator";

async function main() {
  const fixture = reviewConundrumDevSnapshot();
  const input: CompileReviewR6Input = {
    assignmentId: fixture.assignment.assignmentId,
    reviewItemId: fixture.assignment.reviewItemId,
    childId: "dev-child",
    assignmentDate: "2026-08-26",
    prompts: fixture.promptCandidates.map((prompt) => ({ ...prompt, lastCompletedAt: null })),
    dueWords: fixture.targets.map((target) => ({
      ...target.schedule,
      canonicalWordId: target.canonicalWordId,
      canonicalSpelling: target.canonicalSpelling,
      taughtOn: "2026-08-01",
      answerAuthorityReferenceId: target.answerAuthority.referenceId,
      answerAuthorityVersion: target.answerAuthority.version,
      answerAuthorityFingerprint: "a".repeat(64),
      audioAuthorityReferenceId: target.audioAuthority.referenceId,
      audioAuthorityVersion: target.audioAuthority.version,
      audioAuthorityFingerprint: "b".repeat(64),
      audioKind: target.audioAuthority.kind,
      speechText: target.audioAuthority.speechText,
      assetReference: target.audioAuthority.assetReference,
      routeProvenance: target.routeProvenance,
      availableCue: target.availableCue,
    })),
  };
  const before = canonicalSnapshotJson(input);
  const first = compileReviewSnapshotR6(input);
  const second = compileReviewSnapshotR6(input);
  assert(first.ok && second.ok);
  assert.equal(canonicalSnapshotJson(first), canonicalSnapshotJson(second));
  assert.equal(canonicalSnapshotJson(input), before, "compiler never mutates governed inputs");
  assert.deepEqual(first.snapshot.promptCandidates[0], GOVERNED_CONUNDRUM_FIXTURE);

  // Exercise the actual R6 read model using an in-memory read-only database double.
  let storedSnapshot = first.snapshot;
  const client = { from(table: string) {
    const rows = table === "adle_today_session_orchestrations" ? [{
      daily_assignment_id: input.assignmentId, assignment_date: input.assignmentDate,
      major_stage: "review", state_version: 0, blocker_code: null,
    }] : table === "daily_assignments" ? [{
      id: input.assignmentId, status: "pending", compiled_review_snapshot: storedSnapshot,
      compiled_lesson_snapshot: null, lesson_route_metadata: null,
    }] : table === "adle_review_sessions" ? [{
      id: "dev-session", assignment_item_id: input.reviewItemId, completed_at: null,
    }] : (() => { throw new Error(`Unexpected table ${table}`); })();
    const query = {
      select() { return query; }, eq() { return query; }, neq() { return query; },
      order() { return query; }, limit: async () => ({ data: rows, error: null }),
      maybeSingle: async () => ({ data: rows[0], error: null }),
    };
    return query;
  } } as unknown as SupabaseClient;
  const read = await loadAdleTodaySessionR6({ client, parentUserId: "dev-parent", childId: "dev-child", assignmentDate: input.assignmentDate });
  assert(read?.review);
  const rendered = frozenConundrumVideo(read.review.snapshot.promptCandidates[0]);
  assert.deepEqual(rendered, { status: "ready", video: {
    videoId: "_HoaznEUe9E", watchUrl: "https://www.youtube.com/watch?v=_HoaznEUe9E",
    embedUrl: "https://www.youtube.com/embed/_HoaznEUe9E", title: "#27 The Photo Conundrum",
  } });
  assert.equal(canonicalSnapshotJson(read.review.snapshot), canonicalSnapshotJson(first.snapshot));
  for (const prompt of fixture.promptCandidates.filter((p) => p.challengeType !== "conundrums")) {
    assert.deepEqual(frozenConundrumVideo(prompt), { status: "not_required" });
  }

  for (const field of ["embed", "youtube_video_id", "youtube_url", "youtube_embed_url", "video_title"]) {
    const broken = structuredClone(input);
    const configuration = { ...broken.prompts[0].configuration };
    delete configuration[field];
    broken.prompts = [{ ...broken.prompts[0], configuration }, ...broken.prompts.slice(1)];
    const result = compileReviewSnapshotR6(broken);
    assert.deepEqual(result, { ok: false, blockerCode: CONUNDRUM_VIDEO_BLOCKER }, `missing ${field}`);
  }
  const invalidConfigurations: Record<string, ReviewSnapshotJsonValue>[] = [
    { youtube_video_id: "malformed" },
    { youtube_embed_url: "https://evil.example/embed/_HoaznEUe9E" },
    { youtube_embed_url: "https://www.youtube.com/embed/_HoaznEUe9E?autoplay=1" },
    { youtube_url: "https://www.youtube.com/watch?v=different01" },
    { embed: { provider: "vimeo", interactive: true } },
    { embed: { provider: "youtube", interactive: false } },
    { embed: { provider: "youtube", interactive: true, playlist: "another" } },
    { video_title: " " },
  ];
  for (const invalid of invalidConfigurations) {
    assert.equal(frozenConundrumVideo({ ...GOVERNED_CONUNDRUM_FIXTURE,
      configuration: { ...GOVERNED_CONUNDRUM_FIXTURE.configuration, ...invalid },
    }).status, "blocked");
  }
  storedSnapshot = reviewConundrumDevSnapshot(true);
  const invalid = validateCompiledReviewSnapshotV3(storedSnapshot);
  assert(!invalid.ok && invalid.blockers.some((b) => b.code === CONUNDRUM_VIDEO_BLOCKER));
  const blocked = await loadAdleTodaySessionR6({ client, parentUserId: "dev-parent", childId: "dev-child", assignmentDate: input.assignmentDate });
  assert.equal(blocked?.blockerCode, CONUNDRUM_VIDEO_BLOCKER);
  assert.equal(blocked?.review, null);
  console.log(JSON.stringify({ status: "PASS", deterministicFingerprint: first.snapshot.provenance.sourceFingerprint,
    promptSnapshotReadModelRendererExact: true, invalidRequiredConfigClosed: true, inputUnchanged: true }));
}

void main();
