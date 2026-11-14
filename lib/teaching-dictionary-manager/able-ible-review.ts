import "server-only";

import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ABLE_IBLE_ROUTE, ABLE_IBLE_SKILL, type SuffixWorkbookFacts } from "./able-ible-workbook";
import { isAbleIblePilot } from "./bulk-review-scope";
import { emptyMetadata, emptyMorphology, DICTIONARY_BANDS, publicationBlockers, routeBlockers,
  routeWithSharedFacts, type WordDraftPayload, type RouteContentDraft } from "./contracts";
import { inheritFamilyPartMeanings } from "./family-part-meanings";
import { loadLessonReadiness } from "./lesson-preflight";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import { loadDynamicSuffixProfiles } from "@/lib/adle/morphology/dynamic-suffix-profile-loader";
import { loadRouteWordStatuses } from "./route-word-status-service";

type Db = ReturnType<typeof createServiceRoleClient>;
const zeroChild = "00000000-0000-4000-8000-000000000001";

export function suffixWorkbookIssues(facts: SuffixWorkbookFacts | undefined) {
  const issues: string[] = [];
  if (!(DICTIONARY_BANDS.ageBand as readonly string[]).includes(facts?.age_band ?? "")) issues.push("Choose the dictionary age band.");
  if (!(DICTIONARY_BANDS.frequencyBand as readonly string[]).includes(facts?.frequency_band ?? "")) issues.push("Choose the dictionary frequency band.");
  if (!(DICTIONARY_BANDS.complexityBand as readonly string[]).includes(facts?.complexity_band ?? "")) issues.push("Choose the dictionary complexity band.");
  if (facts?.has_schwa !== "Yes" && facts?.has_schwa !== "No") issues.push("Choose whether the British pronunciation has a schwa.");
  return issues;
}

