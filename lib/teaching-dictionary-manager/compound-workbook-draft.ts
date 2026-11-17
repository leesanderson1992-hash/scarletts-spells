import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { CompoundWordMicroSkillKey } from "@/lib/adle/morphology/compound-word-structure-v2";
import { inheritFamilyPartMeanings } from "./family-part-meanings";
import { dictationVariants } from "./authoring";
import { semanticJson } from "@/lib/adle/inflection/semantic-json";
import { DICTIONARY_BANDS, emptyMetadata, emptyMorphology, publicationBlockers, routeBlockers, routeWithSharedFacts, type WordDraftPayload } from "./contracts";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import { compoundWorkbookSource, type CompoundWorkbookFacts } from "./compound-workbook";
import type { SuffixWorkbookFacts } from "./able-ible-workbook";

type Db = ReturnType<typeof createServiceRoleClient>;
export async function stageCompoundWorkbookDraft(db: Db, actorId: string, bundle: MultiSenseCsvBundle,
  skill: CompoundWordMicroSkillKey, senseId: string, facts: CompoundWorkbookFacts, details?: SuffixWorkbookFacts) {
  const sense = bundle.senseSet.senses.find(row => row.id === senseId);
  const analysis = bundle.analyses.find(row => row.senseId === senseId);
  if (!sense || !analysis) throw new Error("Choose the reviewed compound meaning and approve its parts.");
  const [word, metadata, previous, componentWords, revision, memberships] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("normalised_word,dialect_code,age_band,frequency_band,complexity_band,source_category,source_name,source_url,source_licence,source_use_note,confidence").eq("id", bundle.wordId).single(),
    db.from("canonical_teaching_dictionary_word_metadata").select("has_schwa,written_syllable_breakdown,grapheme_notes,morphology_notes,irregularity_notes").eq("canonical_word_id", bundle.wordId).eq("row_status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("teaching_dictionary_manager_drafts").select("id,payload").eq("canonical_word_id", bundle.wordId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("canonical_teaching_dictionary_words").select("id,normalised_word,display_word").in("normalised_word", analysis.parts.map(part => part.sourceText.toLowerCase())).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
    db.from("teaching_dictionary_reviewed_sense_sets").select("reviewed_at").eq("canonical_word_id", bundle.wordId).single(),
    db.from("teaching_dictionary_current_sense_family_memberships").select("component_part_id,base_meaning").eq("canonical_word_id", bundle.wordId).eq("sense_id", senseId),
  ]);
  if (memberships.error || revision.error || word.error || metadata.error || previous.error || componentWords.error) throw new Error("Could not read the compound's dictionary facts.");
  const parts = inheritFamilyPartMeanings(analysis.parts, memberships.data);
  const components = parts.map((part, index) => {
    const component = componentWords.data.find(row => row.normalised_word === part.sourceText.toLowerCase());
    if (!component) throw new Error(`Add the component word “${part.sourceText}” to the Teaching Dictionary first.`);
    return { ordinal: index + 1, canonicalWordId: component.id, displaySurface: part.surfaceText, meaning: part.gloss, sense: part.gloss };
  });
  for (const [field, values] of [["age_band", DICTIONARY_BANDS.ageBand], ["frequency_band", DICTIONARY_BANDS.frequencyBand], ["complexity_band", DICTIONARY_BANDS.complexityBand]] as const) {
    if (details?.[field] && !(values as readonly string[]).includes(details[field])) throw new Error(`Choose a listed ${field.replaceAll("_", " ")}.`);
  }
  const schwa = details?.has_schwa?.toLowerCase();
  if (schwa && !["yes", "no"].includes(schwa)) throw new Error("Choose Yes or No for schwa.");
  const pronunciation = bundle.senseSet.pronunciations.find(row => row.id === sense.pronunciationId);
  const source = word.data;
  const payload: WordDraftPayload = {
    displayWord: bundle.displayWord, senseSet: bundle.senseSet, definition: sense.definition,
    dictationSentence: sense.dictationSentence ?? "", dictationTargetTokenIndex: sense.dictationTargetTokenIndex ?? 0,
    writtenSyllableBreakdown: metadata.data?.written_syllable_breakdown ?? "",
    ageBand: details?.age_band || source.age_band || "", frequencyBand: details?.frequency_band || source.frequency_band || "", complexityBand: details?.complexity_band || source.complexity_band || "",
    metadata: { ...emptyMetadata(), syllables: String(pronunciation?.spokenSyllableCount ?? ""), phoneme_hint: pronunciation?.ipa ?? "", stress_pattern: pronunciation?.stressPattern ?? "",
      has_schwa: schwa === "yes" ? true : schwa === "no" ? false : metadata.data?.has_schwa ?? null,
      morphemes: analysis.wordSum, grapheme_notes: metadata.data?.grapheme_notes ?? "", morphology_notes: metadata.data?.morphology_notes ?? "", irregularity_notes: metadata.data?.irregularity_notes ?? "" },
    canonicalMorphology: { ...emptyMorphology(), analysisStatus: "approved", parts, joins: analysis.joins, transformations: analysis.transformations, wordSum: analysis.wordSum, rawPartOfSpeech: sense.partOfSpeech },
    provenance: { sourceCategory: source.source_category as WordDraftPayload["provenance"]["sourceCategory"], sourceName: source.source_name ?? "", sourceUrl: source.source_url ?? "", sourceLicence: source.source_licence ?? "", sourceUseNote: source.source_use_note ?? "", confidence: source.confidence as WordDraftPayload["provenance"]["confidence"] },
    skillKeys: [skill], skillSenseIds: { [skill]: senseId }, routeContents: [],
  };
  payload.dictationVariants = dictationVariants(payload);
  payload.routeContents = [routeWithSharedFacts({ routeId: "compound_word_lab", routeVersion: "v2", microSkillKey: skill, wordMeaning: "", wordSum: "", content: {
    components, joins: analysis.joins.map(join => join.joinType), componentToWholeRelationship: facts.componentToWholeRelationship.trim(),
    morphologyProvenance: { source: "Approved Teaching Dictionary word parts", reviewedSenseId: senseId, reviewedAt: revision.data.reviewed_at },
    dictation: { sentence: payload.dictationSentence, targetStart: payload.dictationTargetTokenIndex, targetEndExclusive: payload.dictationTargetTokenIndex + bundle.displayWord.trim().split(/\s+/u).length, exactGovernedAnswer: bundle.displayWord },
    workbookSenseRevision: revision.data.reviewed_at,
  } }, payload)];
  let draftId = previous.data && semanticJson(previous.data.payload) === semanticJson(payload) ? previous.data.id : undefined;
  if (!draftId) {
    const created = await db.from("teaching_dictionary_manager_drafts").insert({ canonical_word_id: bundle.wordId, normalised_word: source.normalised_word, dialect_code: source.dialect_code, payload, source_kind: "manual", source_reference: compoundWorkbookSource(skill), created_by: actorId }).select("id").single();
    if (created.error) throw new Error("Could not save the compound lesson draft.");
    draftId = created.data.id;
  }
  const staged = await db.rpc("stage_teaching_dictionary_route_draft", { p_draft: draftId, p_actor: actorId });
  if (staged.error || !staged.data?.length) throw new Error("Could not stage this compound for publication.");
  return draftId;
}

