/* eslint-disable @typescript-eslint/no-explicit-any -- small PostgREST read fixture */
import assert from "node:assert/strict";
import { loadCanonicalWordSkillRelationshipAuthority } from "../lib/adle/word-skill-relationships/repository";
import { loadPublishedWritingAssociations } from "../lib/writing-engine/whole-writing/knowledge-repository";

const tables: Record<string, any[]> = {
  canonical_teaching_dictionary_words: [
    { id: "word-a", normalised_word: "alpha", row_status: "active" },
    { id: "word-b", normalised_word: "beta", row_status: "active" },
    { id: "word-dup-1", normalised_word: "duplicate", row_status: "active" },
    { id: "word-dup-2", normalised_word: "duplicate", row_status: "active" },
  ],
  micro_skill_catalog: [{ micro_skill_key: "SKILL", is_active: true }],
  spelling_canonical_mappings: [
    { id: "mapping-a", misspelling_normalized: "alfa", correct_spelling_normalized: "alpha", micro_skill_key: "SKILL", mapping_status: "active", resolver_visibility_status: "visible", normalization_version: "v1" },
    { id: "mapping-dup", misspelling_normalized: "dupplicate", correct_spelling_normalized: "duplicate", micro_skill_key: "SKILL", mapping_status: "active", resolver_visibility_status: "visible", normalization_version: "v1" },
  ],
  spelling_canonical_mapping_events: [
    { id: "event-a", mapping_id: "mapping-a", event_type: "resolver_visibility_enabled", new_resolver_visibility_status: "visible" },
    { id: "event-dup", mapping_id: "mapping-dup", event_type: "resolver_visibility_enabled", new_resolver_visibility_status: "visible" },
  ],
  canonical_teaching_dictionary_word_support: [
    { id: "support-b", import_batch_id: "batch", canonical_word_id: "word-b", micro_skill_key: "SKILL", support_role: "support_example", row_status: "active", review_status: "approved_for_first_exposure", source_row_hash: "hash-b" },
  ],
  canonical_teaching_dictionary_import_batches: [{ id: "batch", batch_status: "applied", source_commit: "commit", source_folder_sha256: null }],
  canonical_teaching_dictionary_prefix_profiles: [],
  canonical_teaching_dictionary_prefix_members: [],
  canonical_teaching_dictionary_suffix_profiles: [],
  canonical_teaching_dictionary_suffix_members: [],
  teaching_dictionary_pair_latest_decisions: [{ id: "decision-b", canonical_word_id: "word-b", micro_skill_key: "SKILL", action: "deassign", environment_key: "staging" }],
  adle_route_activation_heads: [],
  adle_reviewed_word_skill_releases: [
    { id: "release-a", release_key: "a", reviewed_by: "reviewer", environment_key: "staging" },
    { id: "release-b", release_key: "b", reviewed_by: "reviewer", environment_key: "staging" },
  ],
  adle_reviewed_word_skill_pairs: [
    { id: "pair-a", release_id: "release-a", canonical_word_id: "word-a", micro_skill_key: "SKILL", relationship_role: "demonstrates", source_reference: "synthetic", licence_reference: "synthetic" },
    { id: "pair-b", release_id: "release-b", canonical_word_id: "word-b", micro_skill_key: "SKILL", relationship_role: "demonstrates", source_reference: "synthetic", licence_reference: "synthetic" },
  ],
  adle_reviewed_word_skill_withdrawals: [{ release_id: "release-b" }],
};

