import {
  getPendingAdleLifecycleLabel,
  sortPendingAdleLearningRoutes,
  type PendingAdleLearningRoute,
} from "../lib/adle/pending-learning";

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

function route(
  learningItemId: string,
  microSkillKey: string,
  learnerSpelling: string,
  itemStatus: string,
  intakeOn: string,
): PendingAdleLearningRoute {
  return {
    learningItemId,
    canonicalWordId: "playing-id",
    canonicalWord: "playing",
    learnerSpelling,
    microSkillKey,
    microSkillName: microSkillKey,
    itemStatus,
    lifecycleLabel: getPendingAdleLifecycleLabel(itemStatus),
    intakeOn,
  };
}

const preserveBase = route(
  "route-preserve",
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  "plaiing",
  "pending",
  "2026-07-20",
);
const identifyBase = route(
  "route-identify",
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
  "plaing",
  "pending",
  "2026-07-21",
);

const sharedWordRoutes = sortPendingAdleLearningRoutes([identifyBase, preserveBase]);
assert(sharedWordRoutes.length === 2, "two active playing routes must remain separate");
assert(
  sharedWordRoutes[0]?.learnerSpelling === "plaiing" &&
    sharedWordRoutes[0]?.microSkillKey === "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  "preserve-base route must retain plaiing lineage",
);
assert(
  sharedWordRoutes[1]?.learnerSpelling === "plaing" &&
    sharedWordRoutes[1]?.microSkillKey === "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
  "identify-base route must retain plaing lineage",
);

const ordered = sortPendingAdleLearningRoutes([
  route("review", "D4_REVIEW", "reviewing", "awaiting_review_outcome", "2026-07-01"),
  route("paused", "D4_PAUSED", "paused", "paused_parent_review", "2026-06-01"),
  route("reteach", "D4_RETEACH", "reteach", "pending_reteach", "2026-07-22"),
  preserveBase,
]);
assert(
  ordered.map((entry) => entry.learningItemId).join(",") ===
    "reteach,route-preserve,review,paused",
  "actionable ADLE routes must be ordered before lesson, review, and paused states",
);

const preview = Array.from({ length: 12 }, (_, index) =>
  route(`route-${index}`, `D4_${index}`, `word-${index}`, "pending", `2026-07-${String(index + 1).padStart(2, "0")}`),
).slice(0, 10);
assert(preview.length === 10, "Insights preview must cap at ten routes");
assert(
  getPendingAdleLifecycleLabel("resolved") === "Learning route active",
  "resolved routes have no pending lifecycle label and are excluded by the loader query",
);

console.log("ADLE pending learning regression passed.");
