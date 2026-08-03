import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { NextRequest } from "next/server";

import {
  DYNAMIC_PREFIX_QA_PATH,
  DYNAMIC_PREFIX_QA_STAGING_SUPABASE_REF,
  DYNAMIC_PREFIX_QA_STAGING_VERCEL_PRODUCTION_URL,
  DYNAMIC_PREFIX_QA_STAGING_VERCEL_PROJECT,
  DYNAMIC_PREFIX_QA_STAGING_VERCEL_PROJECT_ID,
  isDynamicPrefixQaLauncherPath,
  isDynamicPrefixQaUserAuthorized,
  isPinnedDynamicPrefixQaEnvironment,
  shouldPreAuthNotFoundDynamicPrefixQa,
} from "../lib/adle/morphology/dynamic-prefix-qa-policy";
import { proxy } from "../proxy";

type Environment = Record<string, string | undefined>;

const staging: Environment = {
  VERCEL_ENV: "production",
  ADLE_DYNAMIC_PREFIX_QA_ENABLED: "enabled",
  ADLE_ROUTE_ACTIVATION_ENVIRONMENT: "staging",
  ADLE_DYNAMIC_PREFIX_QA_VERCEL_PROJECT_ID: DYNAMIC_PREFIX_QA_STAGING_VERCEL_PROJECT_ID,
  ADLE_DYNAMIC_PREFIX_QA_VERCEL_PROJECT_NAME: DYNAMIC_PREFIX_QA_STAGING_VERCEL_PROJECT,
  VERCEL_PROJECT_PRODUCTION_URL: DYNAMIC_PREFIX_QA_STAGING_VERCEL_PRODUCTION_URL,
  NEXT_PUBLIC_SUPABASE_URL: `https://${DYNAMIC_PREFIX_QA_STAGING_SUPABASE_REF}.supabase.co`,
};
const production: Environment = { VERCEL_ENV: "production" };

for (const pathname of [
  DYNAMIC_PREFIX_QA_PATH,
  `${DYNAMIC_PREFIX_QA_PATH}/`,
  `${DYNAMIC_PREFIX_QA_PATH}///`,
  "/admin/%61dle-dynamic-prefix-qa",
  "/admin/%2561dle-dynamic-prefix-qa",
]) {
  assert.equal(isDynamicPrefixQaLauncherPath(pathname), true, `${pathname}: exact launcher surface`);
  assert.equal(shouldPreAuthNotFoundDynamicPrefixQa(pathname, production), true, `${pathname}: production denied`);
}
for (const pathname of [
  "/admin",
  "/admin/other",
  `${DYNAMIC_PREFIX_QA_PATH}/child`,
  "/learn/week/adle",
  "/learn/week/adle/dynamic-prefix",
  "/",
]) {
  assert.equal(isDynamicPrefixQaLauncherPath(pathname), false, `${pathname}: unrelated path excluded`);
  assert.equal(shouldPreAuthNotFoundDynamicPrefixQa(pathname, production), false, `${pathname}: unrelated production path unchanged`);
}
assert.equal(isPinnedDynamicPrefixQaEnvironment(staging), true, "complete staging identity remains authoritative");
assert.equal(shouldPreAuthNotFoundDynamicPrefixQa(DYNAMIC_PREFIX_QA_PATH, staging), false, "staging stable alias is not pre-auth denied");
assert.equal(shouldPreAuthNotFoundDynamicPrefixQa(DYNAMIC_PREFIX_QA_PATH, { VERCEL_ENV: "preview" }), false, "preview is not production denied");
assert.equal(shouldPreAuthNotFoundDynamicPrefixQa(DYNAMIC_PREFIX_QA_PATH, {}), false, "local development is not production denied");
assert.equal(isDynamicPrefixQaUserAuthorized({ userId: "fixture", isAdmin: false, qaUserIds: "fixture" }), true, "authorised staging policy remains active");

async function main() {
  const saved = { ...process.env };
  async function invoke(url: string, environment: Environment, headers?: HeadersInit) {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, environment);
    return proxy(new NextRequest(url, { headers }));
  }

  try {
    const unauthenticated = await invoke(`https://example.test${DYNAMIC_PREFIX_QA_PATH}`, production);
    assert.equal(unauthenticated.status, 404, "unauthenticated production launcher is a genuine 404");
    assert.equal(unauthenticated.headers.get("location"), null, "production launcher does not redirect");
    assert.equal(unauthenticated.headers.get("cache-control"), "private, no-store");

    const authenticated = await invoke(
      `https://example.test${DYNAMIC_PREFIX_QA_PATH}?child=ignored`,
      production,
      { cookie: "sb-access-token=synthetic-authenticated-request" },
    );
    assert.equal(authenticated.status, 404, "authenticated production launcher is also 404");
    assert.equal(authenticated.headers.get("location"), null, "query and cookie cannot bypass denial");

    const trailing = await invoke(`https://example.test${DYNAMIC_PREFIX_QA_PATH}/?_rsc=fixture`, production);
    assert.equal(trailing.status, 404, "trailing slash and App Router data query remain 404");

    const encoded = await invoke("https://example.test/admin/%61dle-dynamic-prefix-qa", production);
    assert.equal(encoded.status, 404, "encoded exact launcher pathname remains 404");

    const stagingUnauthenticated = await invoke(`https://example.test${DYNAMIC_PREFIX_QA_PATH}`, staging);
    assert.equal(stagingUnauthenticated.status, 307, "staging retains normal admin authentication");
    assert.equal(new URL(stagingUnauthenticated.headers.get("location")!).pathname, "/login");

    const otherAdmin = await invoke("https://example.test/admin/other", production);
    assert.equal(otherAdmin.status, 307, "unrelated admin route retains authentication redirect");
    assert.equal(new URL(otherAdmin.headers.get("location")!).pathname, "/login");

    for (const pathname of ["/", "/learn/week/adle", "/learn/week/adle/dynamic-prefix"]) {
      const response = await invoke(`https://example.test${pathname}`, production);
      assert.equal(response.status, 200, `${pathname}: public/learner route unchanged`);
      assert.equal(response.headers.get("location"), null);
    }
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  }

  const proxySource = readFileSync("proxy.ts", "utf8");
  const preAuthIndex = proxySource.indexOf("shouldPreAuthNotFoundDynamicPrefixQa(pathname, process.env)");
  assert(preAuthIndex >= 0, "proxy invokes the exact QA pre-auth policy");
  assert(preAuthIndex < proxySource.indexOf("readSupabaseEnv()"), "404 occurs before Supabase environment access");
  assert(preAuthIndex < proxySource.indexOf("createServerClient(url, anonKey"), "404 occurs before authentication client creation");

  const accessSource = readFileSync("lib/adle/morphology/dynamic-prefix-qa-access.ts", "utf8");
  assert(accessSource.includes("if (!isPinnedDynamicPrefixQaEnvironment(process.env)) notFound()"), "page-level production notFound remains as defence in depth");

  console.log("PASS: Dynamic Prefix QA exact-path production pre-auth 404, staging auth, and unrelated-route isolation");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
