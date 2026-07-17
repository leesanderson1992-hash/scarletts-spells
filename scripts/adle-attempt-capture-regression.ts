import { buildLessonAttemptEvents, buildReviewAttemptEvents } from "../lib/adle/assignment-attempt-events";
import type { AdleSessionItem } from "../lib/adle/loaders/daily-plan-surface";
import {
  insertAssignmentAttemptEvents,
  markAssignmentCompletedIfAllItemsComplete,
  type AssignmentAttemptEventWrite,
} from "../lib/adle/loaders/session-completion-loader";
import { onLessonCompleted, onReviewSessionCompleted } from "../lib/adle/composer-completions";
import { createReviewBundle, REVIEW_POLICY_V1 } from "../lib/adle/review-scheduler";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

const context = {
  childId: "child-1",
  parentUserId: "parent-1",
  assignmentId: "assignment-1",
  planDate: "2026-07-09",
};

function item(overrides: Partial<AdleSessionItem>): AdleSessionItem {
  return {
    id: "item-1",
    sectionKey: "lesson_production",
    templateKey: "CONTROLLED_SPELLING",
    position: 1,
    status: "pending",
    targetWord: "writing",
    canonicalWordId: "word-writing",
    microSkillKey: "D4_INF_ING_ENDINGS_DROP_E",
    adleLearningItemRef: null,
    promptData: {},
    ...overrides,
  };
}

