import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadWordSkillPackage, previewWordSkillPackage, publishWordSkillPackage } from "@/lib/writing-engine/whole-writing/knowledge-review-repository";

export async function exactSkillRelease(
  db: ReturnType<typeof createServiceRoleClient>,
  environment: "local" | "staging" | "production",
  wordId: string,
  skillKey: string,
  actorId: string,
  requestId: string,
): Promise<string> {
  const existing = await db.from("adle_reviewed_word_skill_pairs")
    .select("release_id,adle_reviewed_word_skill_releases!inner(environment_key)")
    .eq("canonical_word_id", wordId).eq("micro_skill_key", skillKey)
    .eq("relationship_role", "demonstrates")
    .eq("adle_reviewed_word_skill_releases.environment_key", environment).limit(30);
  if (existing.error) throw new Error("BASE_FAMILY_SKILL_READ_FAILED");
  const releaseIds = (existing.data ?? []).map((row) => row.release_id);
  if (releaseIds.length) {
    const withdrawals = await db.from("adle_reviewed_word_skill_withdrawals")
      .select("release_id").in("release_id", releaseIds);
    if (withdrawals.error) throw new Error("BASE_FAMILY_SKILL_READ_FAILED");
    const withdrawn = new Set((withdrawals.data ?? []).map((row) => row.release_id));
    const active = releaseIds.find((id) => !withdrawn.has(id));
    if (active) return active;
  }
  const candidate = { canonicalWordId: wordId, microSkillKey: skillKey,
    relationshipRole: "demonstrates", method: "deterministic_candidate",
    sourceReference: `Teaching Dictionary Manager base-family review: ${requestId}`,
    licenceReference: "internal_authored" };
  const created = await db.rpc("create_word_skill_candidate_package", {
    p_key: `tdm-family:${requestId}`, p_environment: environment,
    p_candidates: [candidate], p_actor: actorId,
  });
  if (created.error || !created.data) throw new Error("BASE_FAMILY_SKILL_PACKAGE_FAILED");
  const reviewed = await db.rpc("review_word_skill_candidate_package_with_metrics", {
    p_package: created.data, p_environment: environment, p_decisions: ["approved"],
    p_rejection_reasons: [""], p_actor: actorId,
    p_note: "Approved with reviewed Base Word family relationship", p_active_seconds: 0,
  });
  if (reviewed.error) throw new Error("BASE_FAMILY_SKILL_REVIEW_FAILED");
  const packageFacts = await loadWordSkillPackage(db, environment, created.data);
  const preview = await previewWordSkillPackage(db, packageFacts.package, packageFacts.review);
  if (!preview.pairs[0]?.ready) throw new Error("BASE_FAMILY_SKILL_AUTHORITY_BLOCKED");
  await publishWordSkillPackage(db, environment, created.data, actorId,
    preview.result.reconciliation.sourceFingerprint);
  const publication = await db.from("adle_word_skill_package_publications")
    .select("release_id").eq("package_id", created.data).single();
  if (publication.error) throw new Error("BASE_FAMILY_SKILL_PUBLICATION_FAILED");
  return publication.data.release_id;
}
