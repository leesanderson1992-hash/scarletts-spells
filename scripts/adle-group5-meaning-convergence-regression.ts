import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { ADLE_ACTIVITY_CATALOGUE, ADLE_ACTIVITY_IMPLEMENTATION_AUDIT } from "../lib/adle/activity-catalogue";
import { resolveActivityTemplateDefinition } from "../lib/adle/activity-template-registry";

const source = (path: string) => readFileSync(path, "utf8");
const binSort = source("components/adle/activities/shared/bin-sort.tsx");
const morphology = source("components/adle/morphology/morphology-guided-lesson.tsx");
const match = source("components/adle/morphology/meaning-connection-activity.tsx");
const session = source("components/adle-session-runner.tsx");
const composer = source("lib/adle/daily-assignment-composer.ts");
const snapshotRegistry = source("lib/adle/composable-lesson/generic-snapshot-registry.ts");

assert(!existsSync("components/adle/activities/quick-sort-activity.tsx"), "QuickSort learner renderer must be retired");
assert(!existsSync("components/adle/activities/shared/flip-toggle.tsx"), "FlipToggle prototype must be retired");
assert(!source("components/adle/activities/morphology/shared/morphology-primitives.tsx").includes("MeaningFlip"), "MeaningFlip prototype must be retired");
assert(!morphology.includes("function MeaningCards") && !morphology.includes("function MeaningOverview"), "route-local Meaning recap implementations must be retired");

assert(binSort.includes("function BinSortOverview") && binSort.includes("if (complete && props.showOverview !== false)"), "Overview must be an internal BinSort completion view");
assert(binSort.includes('data-testid="bin-sort-success"') && binSort.includes("useReducedMotion") && binSort.includes("setTimeout"), "BinSort must own bounded reduced-motion-aware success feedback");
assert(binSort.includes("setIndex((current) => current + 1)") && binSort.includes("onComplete.current?.(result.placements)"), "correct placement must advance deterministically and preserve completion callback");
for (const forbidden of ["completeAdleLessonPartAction", "completeAdleReviewPartAction", "supabase", "fetch(", "localStorage", "sessionStorage"]) assert(!binSort.includes(forbidden), `BinSort presentation must not own ${forbidden}`);

assert(morphology.includes("export function Discovery") && morphology.includes("affixTerm") && morphology.includes("prefixLabel") && !morphology.includes("HearWordButton"), "one Discovery engine must accept Prefix/Affix configuration without a word-listen control");
assert(match.includes("export function MeaningConnectionActivity") && match.includes("componentMeanings") && !match.includes("HearWordButton"), "one rich Meaning Match engine must retain clues and connections without a word-listen control");
assert(binSort.includes("binSortTickZoom") && binSort.includes("SUCCESS_SPARKLES") && !binSort.includes("bg-emerald-100"), "correct Sort feedback must use a zooming tick and background sparkles without a colour block");
assert(morphology.includes('showBinDescriptions={props.payload.words.anchor.affixPosition !== "after"}'), "Suffix Sort must keep its categories to the concise labels only");
assert(session.includes('rendererKinds: readonly ActivityRendererKind[]') && session.includes("meaningConnectionTarget") && session.includes("Historical meaning activity compatibility"), "generic dispatch must select rich Match and isolate definition-less compatibility fallback");

assert(!composer.includes('templateKey: "REVIEW_QUICK_SORT"') && !composer.includes('sectionKey: "review_quick_sort"'), "forward composer must not generate QuickSort");
assert(resolveActivityTemplateDefinition({ templateKey: "REVIEW_QUICK_SORT", sectionKey: "review_quick_sort" }).rendererKind === "compatibility_noop", "historical REVIEW_QUICK_SORT must normalize to no learner renderer");
assert(snapshotRegistry.includes('rendererKind: "quick_sort"'), "immutable generic snapshot v2 must retain historical quick_sort decoding");

for (const key of ["HOM_MEANING_MATCH", "MOR_MEANING_MATCH", "MOR_COMPOUND_MEANING_CONNECTION"]) assert(resolveActivityTemplateDefinition({ templateKey: key, sectionKey: "guided_practice" }).rendererKind === "meaning_match", `${key} must select canonical Meaning Match`);
assert.equal(ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "MEANING_DISCOVERY")?.canonicalComponent, "Discovery");
assert.equal(ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "MEANING_MATCH")?.canonicalComponent, "MeaningConnectionActivity");
assert.equal(ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "MEANING_SORT")?.canonicalComponent, "BinSort");
assert.equal(ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === "REVIEW_SORT")?.status, "COMPATIBILITY_ONLY");
assert.equal(ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.find((row) => row.implementationName === "BinSortOverview")?.classification, "CANONICAL_MODE");
assert.equal(ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.find((row) => row.implementationName === "SelectedPrefixFeedback")?.classification, "CANONICAL_MODE");
assert(!ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.some((row) => ["QuickSortActivity", "FlipToggle", "MeaningFlip", "MeaningCards", "MeaningOverview"].includes(row.implementationName)), "retired implementations must leave the live audit inventory");

console.log("PASS: Group 5 has one Discover, Match and Sort engine; BinSort owns sparkle/Overview; QuickSort is compatibility-key-only");
