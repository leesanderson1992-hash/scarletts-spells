import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveReviewedContextObservation } from "../lib/writing-engine/whole-writing/context-reviewed-observation";

async function main() {
  const historical = { id: "older-observation", occurrence_id: "exact-occurrence",
    parent_user_id: "parent", child_id: "child", family_key: "THERE_THEIR_THEYRE" };
  const client = {
    from() {
      const filters = new Map<string, unknown>();
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters.set(key, value); return query; },
        async maybeSingle() {
          const matches = [...filters].every(([key, value]) =>
            historical[key as keyof typeof historical] === value);
          return { data: matches ? historical : null, error: null };
        },
      };
      return query;
    },
  };
  const input = { client: client as never, submittedObservationId: historical.id,
    occurrenceId: historical.occurrence_id, parentUserId: "parent", childId: "child",
    family: historical.family_key };
  assert.equal(await resolveReviewedContextObservation(input), historical.id,
    "An older submitted observation must retain its identity.");
  for (const mismatch of [{ occurrenceId: "other" }, { parentUserId: "other" },
    { childId: "other" }, { family: "TO_TOO_TWO" }, { submittedObservationId: "missing" }]) {
    await assert.rejects(resolveReviewedContextObservation({ ...input, ...mismatch }));
  }
  assert.equal(await resolveReviewedContextObservation({ ...input, submittedObservationId: null }), null);
  const action = readFileSync("app/(authenticated)/courses/review/actions/context-advisory-decision-actions.ts", "utf8");
  assert.match(action, /p_observation_id: reviewedObservationId/);
  assert.doesNotMatch(action, /observationId === row\.observationId/);
  console.log("context feedback historical observation linkage regression passed");
}
void main();
