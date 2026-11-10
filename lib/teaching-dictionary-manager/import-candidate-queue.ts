import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { candidateDecisionIsCurrent, type CandidateDecisionEvent } from "./candidate-decision-current";
import { hasCandidateRule } from "./lesson-candidate";
import type { DictionarySenseSet } from "./senses";

type Db = ReturnType<typeof createServiceRoleClient>;
export type ImportCandidateRequest = { draft_id: string; environment_key: string;
  canonical_word_id: string; micro_skill_key: string; sense_id: string };
export type ImportCandidateRequestStatus = ImportCandidateRequest & { current: boolean;
  supported: boolean };

/** Read the durable CSV handoff and its current exact-fact decision. */
export async function loadImportCandidateRequests(db: Db, draftIds: readonly string[],
  environment: "staging" | "production"): Promise<ImportCandidateRequestStatus[]> {
  const requests: ImportCandidateRequest[] = [];
  for (let start = 0; start < draftIds.length; start += 100) {
    const ids = draftIds.slice(start, start + 100);
    for (let offset = 0; ; offset += 500) {
      const result = await db.from("teaching_dictionary_import_candidate_handoffs")
        .select("draft_id,environment_key,canonical_word_id,micro_skill_key,sense_id")
        .eq("environment_key", environment).in("draft_id", ids)
        .order("draft_id").order("micro_skill_key").range(offset, offset + 499);
      if (result.error) throw new Error("TEACHING_IMPORT_CANDIDATE_QUEUE_READ_FAILED");
      requests.push(...(result.data ?? []));
      if ((result.data?.length ?? 0) < 500) break;
    }
  }
  if (!requests.length) return [];
  const current = new Set<string>();
  const key = (wordId: string, skillKey: string, senseId: string) => `${wordId}:${skillKey}:${senseId}`;
  const wordIds = [...new Set(requests.map(row => row.canonical_word_id))];
  for (let start = 0; start < wordIds.length; start += 50) {
    const ids = wordIds.slice(start, start + 50);
    const [senses, morphologies, links, decisions, bindings] = await Promise.all([
      db.from("teaching_dictionary_reviewed_sense_sets")
        .select("canonical_word_id,sense_set").in("canonical_word_id", ids),
      db.from("canonical_teaching_dictionary_word_morphology")
        .select("id,canonical_word_id,created_at").in("canonical_word_id", ids)
        .eq("row_status", "active").order("created_at", { ascending: false }),
      db.from("teaching_dictionary_current_sense_family_links")
        .select("id,canonical_word_id,sense_id").in("canonical_word_id", ids),
      db.from("teaching_dictionary_current_candidate_decisions")
        .select("canonical_word_id,micro_skill_key,sense_id,action,pronunciation_id,rule_revision,fact_snapshot")
        .eq("environment_key", environment).in("canonical_word_id", ids),
      db.from("teaching_dictionary_effective_lesson_sense_bindings")
        .select("canonical_word_id,micro_skill_key,sense_id")
        .eq("environment_key", environment).in("canonical_word_id", ids),
    ]);
    if (senses.error || morphologies.error || links.error || decisions.error || bindings.error
      || [senses.data, morphologies.data, links.data, decisions.data, bindings.data]
        .some(rows => (rows?.length ?? 0) >= 1000))
      throw new Error("TEACHING_IMPORT_CANDIDATE_FACTS_READ_FAILED");
    const senseByWord = new Map((senses.data ?? []).map(row => [row.canonical_word_id,
      row.sense_set as DictionarySenseSet]));
    const morphologyByWord = new Map<string, string>();
    for (const row of morphologies.data ?? []) if (!morphologyByWord.has(row.canonical_word_id))
      morphologyByWord.set(row.canonical_word_id, row.id);
    const decisionByKey = new Map((decisions.data ?? []).map(row => [
      key(row.canonical_word_id, row.micro_skill_key, row.sense_id), row as CandidateDecisionEvent]));
    const boundKeys = new Set((bindings.data ?? []).map(row => key(row.canonical_word_id,
      row.micro_skill_key, row.sense_id)));
    for (const request of requests.filter(row => ids.includes(row.canonical_word_id))) {
      const requestKey = key(request.canonical_word_id, request.micro_skill_key, request.sense_id);
      if (!hasCandidateRule(request.micro_skill_key)) {
        if (boundKeys.has(requestKey)) current.add(requestKey);
        continue;
      }
      if (candidateDecisionIsCurrent({
        event: decisionByKey.get(requestKey) ?? null,
        senseId: request.sense_id,
        senseSet: senseByWord.get(request.canonical_word_id) ?? null,
        morphologyId: morphologyByWord.get(request.canonical_word_id) ?? null,
        familyLinkIds: (links.data ?? []).filter(row => row.canonical_word_id === request.canonical_word_id
          && row.sense_id === request.sense_id).map(row => row.id),
      })) current.add(requestKey);
    }
  }
  return requests.map(row => ({ ...row,
    current: current.has(key(row.canonical_word_id, row.micro_skill_key, row.sense_id)),
    supported: hasCandidateRule(row.micro_skill_key) }));
}
