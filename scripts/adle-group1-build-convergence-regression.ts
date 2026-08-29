import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  deterministicOrderedBuildOrder,
  normaliseOrderedBuildSnapshot,
  orderedBuildTargetIsCorrect,
  transitionOrderedBuildSnapshot,
  type OrderedBuildTarget,
} from "../components/adle/activities/shared/ordered-build-engine";
import { ADLE_ACTIVITY_CATALOGUE } from "../lib/adle/activity-catalogue";
import {
  compoundJigsawAutoScrollDelta,
  compoundJigsawExpectedPieceIds,
  compoundJigsawPieceEdges,
  compoundJigsawPlacementIntentTargetId,
  compoundJigsawPlacementTargetId,
  compoundJigsawSlotEdges,
  compoundJigsawTargetColumnSpan,
  deriveCompoundJigsawPieces,
  normaliseAnonymousCompoundJigsawSnapshot,
  normaliseCompoundJigsawPlacements,
} from "../lib/adle/morphology/compound-jigsaw-pieces";

const targets: OrderedBuildTarget[] = [
  { id: "rainbow", expectedPieceIds: ["rainbow:0", "rainbow:1"] },
  { id: "mother-in-law", expectedPieceIds: ["mother-in-law:0", "mother-in-law:1", "mother-in-law:2"] },
];
const pieceIds = targets.flatMap((target) => [...target.expectedPieceIds]);
const empty = normaliseOrderedBuildSnapshot(targets, pieceIds);
assert.deepEqual(empty.placements.rainbow, [null, null]);

let state = transitionOrderedBuildSnapshot(empty, { type: "place", pieceId: "rainbow:1", targetId: "rainbow", slot: 0 });
state = transitionOrderedBuildSnapshot(state, { type: "place", pieceId: "rainbow:0", targetId: "rainbow", slot: 1 });
assert(!orderedBuildTargetIsCorrect(targets[0], state.placements.rainbow), "incorrect ordering remains movable for manual correction");
state = transitionOrderedBuildSnapshot(state, { type: "place", pieceId: "rainbow:0", targetId: "rainbow", slot: 0 });
state = transitionOrderedBuildSnapshot(state, { type: "place", pieceId: "rainbow:1", targetId: "rainbow", slot: 1 });
assert(orderedBuildTargetIsCorrect(targets[0], state.placements.rainbow), "pieces can be rearranged into governed order");
state = transitionOrderedBuildSnapshot(state, { type: "complete", targetId: "rainbow" });
assert.deepEqual(state.completedTargetIds, ["rainbow"], "one target can complete while another remains partial");

state = transitionOrderedBuildSnapshot(state, { type: "place", pieceId: "mother-in-law:0", targetId: "mother-in-law", slot: 0 });
const restored = normaliseOrderedBuildSnapshot(targets, pieceIds, state);
assert.deepEqual(restored, state, "partial multi-target placement and completion restore deterministically");

const shuffledOnce = deterministicOrderedBuildOrder(pieceIds, "group-1-build");
const shuffledAgain = deterministicOrderedBuildOrder(pieceIds, "group-1-build");
assert.deepEqual(shuffledOnce, shuffledAgain, "mixed piece bank order is deterministic");
assert.deepEqual(new Set(shuffledOnce), new Set(pieceIds), "mixed bank contains every governed piece exactly once");

const sixPieceTarget: OrderedBuildTarget = {
  id: "six-piece-fixture",
  expectedPieceIds: Array.from({ length: 6 }, (_, index) => `six-piece-fixture:${index}`),
};
const sixPieceSnapshot = normaliseOrderedBuildSnapshot(
  [sixPieceTarget],
  sixPieceTarget.expectedPieceIds,
  { placements: { [sixPieceTarget.id]: [...sixPieceTarget.expectedPieceIds] }, completedTargetIds: [sixPieceTarget.id] },
);
assert(orderedBuildTargetIsCorrect(sixPieceTarget, sixPieceSnapshot.placements[sixPieceTarget.id]), "the neutral foundation validates a deterministic six-piece layout fixture");
const anonymousEngineTarget: OrderedBuildTarget = {
  id: "anonymous-row",
  expectedPieceIds: ["slot:0", "slot:1"],
  isCorrect: (placements) => placements.join("|") === "alternate:0|alternate:1",
};
assert(orderedBuildTargetIsCorrect(anonymousEngineTarget, ["alternate:0", "alternate:1"]), "the shared engine accepts a presentation-owned correctness predicate");
assert(!orderedBuildTargetIsCorrect(anonymousEngineTarget, ["alternate:1", "alternate:0"]));

