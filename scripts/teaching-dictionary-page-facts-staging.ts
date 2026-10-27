/** Compare the compact list read with the previous eight-query projection. */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createServiceRoleClient } from "../lib/supabase/service-role";

const ref = "qkpjbajicacbrphthibk";
assert.equal(process.env.SUPABASE_STAGING_PROJECT_REF, ref);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, `https://${ref}.supabase.co`);
const db = createServiceRoleClient();
const originalFetch = globalThis.fetch;
let capture: { requests: number; decodedBytes: number } | null = null;
globalThis.fetch = async (request, init) => {
  const response = await originalFetch(request, init);
  const url = typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
  if (capture && new URL(url).host === `${ref}.supabase.co`) {
    capture.requests++;
    capture.decodedBytes += (await response.clone().arrayBuffer()).byteLength;
  }
  return response;
};
async function measure<T>(run: () => Promise<T>) {
  capture = { requests: 0, decodedBytes: 0 };
  const started = performance.now();
  try { return { result: await run(), durationMs: Math.round(performance.now() - started), ...capture }; }
  finally { capture = null; }
}
async function read(table: string, columns: string, ids?: string[]) {
  const query = db.from(table).select(columns).order("id");
  const result = await (ids ? query.in("canonical_word_id", ids) : query);
  if (result.error) throw result.error;
  return result.data as Record<string, unknown>[];
}
async function oldFacts(ids: string[]) {
  const [metadata, dictation, prefix, suffix, base, prefixProfiles, suffixProfiles, routeContent] = await Promise.all([
    read("canonical_teaching_dictionary_word_metadata", "id,canonical_word_id,row_status,review_status,syllables,written_syllable_breakdown,phoneme_hint,stress_pattern,has_schwa,morphemes,morphology_notes", ids),
    read("canonical_teaching_dictionary_dictation_sentences", "id,canonical_word_id,row_status,review_status", ids),
    read("canonical_teaching_dictionary_prefix_members", "id,canonical_word_id,prefix_profile_id,row_status", ids),
    read("canonical_teaching_dictionary_suffix_members", "id,canonical_word_id,suffix_profile_id,row_status", ids),
    read("canonical_teaching_dictionary_base_word_family_members", "id,canonical_word_id,row_status", ids),
    read("canonical_teaching_dictionary_prefix_profiles", "id,micro_skill_key,row_status,production_enabled"),
    read("canonical_teaching_dictionary_suffix_profiles", "id,micro_skill_key,row_status,production_enabled"),
    read("teaching_dictionary_route_content_versions", "id,canonical_word_id,route_id,micro_skill_key", ids),
  ]);
  const profileKeys = (rows: Record<string, unknown>[]) => new Map(rows
    .filter(row => row.row_status === "active" && row.production_enabled)
    .map(row => [row.id, row.micro_skill_key]));
  const prefixKeys = profileKeys(prefixProfiles);
  const suffixKeys = profileKeys(suffixProfiles);
  const members = [
    ...prefix.filter(row => row.row_status === "active" && prefixKeys.has(row.prefix_profile_id))
      .map(row => `${row.canonical_word_id}:${prefixKeys.get(row.prefix_profile_id)}`),
    ...suffix.filter(row => row.row_status === "active" && suffixKeys.has(row.suffix_profile_id))
      .map(row => `${row.canonical_word_id}:${suffixKeys.get(row.suffix_profile_id)}`),
    ...base.filter(row => row.row_status === "active").map(row => `${row.canonical_word_id}:base_word_lab`),
  ];
  return { metadata: metadata.filter(row => row.row_status === "active")
      .map(({ id: _id, ...row }) => { void _id; return row; }),
    dictation: dictation.filter(row => row.row_status === "active" && row.review_status === "approved_for_first_exposure")
      .map(({ id: _id, ...row }) => { void _id; return row; }),
    members: [...new Set(members)].sort(),
    content: [...new Set(routeContent.map(row => `${row.canonical_word_id}:${row.micro_skill_key}`))].sort(),
  };
}
async function newFacts(ids: string[]) {
  const response = await db.rpc("teaching_dictionary_admin_page_facts", { p_word_ids: ids });
  if (response.error) throw response.error;
  const data = response.data as { metadata: Record<string, unknown>[]; dictation: Record<string, unknown>[];
    route_members: { canonical_word_id: string; micro_skill_key: string }[];
    route_content: { canonical_word_id: string; micro_skill_key: string }[] };
  return { metadata: data.metadata, dictation: data.dictation,
    members: [...new Set(data.route_members.map(row => `${row.canonical_word_id}:${row.micro_skill_key}`))].sort(),
    content: [...new Set(data.route_content.map(row => `${row.canonical_word_id}:${row.micro_skill_key}`))].sort(),
  };
}
async function main() {
  const count = await db.rpc("teaching_dictionary_admin_filtered_page", {
    p_filter: "all", p_search: "", p_word_ids: null, p_limit: 50, p_offset: 0,
  });
  if (count.error) throw count.error;
  const total = (count.data as { total: number }).total;
  const scenarios = [
    ...Array.from({ length: Math.ceil(total / 50) }, (_, index) => ({ filter: "all", q: "", offset: index * 50 })),
    { filter: "all", q: "careful", offset: 0 },
    { filter: "missing_metadata", q: "", offset: 0 },
  ];
  const results = [];
  for (const scenario of scenarios) {
    const page = await db.rpc("teaching_dictionary_admin_filtered_page", {
      p_filter: scenario.filter, p_search: scenario.q, p_word_ids: null, p_limit: 50, p_offset: scenario.offset,
    });
    if (page.error) throw page.error;
    const ids = ((page.data as { words: { id: string }[] }).words ?? []).map(row => row.id);
    const oldRead = await measure(() => oldFacts(ids));
    const newRead = await measure(() => newFacts(ids));
    assert.deepEqual(newRead.result, oldRead.result, `Page facts changed: ${JSON.stringify(scenario)}`);
    results.push({ scenario, words: ids.length,
      previous: { durationMs: oldRead.durationMs, requests: oldRead.requests, decodedBytes: oldRead.decodedBytes },
      compact: { durationMs: newRead.durationMs, requests: newRead.requests, decodedBytes: newRead.decodedBytes },
    });
  }
  console.log(JSON.stringify({ event: "teaching_dictionary_page_facts_staging_v1", passed: true, results }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
