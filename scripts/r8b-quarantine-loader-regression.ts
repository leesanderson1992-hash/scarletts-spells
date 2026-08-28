import assert from "node:assert/strict";

import { intakeApprovedSubmissionCorrections } from "../lib/adle/loaders/canonical-intake-live";

process.env.ADLE_CANONICAL_INTAKE_ENABLED = "enabled";

type QueryResult = { data: unknown[]; error: null };

class CandidateQuery implements PromiseLike<QueryResult> {
  constructor(private readonly result: QueryResult) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  in() {
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

const reads: string[] = [];
const rpcCalls: string[] = [];
const serviceClient = {
  from(table: string) {
    reads.push(table);
    assert.equal(table, "parent_verified_spelling_candidate_mappings");
    return new CandidateQuery({
      data: [
        {
          id: "r8b-known-match-source",
          parent_user_id: "parent-1",
          child_id: "child-1",
          misspelling_normalized: "futball",
          correct_spelling_normalized: "football",
          micro_skill_key: "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS",
          candidate_status: "parent_local_promoted",
          updated_at: "2026-08-28T12:00:00.000Z",
          source_adle_review_session_id: null,
          canonical_intake_handoff_state: "awaiting_r8c_exact_id_handoff",
        },
      ],
      error: null,
    });
  },
  async rpc(name: string) {
    rpcCalls.push(name);
    return { data: null, error: null };
  },
};

async function main() {
  const result = await intakeApprovedSubmissionCorrections({
    serviceClient: serviceClient as never,
    parentUserId: "parent-1",
    childId: "child-1",
    submissionId: "submission-1",
  });

  assert.deepEqual(reads, ["parent_verified_spelling_candidate_mappings"]);
  assert.equal(result.enabled, true);
  assert.equal(result.eligible, 0);
  assert.equal(result.inserted, 0);
  assert.deepEqual(rpcCalls, []);

  console.log(
    "r8b-quarantine-loader-regression: quarantined source produced zero intake RPC calls",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
