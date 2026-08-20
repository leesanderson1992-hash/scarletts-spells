import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const access = readFileSync("lib/adle/morphology/dynamic-prefix-staging-access.ts", "utf8");
const gate = readFileSync("lib/adle/morphology/dynamic-prefix-route-gate.ts", "utf8");
const route = readFileSync("app/learn/week/adle/dynamic-prefix/page.tsx", "utf8");
const legacy = readFileSync("app/learn/week/adle/page.tsx", "utf8");
const resolver = readFileSync("lib/adle/composable-lesson/route-resolution.ts", "utf8");

assert(access.includes('export { isDynamicPrefixRouteEnabled } from "./dynamic-prefix-route-gate"'), "Staging access must delegate to the single Dynamic Prefix route gate.");
assert(gate.includes('ADLE_ROUTE_ACTIVATION_ENVIRONMENT === "staging"'), "The dedicated staged project enables the route even though its stable alias uses Vercel's production target.");
assert(gate.includes('process.env.VERCEL_ENV === "preview"') && gate.includes('ADLE_DYNAMIC_PREFIX_STAGING_ENABLED === "enabled"'), "Dynamic Prefix route must fail closed outside enabled preview deployments.");
assert(gate.includes('process.env.VERCEL_ENV === "production"') && gate.includes('ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED === "enabled"'), "Production requires its own explicit Dynamic Prefix gate.");
assert(route.includes("selectDynamicPrefixWordLab") && route.includes("compileDynamicPrefixWordLabPayload"), "Staging route must compile the generic dynamic selector payload.");
assert(route.includes("createDynamicPrefixStagingAssignmentAction") && !route.includes("DynamicPrefixStagingLab"), "Staging route must create durable work through its explicit action and must not retain a parallel learner renderer.");
assert(legacy.includes("resolvePersistedLessonRoute") && legacy.includes("isDynamicPrefixRouteEnabled"), "ADLE must admit v2 only through the shared route boundary and its explicit release gate.");
assert(resolver.includes("resolveMorphologyPilotRuntime") && resolver.includes("resolveDynamicPrefixRuntime"), "the shared route boundary retains both legacy v1 and Dynamic Prefix v2 adapters.");
console.log("PASS: Dynamic Prefix release gates are isolated from legacy v1");
