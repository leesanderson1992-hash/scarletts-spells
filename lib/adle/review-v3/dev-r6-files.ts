import "server-only";

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReviewR6QaScenario } from "./dev-r6-scenarios";
import { createReviewR6QaState, type ReviewR6QaState } from "./dev-r6-store";

const directory = join(tmpdir(), `adle-review-r6-qa-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12)}`);
export function validReviewR6QaRun(run: unknown): run is string {
  return typeof run === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(run);
}
function path(run: string) {
  if (process.env.NODE_ENV !== "development" || process.env.ADLE_REVIEW_R6_QA !== "1") throw new Error("QA is disabled");
  if (!validReviewR6QaRun(run)) throw new Error("Invalid QA run");
  return join(directory, `${run}.json`);
}
export function saveReviewR6QaState(state: ReviewR6QaState) {
  const destination = path(state.run);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(`${destination}.tmp`, JSON.stringify(state), { mode: 0o600 });
  renameSync(`${destination}.tmp`, destination);
}
export function loadReviewR6QaState(run: string, scenario?: ReviewR6QaScenario): ReviewR6QaState {
  const file = path(run);
  if (existsSync(file)) {
    const state = JSON.parse(readFileSync(file, "utf8")) as ReviewR6QaState;
    if (state.schemaVersion !== 1 || state.run !== run || (scenario && state.scenario !== scenario)) throw new Error("QA run does not match scenario");
    return state;
  }
  if (!scenario) throw new Error("Open the QA page to initialise this run");
  const state = createReviewR6QaState(scenario, run);
  saveReviewR6QaState(state);
  return state;
}
