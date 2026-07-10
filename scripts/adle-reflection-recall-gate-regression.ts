import { readFileSync } from "node:fs";

import { buildReviewAttemptEvents } from "../lib/adle/assignment-attempt-events";
import type { AdleSessionItem } from "../lib/adle/loaders/daily-plan-surface";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

function item(overrides: Partial<AdleSessionItem>): AdleSessionItem {
  return {
    id: "review-reflection-1",
    sectionKey: "review_reflection",
    templateKey: "ERROR_REFLECTION_CUE",
    position: 1,
    status: "pending",
    targetWord: "hoping",
    canonicalWordId: "word-hoping",
    microSkillKey: "D4_INF_ING_ENDINGS_DROP_E",
    adleLearningItemRef: null,
    promptData: {},
    ...overrides,
  };
}

const reflectionSource = readFileSync("components/adle/activities/reflection-activity.tsx", "utf8");

assert(
  reflectionSource.includes("useState(false)") && reflectionSource.includes("isAnswerHidden"),
  "reflection activity must keep explicit reveal/hide state",
);
assert(
  reflectionSource.includes("Hide Word"),
  "reflection activity must expose a child-facing hide control",
);
assert(
  reflectionSource.includes('type="checkbox"') && reflectionSource.includes('aria-label="Hide Word"'),
  "reflection hide control must be a switch-style checkbox slider",
);
assert(
  reflectionSource.includes("hidden for retry"),
  "reflection activity must mask the correct word after the child hides it",
);
assert(
  /isAnswerHidden\s*\?\s*\([\s\S]*<input[\s\S]*\)\s*:\s*\([\s\S]*type="checkbox"/.test(reflectionSource),
  "retry input must only render after the correct spelling is hidden",
);

const events = buildReviewAttemptEvents({
  context: {
    childId: "child-1",
    parentUserId: "parent-1",
    assignmentId: "assignment-1",
    planDate: "2026-07-10",
  },
  productionItems: [],
  reflectionItems: [item({ id: "reflection-1" })],
  attempts: new Map(),
  reflectionAttempts: new Map([["reflection-1", "hoping"]]),
});

assert(events.length === 1, "reflection retry is submitted as one attempt event");
assert(events[0]?.attemptKind === "reflection_retry", "reflection retry keeps reflection attempt kind");
assert(events[0]?.evidenceClass === "reflection_attempt", "reflection retry keeps reflection evidence class");
assert(events[0]?.isCorrect === null, "reflection retry is not correctness-priced");
assert(
  events.every((event) => event.evidenceClass !== "scheduled_review_attempt"),
  "reflection retry must not become scheduled-review evidence",
);

console.log("ADLE reflection recall gate regression passed");
