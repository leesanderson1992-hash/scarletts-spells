import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignmentHeaderDraft, AssignmentItemDraft } from "../assignment-persistence";
import type { PersistedLessonRouteMetadataV2 } from "../composable-lesson/contracts";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { activationAllowsChild } from "../route-activation-scope";
import type { LearningItemFact } from "../learning-items";
import type { WordEvidenceStateResult } from "../word-evidence-state";
import { compileConvergenceAssignment, type FrozenConvergenceAssignment } from "./convergence-assignment";
import { loadApprovedContextualContent } from "./published-contextual-content-loader";

const ROUTE_ID = "homophone_contextual_choice";
const ROUTE_VERSION = "v1";

/** One small head read determines whether this route can own a child/skill. */
export async function contextualHomophoneRouteSelectedForChild(input: {
  client: SupabaseClient; childId: string; microSkillKey: string;
  environmentKey: "local" | "staging" | "production";
}): Promise<boolean> {
  const head = await input.client.from("adle_route_activation_heads").select("current_revision_id")
    .eq("environment_key", input.environmentKey).eq("route_id", ROUTE_ID)
    .eq("route_version", ROUTE_VERSION).eq("micro_skill_key", input.microSkillKey).maybeSingle();
  if (head.error) throw new Error(`contextual_homophone_route_probe:${head.error.message}`);
  if (!head.data) return false;
  const revision = await input.client.from("adle_route_activation_revisions")
    .select("activation_status,activation_route_key,readiness_report")
    .eq("id", head.data.current_revision_id).maybeSingle();
  if (revision.error) throw new Error(`contextual_homophone_route_probe:${revision.error.message}`);
  return revision.data?.activation_status === "enabled"
    && revision.data.activation_route_key === `${ROUTE_ID}:${ROUTE_VERSION}`
    && activationAllowsChild(revision.data.readiness_report, input.childId);
}

function itemDrafts(input: { assignment: FrozenConvergenceAssignment; childId: string;
  parentUserId: string; date: string; learningItems: readonly LearningItemFact[] }): AssignmentItemDraft[] {
  const words = new Map(input.assignment.contextCheck.selectedSets.flatMap(set => set.members)
    .map(member => [member.canonicalWordId, member.word]));
  return input.assignment.contextCheck.questions.map((question, index) => {
    const learningItem = input.learningItems.find(item => item.childId === input.childId
      && item.microSkillKey === input.assignment.microSkillKey
      && item.canonicalWordId === question.correctWordId && item.rowStatus === "active"
      && (item.itemStatus === "pending" || item.itemStatus === "pending_reteach"));
    return {
      childId: input.childId, parentUserId: input.parentUserId, domainModule: "spelling",
      itemType: "adle_lesson_context_choice", sourceType: "adle_composer",
      sourceEntityId: `adle:${input.childId}:${input.date}:${index + 1}`,
      templateKey: "HOMOPHONE_CONTEXT_SENTENCE_CHOICE", targetWord: words.get(question.correctWordId) ?? null,
      position: index + 1, status: "ready" as const,
      promptData: { questionId: question.questionId, setId: question.setId,
        sentenceWithBlank: question.sentenceWithBlank, optionWordIds: question.optionWordIds },
      metadata: { planDate: input.date, sectionKey: "lesson_context_choice",
        provenance: learningItem ? "authentic_target" : "generated_dictionary_practice",
        microSkillKey: input.assignment.microSkillKey, canonicalWordId: question.correctWordId,
        expectedEvidenceKind: "independent_sentence_choice", adleLearningItemRef: learningItem?.learningItemId ?? null,
        composerPolicyVersion: "homophone_contextual_choice_v1", schedulePolicyVersion: "contextual_choice_v1" },
    };
  });
}

