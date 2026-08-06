/* Supabase's fluent type is deliberately replaced by a read-only fake here. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadDynamicSuffixProfiles } from "../lib/adle/morphology/dynamic-suffix-profile-loader";

const reviewed = JSON.parse(readFileSync(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-27-dynamic-suffix-ness/reviewed-staging-package.json",
  "utf8",
));

const member = (word: any, overrides: Record<string, unknown> = {}) => ({
  canonical_word_id: word.word,
  member_role: word.memberRole,
  suffix_variant: word.suffixVariant,
  semantic_base_text: word.semanticBaseText,
  semantic_base_kind: word.semanticBaseKind,
  base_meaning: word.baseMeaning,
  new_word_meaning: word.newWordMeaning,
  meaning_bin_key: word.meaningBinKey,
  teaching_split_parts: word.teaching.parts,
  teaching_split_joins: word.teaching.joins,
  true_morphology_parts: word.trueMorphology.parts,
  true_morphology_joins: word.trueMorphology.joins,
  true_morphology_transformations: word.trueMorphology.transformations,
  transformation_notes: word.trueMorphology.notes,
  true_morphology_provenance: word.trueMorphology.provenance,
  assignment_eligible: true,
  row_status: "active",
  review_status: "approved_for_first_exposure",
  ...overrides,
});

const reviewedMembers = reviewed.words.map((word: any) => member(word));
const inReviewId = "in-review-member-id";
const inReviewMember = member(reviewed.words[0], {
  canonical_word_id: inReviewId,
  review_status: "in_review",
});

const tables: Record<string, unknown[]> = {
  canonical_teaching_dictionary_suffix_profiles: [{
    id: "profile-row-id",
    micro_skill_key: reviewed.profile.microSkillKey,
    suffix_label: reviewed.profile.suffixLabel,
    suffix_text: reviewed.profile.suffixText,
    suffix_meaning: reviewed.profile.suffixMeaning,
    meaning_bins: reviewed.profile.meaningBins,
    include_meaning_sort: reviewed.profile.includeMeaningSort,
    suffix_choices: reviewed.profile.suffixChoices,
    intro_content: reviewed.profile.introContent,
    reflection_prompt_key: reviewed.profile.reflection.promptKey,
    reflection_prompt_text: reviewed.profile.reflection.promptText,
    production_enabled: true,
    canonical_teaching_dictionary_suffix_members: [...reviewedMembers, inReviewMember],
  }],
  adle_learning_items: [],
  micro_skill_catalog: [{
    micro_skill_key: reviewed.profile.microSkillKey,
    mastery_domain_key: "D4",
    is_active: true,
    is_assignable: true,
  }],
  canonical_teaching_dictionary_words: [
    ...reviewed.words.map((word: any) => ({
      id: word.word,
      display_word: word.word,
      frequency_band: "high",
      age_band: "middle_primary",
      complexity_band: "medium",
      row_status: "active",
      review_status: "approved_for_first_exposure",
    })),
    {
      id: inReviewId,
      display_word: reviewed.words[0].word,
      frequency_band: "high",
      age_band: "middle_primary",
      complexity_band: "medium",
      row_status: "active",
      review_status: "approved_for_first_exposure",
    },
  ],
  canonical_teaching_dictionary_dictation_sentences: [
    ...reviewed.words.map((word: any) => ({
      canonical_word_id: word.word,
      dictation_sentence: word.dictation.sentence,
      dictation_target_token_index: word.dictation.targetTokenIndex,
      audio_text: word.dictation.audioText,
      row_status: "active",
      review_status: "approved_for_first_exposure",
    })),
    {
      canonical_word_id: inReviewId,
      dictation_sentence: reviewed.words[0].dictation.sentence,
      dictation_target_token_index: reviewed.words[0].dictation.targetTokenIndex,
      audio_text: reviewed.words[0].dictation.audioText,
      row_status: "active",
      review_status: "approved_for_first_exposure",
    },
  ],
  canonical_teaching_dictionary_word_metadata: [
    ...reviewed.words.map((word: any) => ({
      canonical_word_id: word.word,
      syllables: "2",
      phoneme_hint: "/fixture/",
      stress_pattern: "primary-unstressed",
      has_schwa: false,
      row_status: "active",
      review_status: "approved_for_first_exposure",
    })),
    {
      canonical_word_id: inReviewId,
      syllables: "2",
      phoneme_hint: "/fixture/",
      stress_pattern: "primary-unstressed",
      has_schwa: false,
      row_status: "active",
      review_status: "approved_for_first_exposure",
    },
  ],
};

class ReadOnlyQuery implements PromiseLike<{ data: unknown[]; error: null }> {
  constructor(private readonly rows: unknown[]) {}
  select() { return this; }
  in() { return this; }
  eq() { return this; }
  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

const client = {
  from(table: string) {
    return new ReadOnlyQuery(tables[table] ?? []);
  },
} as unknown as SupabaseClient;

async function main() {
  const loaded = await loadDynamicSuffixProfiles(client, "fixture-child");
  assert.equal(loaded.profiles.length, 1, "one valid profile remains selectable");
  assert.equal(loaded.profiles[0]!.wordsByCanonicalId.size, 4, "all four reviewed members remain in the pool");
  assert(!loaded.profiles[0]!.wordsByCanonicalId.has(inReviewId), "in-review member is excluded");
  assert.deepEqual(loaded.diagnostics, [{
    profileKey: "D4_MOR_SUFFIXES_NESS",
    blockerCode: "member_validation_failed",
    memberIndex: 4,
  }], "excluded member reports a governed readiness blocker without rejecting the complete profile");

  const inactiveTables = structuredClone(tables);
  inactiveTables.micro_skill_catalog = [{
    micro_skill_key: reviewed.profile.microSkillKey,
    mastery_domain_key: "D4",
    is_active: false,
    is_assignable: true,
  }];
  const inactiveClient = {
    from(table: string) { return new ReadOnlyQuery(inactiveTables[table] ?? []); },
  } as unknown as SupabaseClient;
  const inactive = await loadDynamicSuffixProfiles(inactiveClient, "fixture-child");
  assert.equal(inactive.profiles.length, 0);
  assert(inactive.diagnostics.some((entry) => entry.blockerCode === "micro_skill_not_route_ready"));

  console.log(JSON.stringify({
    status: "passed",
    reviewedCandidatesLoaded: 4,
    inReviewCandidatesExcluded: 1,
    inactiveMicroSkillBlocked: true,
  }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
