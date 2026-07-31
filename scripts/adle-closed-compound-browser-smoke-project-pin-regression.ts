import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ADLE_PRODUCTION_PROJECT_REF,
  ADLE_STAGING_PROJECT_REF,
  assertClosedCompoundBrowserSmokeStagingProject,
  resolveClosedCompoundBrowserSmokeConfig,
} from "./lib/adle-closed-compound-browser-smoke-config";

const stagingUrl = `https://${ADLE_STAGING_PROJECT_REF}.supabase.co`;
const productionUrl = `https://${ADLE_PRODUCTION_PROJECT_REF}.supabase.co`;

assert.equal(
  assertClosedCompoundBrowserSmokeStagingProject(stagingUrl),
  `${stagingUrl}/`,
  "the verified staging project is accepted",
);
assert.throws(
  () => assertClosedCompoundBrowserSmokeStagingProject(productionUrl),
  /requires jlhotktspjvffslvuyfz/,
  "the production project is rejected",
);
assert.throws(
  () =>
    assertClosedCompoundBrowserSmokeStagingProject(
      "https://unknown-project.supabase.co",
    ),
  /requires jlhotktspjvffslvuyfz/,
  "an unknown project is rejected",
);
assert.throws(
  () => assertClosedCompoundBrowserSmokeStagingProject(undefined),
  /Missing NEXT_PUBLIC_SUPABASE_URL/,
  "missing project identity is rejected",
);
assert.throws(
  () => assertClosedCompoundBrowserSmokeStagingProject("not a URL"),
  /Invalid NEXT_PUBLIC_SUPABASE_URL/,
  "malformed project identity is rejected",
);

let credentialRead = false;
const productionEnvironment = new Proxy(
  { NEXT_PUBLIC_SUPABASE_URL: productionUrl } as unknown as NodeJS.ProcessEnv,
  {
    get(target, property, receiver) {
      if (
        property === "SB_SERVICE_ROLE_KEY" ||
        property === "SUPABASE_SERVICE_ROLE_KEY" ||
        property === "ADLE_BROWSER_SMOKE_PASSWORD"
      ) {
        credentialRead = true;
      }
      return Reflect.get(target, property, receiver);
    },
  },
);
assert.throws(
  () => resolveClosedCompoundBrowserSmokeConfig(productionEnvironment, "setup"),
  /requires jlhotktspjvffslvuyfz/,
);
assert.equal(
  credentialRead,
  false,
  "project identity fails before credentials or a mutating mode can be prepared",
);

const source = readFileSync(
  "scripts/adle-closed-compound-browser-smoke.ts",
  "utf8",
);
const configurationIndex = source.indexOf(
  "resolveClosedCompoundBrowserSmokeConfig(process.env, process.argv[2])",
);
const clientIndex = source.indexOf("createClient(url, serviceRoleKey");
const dispatchIndex = source.indexOf(
  '(mode === "setup" ? setup() : cleanup())',
);
assert(
  configurationIndex >= 0 &&
    clientIndex > configurationIndex &&
    dispatchIndex > clientIndex,
  "identity validation must complete before client creation and setup/cleanup dispatch",
);
assert(
  source.includes("const planDate = getDateOnly()") &&
    source.includes("assignment_date: planDate") &&
    source.includes('assignment_generation_source: "adle_composer_v1"') &&
    source.includes('title: "ADLE Daily Plan"') &&
    source.includes("metadata: { ...(item.metadata ?? {}), planDate }") &&
    source.includes("adle-closed-compound-browser-smoke:${assignment.id}:${item.position}"),
  "the disposable clone must use today's date and fixture-owned item provenance",
);

console.log("Closed Compound staging browser-smoke project pin regression passed.");