/** Reads only the selected skill and its immutable release dependency. */
export async function prepareContextualHomophoneAssignment(input: {
  client: SupabaseClient; childId: string; parentUserId: string; date: string; microSkillKey: string;
  learningItems: readonly LearningItemFact[]; wordStates: readonly WordEvidenceStateResult[];
  environmentKey: "local" | "staging" | "production";
}): Promise<{ status: "blocked"; reason: string } | { status: "ready";
  header: AssignmentHeaderDraft; items: AssignmentItemDraft[]; snapshot: FrozenConvergenceAssignment }> {
  const blocked = (reason: string) => ({ status: "blocked" as const, reason });
  const head = await input.client.from("adle_route_activation_heads").select("current_revision_id")
    .eq("environment_key", input.environmentKey).eq("route_id", ROUTE_ID)
    .eq("route_version", ROUTE_VERSION).eq("micro_skill_key", input.microSkillKey).maybeSingle();
  if (head.error) throw new Error(`contextual_homophone_readiness:${head.error.message}`);
  if (!head.data) return blocked("contextual_homophone_route_inactive");
  const revision = await input.client.from("adle_route_activation_revisions").select("*")
    .eq("id", head.data.current_revision_id).maybeSingle();
  if (revision.error) throw new Error(`contextual_homophone_readiness:${revision.error.message}`);
  const active = revision.data;
  if (!active || active.activation_status !== "enabled"
    || active.activation_route_key !== `${ROUTE_ID}:${ROUTE_VERSION}`
    || !activationAllowsChild(active.readiness_report, input.childId))
    return blocked("contextual_homophone_activation_scope_not_ready");
  const releaseRead = await input.client.from("adle_curriculum_release_manifests").select("*")
    .eq("id", active.release_manifest_id).maybeSingle();
  if (releaseRead.error) throw new Error(`contextual_homophone_readiness:${releaseRead.error.message}`);
  const release = releaseRead.data;
  if (!release || release.route_id !== ROUTE_ID || release.route_version !== ROUTE_VERSION
    || release.payload_version !== 1 || release.release_manifest_sha256 !== active.release_manifest_sha256
    || release.dependency_fingerprint !== active.dependency_fingerprint)
    return blocked("contextual_homophone_release_mismatch");
  const current = await input.client.rpc("adle_route_activation_revision_is_current_v2", {
    p_activation_revision_id: active.id, p_release_manifest_id: release.id,
    p_release_manifest_sha256: release.release_manifest_sha256,
    p_dependency_fingerprint: release.dependency_fingerprint });
  if (current.error) throw new Error(`contextual_homophone_readiness:${current.error.message}`);
  if (current.data !== true) return blocked("contextual_homophone_activation_changed");
  const dependencies = await input.client.from("adle_curriculum_release_dependencies").select("*")
    .eq("release_manifest_id", release.id).eq("micro_skill_key", input.microSkillKey);
  if (dependencies.error) throw new Error(`contextual_homophone_readiness:${dependencies.error.message}`);
  if (dependencies.data?.length !== 1 || dependencies.data[0].authority_type !== "homophone_contextual_content")
    return blocked("contextual_homophone_dependency_invalid");
  const dependency = dependencies.data[0];
  const authorityRead = await input.client.from("adle_curriculum_dependency_authorities")
    .select("id,authority_key,authority_type,schema_version,semantic_projection,semantic_fingerprint")
    .eq("id", dependency.authority_id).maybeSingle();
  if (authorityRead.error) throw new Error(`contextual_homophone_readiness:${authorityRead.error.message}`);
  const authority = authorityRead.data;
  if (!authority || authority.authority_key !== dependency.authority_key
    || authority.authority_type !== "homophone_contextual_content" || authority.schema_version !== 1
    || authority.semantic_fingerprint !== dependency.semantic_fingerprint
    || fingerprintSnapshotValue(authority.semantic_projection) !== authority.semantic_fingerprint)
    return blocked("contextual_homophone_authority_invalid");
  const content = await loadApprovedContextualContent(input.client, input.microSkillKey);
  const projection = authority.semantic_projection as { content?: unknown; microSkillKey?: string };
  if (projection.microSkillKey !== input.microSkillKey
    || fingerprintSnapshotValue(projection.content) !== fingerprintSnapshotValue(content))
    return blocked("contextual_homophone_content_changed");
  const queuedItems = input.learningItems.filter(item => item.childId === input.childId
    && item.microSkillKey === input.microSkillKey && item.rowStatus === "active"
    && (item.itemStatus === "pending" || item.itemStatus === "pending_reteach"))
    .map(item => ({ canonicalWordId: item.canonicalWordId, intakeOn: item.intakeOn,
      status: item.itemStatus as "pending" | "pending_reteach" }));
  if (!queuedItems.length) return blocked("contextual_homophone_no_selectable_target");
  const masteredWordIds = new Set(input.wordStates.filter(state => state.childId === input.childId
    && state.state === "mastered").map(state => state.canonicalWordId));
  const rotationIndex = Math.floor(Date.parse(`${input.date}T00:00:00Z`) / 86_400_000);
  const snapshot = compileConvergenceAssignment({ content, queuedItems, masteredWordIds, rotationIndex });
  if (!snapshot || !snapshot.contextCheck.selectedSets.some(set => set.members.some(member =>
    queuedItems.some(item => item.canonicalWordId === member.canonicalWordId))))
    return blocked("contextual_homophone_selection_unavailable");
  const curriculumRelease = { activationRevisionId: active.id, releaseManifestId: release.id,
    releaseKey: release.release_key, releaseManifestSha256: release.release_manifest_sha256,
    dependencyFingerprint: release.dependency_fingerprint };
  const lessonRouteMetadata: PersistedLessonRouteMetadataV2 = {
    metadataSchemaVersion: 2,
    route: { routeId: ROUTE_ID, routeVersion: ROUTE_VERSION },
    recipe: { recipeKey: ROUTE_ID, recipeVersion: ROUTE_VERSION },
    payload: { kind: "homophone_contextual_lesson_v1", version: 1 }, curriculumRelease,
  };
  const items = itemDrafts({ assignment: snapshot, childId: input.childId,
    parentUserId: input.parentUserId, date: input.date, learningItems: input.learningItems });
  const header: AssignmentHeaderDraft = { childId: input.childId, parentUserId: input.parentUserId,
    assignmentDate: input.date, title: "ADLE Daily Plan", status: "pending",
    targetWords: [...new Set(snapshot.contextCheck.selectedSets.flatMap(set => set.members.map(member => member.word)))],
    reviewWords: [], assignmentGenerationSource: "adle_composer_v1", lessonRouteMetadata };
  return { status: "ready", header, items, snapshot };
}

export async function persistContextualHomophoneAssignment(input: {
  client: SupabaseClient; parentUserId: string; childId: string; date: string;
  prepared: Extract<Awaited<ReturnType<typeof prepareContextualHomophoneAssignment>>, { status: "ready" }>;
}): Promise<string> {
  const result = await input.client.rpc("persist_adle_homophone_contextual_daily_plan_v1", {
    p_parent_user_id: input.parentUserId, p_child_id: input.childId,
    p_plan_date: input.date, p_header: input.prepared.header,
    p_items: input.prepared.items, p_intakes: [], p_snapshot: input.prepared.snapshot,
  });
  if (result.error || typeof result.data !== "string")
    throw new Error(`contextual_homophone_persist:${result.error?.message ?? "missing id"}`);
  return result.data;
}
