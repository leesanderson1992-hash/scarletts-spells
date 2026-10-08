import assert from "node:assert/strict";
import { LessonDraftAutosave, type DraftAutosaveStatus } from "../lib/lessons/draft-autosave";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

async function savesDuringContinuousTyping() {
  let answer = "";
  const saved: string[] = [];
  const autosave = new LessonDraftAutosave({
    capture: () => answer,
    save: async (snapshot) => { saved.push(snapshot); return true; },
    onStatus: () => {},
    onSaved: () => {},
    idleMs: 50,
    maxWaitMs: 75,
  });

  for (let index = 0; index < 12; index += 1) {
    answer += "a";
    autosave.edited();
    await wait(10);
    if (index === 9) assert.ok(saved.length > 0, "continuous typing must not postpone every save");
  }
  await wait(65);
  assert.equal(saved.at(-1), answer);
  autosave.dispose();
}

async function queuesLatestAndKeepsStatusHonest() {
  let answer = "first";
  const requests: Array<{ snapshot: string; resolve: (ok: boolean) => void }> = [];
  const statuses: DraftAutosaveStatus[] = [];
  const confirmed: string[] = [];
  const autosave = new LessonDraftAutosave({
    capture: () => answer,
    save: (snapshot) => {
      const request = deferred<boolean>();
      requests.push({ snapshot, resolve: request.resolve });
      return request.promise;
    },
    onStatus: (status) => statuses.push(status),
    onSaved: (snapshot) => confirmed.push(snapshot),
    idleMs: 10,
    maxWaitMs: 30,
  });

  autosave.edited();
  await wait(20);
  assert.deepEqual(requests.map((request) => request.snapshot), ["first"]);
  answer = "second";
  autosave.edited();
  await wait(20);
  assert.equal(requests.length, 1, "there must be only one write in flight");
  requests[0].resolve(true);
  await wait(10);
  assert.deepEqual(requests.map((request) => request.snapshot), ["first", "second"]);
  assert.equal(confirmed.length, 0, "an old acknowledgement cannot mark new text saved");
  assert.notEqual(statuses.at(-1), "saved");
  requests[1].resolve(true);
  await wait(5);
  assert.deepEqual(confirmed, ["second"]);
  assert.equal(statuses.at(-1), "saved");
  autosave.dispose();
}

async function retriesFailure() {
  let attempts = 0;
  const statuses: DraftAutosaveStatus[] = [];
  const autosave = new LessonDraftAutosave({
    capture: () => "answer",
    save: async () => ++attempts > 1,
    onStatus: (status) => statuses.push(status),
    onSaved: () => {},
    idleMs: 10,
    retryMs: 20,
  });
  autosave.edited();
  await wait(55);
  assert.equal(attempts, 2);
  assert.ok(statuses.includes("error"));
  assert.equal(statuses.at(-1), "saved");
  autosave.dispose();
}

async function formActionWaitsForOlderWrite() {
  let answer = "older";
  const request = deferred<boolean>();
  const saved: string[] = [];
  const autosave = new LessonDraftAutosave({
    capture: () => answer,
    save: (snapshot) => { saved.push(snapshot); return request.promise; },
    onStatus: () => {},
    onSaved: () => {},
    idleMs: 10,
  });
  autosave.edited();
  await wait(20);
  answer = "latest";
  autosave.edited();
  let ready = false;
  const preparation = autosave.prepareForFormAction().then(() => { ready = true; });
  await wait(5);
  assert.equal(ready, false);
  request.resolve(true);
  await preparation;
  assert.equal(ready, true);
  assert.deepEqual(saved, ["older"], "a queued autosave must not race the form action");
  assert.equal(answer, "latest", "the form can now capture the current answer");
  autosave.dispose();
}

async function main() {
  await savesDuringContinuousTyping();
  await queuesLatestAndKeepsStatusHonest();
  await retriesFailure();
  await formActionWaitsForOlderWrite();
  console.log("Lesson draft autosave regression passed.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
