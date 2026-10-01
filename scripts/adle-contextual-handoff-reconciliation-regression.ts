import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { selectPartTwoSkill } from "../lib/adle/composer-skill-selection";
import { reconcilePendingContextualHandoffs } from "../lib/adle/contextual-handoff-reconciliation";
import type { LearningItemFact } from "../lib/adle/learning-items";

const parent = "parent";
const child = "child";
const skill = "D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE";
const rows = ["issue-1", "issue-2"].map((writing_issue_id) => ({
  writing_issue_id,
  parent_user_id: parent,
  child_id: child,
  handoff_state: "PENDING_TEACHING_CONTENT",
}));
const admitted = new Set<string>();
let contentReleased = false;
let rpcCalls = 0;
let failRpc = false;
const client = {
  from(table: string) {
    assert.equal(table, "writing_context_learning_handoffs");
    let childFilter: string | undefined;
    let limit = 0;
    const query = {
      select(columns: string) {
        assert.equal(columns, "writing_issue_id,parent_user_id,child_id");
        return query;
      },
      in(column: string, states: string[]) {
        assert.equal(column, "handoff_state");
        assert.deepEqual(states, ["PENDING_CANONICAL_WORD", "PENDING_WORD_SUPPORT", "PENDING_TEACHING_CONTENT"]);
        return query;
      },
      order() { return query; },
      limit(count: number) { limit = count; return query; },
      eq(column: string, value: string) {
        assert.equal(column, "child_id");
        childFilter = value;
        return query;
      },
      then(resolve: (value: unknown) => void) {
        const selected = rows.filter((row) => row.handoff_state !== "READY" &&
          (!childFilter || row.child_id === childFilter)).slice(0, limit);
        resolve({ data: selected, error: null });
      },
    };
    return query;
  },
  async rpc(name: string, args: Record<string, string>) {
    assert.equal(name, "reconcile_contextual_adle_learning_need");
    assert.equal(args.p_parent_user_id, parent);
    assert.equal(args.p_child_id, child);
    rpcCalls += 1;
    if (failRpc) return { data: null, error: { code: "test_failure" } };
    const row = rows.find((candidate) => candidate.writing_issue_id === args.p_writing_issue_id);
    assert(row);
    if (contentReleased) {
      row.handoff_state = "READY";
      admitted.add(row.writing_issue_id);
    }
    return { data: { handoff_state: row.handoff_state }, error: null };
  },
} as unknown as SupabaseClient;

function selection(): string | null {
  const items: LearningItemFact[] = [...admitted].map((issueId, index) => ({
    learningItemId: issueId,
    childId: child,
    canonicalWordId: `word-${index + 1}`,
    microSkillKey: skill,
    itemStatus: "pending",
    sourceKind: "parent_verified_contextual_choice",
    sourceRef: `contextual_writing_issue:${issueId}`,
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: "2026-10-01",
    rowStatus: "active",
  }));
  return selectPartTwoSkill({
    learningItems: items,
    skillFamilyKeyBySkill: new Map([[skill, "D4_HOM"]]),
    prerequisiteKeysBySkill: new Map(),
    frequencyBandByWordId: new Map(),
    previousLessonFamilyKey: null,
  }).microSkillKey;
}

async function main() {
const pending = await reconcilePendingContextualHandoffs({ serviceClient: client, childId: child, limit: 10 });
assert.deepEqual(pending, { examined: 2, ready: 0, stillPending: 2, hasMore: false });
assert.equal(selection(), null, "pending handoffs cannot select a lesson");

contentReleased = true;
const bounded = await reconcilePendingContextualHandoffs({ serviceClient: client, childId: child, limit: 1 });
assert.deepEqual(bounded, { examined: 1, ready: 1, stillPending: 0, hasMore: true });
assert.equal(selection(), null, "one word does not meet the two-item gate");
const released = await reconcilePendingContextualHandoffs({ serviceClient: client, childId: child, limit: 10 });
assert.deepEqual(released, { examined: 1, ready: 1, stillPending: 0, hasMore: false });
assert.equal(selection(), skill, "two distinct governed words make the skill selectable");
const repeated = await reconcilePendingContextualHandoffs({ serviceClient: client, childId: child, limit: 10 });
assert.equal(repeated.examined, 0, "ready handoffs are not replayed");

rows[0].handoff_state = "PENDING_WORD_SUPPORT";
failRpc = true;
await assert.rejects(
  reconcilePendingContextualHandoffs({ serviceClient: client, childId: child, limit: 10 }),
  /contextual_handoff_reconcile_failed/,
  "a failed authority RPC must not be treated as ready",
);
assert.equal(rpcCalls, 5);
console.log("ADLE contextual handoff reconciliation regression passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
