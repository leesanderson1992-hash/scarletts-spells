import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { reviewSessionQueue } from "../lib/adle/review-due-queue";
import {
  createReviewBundle,
  resolveBundleReview,
  REVIEW_POLICY_V1,
} from "../lib/adle/review-scheduler";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const composer = read("lib/adle/daily-assignment-composer.ts");
const generator = read("lib/adle/today-assignment-service.ts");
const action = read("app/learn/week/adle/actions.ts");
const persistence = read("lib/adle/loaders/session-completion-loader.ts");
const runner = read("components/adle-session-runner.tsx");

assert.match(composer, /const dueQueue = reviewSessionQueue\(/,
  "the generic composer currently generates Review from the scheduler queue");
assert.match(composer, /sectionKey: "review_production"/,
  "the generic composer currently authors the old production section");
assert.match(runner, /function ReviewPart|const ReviewPart/,
  "the generic learner runner currently owns the live Review surface");

const specialistPlans = [
  "lib/adle/morphology/dynamic-prefix-assignment-plan.ts",
  "lib/adle/morphology/dynamic-affix-assignment-plan.ts",
  "lib/adle/morphology/compound-word-assignment-plan-v2.ts",
];
for (const path of specialistPlans) {
  const source = read(path);
  assert.match(
    source,
    /partOne:\s*\{[\s\S]*?dueQueue:\s*\[\],[\s\S]*?presentationOrder:\s*\[\],[\s\S]*?sections:\s*\[\],[\s\S]*?skips:\s*\[\][\s\S]*?\}/,
    `${path} currently removes the generic Review segment`,
  );
}
assert.match(generator, /generateGuardedBaseWordFamilyPilot\(/,
  "Base Word currently generates through a lesson-specific assignment path");

const selectionIndex = generator.indexOf("const selection = selectPartTwoSkill({");
const noSkillIndex = generator.indexOf("if (!selection.microSkillKey)", selectionIndex);
const firstCompositionAfterSelection = generator.indexOf("composeDailyPlan(facts", selectionIndex);
assert(selectionIndex >= 0 && noSkillIndex > selectionIndex);
assert(
  firstCompositionAfterSelection === -1 || noSkillIndex < firstCompositionAfterSelection,
  "the live generator returns no_eligible before it can persist a Review-only plan",
);

const policy = REVIEW_POLICY_V1;
const due = createReviewBundle(policy, {
  bundleId: "characterization-bundle",
  childId: "child-1",
  sourceRef: "lesson:characterization",
  taughtOn: "2026-08-23",
  words: Array.from({ length: 11 }, (_, index) => ({
    canonicalWordId: `word-${String(index + 1).padStart(2, "0")}`,
  })),
});
const queue = reviewSessionQueue(policy, [due.bundle], due.words, "2026-08-24");
assert.equal(queue.length, 10, "the live queue caps a due bundle at ten words");
assert.equal(due.words.length, 11, "the eleventh schedule word remains present");
assert.throws(
  () => resolveBundleReview(
    policy,
    due.bundle,
    due.words,
    queue.map((item) => ({
      canonicalWordId: item.canonicalWordId,
      passed: true,
    })),
    "2026-08-24",
  ),
  /outcomes must cover exactly the bundle's scheduled words/,
  "the live bundle resolver cannot complete a cap-truncated bundle",
);

const outcomesIndex = action.indexOf("const outcomes: ReviewItemOutcome[] = [];");
const reviewActionIndex = action.indexOf("export async function completeAdleReviewPartAction");
const firstAttemptIndex = action.indexOf("const attempts = parseAttempts", reviewActionIndex);
const reflectionAttemptIndex = action.indexOf("const reflectionAttempts = parseAttempts", firstAttemptIndex);
const passedIndex = action.indexOf("passed: isAttemptCorrect(attemptText, target)", outcomesIndex);
const attemptWriteIndex = action.indexOf("await insertAssignmentAttemptEvents", outcomesIndex);
const scheduleCompletionIndex = action.indexOf("onReviewSessionCompleted(policy", outcomesIndex);
assert(firstAttemptIndex >= 0 && reflectionAttemptIndex > firstAttemptIndex);
assert(passedIndex > outcomesIndex && passedIndex < attemptWriteIndex);
assert(
  action.slice(outcomesIndex, attemptWriteIndex).includes("reflectionAttempts") === false,
  "reflection retry text does not participate in the original pass/fail outcome",
);
assert(scheduleCompletionIndex > attemptWriteIndex,
  "current raw attempts are written before scheduler completion begins");

assert.match(action, /\.from\("adle_authentic_use_events"\)[\s\S]*?\.select\(/,
  "current Review loads existing authentic-use evidence for scheduler policy");
assert.doesNotMatch(
  persistence.slice(
    persistence.indexOf("export async function persistReviewSessionCompletion"),
    persistence.indexOf("export interface LessonCompletionWrite"),
  ),
  /adle_authentic_use_events/,
  "current Review completion does not create authentic-use evidence",
);
assert.match(persistence, /await updateBundles\(client, write\.updatedBundles\)/);
assert.match(persistence, /await updateScheduleWords\(client, write\.updatedScheduleWords\)/);
assert.match(persistence, /await insertOutcomeEvents\(client, write\.outcomeEvents\)/);
assert(
  persistence.indexOf("await updateBundles(client, write.updatedBundles)") <
    persistence.indexOf("await insertOutcomeEvents(client, write.outcomeEvents)"),
  "current Review scheduling and outcome writes are sequential rather than one RPC",
);

console.log("PASS: current ADLE Review generation, omission, cap failure, original-result, and persistence behavior characterized");
