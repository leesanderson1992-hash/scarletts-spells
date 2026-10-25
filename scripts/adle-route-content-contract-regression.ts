import assert from "node:assert/strict";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "../lib/adle/curriculum-readiness/route-registry";
import {
  routeContentContractFor,
  routeContentContractInventory,
} from "../lib/adle/composable-lesson/route-content-contract";
import { recordAdleReadPage, withAdleReadMetrics } from "../lib/adle/observability/read-metrics";

const contracts = routeContentContractInventory();
const expectedCount = ADLE_CURRICULUM_ROUTE_REGISTRY.reduce((count, route) =>
  count + (route.compatibilityScope.kind === "generic_composer_fallback"
    ? 1 : route.supportedMicroSkillKeys.length), 0);
assert.equal(contracts.length, expectedCount);
for (const contract of contracts) {
  const route = ADLE_CURRICULUM_ROUTE_REGISTRY.find((item) => item.routeId === contract.routeId)!;
  assert.equal(contract.activities.filter((activity) => !activity.conditional).length, route.requiredActivities.length);
  assert.deepEqual(contract.wordCounts, route.wordCounts);
  assert.deepEqual(contract.coverageRequirements, route.coverageRequirements);
  for (const activity of contract.activities) {
    assert(activity.requiredFacts.length > 0 || activity.wordScope === "no_word");
    assert.equal(typeof activity.variantKey, "string");
    assert.equal(typeof activity.position, "number");
  }
}
assert.equal(routeContentContractFor("unknown", "D4_UNKNOWN"), null);
assert.equal(routeContentContractFor("homophone_word_lab", "D4_UNKNOWN"), null);

const homophone = contracts.find((item) => item.routeId === "homophone_word_lab")!;
assert.deepEqual(homophone.wordCounts.lesson, [2, 4]);
assert(homophone.coverageRequirements.includes("distinct_forms"));
assert(homophone.coverageRequirements.includes("unique_dictation_sentences"));
assert.equal(homophone.wordSupportAuthority, "route_content");
assert(homophone.activities.some((activity) => activity.kind === "meaning_sort"));

const ity = routeContentContractFor("dynamic_affix_word_lab", "D4_MOR_SUFFIXES_ITY")!;
const itySort = ity.activities.find((activity) => activity.kind === "meaning_sort")!;
assert.equal(itySort.conditional, true);
assert.equal(itySort.enabled, false);
assert.equal(ity.activities.find((activity) => activity.kind === "cleaver")?.wordScope, "selected_examples");
assert(ity.activities.some((activity) => activity.requiredFacts.some(
  (fact) => fact.factKey === "route_applicability" && fact.owner === "reviewed_word_route_facts")));

const generic = routeContentContractFor("generic_composer", "D4_EXAMPLE")!;
assert.equal(generic.activities.filter((activity) => activity.kind === "dictation").length, 1);
assert(generic.activities.some((activity) => activity.requiredFacts.some(
  (fact) => fact.factKey === "word_micro_skill_support")));

async function checkMetrics() {
const oldFlag = process.env.ADLE_READ_METRICS_ENABLED;
const oldInfo = console.info;
const emitted: Record<string, unknown>[] = [];
console.info = (value: unknown) => { emitted.push(JSON.parse(String(value)) as Record<string, unknown>); };
try {
  process.env.ADLE_READ_METRICS_ENABLED = "1";
  await Promise.all([
    withAdleReadMetrics("one", async () => {
      recordAdleReadPage("words", [{ secret: "private spelling" }], 4);
      await new Promise((resolve) => setTimeout(resolve, 1));
      recordAdleReadPage("words", [], 2);
    }),
    withAdleReadMetrics("two", async () => {
      recordAdleReadPage("skills", [{ id: 1 }, { id: 2 }], 3);
    }),
  ]);
  assert.equal(emitted.length, 2);
  const one = emitted.find((item) => item.operation === "one")!;
  const two = emitted.find((item) => item.operation === "two")!;
  assert.equal(one.instrumentedQueryCount, 2);
  assert.equal(one.instrumentedRows, 1);
  assert.equal(two.instrumentedQueryCount, 1);
  assert.equal(two.instrumentedRows, 2);
  assert(!JSON.stringify(emitted).includes("private spelling"));
  process.env.ADLE_READ_METRICS_ENABLED = "0";
  await withAdleReadMetrics("disabled", async () => recordAdleReadPage("words", [{}], 1));
  assert.equal(emitted.length, 2);
} finally {
  console.info = oldInfo;
  if (oldFlag === undefined) delete process.env.ADLE_READ_METRICS_ENABLED;
  else process.env.ADLE_READ_METRICS_ENABLED = oldFlag;
}
console.log(`ADLE route content contracts: ${contracts.length} route/skill contracts and aggregate read metrics passed.`);
}
checkMetrics().catch((error) => { console.error(error); process.exitCode = 1; });
