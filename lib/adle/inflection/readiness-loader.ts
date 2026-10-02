import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- immutable ledger rows are validated below */
import type { SupabaseClient } from "@supabase/supabase-js";
import { activationAllowsChild } from "../route-activation-scope";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { PersistedCurriculumReleaseAuthorityV2 } from "../composable-lesson/contracts";
import type { SpecialistSnapshotAuthorityV3 } from "../composable-lesson/specialist-snapshot-v3-contracts";
import type { LearningItemFact } from "../learning-items";
import { adjectiveFamilyBlockers, COMPARATIVE_MICRO_SKILLS, COMPARATIVE_ROUTE_KEY, type AdjectiveFamilyV1, type ComparativeMicroSkill } from "./contracts";
import { selectDegreeFamilies } from "./selection";
import { compileComparativeLesson } from "./lesson";
import { compileComparativeSnapshotV3 } from "./snapshot";
import { semanticJson } from "./semantic-json";
import { comparativeReadinessFacts } from "./readiness-facts";

/** No enabled head, incomplete review or closure means no assignment. */
export async function prepareComparativeAssignment(input: { client: SupabaseClient; childId: string; parentUserId: string; date: string; microSkillKey: ComparativeMicroSkill; learningItems: readonly LearningItemFact[]; environmentKey: "local" | "staging" | "production" }) {
  const blocked = (reason: string) => ({ status: "blocked" as const, reason });
  if (!COMPARATIVE_MICRO_SKILLS.includes(input.microSkillKey)) return blocked("comparative_skill_not_supported");
  const read = async (query: PromiseLike<{ data: any; error: { message: string } | null }>) => { const r = await query; if (r.error) throw new Error(`comparative_readiness:${r.error.message}`); return r.data; };
  const head = await read(input.client.from("adle_route_activation_heads").select("current_revision_id").eq("environment_key", input.environmentKey).eq("route_id", "comparative_superlative_word_lab").eq("route_version", "v1").eq("micro_skill_key", input.microSkillKey).maybeSingle());
  if (!head) return blocked("comparative_route_inactive");
  const revision = await read(input.client.from("adle_route_activation_revisions").select("*").eq("id", head.current_revision_id).maybeSingle());
  if (!revision || revision.activation_status !== "enabled" || revision.activation_route_key !== COMPARATIVE_ROUTE_KEY || !activationAllowsChild(revision.readiness_report, input.childId)) return blocked("comparative_activation_scope_not_ready");
  const release = await read(input.client.from("adle_curriculum_release_manifests").select("*").eq("id", revision.release_manifest_id).maybeSingle());
  if (!release || release.route_id !== "comparative_superlative_word_lab" || release.route_version !== "v1" || release.payload_version !== 1 || release.activation_route_key !== COMPARATIVE_ROUTE_KEY
    || release.release_manifest_sha256 !== revision.release_manifest_sha256 || release.dependency_fingerprint !== revision.dependency_fingerprint) return blocked("comparative_release_mismatch");
  const current = await read(input.client.rpc("adle_route_activation_revision_is_current_v2", { p_activation_revision_id: revision.id, p_release_manifest_id: release.id, p_release_manifest_sha256: release.release_manifest_sha256, p_dependency_fingerprint: release.dependency_fingerprint }));
  if (current !== true) return blocked("comparative_activation_changed");
  const bindings: any[] = await read(input.client.from("adle_curriculum_release_dependencies").select("*").eq("release_manifest_id", release.id).eq("micro_skill_key", input.microSkillKey));
  const kinds = ["adjective_degree_families", "teaching_content", "teaching_dictionary_closure"] as const;
  if (bindings.length !== 3 || kinds.some(kind => bindings.filter(b => b.authority_type === kind).length !== 1)) return blocked("comparative_dependency_set_incomplete");
  const authorities: any[] = await read(input.client.from("adle_curriculum_dependency_authorities").select("*").in("id", bindings.map(b => b.authority_id)));
  const exact = kinds.map(kind => { const b = bindings.find(b => b.authority_type === kind); return authorities.find(a => a.id === b.authority_id && a.authority_type === kind && a.authority_key === b.authority_key && a.schema_version === 1 && a.semantic_fingerprint === b.semantic_fingerprint && fingerprintSnapshotValue(a.semantic_projection) === b.semantic_fingerprint && a.semantic_projection.microSkillKey === input.microSkillKey); });
  if (exact.some(a => !a)) return blocked("comparative_dependency_fingerprint_mismatch");
  const [familyAuthority, teachingAuthority, closureAuthority] = exact;
  const families: AdjectiveFamilyV1[] = familyAuthority.semantic_projection.families;
  if (!Array.isArray(families) || families.length !== 6 || families.some(f => f.microSkillKey !== input.microSkillKey || adjectiveFamilyBlockers(f).length)) return blocked("comparative_family_review_incomplete");
  const closure = closureAuthority.semantic_projection;
  if (closure.capability !== "paired_degree_word_audio" || semanticJson(closure.words) !== semanticJson(families.flatMap(f => f.words)) || semanticJson(closure.pairedSentences) !== semanticJson(families.map(f => f.content.pairedSentence))) return blocked("comparative_audio_closure_incomplete");
  const wordRows: any[] = await read(input.client.from("canonical_teaching_dictionary_words").select("id,display_word,row_status,review_status,dialect_code").in("id", families.flatMap(f => f.words.map(w => w.canonicalWordId))));
  if (families.flatMap(f => f.words).some(w => !wordRows.some(r => r.id === w.canonicalWordId && r.display_word === w.word && r.row_status === "active" && r.review_status === "approved_for_first_exposure" && r.dialect_code === "en-GB"))) return blocked("comparative_canonical_word_not_ready");
  const selection = selectDegreeFamilies(input.childId, input.microSkillKey, families, input.learningItems);
  if (!selection.ok) return blocked(selection.blockers.join(","));
  const lesson = compileComparativeLesson(selection, `adle:${input.childId}:${input.date}:${input.microSkillKey}`);
  const teaching = teachingAuthority.semantic_projection;
  if (!teaching.sharedPage || !teaching.rulePage || !teaching.reflectionPrompt) return blocked("comparative_teaching_missing");
  lesson.teaching.pages = [teaching.sharedPage, { ...teaching.rulePage, examples: lesson.families.map(f => ({ text: f.words.map(w => w.word).join(" → "), explanation: f.meaning })) }];
  lesson.reflectionPrompt = teaching.reflectionPrompt;
  const refs: PersistedCurriculumReleaseAuthorityV2 = { activationRevisionId: revision.id, releaseManifestId: release.id, releaseKey: release.release_key, releaseManifestSha256: release.release_manifest_sha256, dependencyFingerprint: release.dependency_fingerprint };
  const contentAuthorities: SpecialistSnapshotAuthorityV3[] = [
    { authorityType: "release_manifest", authorityId: release.id, version: "2", sourceHash: release.release_manifest_sha256 },
    { authorityType: "activation_revision", authorityId: revision.id, version: "2", sourceHash: fingerprintSnapshotValue(revision) },
    { authorityType: "dependency_set", authorityId: release.id, version: "2", sourceHash: release.dependency_fingerprint },
    ...exact.map((a, i) => ({ authorityType: kinds[i], authorityId: a.id, version: "1", sourceHash: a.semantic_fingerprint })),
    { authorityType: "recipe_content", authorityId: teachingAuthority.id, version: "1", sourceHash: teachingAuthority.semantic_fingerprint },
  ];
  return { status: "ready" as const, ...compileComparativeSnapshotV3({ lesson, release: refs, contentAuthorities, childId: input.childId, parentUserId: input.parentUserId, date: input.date }),
    ...comparativeReadinessFacts(lesson, refs, input.childId) };
}