const closedTarget = { canonicalWordId: "closed", word: "rainbow", components: ["rain", "bow"], joins: ["none" as const] };
const openTarget = { canonicalWordId: "open", word: "ice cream", components: ["ice", "cream"], joins: ["space" as const] };
const hyphenTarget = { canonicalWordId: "hyphen", word: "well-being", components: ["well", "being"], joins: ["hyphen" as const] };
const threePartTarget = { canonicalWordId: "three", word: "mother-in-law", components: ["mother", "in", "law"], joins: ["hyphen" as const, "hyphen" as const] };
const sixComponentTarget = {
  canonicalWordId: "six-components",
  word: "one-two-three-four-five-six",
  components: ["one", "two", "three", "four", "five", "six"],
  joins: ["hyphen", "hyphen", "hyphen", "hyphen", "hyphen"] as const,
};
assert.deepEqual(compoundJigsawExpectedPieceIds(closedTarget), ["closed:0", "closed:1"], "closed compounds retain adjacent component pieces with no synthetic gap");
assert.deepEqual(compoundJigsawExpectedPieceIds(openTarget), ["open:0", "open:join:0", "open:1"], "open compounds interleave a draggable space piece");
assert.deepEqual(compoundJigsawExpectedPieceIds(hyphenTarget), ["hyphen:0", "hyphen:join:0", "hyphen:1"], "hyphenated compounds interleave a draggable hyphen piece");
assert.deepEqual(compoundJigsawExpectedPieceIds(threePartTarget), ["three:0", "three:join:0", "three:1", "three:join:1", "three:2"], "three-component words interleave every governed connector");
assert.equal(deriveCompoundJigsawPieces(sixComponentTarget).length, 11, "six components produce six component pieces and five independent connector pieces");
assert.equal(new Set(deriveCompoundJigsawPieces(sixComponentTarget).map((piece) => piece.id)).size, 11, "duplicate connector glyphs retain stable unique identities");
assert.equal(compoundJigsawTargetColumnSpan(2), "one");
assert.equal(compoundJigsawTargetColumnSpan(5), "one");
assert.equal(compoundJigsawTargetColumnSpan(11), "full");
assert.equal(compoundJigsawAutoScrollDelta(10, 800), -18);
assert.equal(compoundJigsawAutoScrollDelta(400, 800), 0);
assert.equal(compoundJigsawAutoScrollDelta(790, 800), 18);
assert.deepEqual(compoundJigsawSlotEdges(0, 3), { left: "flat", right: "tab" });
assert.deepEqual(compoundJigsawSlotEdges(1, 3), { left: "socket", right: "tab" });
assert.deepEqual(compoundJigsawSlotEdges(2, 3), { left: "socket", right: "flat" });
assert.deepEqual(
  deriveCompoundJigsawPieces(hyphenTarget).map((piece) => compoundJigsawPieceEdges(piece, 3)),
  [
    { left: "flat", right: "tab" },
    { left: "socket", right: "tab" },
    { left: "socket", right: "flat" },
  ],
  "each physical piece has one invariant orientation profile",
);

const expandedLegacy = normaliseCompoundJigsawPlacements(
  [openTarget, hyphenTarget],
  {
    open: ["open:0", "open:1"],
    hyphen: ["hyphen:1", "hyphen:0"],
  },
);
assert.deepEqual(expandedLegacy.open, ["open:0", null, "open:1"], "component-only open resume expands without inventing connector progress");
assert.deepEqual(expandedLegacy.hyphen, ["hyphen:1", null, "hyphen:0"], "component-only reordered resume keeps component positions and leaves connector empty");
const connectorAware = normaliseCompoundJigsawPlacements(
  [threePartTarget],
  { three: ["three:0", "three:join:0", null, "three:join:1", "three:2"] },
);
assert.deepEqual(connectorAware.three, ["three:0", "three:join:0", null, "three:join:1", "three:2"], "connector-aware partial resume restores exactly");

