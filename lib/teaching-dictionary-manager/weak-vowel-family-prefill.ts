import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- reviewed family tables precede generated client types */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chooseWeakVowelFamily, type WeakVowelFamilyCandidate, type WeakVowelFamilyChoice } from "./weak-vowel-family-choice";

export type WeakVowelFamilyPrefill = WeakVowelFamilyChoice;

/** Select only a current, approved family with two eligible approved words.
 * Equivalent import revisions use the newest authority; semantic conflicts do
 * not choose a family for the editor. */
export async function loadWeakVowelFamilyPrefill(db: SupabaseClient, wordId: string): Promise<WeakVowelFamilyPrefill> {
  const none: WeakVowelFamilyPrefill = { status: "none", authorityId: null, members: [] };
  const client = db as any;
  const linked = await client.from("canonical_teaching_dictionary_base_word_family_members")
    .select("base_word_family_id").eq("canonical_word_id", wordId)
    .eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
    .eq("assignment_eligible", true);
  if (linked.error) throw new Error("WEAK_VOWEL_FAMILY_PREFILL_LINK_READ_FAILED");
  const ids = [...new Set<string>((linked.data ?? []).map((row: any) => String(row.base_word_family_id)))];
  if (!ids.length) return none;
  const [families, members] = await Promise.all([
    client.from("canonical_teaching_dictionary_base_word_families")
      .select("id,base_family_key,base_word_id,base_meaning,created_at,row_status,review_status")
      .in("id", ids).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
    client.from("canonical_teaching_dictionary_base_word_family_members")
      .select("base_word_family_id,canonical_word_id,assignment_eligible,row_status,review_status")
      .in("base_word_family_id", ids),
  ]);
  if (families.error || members.error) throw new Error("WEAK_VOWEL_FAMILY_PREFILL_READ_FAILED");
  const memberIds = [...new Set<string>((members.data ?? []).map((row: any) => String(row.canonical_word_id)))];
  if (!memberIds.length) return none;
  const words = await client.from("canonical_teaching_dictionary_words")
    .select("id,display_word").in("id", memberIds).eq("row_status", "active")
    .eq("review_status", "approved_for_first_exposure").eq("dialect_code", "en-GB");
  if (words.error) throw new Error("WEAK_VOWEL_FAMILY_PREFILL_WORD_READ_FAILED");
  const spelling = new Map<string, string>((words.data ?? []).map((row: any) => [String(row.id), String(row.display_word)]));
  const valid: WeakVowelFamilyCandidate[] = (families.data ?? []).flatMap((family: any) => {
    const memberRows = (members.data ?? []).filter((row: any) => row.base_word_family_id === family.id);
    const allMemberIds = [...new Set<string>(memberRows.map((row: any) => String(row.canonical_word_id)))].sort();
    const eligibleMemberIds = [...new Set<string>(memberRows.filter((row: any) => row.assignment_eligible &&
      row.row_status === "active" && row.review_status === "approved_for_first_exposure" &&
      spelling.has(row.canonical_word_id)).map((row: any) => String(row.canonical_word_id)))].sort();
    if (eligibleMemberIds.length < 2 || !eligibleMemberIds.includes(wordId) ||
      !eligibleMemberIds.includes(String(family.base_word_id))) return [];
    return [{ id: String(family.id), createdAt: String(family.created_at),
      baseFamilyKey: String(family.base_family_key), baseWordId: String(family.base_word_id),
      baseMeaning: String(family.base_meaning), memberIds: allMemberIds, eligibleMemberIds,
      memberWords: eligibleMemberIds.map(id => spelling.get(id)!) }];
  });
  const choice = chooseWeakVowelFamily(valid);
  if (choice.status !== "ready" || !choice.authorityId) return choice;
  const source = valid.find((family) => family.id === choice.authorityId)!;
  const alias = await client.from("canonical_teaching_dictionary_base_family_registry_aliases")
    .select("canonical_family_id,source_record_ids")
    .eq("source_type", "legacy_base").eq("source_key", source.baseFamilyKey).maybeSingle();
  if (alias.error) throw new Error("WEAK_VOWEL_CANONICAL_FAMILY_ALIAS_READ_FAILED");
  if (!alias.data || !alias.data.source_record_ids.includes(source.id)) return choice;
  const canonicalMembers = await client.from("canonical_teaching_dictionary_base_family_registry_members")
    .select("canonical_word_id")
    .eq("canonical_family_id", alias.data.canonical_family_id)
    .in("canonical_word_id", [wordId, source.baseWordId]);
  if (canonicalMembers.error) throw new Error("WEAK_VOWEL_CANONICAL_FAMILY_MEMBER_READ_FAILED");
  const canonicalWordIds = new Set((canonicalMembers.data ?? []).map((member: any) => member.canonical_word_id));
  return canonicalWordIds.has(wordId) && canonicalWordIds.has(source.baseWordId)
    ? { ...choice, canonicalFamilyId: String(alias.data.canonical_family_id) } : choice;
}