export async function loadPendingCompoundWorkbookQueue(db: Db, skill: CompoundWordMicroSkillKey) {
  const candidates = await db.from("teaching_dictionary_manager_drafts").select("id,canonical_word_id,payload,source_reference").eq("source_reference", compoundWorkbookSource(skill)).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(300);
  if (candidates.error) throw new Error("Could not read the compound review queue.");
  const latest = [...new Map([...candidates.data].reverse().map(row => [row.canonical_word_id, row])).values()];
  if (!latest.length) return [];
  const versions = await db.from("teaching_dictionary_route_content_versions").select("id,draft_id").in("draft_id", latest.map(row => row.id)).eq("route_id", "compound_word_lab").eq("micro_skill_key", skill);
  if (versions.error) throw new Error("Could not read compound publication versions.");
  const ids = versions.data.map(row => row.id);
  const [published, rolledBack] = ids.length ? await Promise.all([
    db.from("teaching_dictionary_route_content_publications").select("content_version_id").in("content_version_id", ids),
    db.from("teaching_dictionary_route_content_rollbacks").select("content_version_id").in("content_version_id", ids),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (published.error || rolledBack.error) throw new Error("Could not verify compound publication status.");
  const withdrawn = new Set(rolledBack.data.map(row => row.content_version_id));
  const live = new Set(published.data.filter(row => !withdrawn.has(row.content_version_id)).map(row => row.content_version_id));
  const completed = new Set(versions.data.filter(row => live.has(row.id)).map(row => row.draft_id));
  return latest.filter(row => !completed.has(row.id)).map(row => {
    const payload = row.payload as WordDraftPayload;
    const route = payload.routeContents.find(item => item.microSkillKey === skill);
    if (!route) return { id: row.id, wordId: row.canonical_word_id!, payload, blockers: ["This draft no longer contains the compound lesson. Open word details to check its micro-skills."] };
    return { id: row.id, wordId: row.canonical_word_id!, payload, blockers: [...new Set([...publicationBlockers(payload, payload.displayWord.toLowerCase()), ...routeBlockers(route, payload)])] };
  });
}
