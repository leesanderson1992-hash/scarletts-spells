import { semanticJson } from "@/lib/adle/inflection/semantic-json";
import { loadSchwaDictionaryFamily } from "@/lib/adle/weak-vowel/canonical-family-loader";
import "server-only";
import { createHash } from "node:crypto";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import { loadLessonReviewRequests } from "./lesson-review-requests";
import { ingReviewEnvironment } from "./ing-staging-scope";
import { emptyMetadata, emptyMorphology, routeBlockers, DICTIONARY_BANDS, type WordDraftPayload, type RouteContentDraft } from "./contracts";
import { type WeakVowelRouteFactsV1 } from "./weak-vowel-authoring";
import { parseSchwaWorkbookFacts, schwaWorkbookFacts, isSchwaWorkbookSkill, type SchwaWorkbookFacts } from "./weak-vowel-workbook";
import { loadWeakVowelSelectionPool } from "@/lib/adle/weak-vowel/readiness-loader";
import { deviceSpeechSource } from "@/lib/adle/weak-vowel/audio-source";
import { saveBulkSkillApprovalsAsActor } from "./bulk-approval-service";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import { randomUUID } from "node:crypto";
import { reviewedAudioBlockers } from "@/lib/adle/weak-vowel/reviewed-audio";
type Db = ReturnType<typeof createServiceRoleClient>;
export const SCHWA_WORKBOOK_SOURCE = "Schwa Bulk review workbook v1";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function loadSchwaWorkbookFacts(db: Db, skill: string, ids: string[]) {
  if (!ids.length) return new Map<string, SchwaWorkbookFacts>();
  const rows = await db.from("teaching_dictionary_route_content_versions").select("canonical_word_id,content,published_at")
    .eq("route_id", "weak_vowel_word_lab").eq("micro_skill_key", skill).in("canonical_word_id", ids)
    .order("published_at", { ascending: false }).order("id", { ascending: false });
  if (rows.error) throw new Error("Could not load reviewed Schwa activity facts.");
  const map = new Map<string, SchwaWorkbookFacts>();
  const words = await db.from("canonical_teaching_dictionary_words").select("id,display_word,age_band,frequency_band,complexity_band").in("id", ids);
  if (words.error) throw new Error("Could not load the workbook words.");
  for (const row of rows.data) {
    if (map.has(row.canonical_word_id)) continue;
    const content = row.content as unknown as RouteContentDraft;
    const word = words.data.find(word => word.id === row.canonical_word_id)?.display_word;
    if (word && content.content?.weakVowel) map.set(row.canonical_word_id, schwaWorkbookFacts(word, content.content.weakVowel as WeakVowelRouteFactsV1));
  }
  // Prefer saved partial workbook decisions to older staged versions.
  const drafts = await db.from("teaching_dictionary_manager_drafts").select("canonical_word_id,payload")
    .eq("source_reference", SCHWA_WORKBOOK_SOURCE).in("canonical_word_id", ids).order("created_at", { ascending: false });
  if (drafts.error) throw new Error("Could not load saved Schwa reviews.");
  const seen = new Set<string>();
  for (const draft of drafts.data) {
    const payload = draft.payload as unknown as WordDraftPayload;
    if (seen.has(draft.canonical_word_id) || !payload.skillKeys.includes(skill)) continue;
    seen.add(draft.canonical_word_id);
    const fields = payload.routeContents.find(route => route.microSkillKey === skill)?.content.schwaWorkbookFields as SchwaWorkbookFacts | undefined;
    if (fields) map.set(draft.canonical_word_id, fields);
  }
  const metadata = await db.from("canonical_teaching_dictionary_word_metadata").select("canonical_word_id,has_schwa").in("canonical_word_id", ids).eq("row_status", "active").order("created_at", { ascending: false });
  if (metadata.error) throw new Error("Could not load the dictionary bands.");
  for (const word of words.data) {
    const existing = map.get(word.id) ?? schwaWorkbookFacts(word.display_word);
    const has = metadata.data.find(row => row.canonical_word_id === word.id)?.has_schwa;
    map.set(word.id, { ...existing, age_band: existing.age_band || word.age_band || "", frequency_band: existing.frequency_band || word.frequency_band || "", complexity_band: existing.complexity_band || word.complexity_band || "", has_schwa: existing.has_schwa || (has == null ? "" : has ? "Yes" : "No") });
  }
  return map;
}

