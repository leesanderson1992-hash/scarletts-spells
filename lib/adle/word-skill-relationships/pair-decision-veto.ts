import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdleRouteActivationEnvironment } from "../route-activation-environment";
import { recordAdleReadPage } from "../observability/read-metrics";
import { canonicalPairKey } from "./pair-key";

const PAGE_SIZE = 100;

/** Daily-plan proficiency needs the complete withdrawal set across its
 * dictionary support pool. Read only current deassignments, in bounded pages. */
export async function loadAllCurrentPairDeassignments(input: {
  client: SupabaseClient;
  environmentKey: AdleRouteActivationEnvironment;
}): Promise<ReadonlySet<string>> {
  const deassigned = new Set<string>();
  let afterSequence = 0;
  for (;;) {
    const started = performance.now();
    const { data, error } = await input.client.from("teaching_dictionary_pair_latest_decisions")
      .select("canonical_word_id,micro_skill_key,sequence_number")
      .eq("environment_key", input.environmentKey)
      .eq("action", "deassign")
      .gt("sequence_number", afterSequence)
      .order("sequence_number", { ascending: true })
      .limit(500);
    recordAdleReadPage("teaching_dictionary_pair_latest_decisions", data ?? [], performance.now() - started);
    if (error) throw new Error(`all pair decision veto read: ${error.message}`);
    for (const row of data ?? []) {
      deassigned.add(canonicalPairKey(row.canonical_word_id, row.micro_skill_key));
      afterSequence = row.sequence_number;
    }
    if ((data ?? []).length < 500) return deassigned;
  }
}

/** The latest governed decision is an explicit veto over otherwise reviewed
 * route membership. Read only the candidate pairs for this assignment. */
export async function loadCurrentPairDeassignments(input: {
  client: SupabaseClient;
  environmentKey: AdleRouteActivationEnvironment;
  pairs: readonly { canonicalWordId: string; microSkillKey: string }[];
}): Promise<ReadonlySet<string>> {
  const requested = new Set(input.pairs.map((pair) => canonicalPairKey(pair.canonicalWordId, pair.microSkillKey)));
  const ids = [...new Set(input.pairs.map((pair) => pair.canonicalWordId).filter(Boolean))];
  const skills = [...new Set(input.pairs.map((pair) => pair.microSkillKey).filter(Boolean))];
  const deassigned = new Set<string>();
  if (ids.length === 0 || skills.length === 0) return deassigned;
  for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
    const started = performance.now();
    const { data, error } = await input.client.from("teaching_dictionary_pair_latest_decisions")
      .select("canonical_word_id,micro_skill_key")
      .eq("environment_key", input.environmentKey)
      .eq("action", "deassign")
      .in("micro_skill_key", skills)
      .in("canonical_word_id", ids.slice(offset, offset + PAGE_SIZE));
    recordAdleReadPage("teaching_dictionary_pair_latest_decisions", data ?? [], performance.now() - started);
    if (error) throw new Error(`pair decision veto read: ${error.message}`);
    for (const row of data ?? []) {
      const key = canonicalPairKey(row.canonical_word_id, row.micro_skill_key);
      if (requested.has(key)) deassigned.add(key);
    }
  }
  return deassigned;
}
