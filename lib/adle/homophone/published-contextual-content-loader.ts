import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildApprovedContextualContent, type PublishedContrastAuthority } from "./approved-contextual-content";

/** Load only the sets for the selected skill; approved revisions are immutable. */
export async function loadApprovedContextualContent(client: SupabaseClient, microSkillKey: string) {
  const setRead = await client.from("homophone_contrast_sets")
    .select("set_key,revision,micro_skill_key,relation_kind,review_status,semantic_fingerprint")
    .eq("micro_skill_key", microSkillKey).eq("review_status", "approved")
    .order("set_key").order("revision", { ascending: false });
  if (setRead.error) throw new Error(`homophone_contextual_sets_read:${setRead.error.message}`);
  const latest = new Map<string, (typeof setRead.data)[number]>();
  for (const set of setRead.data ?? []) if (!latest.has(set.set_key)) latest.set(set.set_key, set);
  const setKeys = [...latest.keys()];
  if (!setKeys.length) throw new Error(`homophone_contextual_sets_missing:${microSkillKey}`);
  const memberRead = await client.from("homophone_contrast_set_members")
    .select("set_key,revision,member_ordinal,canonical_word_id,intended_sense,grammatical_role,target_sentence")
    .in("set_key", setKeys).order("set_key").order("member_ordinal");
  if (memberRead.error) throw new Error(`homophone_contextual_members_read:${memberRead.error.message}`);
  const selectedMembers = (memberRead.data ?? []).filter(member => latest.get(member.set_key)?.revision === member.revision);
  const wordIds = [...new Set(selectedMembers.map(member => member.canonical_word_id))];
  const wordRead = await client.from("canonical_teaching_dictionary_words")
    .select("id,normalised_word,row_status,review_status,dialect_code").in("id", wordIds);
  if (wordRead.error) throw new Error(`homophone_contextual_words_read:${wordRead.error.message}`);
  const words = new Map((wordRead.data ?? []).filter(word => word.row_status === "active"
    && word.review_status === "approved_for_first_exposure" && word.dialect_code === "en-GB")
    .map(word => [word.id, word.normalised_word.replaceAll("’", "'")]));
  if (words.size !== wordIds.length) throw new Error(`homophone_contextual_dictionary_incomplete:${microSkillKey}`);
  const authorities: PublishedContrastAuthority[] = [...latest.values()].map(set => ({
    setId: `${set.set_key}@${set.revision}`, setKey: set.set_key, microSkillKey: set.micro_skill_key,
    revision: set.revision, semanticFingerprint: set.semantic_fingerprint ?? "",
    reviewStatus: "approved", relationKind: set.relation_kind as PublishedContrastAuthority["relationKind"],
    members: selectedMembers.filter(member => member.set_key === set.set_key).map(member => ({
      canonicalWordId: member.canonical_word_id, word: words.get(member.canonical_word_id) ?? "",
      intendedSense: member.intended_sense, grammaticalRole: member.grammatical_role,
      teachingSentence: member.target_sentence,
    })),
  }));
  return buildApprovedContextualContent(microSkillKey, authorities);
}
