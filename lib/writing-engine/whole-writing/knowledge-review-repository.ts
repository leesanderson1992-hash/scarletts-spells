import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCanonicalWordSkillRelationshipAuthority } from "../../adle/word-skill-relationships/repository";
import type { AdleRouteActivationEnvironment } from "../../adle/route-activation-environment";
import { loadPublishedWritingAssociations } from "./knowledge-repository";
import type { EnrichmentCandidate } from "./knowledge";
import { candidatePreviewAssociations, reviewPairReadiness, type PairReviewDecision } from "./knowledge-review";

export type CandidatePackage = { id: string; package_key: string; environment_key: AdleRouteActivationEnvironment; candidates: EnrichmentCandidate[]; created_by: string; created_at: string };
export type PackageReview = { decisions: PairReviewDecision[]; reviewed_by: string; review_note: string; reviewed_at: string };

export async function loadWordSkillPackageLabels(client: SupabaseClient, candidates: readonly EnrichmentCandidate[]) {
  const wordIds = [...new Set(candidates.map(c => c.canonicalWordId))];
  const skillKeys = [...new Set(candidates.map(c => c.microSkillKey))];
  const words = new Map<string, string>();
  const skills = new Map<string, string>();
  // Bound PostgREST URL length even for the maximum 1,000-pair package.
  for (let offset = 0; offset < Math.max(wordIds.length, skillKeys.length); offset += 100) {
    const [wordRows, skillRows] = await Promise.all([
      offset < wordIds.length ? client.from("canonical_teaching_dictionary_words").select("id,normalised_word,dialect_code").in("id", wordIds.slice(offset, offset + 100)) : null,
      offset < skillKeys.length ? client.from("micro_skill_catalog").select("micro_skill_key,display_name").in("micro_skill_key", skillKeys.slice(offset, offset + 100)) : null,
    ]);
    if (wordRows?.error || skillRows?.error) throw new Error("WORD_SKILL_REFERENCE_READ_FAILED");
    wordRows?.data?.forEach(w => words.set(w.id, `${w.normalised_word} (${w.dialect_code})`));
    skillRows?.data?.forEach(s => skills.set(s.micro_skill_key, s.display_name));
  }
  return { words, skills };
}

export async function loadWordSkillReviewControls(client: SupabaseClient, environment: AdleRouteActivationEnvironment) {
  const result = await client.from("adle_word_skill_review_controls").select("review_enabled,publication_enabled,withdrawal_enabled").eq("environment_key", environment).maybeSingle();
  if (result.error) throw new Error("WORD_SKILL_CONTROL_READ_FAILED");
  return result.data ?? { review_enabled: false, publication_enabled: false, withdrawal_enabled: false };
}
export async function loadWordSkillPackage(client: SupabaseClient, environment: AdleRouteActivationEnvironment, id: string) {
  const [pack, review, publication] = await Promise.all([
    client.from("adle_word_skill_candidate_packages").select("*").eq("id", id).eq("environment_key", environment).maybeSingle(),
    client.from("adle_word_skill_package_reviews").select("decisions,reviewed_by,review_note,reviewed_at").eq("package_id", id).maybeSingle(),
    client.from("adle_word_skill_package_publications").select("release_id,authority_fingerprint,published_at").eq("package_id", id).maybeSingle(),
  ]);
  if (pack.error || review.error || publication.error) throw new Error("WORD_SKILL_PACKAGE_READ_FAILED");
  if (!pack.data) throw new Error("WORD_SKILL_PACKAGE_NOT_FOUND");
  return { package: pack.data as CandidatePackage, review: review.data as PackageReview | null, publication: publication.data as { release_id: string; authority_fingerprint: string; published_at: string } | null };
}
export async function previewWordSkillPackage(client: SupabaseClient, pack: CandidatePackage, review: PackageReview | null) {
  const existing = await loadPublishedWritingAssociations(client, pack.environment_key);
  const result = await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: pack.environment_key,
    explicitReviewedAssociations: [...existing, ...candidatePreviewAssociations(pack.id, pack.candidates, review?.decisions)] });
  return { result, pairs: pack.candidates.map((c, i) => reviewPairReadiness(result, pack.id, c, i)) };
}

/** Publication re-reads authority; a displayed preview never becomes approval. */
export async function publishWordSkillPackage(client: SupabaseClient, environment: AdleRouteActivationEnvironment, id: string, actor: string, displayedFingerprint: string) {
  const controls = await loadWordSkillReviewControls(client, environment);
  if (!controls.publication_enabled) throw new Error("WORD_SKILL_PUBLICATION_DISABLED");
  const loaded = await loadWordSkillPackage(client, environment, id);
  if (loaded.publication) return loaded.publication.release_id;
  if (!loaded.review) throw new Error("WORD_SKILL_REVIEW_REQUIRED");
  const preview = await previewWordSkillPackage(client, loaded.package, loaded.review);
  if (preview.result.reconciliation.sourceFingerprint !== displayedFingerprint) throw new Error("WORD_SKILL_AUTHORITY_CHANGED_RELOAD");
  if (!loaded.review.decisions.some(d => d === "approved")) throw new Error("WORD_SKILL_NO_APPROVED_PAIRS");
  if (preview.pairs.some((pair, i) => loaded.review!.decisions[i] === "approved" && !pair.ready)) throw new Error("WORD_SKILL_AUTHORITY_BLOCKED");
  const result = await client.rpc("publish_word_skill_candidate_package", { p_package: id, p_environment: environment, p_actor: actor, p_authority_fingerprint: displayedFingerprint });
  if (result.error) throw new Error("WORD_SKILL_PUBLICATION_FAILED");
  return result.data as string;
}