const anonymousTargets = [openTarget, hyphenTarget, threePartTarget];
assert.equal(compoundJigsawPlacementTargetId(anonymousTargets, [
  "hyphen:0",
  "three:join:0",
  "hyphen:1",
]), "hyphen", "an interchangeable physical hyphen identifies the governed hyphenated word in any three-piece row");
assert.equal(compoundJigsawPlacementTargetId(anonymousTargets, [
  "open:0",
  "open:join:0",
  "open:1",
]), "open", "an open compound identifies independently of the row's stable persistence key");
assert.equal(compoundJigsawPlacementIntentTargetId(anonymousTargets, [
  "open:0",
  "hyphen:join:0",
  "hyphen:1",
]), null, "mixed-target components do not falsely identify a learner-evidence miss");

const swappedAnonymous = normaliseAnonymousCompoundJigsawSnapshot(
  anonymousTargets,
  {
    open: ["hyphen:0", "three:join:0", "hyphen:1"],
    hyphen: ["open:0", "open:join:0", "open:1"],
  },
  ["open", "hyphen"],
);
assert.deepEqual(swappedAnonymous.completedRowIds, ["open", "hyphen"], "two checked same-length words restore as independently completed anonymous rows");
assert.deepEqual(swappedAnonymous.placements.open, ["hyphen:0", "three:join:0", "hyphen:1"], "swapped row content restores without moving it back to its historical target key");
assert.deepEqual(swappedAnonymous.placements.hyphen, ["open:0", "open:join:0", "open:1"]);

const historicalLockedWithoutPlacement = normaliseAnonymousCompoundJigsawSnapshot(
  [closedTarget, openTarget],
  {},
  ["closed"],
);
assert.deepEqual(historicalLockedWithoutPlacement.placements.closed, ["closed:0", "closed:1"], "historical locked targets without placements reconstruct their canonical sequence");
assert.deepEqual(historicalLockedWithoutPlacement.completedRowIds, ["closed"]);

const interchangeableHyphenTarget: OrderedBuildTarget = {
  id: "well-being",
  expectedPieceIds: ["well-being:0", "well-being:join:0", "well-being:1"],
  acceptedPieceIdsBySlot: [
    ["well-being:0"],
    ["well-being:join:0", "mother-in-law:join:0"],
    ["well-being:1"],
  ],
};
assert(orderedBuildTargetIsCorrect(interchangeableHyphenTarget, [
  "well-being:0",
  "mother-in-law:join:0",
  "well-being:1",
]), "any physical hyphen piece satisfies a governed hyphen slot");

