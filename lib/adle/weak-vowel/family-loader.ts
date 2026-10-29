import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentDetectiveFamilyAuthority, DetectiveFamilyV1 } from "../word-lab/family-tree-detective";
import type { PublishedWeakVowelWord } from "./governed-content";

/** A family is an optional, reviewed spelling investigation. No pronunciation
 * change or vowel alignment is inferred from the shared family relationship. */
export async function loadWeakVowelFamilies(input: { client: SupabaseClient;
  selected: readonly PublishedWeakVowelWord[] }): Promise<{
    current: CurrentDetectiveFamilyAuthority[];
    published: Array<{ canonicalWordId: string; family: DetectiveFamilyV1 }>;
  }> {
  const chosen = input.selected.flatMap((word) => {
    const facts = word.routeContent.content.weakVowel;
    return facts.familyDecision === "approve" && facts.familyAuthorityId
      ? [{ word, familyId: facts.familyAuthorityId }] : [];
  });
  const ids = [...new Set(chosen.map((entry) => entry.familyId))];
  if (!ids.length) return { current: [], published: [] };
  const families = await input.client.from("canonical_teaching_dictionary_base_word_families")
    .select("id,base_word_id,base_family_key,source_row_hash,row_status,review_status")
    .in("id", ids).eq("row_status", "active").eq("review_status", "approved_for_first_exposure");
  if (families.error) throw new Error(`WEAK_VOWEL_FAMILY_READ:${families.error.message}`);
  const keys = [...new Set((families.data ?? []).map((family) => family.base_family_key))];
  const aliases = keys.length ? await input.client.from("canonical_teaching_dictionary_base_family_registry_aliases")
    .select("canonical_family_id,source_key,source_record_ids")
    .eq("source_type", "legacy_base").in("source_key", keys) : null;
  if (aliases?.error) throw new Error(`WEAK_VOWEL_CANONICAL_FAMILY_READ:${aliases.error.message}`);
  const canonicalIds = [...new Set((aliases?.data ?? []).map((alias) => alias.canonical_family_id))];
  const canonicalMembers = canonicalIds.length ? await input.client
    .from("canonical_teaching_dictionary_base_family_registry_members")
    .select("canonical_family_id,canonical_word_id")
    .in("canonical_family_id", canonicalIds)
    .in("canonical_word_id", [...new Set([...chosen.map((entry) => entry.word.canonicalWordId),
      ...(families.data ?? []).map((family) => family.base_word_id)])]) : null;
  if (canonicalMembers?.error) throw new Error(`WEAK_VOWEL_CANONICAL_FAMILY_MEMBERS_READ:${canonicalMembers.error.message}`);
  const canonicalMembership = new Set((canonicalMembers?.data ?? []).map((row) =>
    `${row.canonical_family_id}:${row.canonical_word_id}`));
  const members = await input.client.from("canonical_teaching_dictionary_base_word_family_members")
    .select("base_word_family_id,canonical_word_id,assignment_eligible,row_status,review_status,word_sum")
    .in("base_word_family_id", ids).eq("row_status", "active")
    .eq("review_status", "approved_for_first_exposure").eq("assignment_eligible", true);
  if (members.error) throw new Error(`WEAK_VOWEL_FAMILY_MEMBERS_READ:${members.error.message}`);
  const memberIds = [...new Set((members.data ?? []).map((member) => member.canonical_word_id))];
  const words = memberIds.length ? await input.client.from("canonical_teaching_dictionary_words")
    .select("id,display_word,row_status,review_status,dialect_code").in("id", memberIds)
    .eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
    .eq("dialect_code", "en-GB") : null;
  if (words?.error) throw new Error(`WEAK_VOWEL_FAMILY_WORDS_READ:${words.error.message}`);
  const spelling = new Map((words?.data ?? []).map((word) => [word.id, word.display_word]));
  const recordings = new Map(input.selected.map((word) => [word.canonicalWordId,
    { ...word.routeContent.content.weakVowel.wordRecording, reviewStatus: "approved" as const }]));
  const current: CurrentDetectiveFamilyAuthority[] = [];
  const published: Array<{ canonicalWordId: string; family: DetectiveFamilyV1 }> = [];
  for (const family of families.data ?? []) {
    if (!/^[a-f0-9]{64}$/.test(family.source_row_hash) || !spelling.has(family.base_word_id)) continue;
    const familyMembers = (members.data ?? []).filter((member) => member.base_word_family_id === family.id)
      .flatMap((member) => {
        const display = spelling.get(member.canonical_word_id);
        return display ? [{ canonicalWordId: member.canonical_word_id, spelling: display,
          recording: recordings.get(member.canonical_word_id) ?? null,
          morphologyNote: typeof member.word_sum === "string" && member.word_sum.includes("→")
            ? member.word_sum : null, alignedVowelSpan: null }] : [];
      });
    if (familyMembers.length < 2 || !familyMembers.some((member) => member.canonicalWordId === family.base_word_id)) continue;
    for (const choice of chosen.filter((entry) => entry.familyId === family.id &&
      familyMembers.some((member) => member.canonicalWordId === entry.word.canonicalWordId))) {
      const canonicalId = choice.word.routeContent.content.weakVowel.canonicalFamilyId;
      const alias = (aliases?.data ?? []).find((entry) => entry.source_key === family.base_family_key &&
        entry.source_record_ids.includes(family.id));
      if (canonicalId && (alias?.canonical_family_id !== canonicalId ||
        !canonicalMembership.has(`${canonicalId}:${choice.word.canonicalWordId}`) ||
        !canonicalMembership.has(`${canonicalId}:${family.base_word_id}`)))
        throw new Error("WEAK_VOWEL_CANONICAL_FAMILY_BINDING_STALE");
      const authorityId = canonicalId || family.id;
      if (!current.some((entry) => entry.authorityId === authorityId &&
        entry.sourceFingerprint === family.source_row_hash))
        current.push({ authorityId, sourceFingerprint: family.source_row_hash,
          memberWordIds: familyMembers.map((member) => member.canonicalWordId) });
      published.push({ canonicalWordId: choice.word.canonicalWordId,
        family: { authorityId, sourceFingerprint: family.source_row_hash,
          reviewStatus: "approved", name: spelling.get(family.base_word_id)!,
          members: familyMembers, explanation: null } });
    }
  }
  return { current, published };
}
