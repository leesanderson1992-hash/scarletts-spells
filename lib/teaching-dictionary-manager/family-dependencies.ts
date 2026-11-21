import { isSchwaWorkbookSkill, type SchwaWorkbookFacts } from "./weak-vowel-workbook";
import { stageSchwaWorkbookDraft } from "./schwa-bulk-review";
import "server-only";
import { randomUUID } from "node:crypto";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import { saveBulkSkillApprovalsAsActor } from "./bulk-approval-service";
import { hasCandidateRule } from "./lesson-candidate";
import { prefixWorkbookEnabled } from "./prefix-workbook";
import { stagePrefixWorkbookDraft } from "./prefix-workbook-draft";
import { isSuffixWorkbookPilot } from "./bulk-review-scope";
import { stageAbleIbleWord } from "./able-ible-review";
import { isCompoundWorkbookSkill, type CompoundWorkbookFacts } from "./compound-workbook";
import { stageCompoundWorkbookDraft } from "./compound-workbook-draft";
import type { SuffixWorkbookFacts } from "./able-ible-workbook";
import { publicationBlockers, routeBlockers, type WordDraftPayload } from "./contracts";

type Db = ReturnType<typeof createServiceRoleClient>;
export type FamilyDependency = { id: string; canonical_word_id: string; sense_id: string; micro_skill_key: string;
  component_part_id: string; base_form: string; base_kind: string; expected_meaning: string; expected_morphology_id: string;
  expected_reviewed_at: string; reviewed_by: string; updated_at: string; confirmed_family_key: string | null;
  status: string; detail: string; family_resolved: boolean; context: { schwaFacts?: SchwaWorkbookFacts; prefixMeaning?: string; suffixFacts?: SuffixWorkbookFacts; compoundFacts?: CompoundWorkbookFacts } };
export const familyMeaningKey = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase("en-GB").replace(/\s+/gu, " ").replace(/[.!]$/u, "");
type Family = { family_key: string; base_lemma: string; base_kind: string; base_meaning: string; review_status: string; revision?: number };
export function matchingDependencyFamily(dependency: Pick<FamilyDependency, "confirmed_family_key" | "expected_meaning" | "base_form" | "base_kind">, families: Family[]) {
  const eligible = families.filter(family => family.review_status === "approved" && family.base_lemma === dependency.base_form
    && family.base_kind === dependency.base_kind);
  const matching = dependency.confirmed_family_key ? eligible.filter(family => family.family_key === dependency.confirmed_family_key)
    : eligible.filter(family => familyMeaningKey(family.base_meaning) === familyMeaningKey(dependency.expected_meaning));
  return matching.length === 1 ? matching[0] : null;
}

