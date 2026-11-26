import { loadPublishedWritingAssociations } from "@/lib/writing-engine/whole-writing/knowledge-repository";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivatedBaseWordReleaseAuthority } from "../curriculum-release-activation";
import { loadCurrentLessonSenses, type LessonSenseProjection } from "@/lib/teaching-dictionary-manager/lesson-sense-projection";
import type { CanonicalPart } from "@/lib/teaching-dictionary-manager/canonical-morphology";
import { inheritFamilyPartMeanings } from "@/lib/teaching-dictionary-manager/family-part-meanings";
import { semanticJson } from "../inflection/semantic-json";
import { loadCurrentPairDeassignments } from "../word-skill-relationships/pair-decision-veto";
import { canonicalPairKey } from "../word-skill-relationships/pair-key";
import { chooseBaseWordFamilyAnchor, loadBaseWordFamilyAnchors } from "./base-word-family-anchors";
import { parseAdleRouteActivationEnvironment } from "../route-activation-environment";
import { canonicalBaseWordAnalysis } from "../base-word-canonical-analysis";

type CurrentSense = Extract<LessonSenseProjection, { status: "current" }>;
type ApprovedWord = {
  sense: CurrentSense;
  parts: CanonicalPart[];
  joins: unknown[];
  transformations: unknown[];
  wordSum: string;
};

export const baseFamilyWordKey = (family: string, wordId: string) => `${family}:${wordId}`;

export function baseWordPartShape(parts: unknown[]) {
  return semanticJson(parts.map(raw => {
    const part = raw as Partial<CanonicalPart>;
    return [part.kind, part.sourceText, part.surfaceText];
  }));
}

export async function loadPublishedBaseFamilyWords(client: SupabaseClient, activation: ActivatedBaseWordReleaseAuthority) {
  const skill = activation.microSkillKey;
  const environment = parseAdleRouteActivationEnvironment(activation.environmentKey);
  if (!environment) throw new Error("Base Word release environment is invalid.");
  const ids = [...new Set(activation.family.families.flatMap(f => f.members.map(w => w.canonicalWordId)))];
  const result = new Map<string, ApprovedWord>();
  if (!ids.length) return result;
  const [associations, deassigned, anchors] = await Promise.all([
    loadPublishedWritingAssociations(client, environment, ids),
    loadCurrentPairDeassignments({ client, environmentKey: environment,
      pairs: ids.map(canonicalWordId => ({ canonicalWordId, microSkillKey: skill })) }),
    loadBaseWordFamilyAnchors(client, activation.family.families.map(family => family.baseWordId)),
  ]);
  const published = [...new Set(associations.filter(row => row.microSkillKey === skill &&
    row.relationshipRole === "demonstrates" && row.rowStatus === "active").flatMap(row =>
      row.canonicalWordId && !deassigned.has(canonicalPairKey(row.canonicalWordId, skill)) ? [row.canonicalWordId] : []))];
  const senses = new Map<string, LessonSenseProjection>();
  const morphologyBySense = new Map<string, { id: string; morphology_parts: unknown; morphology_joins: unknown; morphology_transformations: unknown; word_sum: string }>();
  const membershipsBySense = new Map<string, Array<{
    canonical_word_id: string; sense_id: string; sense_morphology_id: string; family_key: string;
    component_part_id: string; relationship_kind: string; base_meaning: string | null;
  }>>();
  for (let offset = 0; offset < published.length; offset += 100) {
    const batch = published.slice(offset, offset + 100);
    const [current, analyses, links] = await Promise.all([
      loadCurrentLessonSenses(client, batch, [skill]),
      client.from("teaching_dictionary_current_sense_morphology").select("id,canonical_word_id,sense_id,morphology_parts,morphology_joins,morphology_transformations,word_sum").in("canonical_word_id", batch),
      client.from("teaching_dictionary_current_sense_family_memberships").select("canonical_word_id,sense_id,sense_morphology_id,family_key,component_part_id,relationship_kind,base_meaning").in("canonical_word_id", batch),
    ]);
    if (analyses.error || links.error) throw new Error("Could not read the published Base Word dictionary facts.");
    for (const [key, sense] of current) senses.set(key, sense);
    for (const row of analyses.data) morphologyBySense.set(`${row.canonical_word_id}:${row.sense_id}`, row);
    for (const link of links.data) {
      const key = `${link.canonical_word_id}:${link.sense_id}`;
      membershipsBySense.set(key, [...membershipsBySense.get(key) ?? [], link]);
    }
  }
  for (const family of activation.family.families) {
    const memberFamilyKeys = family.members.flatMap(member => {
      if (member.canonicalWordId === family.baseWordId) return [];
      const sense = senses.get(`${member.canonicalWordId}:${skill}`);
      return sense?.status === "current" ? (membershipsBySense.get(`${member.canonicalWordId}:${sense.senseId}`) ?? [])
        .filter(link => link.relationship_kind === "derived" || link.relationship_kind === "regular_inflection")
        .map(link => link.family_key) : [];
    });
    // A reviewed lesson choice for the base is an explicit sense decision,
    // including when its wording differs from the historical release.
    const baseSense = senses.get(`${family.baseWordId}:${skill}`);
    if (baseSense?.status === "current") memberFamilyKeys.push(...
      (membershipsBySense.get(`${family.baseWordId}:${baseSense.senseId}`) ?? [])
        .filter(link => link.relationship_kind === "free_base").map(link => link.family_key));
    const anchor = chooseBaseWordFamilyAnchor(anchors, family, memberFamilyKeys);
    if (!anchor) continue;
    const approvedMembers = new Map<string, ApprovedWord>();
    for (const member of family.members) {
      if (member.canonicalWordId === family.baseWordId) {
        approvedMembers.set(baseFamilyWordKey(family.baseFamilyKey, member.canonicalWordId), { ...anchor, transformations: [] });
        continue;
      }
      const sense = senses.get(`${member.canonicalWordId}:${skill}`);
      if (sense?.status !== "current" || !sense.pronunciation || !sense.dictationSentence ||
        !sense.dictationAuthorityId || sense.dictationTargetTokenIndex === null) continue;
      const senseKey = `${member.canonicalWordId}:${sense.senseId}`;
      const analysis = morphologyBySense.get(senseKey);
      if (!analysis || !Array.isArray(analysis.morphology_parts) || !Array.isArray(analysis.morphology_joins) ||
        !Array.isArray(analysis.morphology_transformations)) continue;
      const parts = analysis.morphology_parts as CanonicalPart[];
      const membership = (membershipsBySense.get(senseKey) ?? []).filter(link =>
        link.sense_morphology_id === analysis.id && link.family_key === anchor.familyKey &&
        parts.some(part => part.kind === "base" && part.id === link.component_part_id));
      if (membership.length !== 1) continue;
      const displayWord = activation.dictionaryWords.find(word => word.canonicalWordId === member.canonicalWordId)?.displayWord;
      if (!displayWord || !canonicalBaseWordAnalysis({ displayWord, parts,
        joins: analysis.morphology_joins, transformations: analysis.morphology_transformations,
        wordSum: analysis.word_sum, componentPartId: membership[0].component_part_id,
        baseSource: anchor.parts[0].sourceText, relationshipKind: membership[0].relationship_kind })) continue;
      approvedMembers.set(baseFamilyWordKey(family.baseFamilyKey, member.canonicalWordId), {
        sense, parts: inheritFamilyPartMeanings(parts, membership),
        joins: analysis.morphology_joins, transformations: analysis.morphology_transformations, wordSum: analysis.word_sum,
      });
    }
    if (approvedMembers.has(baseFamilyWordKey(family.baseFamilyKey, family.baseWordId))) {
      for (const [key, word] of approvedMembers) result.set(key, word);
    }
  }
  return result;
}