export async function stageSchwaWorkbookDraft(db: Db, actor: string, bundle: MultiSenseCsvBundle,
  skill: string, senseId: string, fields: SchwaWorkbookFacts) {
  if (!isSchwaWorkbookSkill(skill)) throw new Error("Choose a supported Schwa lesson.");
  const sense = bundle.senseSet.senses.find(sense => sense.id === senseId);
  const analysis = bundle.analyses.find(analysis => analysis.senseId === senseId);
  const pronunciation = bundle.senseSet.pronunciations.find(row => row.id === sense?.pronunciationId);
  if (!sense || !analysis) throw new Error("Approve the meaning and word parts first.");
  const [word, versions, fingerprint, oldSentence, oldPronunciation] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("normalised_word,dialect_code,age_band,frequency_band,complexity_band").eq("id", bundle.wordId).single(),
    db.from("teaching_dictionary_route_content_versions").select("content").eq("canonical_word_id", bundle.wordId)
      .eq("micro_skill_key", skill).eq("route_id", "weak_vowel_word_lab").order("published_at", { ascending: false }).order("id", { ascending: false }).limit(1),
    db.rpc("teaching_dictionary_schwa_sense_fingerprint", { p_word: bundle.wordId, p_sense: senseId }),
    db.from("canonical_teaching_dictionary_dictation_sentences").select("dictation_sentence").eq("canonical_word_id", bundle.wordId).eq("row_status", "active").order("created_at", { ascending: false }).limit(1),
    db.from("canonical_teaching_dictionary_word_metadata").select("phoneme_hint,stress_pattern,syllables").eq("canonical_word_id", bundle.wordId).eq("row_status", "active").eq("review_status", "approved_for_first_exposure").order("created_at", { ascending: false }).limit(1),
  ]);
  if (word.error || versions.error || fingerprint.error || !fingerprint.data || oldSentence.error || oldPronunciation.error) throw new Error("Could not check the current Dictionary facts.");
  const prior = (versions.data[0]?.content as unknown as RouteContentDraft | undefined)?.content?.weakVowel as WeakVowelRouteFactsV1 | undefined;
  const parsed = parseSchwaWorkbookFacts(bundle.displayWord, fields);
  const speech = (text: string) => { const src = deviceSpeechSource(text); return { src, sha256: hash(src) }; };
  // Never reuse an old sentence clip after its words change, or a word clip for a different pronunciation.
  const legacyPronunciation = oldPronunciation.data[0];
  const legacyMatches = prior && !prior.canonicalSenseId && (versions.data[0]?.content as unknown as RouteContentDraft).wordMeaning === sense.definition &&
    legacyPronunciation?.phoneme_hint === pronunciation?.ipa && legacyPronunciation?.stress_pattern === pronunciation?.stressPattern && Number(legacyPronunciation?.syllables) === pronunciation?.spokenSyllableCount;
  const samePronunciation = prior?.canonicalSenseId === senseId && prior?.canonicalSenseFingerprint === fingerprint.data || legacyMatches;
  const wordRecording = samePronunciation && prior?.wordRecording || speech(bundle.displayWord);
  const sentence = sense.dictationSentence ?? "";
  const sentenceRecording = prior && (samePronunciation || !prior.canonicalSenseId && oldSentence.data[0]?.dictation_sentence === sentence)
    ? prior.sentenceRecording : speech(sentence);
  const start = sentence.toLowerCase().indexOf(bundle.displayWord.toLowerCase());
  const status = { status: "ready" as const, reason: null };
  const facts: WeakVowelRouteFactsV1 = {
    schemaVersion: "weak_vowel_route_facts_v1", sourceFingerprint: fingerprint.data,
    canonicalSenseId: senseId, canonicalSenseFingerprint: fingerprint.data,
    activityEligibility: { dinner: status, detective: status, memoryLock: status, dictation: status, family: { status: "not_applicable", reason: null } },
    wordSense: sense.definition, pronunciationId: pronunciation?.id ?? "", wordRecording,
    spokenSyllableCount: pronunciation?.spokenSyllableCount ?? 0,
    ...parsed.annotation, target: { ...parsed.annotation.target, soundType: parsed.annotation.target.soundType as "schwa" | "other_unstressed" | "" },
    familyDecision: "skip", familyAuthorityId: null,
    sentenceRecording, sentenceTarget: { start, end: start + bundle.displayWord.length }, reviewSourceReference: SCHWA_WORKBOOK_SOURCE,
  };
  // Existing canonical family links are independent of whether this optional activity is used.
  if (fields.family_exploration === "Use approved family") {
    if (analysis.familyKey) {
      facts.familyDecision = "approve"; facts.familyAuthorityId = `dictionary:${analysis.familyKey}`;
      facts.activityEligibility.family = status;
    }
  }
  const payload: WordDraftPayload = {
    displayWord: bundle.displayWord, senseSet: bundle.senseSet, definition: sense.definition, dictationSentence: sentence,
    dictationTargetTokenIndex: sense.dictationTargetTokenIndex ?? 0, writtenSyllableBreakdown: fields.activity_syllables.replaceAll("-", "·"),
    ageBand: fields.age_band || word.data.age_band || "", frequencyBand: fields.frequency_band || word.data.frequency_band || "", complexityBand: fields.complexity_band || word.data.complexity_band || "",
    metadata: { ...emptyMetadata(), has_schwa: fields.has_schwa === "Yes" ? true : fields.has_schwa === "No" ? false : null, syllables: String(pronunciation?.spokenSyllableCount ?? ""), phoneme_hint: pronunciation?.ipa ?? "", stress_pattern: pronunciation?.stressPattern ?? "" },
    canonicalMorphology: { ...emptyMorphology(), parts: analysis.parts, joins: analysis.joins, transformations: analysis.transformations, wordSum: analysis.wordSum, analysisStatus: "approved", rawPartOfSpeech: sense.partOfSpeech },
    provenance: { sourceCategory: "internal_authored", sourceName: SCHWA_WORKBOOK_SOURCE, sourceUrl: "", sourceLicence: "internal", sourceUseNote: "Admin reviewed workbook", confidence: "high" },
    skillKeys: [skill], skillSenseIds: { [skill]: senseId }, routeContents: [{ routeId: "weak_vowel_word_lab", routeVersion: "v1", microSkillKey: skill, wordMeaning: sense.definition, wordSum: analysis.wordSum,
      content: { weakVowel: facts, schwaWorkbookFields: fields } }],
  };
  const previous = await db.from("teaching_dictionary_manager_drafts").select("id,payload").eq("canonical_word_id", bundle.wordId)
    .eq("source_reference", SCHWA_WORKBOOK_SOURCE).contains("payload", { skillKeys: [skill] }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previous.error) throw new Error("Could not check the saved Schwa review.");
  if (previous.data && semanticJson(previous.data.payload) === semanticJson(payload)) return previous.data.id;
  const draft = await db.from("teaching_dictionary_manager_drafts").insert({ canonical_word_id: bundle.wordId,
    normalised_word: word.data.normalised_word, dialect_code: word.data.dialect_code, payload, source_kind: "manual", source_reference: SCHWA_WORKBOOK_SOURCE, created_by: actor }).select("id").single();
  if (draft.error) throw new Error("Could not save the Schwa review.");
  return draft.data.id;
}