/** A bounded, leased worker. It links and rechecks reviewed facts; it never publishes. */
export async function recheckWaitingFamilyWords(db: Db, environment: "staging" | "production", base?: string, limit = 10) {
  const claimed = await db.rpc("claim_dictionary_family_dependencies", { p_environment: environment, p_limit: limit, p_base: base ?? null });
  if (claimed.error) throw new Error("Could not claim saved family reviews.");
  const rows = claimed.data as FamilyDependency[];
  let ready = 0, changed = 0;
  for (const row of rows) {
    let familyResolved = false;
    const finish = async (status: string, detail: string) => {
      const saved = await db.from("teaching_dictionary_family_dependencies").update({ status, detail, family_resolved: familyResolved, lease_until: null })
        .eq("id", row.id).eq("updated_at", row.updated_at);
      if (saved.error) throw new Error("Could not save the family recheck result.");
    };
    try {
      let [bundle] = await loadReviewedMeaningBundles(db, [row.canonical_word_id]);
      const morphology = await db.from("teaching_dictionary_current_sense_morphology").select("id")
        .eq("canonical_word_id", row.canonical_word_id).eq("sense_id", row.sense_id).maybeSingle();
      if (morphology.error) throw new Error("Could not read the current approved parts.");
      if (!bundle || bundle.sourceSenseReviewedAt !== row.expected_reviewed_at || morphology.data?.id !== row.expected_morphology_id) {
        await finish("needs_review", "The word changed after this review. Review its latest facts before linking automatically."); continue;
      }
      if (bundle.senseSet.senses.find(sense => sense.id === row.sense_id)?.partOfSpeech === "root") {
        await finish("needs_review", "This is a root support entry. Use dedicated root-family review, not an ordinary spelling target."); continue;
      }
      const families = await db.from("teaching_dictionary_families_with_current_meaning")
        .select("family_key,base_lemma,base_kind,base_meaning,review_status,revision").eq("base_lemma", row.base_form).order("revision", { ascending: false });
      if (families.error) throw new Error("Could not read the approved families.");
      const latest = [...new Map([...families.data].reverse().map(family => [family.family_key, family])).values()];
      const family = matchingDependencyFamily(row, latest);
      if (!family) {
        await finish(latest.some(f => f.review_status === "approved" && f.base_kind === row.base_kind) ? "needs_choice" : "waiting",
          latest.some(f => f.review_status === "approved" && f.base_kind === row.base_kind)
            ? "Choose the family meaning. No unique approved family matches the reviewed meaning." : "Waiting for this base/root family to be approved."); continue;
      }
      if (family.base_kind === "bound_root") {
        const root = await db.from("canonical_teaching_dictionary_lexical_root_metadata").select("root_text,root_meaning,origin_language")
          .eq("family_key", family.family_key).eq("revision", family.revision).maybeSingle();
        if (root.error) throw new Error("Could not read the reviewed root entry.");
        if (!root.data || !root.data.origin_language || root.data.root_text !== family.base_lemma) {
          await finish("waiting", "The bound-root family needs its dedicated reviewed root entry and origin."); continue;
        }
      }
      const existingLinks = await db.from("teaching_dictionary_current_sense_family_memberships").select("family_key")
        .eq("canonical_word_id", row.canonical_word_id).eq("sense_id", row.sense_id).eq("component_part_id", row.component_part_id);
      if (existingLinks.error) throw new Error("Could not check current family choices.");
      if (existingLinks.data.some(link => link.family_key !== family.family_key)) {
        await finish("needs_review", "A different family has already been linked. Review that choice on the word page."); continue;
      }
      const analysis = bundle.analyses.find(analysis => analysis.senseId === row.sense_id)!;
      const relationship = row.micro_skill_key.startsWith("D4_INF_") ? "regular_inflection" : "derived";
      const wholeBase = bundle.displayWord === row.base_form && analysis.parts.length === 1;
      const linked = existingLinks.data.some(link => link.family_key === family.family_key) ? { error: null } : await db.rpc("review_teaching_dictionary_sense_family_membership", {
        p_request_id: randomUUID(), p_word_id: row.canonical_word_id, p_sense_id: row.sense_id,
        p_sense_morphology_id: morphology.data.id, p_family_key: family.family_key, p_component_part_id: row.component_part_id,
        p_relationship_kind: wholeBase ? "free_base" : relationship, p_action: "approve", p_actor: row.reviewed_by,
        p_source_reference: `Saved workbook family dependency ${row.id}`,
      });
      if (linked.error) throw new Error("The family could not be linked to the reviewed component.");
      familyResolved = true;
      if (!existingLinks.data.length) changed++;
      [bundle] = await loadReviewedMeaningBundles(db, [row.canonical_word_id]);
      if (bundle.senseSet.senses.find(sense => sense.id === row.sense_id)?.partOfSpeech === "root") {
        await finish("needs_review", "Root support entry linked. It is not an ordinary spelling or dictation target."); continue;
      }
      if (hasCandidateRule(row.micro_skill_key)) {
        const approval = await saveBulkSkillApprovalsAsActor({ microSkillKey: row.micro_skill_key,
          applyWordIds: [row.canonical_word_id], excludeWordIds: [], clearWordIds: [], deassignWordIds: [],
          senseIds: { [row.canonical_word_id]: row.sense_id }, requestId: randomUUID(), workbookReadback: true,
          sourceKind: "teaching_dictionary_import" }, row.reviewed_by);
        if (!approval.ok) {
          await finish("needs_review", approval.blocked[0]?.reason ?? approval.error ?? "Family linked; complete the remaining lesson facts."); continue;
        }
        changed += approval.approvedCount;
      }
      const skill = row.micro_skill_key;
      let draftId: string | undefined;
      if (isSchwaWorkbookSkill(skill) && row.context.schwaFacts)
        draftId = await stageSchwaWorkbookDraft(db, row.reviewed_by, bundle, skill, row.sense_id, row.context.schwaFacts);
      else if (prefixWorkbookEnabled(skill) && row.context.prefixMeaning)
        draftId = await stagePrefixWorkbookDraft(db, row.reviewed_by, bundle, skill, row.sense_id, row.context.prefixMeaning);
      else if (isSuffixWorkbookPilot(skill) && row.context.suffixFacts)
        await stageAbleIbleWord(db, row.reviewed_by, bundle, row.sense_id, row.context.suffixFacts, skill);
      else if (isCompoundWorkbookSkill(skill) && row.context.compoundFacts)
        draftId = await stageCompoundWorkbookDraft(db, row.reviewed_by, bundle, skill, row.sense_id, row.context.compoundFacts, row.context.suffixFacts);
      if (draftId) {
        const staged = await db.from("teaching_dictionary_manager_drafts").select("payload").eq("id", draftId).single();
        if (staged.error) throw new Error("Could not verify the staged word facts.");
        const payload = staged.data.payload as WordDraftPayload;
        const blockers = [...publicationBlockers(payload, bundle.displayWord.toLocaleLowerCase("en-GB")),
          ...payload.routeContents.filter(route => route.microSkillKey === skill).flatMap(route => routeBlockers(route, payload))];
        if (blockers.length) { await finish("needs_review", `Family linked. ${[...new Set(blockers)].join(" ")}`); continue; }
      }
      await finish("ready", "Family linked and lesson checks rerun. Open Preview to review and publish; no automatic publication."); ready++;
    } catch (error) {
      await finish("error", error instanceof Error ? error.message : "Family recheck failed. It will be retried.");
    }
  }
  return { checked: rows.length, ready, changed };
}

export async function loadSavedFamilyReviews(db: Db, environment: string, skill?: string) {
  let query = db.from("teaching_dictionary_family_dependencies")
    .select("id,canonical_word_id,sense_id,micro_skill_key,component_part_id,base_form,base_kind,expected_meaning,status,detail,family_resolved")
    .eq("environment_key", environment).order("updated_at", { ascending: false }).limit(100);
  if (skill) query = query.eq("micro_skill_key", skill);
  const result = await query;
  if (result.error) throw new Error("Could not load saved family reviews.");
  return result.data as FamilyDependency[];
}