const reads: { table: string; rows: number }[] = [];
class Query {
  private filters: ((row: any) => boolean)[] = [];
  private sortKey: string | null = null;
  private take: number | null = null;
  private window: [number, number] | null = null;
  constructor(private table: string) {}
  select(columns: string) { void columns; return this; }
  eq(key: string, value: unknown) { this.filters.push((row) => row[key] === value); return this; }
  in(key: string, values: unknown[]) { this.filters.push((row) => values.includes(row[key])); return this; }
  gt(key: string, value: string) { this.filters.push((row) => String(row[key]) > value); return this; }
  order(key: string) { this.sortKey = key; return this; }
  limit(value: number) { this.take = value; return this; }
  range(start: number, end: number) { this.window = [start, end]; return this; }
  then(resolve: (value: { data: any[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
    let data = (tables[this.table] ?? []).filter((row) => this.filters.every((filter) => filter(row)));
    if (this.sortKey) data = [...data].sort((a, b) => String(a[this.sortKey!]).localeCompare(String(b[this.sortKey!])));
    if (this.window) data = data.slice(this.window[0], this.window[1] + 1);
    if (this.take !== null) data = data.slice(0, this.take);
    reads.push({ table: this.table, rows: data.length });
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  }
}
const client = { from(table: string) { return new Query(table); } } as any;

async function main() {
  const fullAssociations = await loadPublishedWritingAssociations(client, "staging");
  const full = await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: "staging", explicitReviewedAssociations: fullAssociations });
  const fullWordRows = reads.filter((read) => read.table === "canonical_teaching_dictionary_words").reduce((sum, read) => sum + read.rows, 0);
  assert.equal(fullWordRows, 4);
  reads.length = 0;
  const reused = await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: "staging",
    explicitReviewedAssociations: fullAssociations,
    genericSupportSourceRows: tables.canonical_teaching_dictionary_word_support });
  assert.deepEqual(reused, full, "preloaded support source preserves relationship decisions and fingerprint");
  assert.equal(reads.filter((read) => read.table === "canonical_teaching_dictionary_word_support").length, 0,
    "preloaded support source avoids a second support-table read");
  for (const id of ["word-a", "word-b", "word-dup-1", "word-dup-2"]) {
    reads.length = 0;
    const associations = await loadPublishedWritingAssociations(client, "staging", id);
    const scoped = await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: "staging", explicitReviewedAssociations: associations, canonicalWordId: id });
    assert.deepEqual(scoped.relationships, full.relationships.filter((row) => row.canonicalWordId === id), `${id} admitted pairs`);
    assert.deepEqual(scoped.decisions.filter((row) => row.canonicalWordId === id), full.decisions.filter((row) => row.canonicalWordId === id), `${id} decisions`);
    if (id === "word-a" || id === "word-b") {
      assert.equal(reads.filter((read) => read.table === "canonical_teaching_dictionary_words").reduce((sum, read) => sum + read.rows, 0), 2, "one target identity plus spelling collision check");
      assert.ok(!reads.some((read) => read.table === "canonical_teaching_dictionary_word_support" && read.rows > 1));
    }
  }
  reads.length = 0;
  const batchIds = ["word-a", "word-b", "word-dup-1", "word-dup-2"];
  const batchAssociations = await loadPublishedWritingAssociations(client, "staging", batchIds);
  const batch = await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: "staging",
    explicitReviewedAssociations: batchAssociations, canonicalWordIds: batchIds });
  assert.deepEqual(batch.relationships, full.relationships, "batch interpretation matches complete authority");
  assert.deepEqual(batch.decisions, full.decisions, "batch decisions match complete authority");
  const batchWordRows = reads.filter((read) => read.table === "canonical_teaching_dictionary_words").reduce((sum, read) => sum + read.rows, 0);
  assert.equal(batchWordRows, 8, "batch retrieves four target identities and four spelling collision rows");
  assert.equal(reads.filter((read) => read.table === "canonical_teaching_dictionary_word_support").length, 1,
    "batch support read uses one ID-filtered query");
  assert.equal(full.relationships.filter((row) => row.canonicalWordId === "word-a").length, 1, "reviewed and resolver evidence admitted");
  assert.equal(full.relationships.filter((row) => row.canonicalWordId === "word-b").length, 0, "deassignment and withdrawal respected");
  assert.equal(full.relationships.filter((row) => row.canonicalWordId.startsWith("word-dup")).length, 0, "unstable spelling identity blocked");
  console.log("ADLE word-scoped governed read regression passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
