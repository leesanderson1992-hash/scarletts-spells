/** Read-only, isolated staging measurements for the two editor read paths. */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { loadLessonReadiness } from "../lib/teaching-dictionary-manager/lesson-preflight";
import {
  loadTeachingDictionaryEvidenceAuthority,
  loadTeachingDictionaryEvidenceAuthorityForWord,
} from "../lib/teaching-dictionary-manager/evidence-authority";

const ref = "qkpjbajicacbrphthibk";
assert.equal(process.env.SUPABASE_STAGING_PROJECT_REF, ref);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, `https://${ref}.supabase.co`);
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, "staging");

const wordId = process.argv[2];
assert.match(wordId ?? "", /^[0-9a-f-]{36}$/i, "Pass a staging canonical word ID");

const originalFetch = globalThis.fetch;
let capture: { requests: number; decodedBytes: number } | null = null;
globalThis.fetch = async (request, init) => {
  const response = await originalFetch(request, init);
  const url = typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
  if (capture && new URL(url).host === `${ref}.supabase.co`) {
    capture.requests += 1;
    capture.decodedBytes += (await response.clone().arrayBuffer()).byteLength;
  }
  return response;
};

async function measure<T>(name: string, run: () => Promise<T>) {
  capture = { requests: 0, decodedBytes: 0 };
  const started = performance.now();
  try {
    const result = await run();
    return { name, durationMs: Math.round(performance.now() - started), ...capture, result };
  } finally {
    capture = null;
  }
}

async function main() {
  const db = createServiceRoleClient();
  const environment = "staging";
  const global = await measure("global_relationship_authority", () => loadTeachingDictionaryEvidenceAuthority(db, environment));
  const scoped = await measure("word_relationship_authority", () => loadTeachingDictionaryEvidenceAuthorityForWord(db, environment, wordId));
  const pairs = (rows: typeof global.result.relationships) => rows
    .filter(row => row.canonicalWordId === wordId)
    .map(row => `${row.canonicalWordId}:${row.microSkillKey}:${row.relationshipRole}`).sort();
  assert.deepEqual(pairs(scoped.result.relationships), pairs(global.result.relationships), "Word-scoped approval decisions changed");
  const approvedSkillKeys = scoped.result.relationships.map(row => row.microSkillKey);
  const readiness = await measure("word_lesson_readiness", () => loadLessonReadiness({ wordId, approvedSkillKeys }));
  console.log(JSON.stringify({ event: "teaching_dictionary_speed_staging_v1", wordId,
    measures: [global, scoped, readiness].map(({ result, ...metric }) => ({ ...metric,
      ...(Array.isArray(result) ? { routeCount: result.length } : { approvedPairCount: pairs(result.relationships).length }),
    })),
    decisionsEqual: true,
  }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