export async function loadSchwaWorkbookQueue(db: Db, skill: string, wordIds?: string[]) {
  let query = db.from("teaching_dictionary_manager_drafts").select("id,canonical_word_id,payload,created_at")
    .eq("source_reference", SCHWA_WORKBOOK_SOURCE).contains("payload", { skillKeys: [skill] }).order("created_at", { ascending: false });
  if (wordIds) query = query.in("canonical_word_id", wordIds);
  const drafts = await query;
  if (drafts.error) throw new Error("Could not load saved Schwa reviews.");
  const seen = new Set<string>();
  const latest = drafts.data.filter(draft => {
    const payload = draft.payload as unknown as WordDraftPayload;
    if (!payload.skillKeys.includes(skill) || seen.has(draft.canonical_word_id)) return false;
    seen.add(draft.canonical_word_id); return true;
  });
  if (!latest.length) return [];
  const fingerprints = new Map<string, { dictionary_fingerprint: string; sense_fingerprint: string | null }>();
  for (let at = 0; at < latest.length; at += 100) {
    const batch = latest.slice(at, at + 100);
    const senses = Object.fromEntries(batch.map(draft => [draft.canonical_word_id, (draft.payload as unknown as WordDraftPayload).skillSenseIds![skill]]));
    const result = await db.rpc("teaching_dictionary_schwa_fingerprints", { p_words: batch.map(draft => draft.canonical_word_id), p_senses: senses });
    if (result.error || !Array.isArray(result.data)) throw new Error("Could not check reviewed Schwa facts.");
    for (const row of result.data as { word_id: string; dictionary_fingerprint: string; sense_fingerprint: string | null }[]) fingerprints.set(row.word_id, row);
  }
  const versions = await db.from("teaching_dictionary_route_content_versions").select("id,draft_id").in("draft_id", latest.map(draft => draft.id)).eq("micro_skill_key", skill);
  if (versions.error) throw new Error("Could not check the Schwa publication.");
  const publications = versions.data.length ? await db.from("adle_weak_vowel_content_publications").select("content_version_id,dictionary_fingerprint").in("content_version_id", versions.data.map(row => row.id)) : { data: [], error: null };
  if (publications.error) throw new Error("Could not verify the Schwa publication.");
  const queue = await Promise.all(latest.map(async draft => {
    const payload = draft.payload as unknown as WordDraftPayload;
    const route = payload.routeContents.find(route => route.microSkillKey === skill)!;
    const fields = route.content.schwaWorkbookFields as SchwaWorkbookFacts;
    const facts = route.content.weakVowel as WeakVowelRouteFactsV1;
    const fingerprint = fingerprints.get(draft.canonical_word_id);
    const blockers = [...parseSchwaWorkbookFacts(payload.displayWord, fields).errors, ...routeBlockers(route, payload), ...reviewedAudioBlockers(facts)];
    if (!(DICTIONARY_BANDS.ageBand as readonly string[]).includes(payload.ageBand)) blockers.push("Choose the dictionary age band.");
    if (!(DICTIONARY_BANDS.frequencyBand as readonly string[]).includes(payload.frequencyBand)) blockers.push("Choose the dictionary frequency band.");
    if (!(DICTIONARY_BANDS.complexityBand as readonly string[]).includes(payload.complexityBand)) blockers.push("Choose the dictionary complexity band.");
    if (payload.metadata.has_schwa === null) blockers.push("Choose whether the selected pronunciation has a schwa.");
    if (!payload.metadata.phoneme_hint.trim()) blockers.push("Approve British IPA for this meaning.");
    if (!payload.metadata.stress_pattern.trim()) blockers.push("Approve the stress pattern for this pronunciation.");
    if (fingerprint?.sense_fingerprint !== facts.canonicalSenseFingerprint) blockers.push("Dictionary facts changed; upload the latest review workbook or save the current meaning again.");
    if (fields.family_exploration === "Use approved family" && facts.familyDecision !== "approve") blockers.push("Link the selected meaning to an approved family.");
    // Optional enrichment is checked live, independently of the core publication.
    // Retain the reviewed intent so family growth needs no workbook or republish.
    const familyState = facts.familyDecision === "approve" && facts.familyAuthorityId?.startsWith("dictionary:")
      ? await loadSchwaDictionaryFamily(db, draft.canonical_word_id, facts.canonicalSenseId!, facts.familyAuthorityId.slice("dictionary:".length))
        ? "ready" as const : "waiting" as const
      : "not_used" as const;
    const publication = publications.data?.find(row => versions.data.some(version => version.draft_id === draft.id && version.id === row.content_version_id));
    return { id: draft.id, wordId: draft.canonical_word_id, payload, fields, familyState, blockers: [...new Set(blockers)], published: Boolean(publication && !blockers.length) };
  }));
  return queue;
}

