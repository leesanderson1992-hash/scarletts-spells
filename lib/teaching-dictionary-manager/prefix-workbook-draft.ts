import "server-only";

import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { semanticJson } from "@/lib/adle/inflection/semantic-json";
import { emptyMetadata, emptyMorphology, routeForSkill, routeWithSharedFacts,
  type RouteContentDraft, type WordDraftPayload } from "./contracts";
import { normaliseWrittenSyllableBreakdown, writtenSyllableBlockers } from "./authoring";
import { inheritFamilyPartMeanings } from "./family-part-meanings";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import { NEGATIVE_PREFIX_SKILL, IN_PREFIX_FORMS, negativePrefixForBase, prefixWorkbookChoice, prefixWorkbookEnabled,
  prefixWorkbooks, type PrefixWorkbookSkill } from "./prefix-workbook";

type Db = ReturnType<typeof createServiceRoleClient>;

export type PrefixWorkbookDetails = Pick<WordDraftPayload, "ageBand" | "frequencyBand" | "complexityBand" | "writtenSyllableBreakdown">
  & { hasSchwa?: boolean };

export async function stagePrefixWorkbookDraft(db: Db, actorId: string, bundle: MultiSenseCsvBundle,
  skill: PrefixWorkbookSkill, senseId: string, meaning: string, details?: PrefixWorkbookDetails) {
  const route = routeForSkill(skill);
  const sense = bundle.senseSet.senses.find(item => item.id === senseId);
  const analysis = bundle.analyses.find(item => item.senseId === senseId);
  if (!route || !sense || !analysis) throw new Error("The workbook teaching meaning could not be found.");
  const wordId = bundle.wordId;
  const pilot = prefixWorkbookEnabled(skill);
  const choice = prefixWorkbookChoice(skill, meaning);
  if (!choice) throw new Error("Choose the meaning group for this prefix.");
  const source = prefixWorkbooks[skill].source;
  const [profile, word, metadata, memberships, previous, revision] = await Promise.all([
    db.from("canonical_teaching_dictionary_prefix_profiles").select("id,source_row_hash,meaning_bins,intro_content,prefix_choices")
      .eq("micro_skill_key", skill).eq("row_status", "active").eq("review_status", "approved_for_first_exposure").single(),
    db.from("canonical_teaching_dictionary_words").select("normalised_word,dialect_code,age_band,frequency_band,complexity_band,source_category,source_name,source_url,source_licence,source_use_note,confidence")
      .eq("id", wordId).single(),
    db.from("canonical_teaching_dictionary_word_metadata").select("has_schwa,written_syllable_breakdown,grapheme_notes,morphology_notes,irregularity_notes")
      .eq("canonical_word_id", wordId).eq("row_status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("teaching_dictionary_current_sense_family_memberships").select("component_part_id,base_meaning")
      .eq("canonical_word_id", wordId).eq("sense_id", senseId).eq("family_key", analysis.familyKey),
    db.from("teaching_dictionary_manager_drafts").select("id,payload,source_reference")
      .eq("canonical_word_id", wordId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    pilot ? db.from("teaching_dictionary_reviewed_sense_sets").select("reviewed_at").eq("canonical_word_id", wordId).single() : null,
  ]);
  if (revision?.error || profile.error || word.error || metadata.error || memberships.error || previous.error)
    throw new Error("Could not load the current prefix lesson and dictionary facts.");
  const pronunciation = bundle.senseSet.pronunciations.find(item => item.id === sense.pronunciationId);
  const parts = inheritFamilyPartMeanings(analysis.parts, memberships.data);
  const prefix = parts[0];
  const prefixText = skill === NEGATIVE_PREFIX_SKILL ? prefix?.sourceText : choice.prefix;
  if (prefix?.kind !== "prefix" || prefix.sourceText !== prefixText || prefix.surfaceText !== prefixText
    || (skill === NEGATIVE_PREFIX_SKILL && !IN_PREFIX_FORMS.some(form => form === prefixText))
    || prefix.gloss !== choice.gloss)
    throw new Error("The reviewed prefix part must match the selected meaning group.");
  // This lesson's existing form-sort activity keeps form IDs. The semantic
  // choice is canonical in the prefix part's gloss, never in a spelling bin.
  const meaningBinKey = skill === NEGATIVE_PREFIX_SKILL ? prefixText : meaning;
  if (!(profile.data.meaning_bins as { id: string }[]).some(bin => bin.id === meaningBinKey))
    throw new Error("This meaning group is unavailable in the current prefix lesson.");
  if (skill === NEGATIVE_PREFIX_SKILL && meaning === "not" && prefix.surfaceText !== negativePrefixForBase(bundle.displayWord.slice(prefix.surfaceText.length)))
    throw new Error("Use the negative prefix form that matches the first letter of the base.");
  const facts = word.data;
  const priorPayload = previous.data?.payload as WordDraftPayload | undefined;
  const prior = priorPayload?.skillSenseIds?.[skill] === senseId
    ? priorPayload.routeContents.find(item => item.microSkillKey === skill) : undefined;
  const priorDetails = pilot && previous.data?.source_reference === source && prior
    && prior.content.workbookSenseRevision === revision?.data?.reviewed_at ? priorPayload : undefined;
  const approvedWritten = metadata.data?.written_syllable_breakdown ?? "";
  const written = pilot && writtenSyllableBlockers(bundle.displayWord, approvedWritten).length ? "" : approvedWritten;
  const payload: WordDraftPayload = {
    displayWord: bundle.displayWord, senseSet: bundle.senseSet, definition: sense.definition,
    dictationSentence: sense.dictationSentence ?? "", dictationTargetTokenIndex: sense.dictationTargetTokenIndex ?? 0,
    writtenSyllableBreakdown: normaliseWrittenSyllableBreakdown(written
      || details?.writtenSyllableBreakdown || priorDetails?.writtenSyllableBreakdown || ""),
    ageBand: facts.age_band || details?.ageBand || priorDetails?.ageBand || "",
    frequencyBand: facts.frequency_band || details?.frequencyBand || priorDetails?.frequencyBand || "",
    complexityBand: facts.complexity_band || details?.complexityBand || priorDetails?.complexityBand || "",
    metadata: { ...emptyMetadata(), syllables: String(pronunciation?.spokenSyllableCount ?? ""),
      phoneme_hint: pronunciation?.ipa ?? "", stress_pattern: pronunciation?.stressPattern ?? "",
      morphemes: analysis.wordSum, has_schwa: metadata.data?.has_schwa ?? details?.hasSchwa ?? priorDetails?.metadata.has_schwa ?? null,
      grapheme_notes: metadata.data?.grapheme_notes ?? "", morphology_notes: metadata.data?.morphology_notes?.trim()
        || (pilot ? `The prefix ${prefixText}- means ${choice.gloss} in this word.` : ""),
      irregularity_notes: metadata.data?.irregularity_notes ?? "" },
    canonicalMorphology: { ...emptyMorphology(), analysisStatus: "approved", parts, joins: analysis.joins,
      transformations: analysis.transformations, wordSum: analysis.wordSum, rawPartOfSpeech: sense.partOfSpeech },
    provenance: { sourceCategory: facts.source_category as WordDraftPayload["provenance"]["sourceCategory"],
      sourceName: facts.source_name ?? "", sourceUrl: facts.source_url ?? "", sourceLicence: facts.source_licence ?? "",
      sourceUseNote: facts.source_use_note ?? "", confidence: facts.confidence as WordDraftPayload["provenance"]["confidence"] },
    skillKeys: [skill], skillSenseIds: { [skill]: senseId }, routeContents: [],
  };
  const intro = profile.data.intro_content as { validChoiceAudit?: { word: string }[] } | null;
  const priorAudit = prior && prior.content.expectedProfileId === profile.data.id ? prior.content.choiceAudit : undefined;
  const choices = (profile.data.prefix_choices as { text: string }[] | null) ?? [];
  const canDeriveChoice = pilot && choices.filter(option => option.text === prefixText).length === 1
    && new Set(choices.map(choice => choice.text)).size === choices.length;
  const derivedAudit = canDeriveChoice ? { word: bundle.displayWord,
    choiceVerdicts: Object.fromEntries(choices.map(choice => [choice.text, choice.text === prefix.surfaceText])) } : undefined;
  const choiceAudit = derivedAudit ?? priorAudit ?? intro?.validChoiceAudit?.find(item => item.word === bundle.displayWord);
  const content: RouteContentDraft = {
    routeId: route.routeId, routeVersion: route.routeVersion, microSkillKey: skill, wordMeaning: "", wordSum: "",
    content: { prefixVariant: prefixText, meaningBinKey, expectedProfileId: profile.data.id,
      expectedSourceRowHash: profile.data.source_row_hash, ...(pilot ? { workbookSenseRevision: revision!.data!.reviewed_at } : {}), ...(choiceAudit ? { choiceAudit } : {}) },
  };
  payload.routeContents = [routeWithSharedFacts(content, payload)];
  let draftId = previous.data && semanticJson(priorPayload) === semanticJson(payload) ? previous.data.id : undefined;
  if (!draftId) {
    const draft = await db.from("teaching_dictionary_manager_drafts").insert({
      canonical_word_id: wordId, normalised_word: facts.normalised_word, dialect_code: facts.dialect_code, payload,
      source_kind: "manual", source_reference: pilot ? source : "Prefix meaning from Bulk review workbook", created_by: actorId,
    }).select("id").single();
    if (draft.error) throw new Error("Could not save the prefix lesson draft.");
    draftId = draft.data.id;
  }
  const staged = await db.rpc("stage_teaching_dictionary_route_draft", { p_draft: draftId, p_actor: actorId });
  if (staged.error || !staged.data?.length) throw new Error("Could not stage the prefix lesson draft. Open the saved draft to retry.");
  return draftId;
}