const jigsawSource = readFileSync("components/adle/morphology/compound-jigsaw-activity.tsx", "utf8");
const compoundAdapterSource = readFileSync("components/adle/morphology/closed-compound-guided-lesson.tsx", "utf8");
const morphologySource = readFileSync("components/adle/morphology/morphology-guided-lesson.tsx", "utf8");
const baseWordSource = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");
const canonicalRegistrySource = readFileSync("components/adle/activities/canonical-renderer-registry.tsx", "utf8");
const definitionBuilderSource = readFileSync("components/adle/activities/shared/definition-word-builder.tsx", "utf8");
const snapRailSource = readFileSync("components/adle/activities/shared/snap-rail.tsx", "utf8");
assert(!jigsawSource.includes("closed_v1") && !jigsawSource.includes("copyMode") && !jigsawSource.includes("firstWord"), "the canonical Jigsaw renderer has no historical learner mode or payload shape");
assert(jigsawSource.indexOf("Anonymous jigsaw rows") < jigsawSource.indexOf("Mixed jigsaw piece bank"), "anonymous rows render before the mixed bank");
assert(!jigsawSource.includes("aria-hidden=\"true\">+</span>"), "Jigsaw trays do not render plus signs between closed components");
assert(!jigsawSource.includes("Word {targetIndex + 1}") && jigsawSource.includes("compoundJigsawPlacementTargetId"), "rows expose no target numbering and derive canonical ownership from assembled content");
assert(jigsawSource.includes("compoundJigsawPiecePath") && jigsawSource.includes("preserveAspectRatio=\"xMidYMid meet\""), "bank pieces, placed pieces and silhouettes share aspect-ratio-safe SVG geometry");
assert(jigsawSource.includes("pointerStart") && jigsawSource.includes("nearestDestination") && jigsawSource.includes("setPointerCapture"), "Jigsaw pointer capture and hit testing are controlled at board level");
assert(!compoundAdapterSource.includes("closedCompoundActivityId") && !compoundAdapterSource.includes("ClosedCompoundGuidedLesson"), "the current compound renderer has no closed-v1 route adapter");
assert(morphologySource.includes('concept: "WORD_ASSEMBLY"') && morphologySource.includes('mode: "definition_word_builder"') && canonicalRegistrySource.includes('"DefinitionWordBuilder", definitionBuilderLoader'), "Prefix and Affix resolve shared Definition Word Builder through the canonical registry");
assert(baseWordSource.includes('concept: "WORD_ASSEMBLY"') && baseWordSource.includes('mode: "definition_word_builder"') && canonicalRegistrySource.includes('"DefinitionWordBuilder", definitionBuilderLoader') && !baseWordSource.includes("function WordBuilder"), "Base Word resolves the shared Definition Word Builder through the canonical registry without a route-local renderer");
assert(!definitionBuilderSource.includes("Build from the meaning"), "Definition Word Builder has one progress title instead of a duplicate build heading");
assert(snapRailSource.includes("useOrderedBuildEngine") && jigsawSource.includes("useOrderedBuildEngine"), "SnapRail and Jigsaw share one ordered-build state machine");

const wordAssembly = ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "WORD_ASSEMBLY")!;
assert.equal(wordAssembly.canonicalComponent, "DefinitionWordBuilder");
assert.equal(wordAssembly.usedByMicroSkills.length, 19, "all five Prefix, ten Affix and four Base Word microskills resolve to the shared Definition Word Builder");
assert.equal(new Set(wordAssembly.usedByMicroSkills).size, 19, "the 19 configured specialist microskills are unique");

const reviewedPrefixManifest = JSON.parse(readFileSync(
  "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-03-dynamic-prefix-pedagogy-v1/manifest.json",
  "utf8",
)) as {
  profiles: Array<{ microSkillKey: string; targetForms: string[]; choiceForms: string[]; validChoiceAudit: Array<{ choiceVerdicts: Record<string, boolean> }> }>;
};
for (const profile of reviewedPrefixManifest.profiles) {
  assert(profile.choiceForms.length >= 3, `${profile.microSkillKey} has at least three reviewed Prefix choices`);
  assert.equal(new Set(profile.choiceForms).size, profile.choiceForms.length, `${profile.microSkillKey} choices are distinct`);
  assert(profile.validChoiceAudit.every((audit) => Object.values(audit.choiceVerdicts).filter(Boolean).length === 1), `${profile.microSkillKey} gives every build exactly one target`);
}
assert.deepEqual(
  reviewedPrefixManifest.profiles.find((profile) => profile.microSkillKey === "D4_MOR_PREFIXES_UN")?.choiceForms,
  ["un", "dis", "mis"],
  "un- uses the governed un-/dis-/mis- choice set",
);
assert.deepEqual(
  reviewedPrefixManifest.profiles.find((profile) => profile.microSkillKey === "D4_MOR_PREFIXES_IN_IM_IL_IR")?.choiceForms,
  ["in", "im", "il", "ir"],
  "in-/im-/il-/ir- retains all four governed choices",
);
const contractsSource = readFileSync("lib/adle/morphology/dynamic-prefix-contracts.ts", "utf8");
assert(contractsSource.includes("if (payload.presentationPolicyVersion === undefined) return true"), "historical Prefix snapshots remain accepted without applying the forward reviewed-choice policy");

console.log("PASS: Group 1 BUILD convergence (reviewed Prefix choices, connector-aware joined Jigsaw board, historical resume compatibility)");
