import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`ADLE child route read-only regression failed: ${message}`);
  }
}

const page = readFileSync("app/learn/week/adle/page.tsx", "utf8");

assert(
  !page.includes("ensureAdleDailyPlan"),
  "child ADLE route must not import or call ensureAdleDailyPlan",
);
assert(
  page.includes("getExistingAdleDailyPlanId"),
  "child ADLE route should read an existing ADLE header before loading the read model",
);
assert(
  page.includes("Today&apos;s spelling plan has not been set up yet"),
  "empty state should explain that generation is explicit, not a rest-day composer result",
);

console.log("ADLE child route read-only regression passed.");
