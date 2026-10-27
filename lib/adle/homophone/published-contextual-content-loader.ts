import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildApprovedContextualContent, type PublishedContrastAuthority } from "./approved-contextual-content";
import type { ContextualChoiceContent } from "./contextual-choice-contract";
import { recordAdleReadPage } from "../observability/read-metrics";

type CurrentContent = { content: ContextualChoiceContent; blocker: null } | { content: null; blocker: string };
type SetRow = { set_key: string; revision: number; micro_skill_key: string; relation_kind: string;
  review_status: string; semantic_fingerprint: string | null };
type MemberRow = { set_key: string; revision: number; member_ordinal: number; canonical_word_id: string;
  intended_sense: string; grammatical_role: string; target_sentence: string };
type WordRow = { id: string; normalised_word: string; row_status: string; review_status: string; dialect_code: string };

async function readPages<T>(makeQuery: (offset: number) => PromiseLike<{
  data: T[] | null; error: { message: string } | null;
}>, label: string, table: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const started = performance.now();
    const result = await makeQuery(offset);
    recordAdleReadPage(table, result.data ?? [], performance.now() - started);
    if (result.error) throw new Error(`${label}:${result.error.message}`);
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < 500) return rows;
  }
}

/** One scoped set/member/word read serves an admin view containing many
 * contextual skills. A missing or withdrawn set stays a per-skill blocker. */
export async function loadApprovedContextualContentForSkills(
  client: SupabaseClient,
  microSkillKeys: readonly string[],
): Promise<Map<string, CurrentContent>> {
  const skills = [...new Set(microSkillKeys)];
  const results = new Map<string, CurrentContent>();
  if (!skills.length) return results;
  const setRows = await readPages<SetRow>((offset) => client.from("homophone_contrast_sets")
    .select("set_key,revision,micro_skill_key,relation_kind,review_status,semantic_fingerprint")
    .in("micro_skill_key", skills).eq("review_status", "approved")
    .order("set_key").order("revision", { ascending: false }).range(offset, offset + 499),
  "homophone_contextual_sets_read", "homophone_contrast_sets");
  const latest = new Map<string, SetRow>();
  for (const set of setRows) if (!latest.has(set.set_key)) latest.set(set.set_key, set);
  const setKeys = [...latest.keys()];
  if (!setKeys.length) {
    for (const skill of skills) results.set(skill, { content: null, blocker: `homophone_contextual_sets_missing:${skill}` });
    return results;
  }
  const memberRows = await readPages<MemberRow>((offset) => client.from("homophone_contrast_set_members")
    .select("set_key,revision,member_ordinal,canonical_word_id,intended_sense,grammatical_role,target_sentence")
    .in("set_key", setKeys).order("set_key").order("revision", { ascending: false })
    .order("member_ordinal").order("canonical_word_id").range(offset, offset + 499),
  "homophone_contextual_members_read", "homophone_contrast_set_members");
  const selectedMembers = memberRows.filter(member => latest.get(member.set_key)?.revision === member.revision);
  const wordIds = [...new Set(selectedMembers.map(member => member.canonical_word_id))];
  const wordRows = wordIds.length ? await readPages<WordRow>((offset) => client.from("canonical_teaching_dictionary_words")
    .select("id,normalised_word,row_status,review_status,dialect_code").in("id", wordIds)
    .order("id").range(offset, offset + 499), "homophone_contextual_words_read",
  "canonical_teaching_dictionary_words") : [];
  const words = new Map(wordRows.filter(word => word.row_status === "active"
    && word.review_status === "approved_for_first_exposure" && word.dialect_code === "en-GB")
    .map(word => [word.id, word.normalised_word.replaceAll("’", "'")]));
  for (const skill of skills) {
    const sets = [...latest.values()].filter(set => set.micro_skill_key === skill);
    if (!sets.length) {
      results.set(skill, { content: null, blocker: `homophone_contextual_sets_missing:${skill}` });
      continue;
    }
    const authorities: PublishedContrastAuthority[] = sets.map(set => ({
      setId: `${set.set_key}@${set.revision}`, setKey: set.set_key, microSkillKey: set.micro_skill_key,
      revision: set.revision, semanticFingerprint: set.semantic_fingerprint ?? "",
      reviewStatus: "approved", relationKind: set.relation_kind as PublishedContrastAuthority["relationKind"],
      members: selectedMembers.filter(member => member.set_key === set.set_key).map(member => ({
        canonicalWordId: member.canonical_word_id, word: words.get(member.canonical_word_id) ?? "",
        intendedSense: member.intended_sense, grammaticalRole: member.grammatical_role,
        teachingSentence: member.target_sentence,
      })),
    }));
    if (authorities.some(set => set.members.some(member => !member.word))) {
      results.set(skill, { content: null, blocker: `homophone_contextual_dictionary_incomplete:${skill}` });
      continue;
    }
    try {
      results.set(skill, { content: buildApprovedContextualContent(skill, authorities), blocker: null });
    } catch (error) {
      results.set(skill, { content: null, blocker: error instanceof Error ? error.message : "homophone_contextual_content_invalid" });
    }
  }
  return results;
}

/** Learner generation keeps the same one-skill scope as before. */
export async function loadApprovedContextualContent(client: SupabaseClient, microSkillKey: string): Promise<ContextualChoiceContent> {
  const current = (await loadApprovedContextualContentForSkills(client, [microSkillKey])).get(microSkillKey);
  if (!current?.content) throw new Error(current?.blocker ?? `homophone_contextual_sets_missing:${microSkillKey}`);
  return current.content;
}