export async function stageAbleIbleWord(db: Db, actor: string, bundle: MultiSenseCsvBundle, senseId: string, facts: SuffixWorkbookFacts) {
  if (!isAbleIblePilot(ABLE_IBLE_SKILL)) throw new Error("The suffix workbook pilot is available in staging.");
  const wordId = bundle.wordId;
  const sense = bundle.senseSet.senses.find(item => item.id === senseId);
  const pronunciation = bundle.senseSet.pronunciations.find(item => item.id === sense?.pronunciationId);
  const analysis = bundle.analyses.find(item => item.senseId === senseId);
  if (!sense || !pronunciation || !analysis || !sense.dictationSentence || !Number.isInteger(sense.dictationTargetTokenIndex))
    throw new Error("Review the selected meaning, its pronunciation, word parts and dictation sentence.");
  const [profile, memberships, existing, word, metadata] = await Promise.all([
    db.from("canonical_teaching_dictionary_suffix_profiles").select("id,source_row_hash,meaning_bins").eq("micro_skill_key", ABLE_IBLE_SKILL)
      .eq("row_status", "active").eq("review_status", "approved_for_first_exposure").single(),
    db.from("teaching_dictionary_current_sense_family_memberships").select("component_part_id,base_meaning")
      .eq("canonical_word_id", wordId).eq("sense_id", senseId).eq("family_key", analysis.familyKey),
    db.from("teaching_dictionary_route_content_versions").select("id,draft_id,content")
      .eq("canonical_word_id", wordId).eq("route_id", ABLE_IBLE_ROUTE).eq("micro_skill_key", ABLE_IBLE_SKILL)
      .order("published_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
    db.from("canonical_teaching_dictionary_words").select("source_category,source_name,source_url,source_licence,source_use_note,confidence")
      .eq("id", wordId).single(),
    db.from("canonical_teaching_dictionary_word_metadata").select("grapheme_notes,morphology_notes,irregularity_notes")
      .eq("canonical_word_id", wordId).eq("row_status", "active").limit(1).maybeSingle(),
  ]);
  if (profile.error || memberships.error || existing.error || word.error || metadata.error) throw new Error("Could not load the current suffix profile and dictionary facts.");
  if (memberships.data.length !== 1) throw new Error("Review the teaching family for this meaning.");
  const bins = profile.data.meaning_bins as { id: string }[];
  if (bins.length !== 1) throw new Error("Choose the lesson’s meaning group in the route editor.");
  const parts = inheritFamilyPartMeanings(analysis.parts, memberships.data);
  const payload: WordDraftPayload = {
    displayWord: bundle.displayWord, senseSet: bundle.senseSet, definition: sense.definition,
    dictationSentence: sense.dictationSentence, dictationTargetTokenIndex: sense.dictationTargetTokenIndex!,
    ageBand: facts.age_band, frequencyBand: facts.frequency_band, complexityBand: facts.complexity_band,
    metadata: { ...emptyMetadata(), syllables: String(pronunciation.spokenSyllableCount ?? ""),
      phoneme_hint: pronunciation.ipa, stress_pattern: pronunciation.stressPattern, has_schwa: facts.has_schwa === "Yes",
      grapheme_notes: metadata.data?.grapheme_notes ?? "", morphology_notes: metadata.data?.morphology_notes ?? "",
      irregularity_notes: metadata.data?.irregularity_notes ?? "", morphemes: analysis.wordSum },
    canonicalMorphology: { ...emptyMorphology(), analysisStatus: "approved", parts, joins: analysis.joins,
      transformations: analysis.transformations, wordSum: analysis.wordSum, rawPartOfSpeech: sense.partOfSpeech },
    provenance: { sourceCategory: word.data.source_category as WordDraftPayload["provenance"]["sourceCategory"],
      sourceName: word.data.source_name ?? "", sourceUrl: word.data.source_url ?? "", sourceLicence: word.data.source_licence ?? "",
      sourceUseNote: word.data.source_use_note ?? "", confidence: word.data.confidence as WordDraftPayload["provenance"]["confidence"] },
    skillKeys: [ABLE_IBLE_SKILL], skillSenseIds: { [ABLE_IBLE_SKILL]: senseId }, routeContents: [],
  };
  const route = routeWithSharedFacts({ routeId: ABLE_IBLE_ROUTE, routeVersion: "v3", microSkillKey: ABLE_IBLE_SKILL,
    wordMeaning: "", wordSum: "", content: { meaningBinKey: bins[0].id, expectedProfileId: profile.data.id,
      expectedSourceRowHash: profile.data.source_row_hash } }, payload);
  payload.routeContents = [route];
  const issues = [...publicationBlockers(payload, bundle.displayWord.toLowerCase()), ...routeBlockers(route, payload)];
  if (issues.length) throw new Error([...new Set(issues)].join(" "));

  const latest = existing.data?.content as RouteContentDraft | null;
  const previous = existing.data?.draft_id && latest ? await db.from("teaching_dictionary_manager_drafts").select("id,payload")
    .eq("canonical_word_id", wordId).order("created_at", { ascending: false }).limit(1).maybeSingle() : null;
  if (previous?.error) throw new Error("Could not check the latest suffix draft.");
  const { semanticJson } = await import("@/lib/adle/inflection/semantic-json");
  let draftId = previous?.data?.id === existing.data?.draft_id &&
    semanticJson(previous?.data?.payload ?? null) === semanticJson(payload) ? existing.data?.draft_id : undefined;
  if (!draftId) {
    const draft = await db.from("teaching_dictionary_manager_drafts").insert({
      canonical_word_id: wordId, normalised_word: bundle.displayWord.toLowerCase(), dialect_code: "en-GB", payload,
      source_kind: "manual", source_reference: "Approved -able/-ible Bulk review workbook", created_by: actor,
    }).select("id").single();
    if (draft.error) throw new Error("Could not save the reviewed suffix draft.");
    draftId = draft.data.id;
  }
  const overview = await db.rpc("review_teaching_dictionary_overview", { p_draft: draftId, p_actor: actor });
  if (overview.error) throw new Error("Could not record the reviewed dictionary facts.");
  const version = await db.rpc("stage_teaching_dictionary_route_draft", { p_draft: draftId, p_actor: actor });
  if (version.error || !version.data?.[0]) throw new Error("Could not stage the suffix lesson facts.");
  const review = await db.rpc("review_teaching_dictionary_route_content", { p_content_version: version.data[0], p_actor: actor });
  if (review.error) throw new Error("Could not record the suffix lesson approval.");
}

export async function loadAbleIbleReview(db: Db) {
  if (!isAbleIblePilot(ABLE_IBLE_SKILL)) throw new Error("The suffix workbook pilot is available in staging.");
  const [lesson] = await loadLessonReadiness({ routeId: ABLE_IBLE_ROUTE, microSkillKey: ABLE_IBLE_SKILL });
  const [pool, candidates] = await Promise.all([
    loadDynamicSuffixProfiles(db, zeroChild, { microSkillKeys: [ABLE_IBLE_SKILL] }),
    loadRouteWordStatuses({ lesson, routeId: ABLE_IBLE_ROUTE, microSkillKey: ABLE_IBLE_SKILL }),
  ]);
  const current = [...(pool.profiles[0]?.wordsByCanonicalId.values() ?? [])].map(word => ({
    canonicalWordId: word.canonicalWordId, word: word.displayWord, base: word.semanticBaseText,
    meaning: word.derivedMeaning, dictationSentence: word.dictationSentence,
  }));
  const active = new Set(current.map(word => word.canonicalWordId));
  const review = new Map<string, string>();
  for (const word of lesson.words) if (word.blockers.length && (!active.has(word.id) || word.role === "unreleased draft"))
    review.set(word.id, word.blockers.join(" "));
  for (const word of candidates.words) {
    if (word.familyMeaningReview) review.set(word.wordId, `The family meaning for “${word.familyMeaningReview}” changed. Confirm the teaching family.`);
    else if (!active.has(word.wordId) && word.status.relationshipApproved &&
      !lesson.words.some(row => row.id === word.wordId && row.ready))
      review.set(word.wordId, word.overviewCandidate?.issues.map(issue => issue.message).join(" ") || "Review the lesson facts in the workbook.");
  }
  const rows = [...review].map(([id, reason]) => ({ id, note: active.has(id) ? `Active in the live lesson pool. ${reason}` : reason,
    word: candidates.words.find(word => word.wordId === id)?.displayWord ?? lesson.words.find(word => word.id === id)?.word ?? id }));
  rows.sort((a, b) => a.word.localeCompare(b.word, "en-GB") || a.id.localeCompare(b.id));
  return { lesson, current, rows };
}

export async function loadAbleIbleWorkbook(db: Db, ids: string[]) {
  const [reviewed, words, metadata] = await Promise.all([
    loadReviewedMeaningBundles(db, ids),
    db.from("canonical_teaching_dictionary_words").select("id,display_word,age_band,frequency_band,complexity_band").in("id", ids),
    db.from("canonical_teaching_dictionary_word_metadata").select("canonical_word_id,has_schwa").in("canonical_word_id", ids).eq("row_status", "active"),
  ]);
  if (words.error || metadata.error) throw new Error("Could not export the suffix workbook facts.");
  const bundles = ids.flatMap(id => {
    const bundle = reviewed.find(row => row.wordId === id);
    if (bundle) return [bundle];
    const word = words.data.find(row => row.id === id);
    return word ? [{ wordId: id, displayWord: word.display_word, sourceSenseReviewedAt: "",
      senseSet: { senses: [{ id: "review", definition: "", partOfSpeech: "adjective", pronunciationId: "standard" }],
        pronunciations: [{ id: "standard", ipa: "", stressPattern: "", spokenSyllableCount: null }] }, analyses: [] }] : [];
  });
  const suffixFacts = new Map(words.data.map(word => {
    const value = metadata.data.find(row => row.canonical_word_id === word.id)?.has_schwa;
    return [word.id, { age_band: word.age_band ?? "", frequency_band: word.frequency_band ?? "",
      complexity_band: word.complexity_band ?? "", has_schwa: value == null ? "" : value ? "Yes" : "No" }];
  }));
  return { bundles, suffixFacts };
}