export async function publishSchwaWorkbookWord(db: Db, actor: string, skill: string, draftId: string) {
  const identity = await db.from("teaching_dictionary_manager_drafts").select("canonical_word_id").eq("id", draftId).single();
  if (identity.error) throw new Error("Open the latest Schwa preview.");
  const row = (await loadSchwaWorkbookQueue(db, skill, [identity.data.canonical_word_id])).find(row => row.id === draftId);
  if (!row || row.blockers.length) throw new Error(row?.blockers.join(" ") || "Open the latest Schwa preview.");
  if (row.published) {
    const version = await db.from("teaching_dictionary_route_content_versions").select("id").eq("draft_id", row.id).eq("micro_skill_key", skill).single();
    if (version.error) throw new Error("Could not verify the published Schwa word.");
    return { wordId: row.wordId, contentVersionId: version.data.id };
  }
  const approval = await saveBulkSkillApprovalsAsActor({ microSkillKey: skill, applyWordIds: [row.wordId], excludeWordIds: [], clearWordIds: [], deassignWordIds: [], senseIds: { [row.wordId]: row.payload.skillSenseIds![skill] }, requestId: randomUUID(), workbookReadback: true, sourceKind: "teaching_dictionary_import" }, actor);
  if (!approval.ok) throw new Error(approval.blocked[0]?.reason ?? approval.error ?? "Could not approve the teaching meaning.");
  const route = row.payload.routeContents[0]; const facts = route.content.weakVowel as WeakVowelRouteFactsV1;
  const overview = await db.rpc("review_teaching_dictionary_overview", { p_draft: row.id, p_actor: actor });
  if (overview.error) throw new Error(overview.error.message);
  const staged = await db.rpc("stage_teaching_dictionary_route_draft", { p_draft: row.id, p_actor: actor });
  if (staged.error || staged.data?.length !== 1) throw new Error(staged.error?.message ?? "Could not stage the Schwa word.");
  const id = staged.data[0];
  const reviewed = await db.rpc("review_teaching_dictionary_route_content", { p_content_version: id, p_actor: actor });
  if (reviewed.error) throw new Error(reviewed.error.message);
  const published = await db.rpc("publish_adle_weak_vowel_content_v1", { p_content_version: id, p_actor: actor,
    p_expected_source_fingerprint: facts.sourceFingerprint, p_expected_word_audio_sha256: facts.wordRecording.sha256, p_expected_sentence_audio_sha256: facts.sentenceRecording.sha256 });
  if (published.error || published.data !== id) throw new Error(published.error?.message ?? "Could not publish the Schwa word.");
  return { wordId: row.wordId, contentVersionId: id };
}