/** Keep the immutable release references for snapshot persistence while
 * replacing the selectable word facts with the matching dictionary records. */
export async function projectPublishedBaseWordRelease(client: SupabaseClient, activation: ActivatedBaseWordReleaseAuthority) {
  const approved = await loadPublishedBaseFamilyWords(client, activation);
  const family = structuredClone(activation.family);
  const factsByWord = new Map<string, CurrentSense>();
  for (const entry of family.families) {
    const base = approved.get(baseFamilyWordKey(entry.baseFamilyKey, entry.baseWordId));
    if (base) entry.baseMeaning = base.sense.meaning;
    entry.members = entry.members.flatMap(member => {
      const facts = approved.get(baseFamilyWordKey(entry.baseFamilyKey, member.canonicalWordId));
      if (!facts) return [];
      factsByWord.set(member.canonicalWordId, facts.sense);
      return [{ ...member, morphologyParts: facts.parts, morphologyJoins: facts.joins,
        morphologyTransformations: facts.transformations,
        transformationNotes: facts.transformations.map(change => (change as { explanation: string }).explanation).join(" "),
        dictionarySenseId: facts.sense.senseId, wordSum: facts.wordSum, childFriendlyMeaning: facts.sense.meaning }];
    });
  }
  const dictionaryWords = activation.dictionaryWords.flatMap(word => {
    const sense = factsByWord.get(word.canonicalWordId);
    return sense?.dictationSentence && sense.dictationTargetTokenIndex !== null ? [{
      ...word, dictationSentence: sense.dictationSentence, audioText: sense.dictationSentence,
      dictationTargetTokenIndex: sense.dictationTargetTokenIndex,
      dictationVariants: undefined, dictationSetFingerprint: undefined,
    }] : [];
  });
  return { ...activation, family, dictionaryWords };
}
