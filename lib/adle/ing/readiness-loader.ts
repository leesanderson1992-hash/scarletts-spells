import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- database ledger rows are checked at the boundary */
import type { SupabaseClient } from "@supabase/supabase-js";
import { activationAllowsChild } from "../route-activation-scope";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { PersistedCurriculumReleaseAuthorityV2 } from "../composable-lesson/contracts";
import type { SpecialistSnapshotAuthorityV3 } from "../composable-lesson/specialist-snapshot-v3-contracts";
import type { LearningItemFact } from "../learning-items";
import { ING_MICRO_SKILLS, ING_ROUTE_KEY, ingWordBlockers, type IngDictionaryWordV1, type IngMicroSkill } from "./contracts";
import { selectIngWords, compileIngLesson, validateIngLesson } from "./lesson";
import { compileIngSnapshotV3 } from "./snapshot";
import { ingReadinessFacts } from "./readiness-facts";
import { semanticJson } from "../inflection/semantic-json";

/** Activated, reviewed content and the current release head are mandatory. */
export async function prepareIngAssignment(input: { client: SupabaseClient; childId: string; parentUserId: string; date: string; microSkillKey: IngMicroSkill; learningItems: readonly LearningItemFact[]; environmentKey: "local" | "staging" | "production" }) {
  const blocked = (reason: string) => ({ status: "blocked" as const, reason });
  if (!ING_MICRO_SKILLS.includes(input.microSkillKey)) return blocked("ing_skill_not_supported");
  const read = async (query: PromiseLike<{ data: any; error: { message: string } | null }>) => { const result = await query; if (result.error) throw new Error(`ing_readiness:${result.error.message}`); return result.data; };
  const head = await read(input.client.from("adle_route_activation_heads").select("current_revision_id").eq("environment_key", input.environmentKey).eq("route_id", "ing_endings_word_lab").eq("route_version", "v1").eq("micro_skill_key", input.microSkillKey).maybeSingle());
  if (!head) return blocked("ing_route_inactive");
  const revision = await read(input.client.from("adle_route_activation_revisions").select("*").eq("id", head.current_revision_id).maybeSingle());
  if (!revision || revision.activation_status !== "enabled" || revision.activation_route_key !== ING_ROUTE_KEY || !activationAllowsChild(revision.readiness_report, input.childId)) return blocked("ing_activation_scope_not_ready");
  const release = await read(input.client.from("adle_curriculum_release_manifests").select("*").eq("id", revision.release_manifest_id).maybeSingle());
  if (!release || release.route_id !== "ing_endings_word_lab" || release.route_version !== "v1" || release.payload_version !== 1 || release.activation_route_key !== ING_ROUTE_KEY
    || release.release_manifest_sha256 !== revision.release_manifest_sha256 || release.dependency_fingerprint !== revision.dependency_fingerprint) return blocked("ing_release_mismatch");
  const current = await read(input.client.rpc("adle_route_activation_revision_is_current_v2", { p_activation_revision_id: revision.id, p_release_manifest_id: release.id, p_release_manifest_sha256: release.release_manifest_sha256, p_dependency_fingerprint: release.dependency_fingerprint }));
  if (current !== true) return blocked("ing_activation_changed");
  const bindings: any[] = await read(input.client.from("adle_curriculum_release_dependencies").select("*").eq("release_manifest_id", release.id).eq("micro_skill_key", input.microSkillKey));
  const kinds = ["ing_word_members", "teaching_content", "teaching_dictionary_closure"] as const;
  if (bindings.length !== 3 || kinds.some(kind => bindings.filter(binding => binding.authority_type === kind).length !== 1)) return blocked("ing_dependency_set_incomplete");
  const authorities: any[] = await read(input.client.from("adle_curriculum_dependency_authorities").select("*").in("id", bindings.map(binding => binding.authority_id)));
  const exact = kinds.map(kind => { const binding = bindings.find(candidate => candidate.authority_type === kind); return authorities.find(authority => authority.id === binding.authority_id && authority.authority_type === kind && authority.authority_key === binding.authority_key && authority.schema_version === 1 && authority.semantic_fingerprint === binding.semantic_fingerprint && fingerprintSnapshotValue(authority.semantic_projection) === binding.semantic_fingerprint && authority.semantic_projection.microSkillKey === input.microSkillKey); });
  if (exact.some(authority => !authority)) return blocked("ing_dependency_fingerprint_mismatch");
  const [wordAuthority, teachingAuthority, closureAuthority] = exact;
  const words: IngDictionaryWordV1[] = wordAuthority.semantic_projection.words;
  if (!Array.isArray(words) || words.length < 6 || new Set(words.map(word => word.canonicalWordId)).size !== words.length || new Set(words.map(word => word.word)).size !== words.length || words.some(word => word.microSkillKey !== input.microSkillKey || ingWordBlockers(word).length)) return blocked("ing_word_review_incomplete");
  const closure = closureAuthority.semantic_projection;
  if (closure.capability !== "single_ing_word_audio" || semanticJson(closure.words) !== semanticJson(words.map(word => ({ canonicalWordId: word.canonicalWordId, word: word.word, sentence: word.dictationSentence, audioText: word.audioText })))) return blocked("ing_audio_closure_incomplete");
  const rows: any[] = await read(input.client.from("canonical_teaching_dictionary_words").select("id,display_word,row_status,review_status,dialect_code").in("id", words.map(word => word.canonicalWordId)));
  if (words.some(word => !rows.some(row => row.id === word.canonicalWordId && row.display_word === word.word && row.row_status === "active" && row.review_status === "approved_for_first_exposure" && row.dialect_code === "en-GB"))) return blocked("ing_canonical_word_not_ready");
  const selection = selectIngWords(input.childId, input.microSkillKey, words, input.learningItems);
  if (!selection.ok) return blocked(selection.blockers.join(","));
  const lesson = compileIngLesson(selection, `adle:${input.childId}:${input.date}:${input.microSkillKey}`);
  const teaching = teachingAuthority.semantic_projection;
  if (!teaching.sharedPage || !teaching.rulePage || !teaching.reflectionPrompt) return blocked("ing_teaching_missing");
  lesson.teaching.pages = [teaching.sharedPage, teaching.rulePage];
  lesson.reflectionPrompt = teaching.reflectionPrompt;
  if (!validateIngLesson(lesson)) return blocked("ing_teaching_content_invalid");
  const refs: PersistedCurriculumReleaseAuthorityV2 = { activationRevisionId: revision.id, releaseManifestId: release.id, releaseKey: release.release_key, releaseManifestSha256: release.release_manifest_sha256, dependencyFingerprint: release.dependency_fingerprint };
  const contentAuthorities: SpecialistSnapshotAuthorityV3[] = [
    { authorityType: "release_manifest", authorityId: release.id, version: "2", sourceHash: release.release_manifest_sha256 },
    { authorityType: "activation_revision", authorityId: revision.id, version: "2", sourceHash: fingerprintSnapshotValue(revision) },
    { authorityType: "dependency_set", authorityId: release.id, version: "2", sourceHash: release.dependency_fingerprint },
    ...exact.map((authority, index) => ({ authorityType: kinds[index], authorityId: authority.id, version: "1", sourceHash: authority.semantic_fingerprint })),
    { authorityType: "recipe_content", authorityId: teachingAuthority.id, version: "1", sourceHash: teachingAuthority.semantic_fingerprint },
  ];
  return { status: "ready" as const, ...compileIngSnapshotV3({ lesson, release: refs, contentAuthorities, childId: input.childId, parentUserId: input.parentUserId, date: input.date }), ...ingReadinessFacts(lesson, refs, input.childId) };
}