export async function loadSchwaBulkReview(db: Db, skill: string, includeBundles = false) {
  if (!isSchwaWorkbookSkill(skill)) throw new Error("Unsupported Schwa lesson.");
  const environment = ingReviewEnvironment()!;
  const [requests, publications, queue, pool] = await Promise.all([
    loadLessonReviewRequests(db, skill),
    db.from("adle_weak_vowel_content_publications").select("canonical_word_id").eq("micro_skill_key", skill),
    loadSchwaWorkbookQueue(db, skill), loadWeakVowelSelectionPool({ client: db, environmentKey: environment }, skill),
  ]);
  if (publications.error) throw new Error("Could not load the Schwa lesson pool.");
  const assigned = pool.authority.relationships;
  const ids = [...new Set([...assigned.map(row => row.canonicalWordId), ...requests.keys(), ...publications.data.map(row => row.canonical_word_id), ...queue.map(row => row.wordId)])];
  const current = pool.words.map(row => ({ canonicalWordId: row.canonicalWordId, word: row.spelling, base: "", meaning: row.definition, dictationSentence: row.sentence }));
  const words = ids.length ? await db.from("canonical_teaching_dictionary_words").select("id,display_word").in("id", ids).eq("row_status", "active") : { data: [], error: null };
  if (words.error) throw new Error("Could not load assigned Schwa words.");
  const bundles = await loadReviewedMeaningBundles(db, ids);
  const rows = words.data.flatMap(word => {
    const draft = queue.find(row => row.wordId === word.id);
    const bundle = bundles.find(row => row.wordId === word.id);
    const active = current.some(row => row.canonicalWordId === word.id);
    const issues: string[] = [];
    if (!bundle?.sourceSenseReviewedAt) issues.push("Review the canonical meaning, pronunciation and word parts in the workbook.");
    if (draft && (!draft.published || draft.blockers.length)) issues.push(...draft.blockers.length ? draft.blockers : ["Reviewed facts are ready to publish."]);
    if (!active && !issues.length) issues.push("Review the weak-vowel activity facts, then publish.");
    if (active && !issues.length) return [];
    return [{ id: word.id, word: word.display_word, href: `/admin/teaching-dictionary/${word.id}#td-overview`, note: issues.join(" ") }];
  }).sort((a, b) => a.word.localeCompare(b.word, "en-GB"));
  return { current, rows, queue, bundles: includeBundles ? rows.map(row => bundles.find(bundle => bundle.wordId === row.id) ?? { wordId: row.id, displayWord: row.word, sourceSenseReviewedAt: "", analyses: [], senseSet: { pronunciations: [], senses: [{ id: "review", definition: "", partOfSpeech: "", pronunciationId: null }] } } satisfies MultiSenseCsvBundle) : [], title: "Schwa and weak vowels", routeId: "weak_vowel_word_lab", skill };
}
