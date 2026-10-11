import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishedAssociationsToPhaseB, type PublishedAssociation } from "./knowledge";

export async function loadPublishedWritingAssociations(client: SupabaseClient, environment: "local" | "staging" | "production") {
  const releases: { id: string; release_key: string; reviewed_by: string }[] = [];
  const pairs: PublishedAssociation[] = [];
  const withdrawn = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    const response = await client.from("adle_reviewed_word_skill_releases").select("id,release_key,reviewed_by").eq("environment_key", environment).order("id").range(offset, offset + 499);
    if (response.error) throw new Error("WRITING_KNOWLEDGE_RELEASE_READ_FAILED");
    releases.push(...response.data);
    if (response.data.length < 500) break;
  }
  // Read all releases in batches. A round trip per release made every admin
  // navigation slower as review history grew, even when only one word was open.
  for (let start = 0; start < releases.length; start += 100) {
    const releaseIds = releases.slice(start, start + 100).map((release) => release.id);
    const withdrawalRequest = client.from("adle_reviewed_word_skill_withdrawals")
      .select("release_id").in("release_id", releaseIds);
    const pairRequest = async () => {
      const batch: PublishedAssociation[] = [];
      for (let offset = 0; ; offset += 500) {
        const response = await client.from("adle_reviewed_word_skill_pairs").select("*")
          .in("release_id", releaseIds).order("id").range(offset, offset + 499);
        if (response.error) throw new Error("WRITING_KNOWLEDGE_PAIR_READ_FAILED");
        batch.push(...response.data as PublishedAssociation[]);
        if (response.data.length < 500) return batch;
      }
    };
    const [withdrawal, batch] = await Promise.all([withdrawalRequest, pairRequest()]);
    if (withdrawal.error) throw new Error("WRITING_KNOWLEDGE_WITHDRAWAL_READ_FAILED");
    for (const row of withdrawal.data) withdrawn.add(row.release_id);
    pairs.push(...batch);
  }
  const releaseOrder = new Map(releases.map((release, index) => [release.id, index]));
  pairs.sort((a, b) => (releaseOrder.get(a.release_id) ?? 0) - (releaseOrder.get(b.release_id) ?? 0)
    || a.id.localeCompare(b.id));
  return publishedAssociationsToPhaseB(pairs, new Map(releases.map((release) => [release.id, release])), withdrawn);
}
