import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const access = readFileSync("lib/adle/morphology/dynamic-prefix-staging-access.ts", "utf8");
const gate = readFileSync("lib/adle/morphology/dynamic-prefix-route-gate.ts", "utf8");
const route = readFileSync("app/learn/week/adle/dynamic-prefix/page.tsx", "utf8");
const renderer = readFileSync("components/adle/morphology/dynamic-prefix-staging-lab.tsx", "utf8");
const legacy = readFileSync("app/learn/week/adle/page.tsx", "utf8");

assert(access.includes('export { isDynamicPrefixRouteEnabled } from "./dynamic-prefix-route-gate"'), "Staging access must delegate to the single Dynamic Prefix route gate.");
assert(gate.includes('process.env.VERCEL_ENV === "preview"') && gate.includes('ADLE_DYNAMIC_PREFIX_STAGING_ENABLED === "enabled"'), "Dynamic Prefix route must fail closed outside enabled preview deployments.");
assert(gate.includes('process.env.VERCEL_ENV === "production"') && gate.includes('ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED === "enabled"'), "Production requires its own explicit Dynamic Prefix gate.");
assert(route.includes("selectDynamicPrefixWordLab") && route.includes("compileDynamicPrefixWordLabPayload"), "Staging route must compile the generic dynamic selector payload.");
assert(renderer.includes("This staging-only route does not replace the fixed un- Word Lab") && route.includes("createDynamicPrefixStagingAssignmentAction"), "Staging route must retain legacy isolation and create durable work only through its explicit staging action.");
assert(legacy.includes("resolveMorphologyPilotRuntime") && legacy.includes("resolveDynamicPrefixRuntime") && legacy.includes("isDynamicPrefixRouteEnabled"), "ADLE must admit v2 only through its explicit release gate while retaining its legacy resolver.");
console.log("PASS: Dynamic Prefix release gates are isolated from legacy v1");
