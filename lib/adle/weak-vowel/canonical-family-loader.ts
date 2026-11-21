import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { DetectiveFamilyV1 } from "../word-lab/family-tree-detective";

/** Only reviewed, sense-specific Dictionary membership supplies new family exploration. */
export async function loadSchwaDictionaryFamily(db: SupabaseClient, wordId: string, senseId: string, familyKey: string): Promise<DetectiveFamilyV1 | null> {
  const [families, links] = await Promise.all([
    db.from("teaching_dictionary_families_with_current_meaning").select("family_key,revision,base_lemma,canonical_base_word_id,review_status")
      .eq("family_key", familyKey).order("revision", { ascending: false }).limit(1),
    db.from("teaching_dictionary_current_sense_family_memberships").select("canonical_word_id,sense_id")
      .eq("family_key", familyKey),
  ]);
  if (families.error || links.error) throw new Error("Could not load the approved Dictionary family.");
  const family = families.data[0];
  if (!family || family.review_status !== "approved" || !family.canonical_base_word_id ||
    !links.data.some(link => link.canonical_word_id === wordId && link.sense_id === senseId)) return null;
  const ids = [...new Set([family.canonical_base_word_id, ...links.data.map(link => link.canonical_word_id)])];
  const words = await db.from("canonical_teaching_dictionary_words").select("id,display_word").in("id", ids)
    .eq("row_status", "active").eq("review_status", "approved_for_first_exposure").eq("dialect_code", "en-GB");
  if (words.error) throw new Error("Could not load reviewed family members.");
  if (words.data.length < 2 || !words.data.some(word => word.id === wordId) || !words.data.some(word => word.id === family.canonical_base_word_id)) return null;
  const members = words.data.sort((a, b) => a.id.localeCompare(b.id)).map(word => ({ canonicalWordId: word.id,
    spelling: word.display_word, recording: null, morphologyNote: null, alignedVowelSpan: null }));
  return { authorityId: `dictionary:${familyKey}`, sourceFingerprint: fingerprintSnapshotValue({ familyKey, base: family.canonical_base_word_id, members: members.map(member => member.canonicalWordId) }),
    reviewStatus: "approved", name: family.base_lemma, members, explanation: null };
}
