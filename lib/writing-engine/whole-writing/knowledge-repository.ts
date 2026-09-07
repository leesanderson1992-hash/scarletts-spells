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
  // Each release is bounded to 1,000 pairs at publication; explicitly page it.
  for (const release of releases) {
    const withdrawal = await client.from("adle_reviewed_word_skill_withdrawals").select("release_id").eq("release_id", release.id).maybeSingle();
    if (withdrawal.error) throw new Error("WRITING_KNOWLEDGE_WITHDRAWAL_READ_FAILED");
    if (withdrawal.data) withdrawn.add(release.id);
    for (let offset = 0; ; offset += 500) {
      const response = await client.from("adle_reviewed_word_skill_pairs").select("*").eq("release_id", release.id).order("id").range(offset, offset + 499);
      if (response.error) throw new Error("WRITING_KNOWLEDGE_PAIR_READ_FAILED");
      pairs.push(...response.data as PublishedAssociation[]);
      if (response.data.length < 500) break;
    }
  }
  return publishedAssociationsToPhaseB(pairs, new Map(releases.map((release) => [release.id, release])), withdrawn);
}
