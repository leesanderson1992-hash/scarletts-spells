import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadWeakVowelFamilyPrefill } from "../lib/teaching-dictionary-manager/weak-vowel-family-prefill";
import { loadWeakVowelFamilies } from "../lib/adle/weak-vowel/family-loader";
import type { PublishedWeakVowelWord } from "../lib/adle/weak-vowel/governed-content";

const sourceId = "11111111-1111-4111-8111-111111111111";
const canonicalId = "22222222-2222-4222-8222-222222222222";
const baseId = "33333333-3333-4333-8333-333333333333";
const targetId = "44444444-4444-4444-8444-444444444444";
const hash = "a".repeat(64);
const tables: Record<string, Record<string, unknown>[]> = {
  canonical_teaching_dictionary_base_word_family_members: [baseId, targetId].map((id) => ({
    base_word_family_id: sourceId, canonical_word_id: id, assignment_eligible: true,
    row_status: "active", review_status: "approved_for_first_exposure", word_sum: null,
  })),
  canonical_teaching_dictionary_base_word_families: [{ id: sourceId, base_family_key: "nature_base_family",
    base_word_id: baseId, base_meaning: "the natural world", source_row_hash: hash,
    created_at: "2026-08-01T00:00:00Z", row_status: "active", review_status: "approved_for_first_exposure" }],
  canonical_teaching_dictionary_words: [
    { id: baseId, display_word: "nature" }, { id: targetId, display_word: "natural" },
  ].map((word) => ({ ...word, row_status: "active", review_status: "approved_for_first_exposure", dialect_code: "en-GB" })),
  canonical_teaching_dictionary_base_family_registry_aliases: [{ source_type: "legacy_base",
    source_key: "nature_base_family", canonical_family_id: canonicalId, source_record_ids: [sourceId] }],
  canonical_teaching_dictionary_base_family_registry_members: [baseId, targetId].map((id) => ({
    canonical_family_id: canonicalId, canonical_word_id: id,
  })),
};

function client(): SupabaseClient {
  return { from(name: string) {
    let rows = [...(tables[name] ?? [])];
    const query = {
      select(_columns: string) { return query; },
      eq(column: string, value: unknown) { rows = rows.filter((row) => row[column] === value); return query; },
      in(column: string, values: unknown[]) { rows = rows.filter((row) => values.includes(row[column])); return query; },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then(resolve: (result: { data: Record<string, unknown>[]; error: null }) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return query;
  } } as unknown as SupabaseClient;
}

async function main() {
const prefill = await loadWeakVowelFamilyPrefill(client(), targetId);
assert.equal(prefill.status, "ready");
assert.equal(prefill.authorityId, sourceId, "approved source remains pinned for editorial review");
assert.equal(prefill.canonicalFamilyId, canonicalId, "merged identity prefills separately");

function selected(canonicalFamilyId?: string): PublishedWeakVowelWord {
  return { canonicalWordId: targetId, spelling: "natural", routeContent: {
    content: { weakVowel: { familyDecision: "approve", familyAuthorityId: sourceId,
      canonicalFamilyId: canonicalFamilyId ?? null } },
  } } as unknown as PublishedWeakVowelWord;
}
const canonical = await loadWeakVowelFamilies({ client: client(), selected: [selected(canonicalId)] });
assert.equal(canonical.published[0].family.authorityId, canonicalId);
assert.equal(canonical.current[0].authorityId, canonicalId);
assert.deepEqual(canonical.published[0].family.members.map((member) => member.spelling), ["nature", "natural"]);
assert.equal(canonical.published[0].family.sourceFingerprint, hash);

const historical = await loadWeakVowelFamilies({ client: client(), selected: [selected()] });
assert.equal(historical.published[0].family.authorityId, sourceId,
  "published lessons without a canonical ID retain their source identity");
await assert.rejects(loadWeakVowelFamilies({ client: client(),
  selected: [selected("55555555-5555-4555-8555-555555555555")] }),
  /WEAK_VOWEL_CANONICAL_FAMILY_BINDING_STALE/);
console.log("Weak-vowel canonical family identity regression passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
