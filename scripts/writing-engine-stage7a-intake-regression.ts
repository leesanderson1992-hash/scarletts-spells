import assert from "node:assert/strict";

import {
  saveManualWritingSampleIntake,
  type SaveManualWritingSampleIntakeDeps,
} from "../lib/writing-samples/manual-intake";

type InsertedRow = {
  child_id: string;
  parent_user_id: string;
  title: string;
  sample_text: string;
  source: string;
  written_at: string;
  task_submission_id: null;
};

function buildFormData(entries: Record<string, string>) {
  const formData = new FormData();

  Object.entries(entries).forEach(([key, value]) => {
    formData.set(key, value);
  });

  return formData;
}

function createHarness() {
  const writes: Array<{ table: string; kind: string; record?: unknown }> = [];
  const insertedRows: InsertedRow[] = [];
  const analysisCalls: Array<{
    sample: { id: string; child_id: string; sample_text: string };
    parentUserId: string;
  }> = [];

  const client = {
    name: "fake-client",
  };

  const deps: SaveManualWritingSampleIntakeDeps<typeof client> = {
    async createClient() {
      return client;
    },
    async getSignedInParentUserId() {
      return "parent-1";
    },
    async getActiveChildrenForUser() {
      return [{ id: "child-1" }];
    },
    async insertWritingSample(_client, record) {
      writes.push({ table: "writing_samples", kind: "insert", record });
      insertedRows.push(record);

      return {
        data: {
          id: "sample-1",
          child_id: record.child_id,
          sample_text: record.sample_text,
        },
        error: null,
      };
    },
    async replaceAnalysisForSample(_client, sample, parentUserId) {
      analysisCalls.push({ sample, parentUserId });
      return { error: null };
    },
    getTodayDateOnly() {
      return "2026-05-13";
    },
  };

  return {
    deps,
    writes,
    insertedRows,
    analysisCalls,
  };
}

async function testMissingChildFailsAndSavesNothing() {
  const harness = createHarness();
  const location = await saveManualWritingSampleIntake(
    buildFormData({
      mode: "parent",
      sample_text: "I hav a cat.",
    }),
    harness.deps,
  );

  assert.equal(
    location,
    "/analyse?error=Choose+a+child+before+adding+a+writing+sample.",
  );
  assert.equal(harness.insertedRows.length, 0);
  assert.equal(harness.analysisCalls.length, 0);
  assert.equal(harness.writes.length, 0);
}

async function testMissingTextFailsAndSavesNothing() {
  const harness = createHarness();
  const location = await saveManualWritingSampleIntake(
    buildFormData({
      mode: "parent",
      child_id: "child-1",
      sample_text: "   ",
    }),
    harness.deps,
  );

  assert.equal(
    location,
    "/analyse?child=child-1&error=Paste+some+writing+before+saving.",
  );
  assert.equal(harness.insertedRows.length, 0);
  assert.equal(harness.analysisCalls.length, 0);
  assert.equal(harness.writes.length, 0);
}

async function testSuccessfulSubmitInsertsCanonicalWritingSampleAndHandsOffToReviewWork() {
  const harness = createHarness();
  const sampleText = "I hav a cat and I lik to pla.";
  const location = await saveManualWritingSampleIntake(
    buildFormData({
      mode: "parent",
      child_id: "child-1",
      sample_text: sampleText,
    }),
    harness.deps,
  );

  assert.equal(
    location,
    "/courses/review?child=child-1&saved=Writing+sample+saved.+Review+Work+is+ready+when+you+are.",
  );
  assert.equal(harness.insertedRows.length, 1);
  assert.equal(harness.analysisCalls.length, 1);
  assert.equal(harness.writes.length, 1);

  const [inserted] = harness.insertedRows;
  assert.ok(inserted);
  assert.equal(inserted.title, "Manual writing sample");
  assert.equal(inserted.source, "Add Writing Sample");
  assert.equal(inserted.sample_text, sampleText);
  assert.equal(inserted.written_at, "2026-05-13");
  assert.equal(inserted.task_submission_id, null);
  assert.equal(inserted.child_id, "child-1");
  assert.equal(inserted.parent_user_id, "parent-1");

  const [analysisCall] = harness.analysisCalls;
  assert.ok(analysisCall);
  assert.equal(analysisCall.parentUserId, "parent-1");
  assert.equal(analysisCall.sample.id, "sample-1");
  assert.equal(analysisCall.sample.child_id, "child-1");
  assert.equal(analysisCall.sample.sample_text, sampleText);

  const writtenTables = new Set(harness.writes.map((entry) => entry.table));
  assert.deepEqual(writtenTables, new Set(["writing_samples"]));
}

function main() {
  Promise.resolve()
    .then(testMissingChildFailsAndSavesNothing)
    .then(testMissingTextFailsAndSavesNothing)
    .then(testSuccessfulSubmitInsertsCanonicalWritingSampleAndHandsOffToReviewWork)
    .then(() => {
      console.log("writing-engine-stage7a-intake-regression: ok");
    });
}

main();