async function main() {
  // First-exposure lesson attempts are captured but never classified as review
  // outcomes or authentic use.
  {
  const lessonSourceRef = "lesson:child-1:2026-07-09:D4_INF_ING_ENDINGS_DROP_E";
  const events = buildLessonAttemptEvents({
    context,
    sourceRef: lessonSourceRef,
    items: [
      item({ id: "guided-1", sectionKey: "guided_practice", templateKey: "PG_SOUND_NOTICE" }),
      item({ id: "prod-1", sectionKey: "lesson_production", templateKey: "CONTROLLED_SPELLING" }),
      item({ id: "dict-1", sectionKey: "lesson_dictation", templateKey: "DICTATION_NO_IMAGE" }),
      item({
        id: "probe-1",
        sectionKey: "lesson_probe",
        templateKey: "DIAGNOSTIC_DICTATION_PROBE",
        canonicalWordId: null,
        targetWord: null,
        promptData: {
          words: [
            { canonicalWordId: "word-making", targetWord: "making" },
            { canonicalWordId: "word-hoping", targetWord: "hoping" },
          ],
        },
      }),
    ],
    guidedAttempts: new Map([["guided-1", "I think it drops the e"]]),
    controlledAttempts: new Map([["word-writing", "writting"]]),
    dictationAttempts: new Map([["word-writing", "righting"]]),
    probeAttempts: new Map([
      ["word-making", "makeing"],
      ["word-hoping", "hoping"],
    ]),
  });

  assert(events.length === 5, "guided, controlled, dictation, and two probe attempts are captured");
  assert(
    events.some(
      (event) =>
        event.attemptKind === "lesson_production" &&
        event.evidenceClass === "first_exposure_lesson_attempt" &&
        event.attemptText === "writting" &&
        event.isCorrect === false,
    ),
    "wrong controlled first-exposure attempt is stored as non-punitive lesson evidence",
  );
  assert(
    events.some(
      (event) =>
        event.attemptKind === "lesson_dictation" &&
        event.evidenceClass === "first_exposure_lesson_attempt" &&
        event.attemptText === "righting" &&
        event.isCorrect === false,
    ),
    "wrong dictation first-exposure attempt is stored as non-punitive lesson evidence",
  );
  assert(
    events.some(
      (event) =>
        event.attemptKind === "guided_practice" &&
        event.evidenceClass === "guided_practice_attempt" &&
        event.isCorrect === null,
    ),
    "guided prompt shell text is stored without correctness pricing",
  );
  assert(
    events.some(
      (event) =>
        event.attemptKind === "lesson_probe" &&
        event.evidenceClass === "diagnostic_probe_attempt" &&
        event.sourceRef.endsWith(":word-making"),
    ),
    "probe attempts use per-word idempotency source refs",
  );
  assert(
    events.every(
      (event) =>
        event.evidenceClass !== "scheduled_review_attempt" &&
        event.evidenceClass !== ("authentic_use_attempt" as AssignmentAttemptEventWrite["evidenceClass"]),
    ),
    "first-exposure attempts are neither scheduled-review nor authentic-use evidence",
  );

  const lessonResult = onLessonCompleted(REVIEW_POLICY_V1, {
    childId: context.childId,
    microSkillKey: "D4_INF_ING_ENDINGS_DROP_E",
    completedOn: context.planDate,
    sourceRef: lessonSourceRef,
    bundleId: "bundle-1",
    producedWords: [{ canonicalWordId: "word-writing", attemptText: "writting", correct: false }],
    learningItems: [],
  });
  assert(
    lessonResult.taughtEvents[0]?.attemptText === "writting",
    "taught history receives actual final produced attempt text",
  );
  assert(!("outcomeEvents" in lessonResult), "lesson completion does not create review outcome events");
  }

  // Scheduled review attempts are the only route to scheduled-review evidence.
  {
  const reviewEvents = buildReviewAttemptEvents({
    context,
    productionItems: [
      item({
        id: "review-prod-1",
        sectionKey: "review_production",
        templateKey: "REVIEW_DICTATION",
        targetWord: "writing",
        canonicalWordId: "word-writing",
      }),
    ],
    reflectionItems: [
      item({
        id: "review-reflect-1",
        sectionKey: "review_reflection",
        templateKey: "ERROR_REFLECTION_CUE",
        targetWord: "writing",
        canonicalWordId: "word-writing",
      }),
    ],
    attempts: new Map([["word-writing", "writting"]]),
    reflectionAttempts: new Map([["review-reflect-1", "I missed one t"]]),
  });
  assert(
    reviewEvents.some(
      (event) =>
        event.attemptKind === "review_production" &&
        event.evidenceClass === "scheduled_review_attempt" &&
        event.isCorrect === false,
    ),
    "wrong scheduled review attempt is classified as scheduled-review evidence",
  );
  assert(
    reviewEvents.some(
      (event) =>
        event.attemptKind === "reflection_retry" &&
        event.evidenceClass === "reflection_attempt" &&
        event.attemptText === "I missed one t",
    ),
    "reflection retry text is captured separately from the review outcome",
  );

  const { bundle, words } = createReviewBundle(REVIEW_POLICY_V1, {
    bundleId: "review-bundle-1",
    childId: context.childId,
    sourceRef: "lesson:child-1:2026-07-08:D4_INF_ING_ENDINGS_DROP_E",
    taughtOn: "2026-07-08",
    words: [{ canonicalWordId: "word-writing" }],
  });
  const reviewResult = onReviewSessionCompleted(REVIEW_POLICY_V1, {
    childId: context.childId,
    completedOn: context.planDate,
    sourceRef: `review:${context.childId}:${context.planDate}`,
    bundles: [bundle],
    scheduleWords: words,
    outcomes: [
      {
        canonicalWordId: "word-writing",
        bundleId: "review-bundle-1",
        kind: "bundle_review",
        passed: false,
        attemptText: "writting",
      },
    ],
    microSkillKeyByWordId: new Map([["word-writing", "D4_INF_ING_ENDINGS_DROP_E"]]),
  });
  assert(
    reviewResult.outcomeEvents.some(
      (event) => event.eventType === "review_fail" && event.attemptText === "writting",
    ),
    "scheduled review wrong attempt creates a review outcome event with raw attempt text",
  );
  }

  // Attempt insertion is idempotent on (assignment_item_id, attempt_kind,
  // source_ref): duplicates are tolerated as success.
  {
  const inserted: string[] = [];
  const seen = new Set<string>();
  const fakeClient = {
    from(table: string) {
      assert(table === "adle_assignment_attempt_events", "attempt insert targets the attempt ledger");
      return {
        async upsert(rows: Array<{
          assignment_item_id: string;
          attempt_kind: string;
          source_ref: string;
        }>) {
          for (const row of rows) {
            const key = `${row.assignment_item_id}:${row.attempt_kind}:${row.source_ref}`;
            if (!seen.has(key)) {
              seen.add(key);
              inserted.push(key);
            }
          }
          return { error: null };
        },
      };
    },
  };
  const event: AssignmentAttemptEventWrite = {
    childId: context.childId,
    parentUserId: context.parentUserId,
    dailyAssignmentId: context.assignmentId,
    assignmentItemId: "prod-1",
    canonicalWordId: "word-writing",
    microSkillKey: "D4_INF_ING_ENDINGS_DROP_E",
    sectionKey: "lesson_production",
    templateKey: "CONTROLLED_SPELLING",
    targetWord: "writing",
    attemptText: "writting",
    isCorrect: false,
    attemptKind: "lesson_production",
    evidenceClass: "first_exposure_lesson_attempt",
    sourceRef: "lesson:child-1:2026-07-09:D4_INF_ING_ENDINGS_DROP_E",
  };
  await insertAssignmentAttemptEvents(fakeClient as never, [event, event]);
  assert(inserted.length === 1, "duplicate attempt event inserts are idempotent");
  }

  // Header completion is derived after all assignment items are complete.
  {
  let headerUpdated = false;
  const fakeClient = {
    from(table: string) {
      if (table === "assignment_items") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async neq() {
            return { count: 0, error: null };
          },
        };
      }
      assert(table === "daily_assignments", "completed header update targets daily_assignments");
      return {
        update(payload: { status: string }) {
          assert(payload.status === "completed", "header status is completed");
          headerUpdated = true;
          return this;
        },
        eq() {
          return this;
        },
        then(resolve: (value: { error: null }) => void) {
          resolve({ error: null });
        },
      };
    },
  };
  const completed = await markAssignmentCompletedIfAllItemsComplete(fakeClient as never, context);
  assert(completed && headerUpdated, "assignment header is marked completed when no incomplete items remain");
  }

  console.log("ADLE attempt capture regression passed");
}

void main();
