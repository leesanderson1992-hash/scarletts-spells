import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { candidateFactsForSense, type CandidateAnalysisRow, type CandidateLinkRow } from "@/lib/teaching-dictionary-manager/candidate-sense-facts";
import type { BulkWord } from "@/lib/teaching-dictionary-manager/bulk-skill-assignment";
import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";

type BulkMorphologyRow = {
  id: string; canonical_word_id: string; morphology_parts: unknown;
  morphology_joins: unknown; analysis_status: string; review_status: string; word_sum: string | null;
};
type BulkSenseRow = { canonical_word_id: string; sense_set: DictionarySenseSet };
type BulkMetadataRow = {
  canonical_word_id: string; has_schwa: boolean | null; syllables: string | null;
  written_syllable_breakdown: string | null; phoneme_hint: string | null;
};

type BulkPageFacts = {
  metadata: BulkMetadataRow[];
  morphology: BulkMorphologyRow[];
  senses: BulkSenseRow[];
  links: CandidateLinkRow[];
  analyses: CandidateAnalysisRow[];
  memberships: CandidateLinkRow[];
};

export async function readBulkPageFacts(wordIds: string[], includeCandidateFacts: boolean) {
  const { data, error } = await createServiceRoleClient().rpc("teaching_dictionary_bulk_candidate_page_facts", {
    p_word_ids: wordIds, p_candidate_rule: includeCandidateFacts,
  });
  if (error) throw new Error("Could not load candidate facts for this page.");
  return data as BulkPageFacts;
}

export function buildBulkCandidateDetails(wordIds: string[], { senses, morphology, links, analyses, memberships }: BulkPageFacts) {
  const details: Record<string, NonNullable<BulkWord["candidateSenseFacts"]>> = {};
  for (const id of wordIds) {
    const senseSet = senses.find(row => row.canonical_word_id === id)?.sense_set;
    const legacy = morphology.find(row => row.canonical_word_id === id);
    details[id] = Object.fromEntries((senseSet?.senses ?? []).map(sense => {
      const { morphology, familyLinks } = candidateFactsForSense({
        wordId: id, senseId: sense.id, senseSet: senseSet ?? null,
        legacyMorphology: legacy ? {
          id: legacy.id, parts: legacy.morphology_parts, joins: legacy.morphology_joins,
          analysisStatus: legacy.analysis_status, reviewStatus: legacy.review_status, wordSum: legacy.word_sum,
        } : null,
        legacyLinks: links.filter(row => row.canonical_word_id === id),
        senseAnalyses: analyses.filter(row => row.canonical_word_id === id),
        senseLinks: memberships.filter(row => row.canonical_word_id === id),
      });
      return [sense.id, { morphology, familyLinks }];
    }));
  }
  return details;
}

export async function readBulkCandidateDetails(wordIds: string[]) {
  return buildBulkCandidateDetails(wordIds, await readBulkPageFacts(wordIds, true));
}
