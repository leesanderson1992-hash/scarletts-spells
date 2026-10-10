"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { emptyMetadata, emptyMorphology, normaliseWord, publicationBlockers, routeBlockers, validateDraft, WORD_METADATA_FIELDS, type RouteContentDraft, type WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";
import { combineRoundTripRows, parseDictionaryCsv } from "@/lib/teaching-dictionary-manager/csv";
import { derivePrefixRouteFacts } from "@/lib/teaching-dictionary-manager/prefix-content";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { loadTeachingDictionaryEvidenceAuthority } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { matchesPublishedFactsForDefinitionOnly } from "@/lib/teaching-dictionary-manager/definition-only";
import { loadDynamicPrefixProfiles } from "@/lib/adle/morphology/dynamic-prefix-profile-loader";
import { loadDynamicSuffixProfiles } from "@/lib/adle/morphology/dynamic-suffix-profile-loader";
import { loadWordSkillPackage, previewWordSkillPackage, publishWordSkillPackage } from "@/lib/writing-engine/whole-writing/knowledge-review-repository";

const PATH = "/admin/teaching-dictionary";
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const errorCode = (error: unknown) => error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "TEACHING_DICTIONARY_ACTION_FAILED";

function finish(path: string, error?: unknown): never {
  if (!error) revalidatePath(PATH);
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${error ? `error=${encodeURIComponent(errorCode(error))}` : "saved=1"}`);
}

async function publishPrefixVerified(db: ReturnType<typeof createServiceRoleClient>, contentId: string, actorId: string) {
  const result = await db.rpc("publish_teaching_dictionary_prefix_content", { p_content_version: contentId, p_actor: actorId });
  if (result.error || !result.data) {
    const code = result.error?.message.match(/TEACHING_PREFIX_[A-Z_]+/)?.[0];
    throw new Error(code ?? "TEACHING_PREFIX_PUBLICATION_FAILED");
  }
  let runtimeReady = false;
  try {
    const loaded = await loadDynamicPrefixProfiles(db, actorId);
    runtimeReady = loaded.profiles.some((profile) => profile.governance?.profileId === result.data && profile.productionEnabled);
  } catch { runtimeReady = false; }
  if (!runtimeReady) {
    const rollback = await db.rpc("rollback_teaching_dictionary_prefix_content", {
      p_content_version: contentId, p_actor: actorId, p_reason: "New prefix profile failed runtime compilation after publication",
    });
    if (rollback.error) throw new Error("TEACHING_PREFIX_ROLLBACK_FAILED");
    throw new Error("TEACHING_PREFIX_RUNTIME_VERIFY_FAILED");
  }
}

async function publishSuffixVerified(db: ReturnType<typeof createServiceRoleClient>, contentId: string, actorId: string) {
  const result = await db.rpc("publish_teaching_dictionary_suffix_content", { p_content_version: contentId, p_actor: actorId });
  if (result.error || !result.data) {
    const code = result.error?.message.match(/TEACHING_SUFFIX_[A-Z_]+/)?.[0];
    throw new Error(code ?? "TEACHING_SUFFIX_PUBLICATION_FAILED");
  }
  let runtimeReady = false;
  try {
    const loaded = await loadDynamicSuffixProfiles(db, actorId);
    runtimeReady = loaded.profiles.some((profile) => profile.governance?.profileId === result.data && profile.productionEnabled);
  } catch { runtimeReady = false; }
  if (!runtimeReady) {
    const rollback = await db.rpc("rollback_teaching_dictionary_suffix_content", {
      p_content_version: contentId, p_actor: actorId, p_reason: "New suffix profile failed runtime compilation after publication",
    });
    if (rollback.error) throw new Error("TEACHING_SUFFIX_ROLLBACK_FAILED");
    throw new Error("TEACHING_SUFFIX_RUNTIME_VERIFY_FAILED");
  }
}

async function publishValidatedDraft(
  db: ReturnType<typeof createServiceRoleClient>,
  id: string,
  actorId: string,
  payload: WordDraftPayload,
  normalisedWord: string,
): Promise<string> {
  if (publicationBlockers(payload, normalisedWord).length) throw new Error("TEACHING_DRAFT_REQUIRED_FACTS_MISSING");
  const published = await db.rpc("publish_teaching_dictionary_manager_draft", { p_draft: id, p_actor: actorId });
  if (published.error?.message.includes("TEACHING_DRAFT_ROUTE_RELEASE_REQUIRED")) {
    const proof = await definitionOnlyPublicationProof(db, payload, normalisedWord);
    if (proof) {
      const definition = await db.rpc("publish_teaching_dictionary_definition_only", {
        p_draft: id, p_actor: actorId, p_word_source_hash: proof.wordHash,
        p_metadata_id: proof.metadataId, p_dictation_id: proof.dictationId,
        p_morphology_id: proof.morphologyId,
      });
      if (definition.error || !definition.data) throw new Error("TEACHING_DEFINITION_PUBLICATION_FAILED");
      return `${PATH}/${definition.data}`;
    }
  }
  if (published.error || !published.data) {
    throw new Error(published.error?.message.includes("TEACHING_DRAFT_ROUTE_RELEASE_REQUIRED")
      ? "TEACHING_DRAFT_ROUTE_RELEASE_REQUIRED" : "TEACHING_DRAFT_PUBLISH_FAILED");
  }
  let destination = `${PATH}/${published.data}`;
  const contents = await db.from("teaching_dictionary_route_content_versions").select("id,route_id,content")
    .eq("draft_id", id).in("route_id", ["dynamic_prefix_word_lab", "dynamic_affix_word_lab"]);
  if (contents.error) throw new Error("TEACHING_ROUTE_CONTENT_READ_FAILED");
  for (const content of contents.data ?? []) {
    if (routeBlockers(content.content as RouteContentDraft, payload).length) continue;
    try {
      if (content.route_id === "dynamic_prefix_word_lab") await publishPrefixVerified(db, content.id, actorId);
      else await publishSuffixVerified(db, content.id, actorId);
    } catch (error) {
      destination += `?route_error=${encodeURIComponent(errorCode(error))}`;
      break;
    }
  }
  return destination;
}

async function definitionOnlyPublicationProof(
  db: ReturnType<typeof createServiceRoleClient>,
  payload: WordDraftPayload,
  normalisedWord: string,
): Promise<{ wordHash: string; metadataId: string | null; dictationId: string | null; morphologyId: string | null } | null> {
  if (payload.routeContents.length > 0) return null;
  const wordResult = await db.from("canonical_teaching_dictionary_words").select("*")
    .eq("normalised_word", normalisedWord).eq("dialect_code", "en-GB").eq("row_status", "active").maybeSingle();
  if (wordResult.error || !wordResult.data) return null;
  const word = wordResult.data;
  const [metadataResult, dictationResult, morphologyResult] = await Promise.all([
    db.from("canonical_teaching_dictionary_word_metadata").select("*").eq("canonical_word_id", word.id).eq("row_status", "active").maybeSingle(),
    db.from("canonical_teaching_dictionary_dictation_sentences").select("*").eq("canonical_word_id", word.id).eq("row_status", "active").maybeSingle(),
    db.from("canonical_teaching_dictionary_word_morphology").select("*").eq("canonical_word_id", word.id).eq("row_status", "active").maybeSingle(),
  ]);
  if (metadataResult.error || dictationResult.error || morphologyResult.error) return null;
  const metadata = metadataResult.data;
  const dictation = dictationResult.data;
  const morphology = morphologyResult.data;
  if (!matchesPublishedFactsForDefinitionOnly({ payload, word, metadata, dictation, morphology })) return null;
  return { wordHash: word.source_row_hash, metadataId: metadata?.id ?? null,
    dictationId: dictation.id, morphologyId: morphology?.id ?? null };
}

function payloadFromForm(form: FormData): WordDraftPayload {
  const metadata = emptyMetadata();
  for (const key of WORD_METADATA_FIELDS) metadata[key] = value(form, key).slice(0, 2000);
  const schwa = value(form, "has_schwa");
  metadata.has_schwa = schwa === "true" ? true : schwa === "false" ? false : null;
  let routeContents: RouteContentDraft[] = [];
  try {
    const parsed: unknown = JSON.parse(value(form, "route_contents") || "[]");
    if (!Array.isArray(parsed) || parsed.length > 30) throw new Error("TEACHING_ROUTE_CONTENT_INVALID");
    routeContents = parsed.map((row: unknown) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("TEACHING_ROUTE_CONTENT_INVALID");
      const item = row as Record<string, unknown>;
      if (typeof item.routeId !== "string" || typeof item.routeVersion !== "string" || typeof item.microSkillKey !== "string"
        || typeof item.wordMeaning !== "string" || typeof item.wordSum !== "string"
        || !item.content || typeof item.content !== "object" || Array.isArray(item.content)) throw new Error("TEACHING_ROUTE_CONTENT_INVALID");
      return { routeId: item.routeId, routeVersion: item.routeVersion, microSkillKey: item.microSkillKey,
        wordMeaning: item.wordMeaning, wordSum: item.wordSum, content: item.content as Record<string, unknown> };
    });
  } catch { throw new Error("TEACHING_ROUTE_CONTENT_INVALID"); }
  const skillKeys = form.getAll("skill_key").map((key) => String(key).trim()).filter(Boolean);
  const target = Number(value(form, "dictation_target_token_index"));
  const morphology = emptyMorphology();
  for (const [field, formName] of [["parts", "morphology_parts"], ["featureKeys", "feature_keys"], ["joins", "morphology_joins"]] as const) {
    try {
      const parsed: unknown = JSON.parse(value(form, formName) || "[]");
      if (!Array.isArray(parsed) || parsed.length > 50) throw new Error("TEACHING_MORPHOLOGY_INVALID");
      morphology[field] = parsed;
    } catch { throw new Error("TEACHING_MORPHOLOGY_INVALID"); }
  }
  morphology.rawSegmentation = value(form, "raw_morpholex_segmentation");
  morphology.rawPartOfSpeech = value(form, "raw_morpholex_pos");
  morphology.transformationNotes = value(form, "transformation_notes");
  morphology.wordSum = value(form, "canonical_word_sum");
  morphology.analysisStatus = value(form, "analysis_status") as WordDraftPayload["canonicalMorphology"]["analysisStatus"];
  morphology.reviewNotes = value(form, "morphology_review_notes");
  return { displayWord: value(form, "display_word"), definition: value(form, "definition"),
    dictationSentence: value(form, "dictation_sentence"), dictationTargetTokenIndex: Number.isInteger(target) && target >= 0 ? target : 0,
    ageBand: value(form, "age_band"), frequencyBand: value(form, "frequency_band"), complexityBand: value(form, "complexity_band"),
    metadata, canonicalMorphology: morphology,
    provenance: { sourceCategory: value(form, "source_category") as WordDraftPayload["provenance"]["sourceCategory"],
      sourceName: value(form, "source_name"), sourceUrl: value(form, "source_url"),
      sourceLicence: value(form, "source_licence"), sourceUseNote: value(form, "source_use_note"),
      confidence: value(form, "confidence") as WordDraftPayload["provenance"]["confidence"] },
    skillKeys, routeContents };
}

export async function saveTeachingDictionaryDraft(form: FormData) {
  const actor = await requireAdminUser();
  const wordId = value(form, "word_id");
  const path = wordId && isUuid(wordId) ? `${PATH}/${wordId}` : PATH;
  let destination = path;
  try {
    if (wordId && !isUuid(wordId)) throw new Error("TEACHING_WORD_ID_INVALID");
    const normalisedWord = normaliseWord(value(form, "normalised_word"));
    const payload = payloadFromForm(form);
    const blockers = validateDraft(payload, normalisedWord);
    if (blockers.length) throw new Error("TEACHING_DRAFT_INVALID");
    const sourceReference = value(form, "source_reference");
    if (!sourceReference || sourceReference.length > 2000) throw new Error("TEACHING_SOURCE_REQUIRED");
    const db = createServiceRoleClient();
    const prefixKeys = [...new Set(payload.routeContents.filter((route) => route.routeId === "dynamic_prefix_word_lab").map((route) => route.microSkillKey))];
    if (prefixKeys.length) {
      const profiles = await db.from("canonical_teaching_dictionary_prefix_profiles").select("id,micro_skill_key,source_row_hash")
        .in("micro_skill_key", prefixKeys).eq("row_status", "active").eq("review_status", "approved_for_first_exposure");
      if (profiles.error) throw new Error("TEACHING_PREFIX_PROFILE_READ_FAILED");
      for (const route of payload.routeContents) {
        const profile = profiles.data?.find((candidate) => candidate.micro_skill_key === route.microSkillKey);
        if (route.routeId === "dynamic_prefix_word_lab" && profile) {
          route.content.expectedProfileId ??= profile.id;
          route.content.expectedSourceRowHash ??= profile.source_row_hash;
        }
      }
    }
    const suffixKeys = [...new Set(payload.routeContents.filter((route) => route.routeId === "dynamic_affix_word_lab").map((route) => route.microSkillKey))];
    if (suffixKeys.length) {
      const profiles = await db.from("canonical_teaching_dictionary_suffix_profiles").select("id,micro_skill_key,source_row_hash")
        .in("micro_skill_key", suffixKeys).eq("row_status", "active").eq("review_status", "approved_for_first_exposure");
      if (profiles.error) throw new Error("TEACHING_SUFFIX_PROFILE_READ_FAILED");
      for (const route of payload.routeContents) {
        const profile = profiles.data?.find((candidate) => candidate.micro_skill_key === route.microSkillKey);
        if (route.routeId === "dynamic_affix_word_lab" && profile) {
          route.content.expectedProfileId ??= profile.id;
          route.content.expectedSourceRowHash ??= profile.source_row_hash;
        }
      }
    }
    if (wordId) {
      const word = await db.from("canonical_teaching_dictionary_words").select("normalised_word,dialect_code").eq("id", wordId).single();
      if (word.error || word.data.normalised_word !== normalisedWord) throw new Error("TEACHING_WORD_IDENTITY_CHANGED");
    }
    const result = await db.from("teaching_dictionary_manager_drafts").insert({
      canonical_word_id: wordId || null, normalised_word: normalisedWord, dialect_code: "en-GB",
      payload, source_kind: "manual", source_reference: sourceReference, created_by: actor.id,
    }).select("id").single();
    if (result.error) throw new Error("TEACHING_DRAFT_SAVE_FAILED");
    destination = `${path}?draft=${result.data.id}`;
    if (publicationBlockers(payload, normalisedWord).length === 0) {
      try {
        destination = await publishValidatedDraft(db, result.data.id, actor.id, payload, normalisedWord);
      } catch (error) {
        destination += `&publish_error=${encodeURIComponent(errorCode(error))}`;
      }
    }
  } catch (error) { finish(path, error); }
  finish(destination);
}

export async function publishTeachingDictionaryDraft(form: FormData) {
  const actor = await requireAdminUser();
  const id = value(form, "draft_id");
  const wordId = value(form, "word_id");
  const path = wordId && isUuid(wordId) ? `${PATH}/${wordId}?draft=${id}` : `${PATH}?draft=${id}`;
  let destination = path;
  try {
    if (!isUuid(id)) throw new Error("TEACHING_DRAFT_ID_INVALID");
    const db = createServiceRoleClient();
    const draft = await db.from("teaching_dictionary_manager_drafts").select("normalised_word,payload").eq("id", id).single();
    if (draft.error) throw new Error("TEACHING_DRAFT_NOT_FOUND");
    const payload = draft.data.payload as WordDraftPayload;
    destination = await publishValidatedDraft(db, id, actor.id, payload, draft.data.normalised_word);
  } catch (error) { finish(path, error); }
  finish(destination);
}

export type CsvImportState = { imported?: number; batchId?: string; errorCount?: number; errors?: string[]; error?: string };
export async function importTeachingDictionaryCsv(_previous: CsvImportState, form: FormData): Promise<CsvImportState> {
  const actor = await requireAdminUser();
  const file = form.get("dictionary_csv");
  if (!(file instanceof File) || file.size === 0 || file.size > 4_000_000) return { error: "Choose a CSV file smaller than 4 MB." };
  try {
    const grouped = combineRoundTripRows(parseDictionaryCsv(await file.text()));
    const rows = grouped.rows;
    const db = createServiceRoleClient();
    const spellings = [...new Set(rows.map((row) => row.normalisedWord).filter(Boolean))];
    const prefixKeys = [...new Set(rows.flatMap((row) => row.payload.routeContents)
      .filter((route) => route.routeId === "dynamic_prefix_word_lab").map((route) => route.microSkillKey))];
    const prefixProfiles = new Map<string, { id: string; hash: string; bins: { id: string; prefixText?: string }[]; choices: string[] }>();
    if (prefixKeys.length) {
      const profiles = await db.from("canonical_teaching_dictionary_prefix_profiles").select("id,micro_skill_key,source_row_hash,meaning_bins,prefix_choices")
        .in("micro_skill_key", prefixKeys).eq("row_status", "active").eq("review_status", "approved_for_first_exposure");
      if (profiles.error) throw new Error("CSV_PREFIX_PROFILE_READ_FAILED");
      for (const profile of profiles.data ?? []) prefixProfiles.set(profile.micro_skill_key, {
        id: profile.id, hash: profile.source_row_hash,
        bins: profile.meaning_bins as { id: string; prefixText?: string }[],
        choices: ((profile.prefix_choices ?? []) as { text?: string }[]).map((choice) => choice.text ?? "").filter(Boolean),
      });
    }
    const suffixKeys = [...new Set(rows.flatMap((row) => row.payload.routeContents)
      .filter((route) => route.routeId === "dynamic_affix_word_lab").map((route) => route.microSkillKey))];
    const suffixProfiles = new Map<string, { id: string; hash: string }>();
    if (suffixKeys.length) {
      const profiles = await db.from("canonical_teaching_dictionary_suffix_profiles").select("id,micro_skill_key,source_row_hash")
        .in("micro_skill_key", suffixKeys).eq("row_status", "active").eq("review_status", "approved_for_first_exposure");
      if (profiles.error) throw new Error("CSV_SUFFIX_PROFILE_READ_FAILED");
      for (const profile of profiles.data ?? []) suffixProfiles.set(profile.micro_skill_key, { id: profile.id, hash: profile.source_row_hash });
    }
    const existing = new Map<string, { id: string; source_row_hash: string; display_word: string; age_band: string | null; frequency_band: string | null; complexity_band: string | null;
      source_category: WordDraftPayload["provenance"]["sourceCategory"]; source_name: string | null; source_url: string | null; source_licence: string | null; source_use_note: string | null; confidence: WordDraftPayload["provenance"]["confidence"] }>();
    for (let i = 0; i < spellings.length; i += 100) {
      const result = await db.from("canonical_teaching_dictionary_words").select("id,normalised_word,source_row_hash,display_word,age_band,frequency_band,complexity_band,source_category,source_name,source_url,source_licence,source_use_note,confidence")
        .in("normalised_word", spellings.slice(i, i + 100)).eq("row_status", "active").eq("dialect_code", "en-GB");
      if (result.error) throw new Error("CSV_WORD_LOOKUP_FAILED");
      for (const word of result.data ?? []) existing.set(word.normalised_word, word);
    }
    const existingIds = [...existing.values()].map((word) => word.id);
    const metadataByWord = new Map<string, Record<string, unknown>>();
    const dictationByWord = new Map<string, { dictation_sentence: string; dictation_target_token_index: number }>();
    const definitionByWord = new Map<string, string>();
    const morphologyByWord = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < existingIds.length; i += 100) {
      const ids = existingIds.slice(i, i + 100);
      const [metadata, dictation, definitions, morphology] = await Promise.all([
        db.from("canonical_teaching_dictionary_word_metadata").select("*").in("canonical_word_id", ids).eq("row_status", "active"),
        db.from("canonical_teaching_dictionary_dictation_sentences").select("canonical_word_id,dictation_sentence,dictation_target_token_index").in("canonical_word_id", ids).eq("row_status", "active"),
        db.from("teaching_dictionary_definition_versions").select("canonical_word_id,definition,published_at").in("canonical_word_id", ids).is("route_id", null).order("published_at", { ascending: false }),
        db.from("canonical_teaching_dictionary_word_morphology").select("*").in("canonical_word_id", ids).eq("row_status", "active"),
      ]);
      if (metadata.error || dictation.error || definitions.error || morphology.error) throw new Error("CSV_EXISTING_FACTS_READ_FAILED");
      for (const row of metadata.data ?? []) metadataByWord.set(row.canonical_word_id, row);
      for (const row of dictation.data ?? []) dictationByWord.set(row.canonical_word_id, row);
      for (const row of definitions.data ?? []) if (!definitionByWord.has(row.canonical_word_id)) definitionByWord.set(row.canonical_word_id, row.definition);
      for (const row of morphology.data ?? []) morphologyByWord.set(row.canonical_word_id, row);
    }
    const errors: string[] = [...grouped.errors];
    const batchId = randomUUID();
    const drafts = rows.flatMap((row) => {
      row.payload.routeContents = row.payload.routeContents.map((route) => {
        if (route.routeId === "dynamic_prefix_word_lab") {
          const profile = prefixProfiles.get(route.microSkillKey);
          return { ...route, content: { ...derivePrefixRouteFacts({ word: row.payload.displayWord, source: route.content,
            meaningBins: profile?.bins ?? [], choiceForms: profile?.choices ?? [] }),
            ...(profile ? { expectedProfileId: profile.id, expectedSourceRowHash: profile.hash } : {}) } };
        }
        if (route.routeId === "dynamic_affix_word_lab") {
          const profile = suffixProfiles.get(route.microSkillKey);
          return { ...route, content: { ...route.content,
            ...(profile ? { expectedProfileId: profile.id, expectedSourceRowHash: profile.hash } : {}) } };
        }
        return route;
      });
      const current = existing.get(row.normalisedWord);
      const supplied = new Set(row.providedColumns);
      if (row.canonicalWordId && (!current || current.id !== row.canonicalWordId)) {
        errors.push(`Row ${row.rowNumber}: Canonical word ID no longer matches the active word.`);
        return [];
      }
      if (row.sourceRowHash && current?.source_row_hash !== row.sourceRowHash) {
        errors.push(`Row ${row.rowNumber}: Dictionary word changed since export. Download a fresh CSV.`);
        return [];
      }
      if (current) {
        if (!supplied.has("display_word")) row.payload.displayWord = current.display_word;
        if (!supplied.has("age_band")) row.payload.ageBand = current.age_band ?? "";
        if (!supplied.has("frequency_band")) row.payload.frequencyBand = current.frequency_band ?? "";
        if (!supplied.has("complexity_band")) row.payload.complexityBand = current.complexity_band ?? "";
        if (!supplied.has("definition") && definitionByWord.has(current.id)) row.payload.definition = definitionByWord.get(current.id)!;
        if (!supplied.has("source_category")) row.payload.provenance.sourceCategory = current.source_category;
        if (!supplied.has("source_name")) row.payload.provenance.sourceName = current.source_name ?? "";
        if (!supplied.has("source_url")) row.payload.provenance.sourceUrl = current.source_url ?? "";
        if (!supplied.has("source_licence")) row.payload.provenance.sourceLicence = current.source_licence ?? "";
        if (!supplied.has("source_use_note")) row.payload.provenance.sourceUseNote = current.source_use_note ?? "";
        if (!supplied.has("confidence")) row.payload.provenance.confidence = current.confidence;
        const oldMetadata = metadataByWord.get(current.id);
        if (oldMetadata) {
          for (const key of WORD_METADATA_FIELDS) if (!supplied.has(key)) row.payload.metadata[key] = String(oldMetadata[key] ?? "");
          if (!supplied.has("has_schwa")) row.payload.metadata.has_schwa = typeof oldMetadata.has_schwa === "boolean" ? oldMetadata.has_schwa : null;
        }
        const oldSentence = dictationByWord.get(current.id);
        if (oldSentence && !supplied.has("dictation_sentence") && !supplied.has("dictation1_sentence")) {
          row.payload.dictationSentence = oldSentence.dictation_sentence;
          row.payload.dictationTargetTokenIndex = oldSentence.dictation_target_token_index;
        }
        const oldMorphology = morphologyByWord.get(current.id);
        if (oldMorphology) {
          const old = row.payload.canonicalMorphology;
          if (!supplied.has("raw_morpholex_segmentation")) old.rawSegmentation = String(oldMorphology.raw_morpholex_segmentation ?? "");
          if (!supplied.has("raw_morpholex_pos")) old.rawPartOfSpeech = String(oldMorphology.raw_morpholex_pos ?? "");
          if (!supplied.has("morphology_parts")) old.parts = oldMorphology.morphology_parts as unknown[] ?? [];
          if (!supplied.has("feature_keys")) old.featureKeys = oldMorphology.feature_keys as unknown[] ?? [];
          if (!supplied.has("morphology_joins")) old.joins = oldMorphology.morphology_joins as unknown[] ?? [];
          if (!supplied.has("transformation_notes")) old.transformationNotes = String(oldMorphology.transformation_notes ?? "");
          if (!supplied.has("word_sum")) old.wordSum = String(oldMorphology.word_sum ?? "");
          if (!supplied.has("analysis_status")) old.analysisStatus = oldMorphology.analysis_status as WordDraftPayload["canonicalMorphology"]["analysisStatus"];
          if (!supplied.has("review_notes")) old.reviewNotes = String(oldMorphology.review_notes ?? "");
        }
      }
      const issues = row.error ? [row.error] : validateDraft(row.payload, row.normalisedWord);
      if (issues.length) { errors.push(`Row ${row.rowNumber}: ${issues.join(" ")}`); return []; }
      return [{ canonical_word_id: current?.id ?? null,
        normalised_word: row.normalisedWord, dialect_code: "en-GB", payload: row.payload,
        source_kind: "csv", source_reference: `CSV batch ${batchId}, ${file.name}, row ${row.rowNumber}`, created_by: actor.id }];
    });
    for (let i = 0; i < drafts.length; i += 100) {
      const result = await db.from("teaching_dictionary_manager_drafts").insert(drafts.slice(i, i + 100));
      if (result.error) throw new Error("CSV_DRAFT_IMPORT_FAILED");
    }
    revalidatePath(PATH);
    return { imported: drafts.length, batchId: drafts.length ? batchId : undefined,
      errorCount: errors.length, errors: errors.slice(0, 50) };
  } catch (error) { return { error: errorCode(error) }; }
}

export async function publishTeachingDictionaryBatch(form: FormData) {
  const actor = await requireAdminUser();
  const batchId = value(form, "batch_id");
  if (!isUuid(batchId)) throw new Error("TEACHING_BATCH_ID_INVALID");
  const path = `${PATH}/imports/${batchId}`;
  const db = createServiceRoleClient();
  let published = 0;
  let failed = 0;
  let scanned = 0;
  const failureCodes: Record<string, string> = {};
  for (let start = 0; start < 10000 && published + failed < 10; start += 100) {
    const result = await db.from("teaching_dictionary_manager_drafts")
      .select("id,normalised_word,payload").like("source_reference", `CSV batch ${batchId},%`)
      .order("id").range(start, start + 99);
    if (result.error) throw new Error("TEACHING_BATCH_READ_FAILED");
    const drafts = result.data ?? [];
    if (!drafts.length) break;
    const publications = await db.from("teaching_dictionary_manager_publications")
      .select("draft_id").in("draft_id", drafts.map((draft) => draft.id));
    if (publications.error) throw new Error("TEACHING_BATCH_PUBLICATION_READ_FAILED");
    const done = new Set((publications.data ?? []).map((item) => item.draft_id));
    for (const draft of drafts) {
      scanned += 1;
      if (done.has(draft.id)) continue;
      const payload = draft.payload as WordDraftPayload;
      if (publicationBlockers(payload, draft.normalised_word).length
        || payload.routeContents.some((route) => routeBlockers(route, payload).length)) continue;
      try {
        const destination = await publishValidatedDraft(db, draft.id, actor.id, payload, draft.normalised_word);
        if (destination.includes("route_error=")) {
          failed += 1;
          failureCodes[draft.id] = new URL(destination, "https://example.invalid").searchParams.get("route_error") ?? "ROUTE_PUBLICATION_FAILED";
        }
        else published += 1;
      } catch (error) { failed += 1; failureCodes[draft.id] = errorCode(error); }
      if (published + failed >= 10) break;
    }
    if (drafts.length < 100) break;
  }
  revalidatePath(path);
  redirect(`${path}?${new URLSearchParams({ published: String(published), failed: String(failed),
    scanned: String(scanned), failures: JSON.stringify(failureCodes) })}`);
}

export async function saveTeachingDictionarySkillApprovals(form: FormData) {
  const actor = await requireAdminUser();
  const wordId = value(form, "word_id");
  const path = `${PATH}/${wordId}`;
  try {
    if (!isUuid(wordId)) throw new Error("TEACHING_WORD_ID_INVALID");
    const keys = form.getAll("skill_key").map((item) => String(item).trim()).filter(Boolean);
    if (keys.length !== new Set(keys).size || keys.length > 30) throw new Error("TEACHING_SKILL_SELECTION_INVALID");
    const db = createServiceRoleClient();
    const environment = resolveAdleRouteActivationEnvironment();
    if (!environment) throw new Error("WORD_SKILL_ENVIRONMENT_UNSET");
    const [word, skillRows, managerPackages] = await Promise.all([
      db.from("canonical_teaching_dictionary_words").select("id,row_status,review_status").eq("id", wordId).single(),
      keys.length ? db.from("micro_skill_catalog").select("micro_skill_key").in("micro_skill_key", keys).eq("is_active", true) : Promise.resolve({ data: [], error: null }),
      db.from("adle_word_skill_candidate_packages").select("id,candidates").like("package_key", `tdm:${wordId}:%`).eq("environment_key", environment),
    ]);
    if (word.error || word.data.row_status !== "active" || word.data.review_status !== "approved_for_first_exposure") throw new Error("TEACHING_WORD_NOT_APPROVED");
    if (skillRows.error || (skillRows.data?.length ?? 0) !== keys.length || managerPackages.error) throw new Error("TEACHING_SKILL_SELECTION_INVALID");
    const published = managerPackages.data?.length ? await db.from("adle_word_skill_package_publications").select("package_id,release_id").in("package_id", managerPackages.data.map((pack) => pack.id)) : { data: [], error: null };
    if (published.error) throw new Error("WORD_SKILL_PUBLICATION_READ_FAILED");
    const withdrawals = published.data?.length ? await db.from("adle_reviewed_word_skill_withdrawals").select("release_id").in("release_id", published.data.map((row) => row.release_id)) : { data: [], error: null };
    if (withdrawals.error) throw new Error("WORD_SKILL_WITHDRAWAL_READ_FAILED");
    const withdrawn = new Set((withdrawals.data ?? []).map((row) => row.release_id));
    const releaseByPackage = new Map((published.data ?? []).map((row) => [row.package_id, row.release_id]));
    const managerApprovals = new Map<string, string[]>();
    for (const pack of managerPackages.data ?? []) {
      const releaseId = releaseByPackage.get(pack.id);
      if (!releaseId || withdrawn.has(releaseId)) continue;
      const candidate = Array.isArray(pack.candidates) ? pack.candidates[0] as { microSkillKey?: string } : null;
      if (candidate?.microSkillKey) managerApprovals.set(candidate.microSkillKey, [...(managerApprovals.get(candidate.microSkillKey) ?? []), releaseId]);
    }
    for (const [key, releaseIds] of managerApprovals) if (!keys.includes(key)) {
      for (const releaseId of releaseIds) {
        const result = await db.rpc("withdraw_word_skill_reviewed_release", { p_release: releaseId, p_environment: environment, p_actor: actor.id, p_reason: "Removed in Teaching Dictionary Manager" });
        if (result.error) throw new Error("WORD_SKILL_WITHDRAWAL_FAILED");
      }
    }
    const authority = await loadTeachingDictionaryEvidenceAuthority(db, environment);
    const effective = new Set(authority.relationships.filter((row) => row.canonicalWordId === wordId).map((row) => row.microSkillKey));
    for (const key of keys) {
      if (effective.has(key)) continue;
      const candidate = { canonicalWordId: wordId, microSkillKey: key, relationshipRole: "demonstrates", method: "deterministic_candidate",
        sourceReference: `Teaching Dictionary Manager human approval: ${wordId}:${key}`, licenceReference: "internal_authored" };
      const packageKey = `tdm:${wordId}:${randomUUID()}`;
      const created = await db.rpc("create_word_skill_candidate_package", { p_key: packageKey, p_environment: environment, p_candidates: [candidate], p_actor: actor.id });
      if (created.error || !created.data) throw new Error("WORD_SKILL_PACKAGE_CREATE_FAILED");
      const reviewed = await db.rpc("review_word_skill_candidate_package_with_metrics", { p_package: created.data, p_environment: environment,
        p_decisions: ["approved"], p_rejection_reasons: [""], p_actor: actor.id, p_note: "Approved in Teaching Dictionary Manager", p_active_seconds: 0 });
      if (reviewed.error) throw new Error("WORD_SKILL_REVIEW_FAILED");
      const pack = await loadWordSkillPackage(db, environment, created.data);
      const preview = await previewWordSkillPackage(db, pack.package, pack.review);
      if (!preview.pairs[0]?.ready) throw new Error("WORD_SKILL_AUTHORITY_BLOCKED");
      await publishWordSkillPackage(db, environment, created.data, actor.id, preview.result.reconciliation.sourceFingerprint);
      effective.add(key);
    }
  } catch (error) { finish(path, error); }
  finish(path);
}

export async function importApprovedTeachingSubmission(form: FormData) {
  const actor = await requireAdminUser();
  const submissionId = value(form, "submission_id");
  const wordId = value(form, "word_id");
  const path = `${PATH}/${wordId}`;
  let destination = path;
  try {
    if (!isUuid(submissionId) || !isUuid(wordId)) throw new Error("TEACHING_SUBMISSION_ID_INVALID");
    const db = createServiceRoleClient();
    const [submission, word, metadata, dictation, morphology] = await Promise.all([
      db.from("adle_word_teaching_content_submissions").select("id,canonical_word_id,target_word,route_id,route_version,micro_skill_key,content,approval_status")
        .eq("id", submissionId).eq("canonical_word_id", wordId).single(),
      db.from("canonical_teaching_dictionary_words").select("normalised_word,display_word,age_band,frequency_band,complexity_band,source_category,source_name,source_url,source_licence,source_use_note,confidence").eq("id", wordId).single(),
      db.from("canonical_teaching_dictionary_word_metadata").select("*").eq("canonical_word_id", wordId).eq("row_status", "active").order("created_at", { ascending: false }).limit(1),
      db.from("canonical_teaching_dictionary_dictation_sentences").select("*").eq("canonical_word_id", wordId).eq("row_status", "active").order("created_at", { ascending: false }).limit(1),
      db.from("canonical_teaching_dictionary_word_morphology").select("*").eq("canonical_word_id", wordId).eq("row_status", "active").limit(1),
    ]);
    if (submission.error || word.error || metadata.error || dictation.error || morphology.error || submission.data.approval_status !== "approved_for_import") throw new Error("TEACHING_SUBMISSION_NOT_APPROVED");
    const content = submission.data.content as Record<string, unknown>;
    const currentMetadata = metadata.data?.[0] ?? {};
    const mergedMetadata = emptyMetadata();
    for (const key of WORD_METADATA_FIELDS) mergedMetadata[key] = String(currentMetadata[key] ?? "");
    mergedMetadata.has_schwa = typeof currentMetadata.has_schwa === "boolean" ? currentMetadata.has_schwa : null;
    const sentence = dictation.data?.[0];
    const currentMorphology = morphology.data?.[0];
    let routeFacts = content;
    if (submission.data.route_id === "dynamic_prefix_word_lab") {
      const profiles = await db.from("canonical_teaching_dictionary_prefix_profiles")
        .select("id,source_row_hash,meaning_bins,prefix_choices").eq("micro_skill_key", submission.data.micro_skill_key)
        .eq("row_status", "active").eq("review_status", "approved_for_first_exposure").limit(1);
      if (profiles.error) throw new Error("TEACHING_PREFIX_PROFILE_READ_FAILED");
      routeFacts = { ...derivePrefixRouteFacts({ word: word.data.display_word, source: content,
        meaningBins: (profiles.data?.[0]?.meaning_bins ?? []) as { id: string; prefixText?: string }[],
        choiceForms: ((profiles.data?.[0]?.prefix_choices ?? []) as { text?: string }[]).map((choice) => choice.text ?? "").filter(Boolean) }),
        ...(profiles.data?.[0] ? { expectedProfileId: profiles.data[0].id, expectedSourceRowHash: profiles.data[0].source_row_hash } : {}) };
    } else if (submission.data.route_id === "dynamic_affix_word_lab") {
      const profiles = await db.from("canonical_teaching_dictionary_suffix_profiles").select("id,source_row_hash")
        .eq("micro_skill_key", submission.data.micro_skill_key).eq("row_status", "active")
        .eq("review_status", "approved_for_first_exposure").limit(1);
      if (profiles.error) throw new Error("TEACHING_SUFFIX_PROFILE_READ_FAILED");
      routeFacts = { ...content,
        ...(profiles.data?.[0] ? { expectedProfileId: profiles.data[0].id, expectedSourceRowHash: profiles.data[0].source_row_hash } : {}) };
    }
    const route: RouteContentDraft = { routeId: submission.data.route_id, routeVersion: submission.data.route_version,
      microSkillKey: submission.data.micro_skill_key, wordMeaning: String(content.wordMeaning ?? ""),
      wordSum: String(content.wordSum ?? ""), content: routeFacts };
    const payload: WordDraftPayload = { displayWord: word.data.display_word, definition: String(content.wordMeaning ?? ""),
      dictationSentence: sentence?.dictation_sentence ?? String(content.dictation1_sentence ?? ""),
      dictationTargetTokenIndex: sentence?.dictation_target_token_index ?? 0,
      ageBand: word.data.age_band ?? "", frequencyBand: word.data.frequency_band ?? "", complexityBand: word.data.complexity_band ?? "",
      metadata: mergedMetadata,
      canonicalMorphology: currentMorphology ? {
        rawSegmentation: currentMorphology.raw_morpholex_segmentation ?? "", rawPartOfSpeech: currentMorphology.raw_morpholex_pos ?? "",
        parts: currentMorphology.morphology_parts ?? [], featureKeys: currentMorphology.feature_keys ?? [], joins: currentMorphology.morphology_joins ?? [],
        transformationNotes: currentMorphology.transformation_notes ?? "", wordSum: currentMorphology.word_sum ?? "",
        analysisStatus: currentMorphology.analysis_status, reviewNotes: currentMorphology.review_notes ?? "",
      } : emptyMorphology(),
      provenance: { sourceCategory: word.data.source_category as WordDraftPayload["provenance"]["sourceCategory"],
        sourceName: word.data.source_name ?? "", sourceUrl: word.data.source_url ?? "",
        sourceLicence: word.data.source_licence ?? "", sourceUseNote: word.data.source_use_note ?? "",
        confidence: word.data.confidence as WordDraftPayload["provenance"]["confidence"] },
      skillKeys: [submission.data.micro_skill_key], routeContents: [route] };
    const saved = await db.from("teaching_dictionary_manager_drafts").insert({ canonical_word_id: wordId,
      normalised_word: word.data.normalised_word, dialect_code: "en-GB", payload, source_kind: "approved_submission",
      source_reference: `Approved teaching submission ${submissionId}`, created_by: actor.id }).select("id").single();
    if (saved.error) throw new Error("TEACHING_SUBMISSION_IMPORT_FAILED");
    destination = `${path}?draft=${saved.data.id}`;
  } catch (error) { finish(path, error); }
  finish(destination);
}

export async function publishTeachingDictionaryPrefixContent(form: FormData) {
  const actor = await requireAdminUser();
  const wordId = value(form, "word_id");
  const contentId = value(form, "content_version_id");
  const path = `${PATH}/${wordId}`;
  try {
    if (!isUuid(wordId) || !isUuid(contentId)) throw new Error("TEACHING_PREFIX_CONTENT_ID_INVALID");
    const db = createServiceRoleClient();
    const content = await db.from("teaching_dictionary_route_content_versions")
      .select("id,canonical_word_id,route_id,route_version,micro_skill_key,content")
      .eq("id", contentId).eq("canonical_word_id", wordId).single();
    if (content.error || content.data.route_id !== "dynamic_prefix_word_lab" || content.data.route_version !== "v2") throw new Error("TEACHING_PREFIX_CONTENT_UNSUPPORTED");
    await publishPrefixVerified(db, contentId, actor.id);
  } catch (error) { finish(path, error); }
  finish(path);
}

export async function publishTeachingDictionarySuffixContent(form: FormData) {
  const actor = await requireAdminUser();
  const wordId = value(form, "word_id");
  const contentId = value(form, "content_version_id");
  const path = `${PATH}/${wordId}`;
  try {
    if (!isUuid(wordId) || !isUuid(contentId)) throw new Error("TEACHING_SUFFIX_CONTENT_ID_INVALID");
    const db = createServiceRoleClient();
    const content = await db.from("teaching_dictionary_route_content_versions")
      .select("id,canonical_word_id,route_id,route_version,micro_skill_key,content")
      .eq("id", contentId).eq("canonical_word_id", wordId).single();
    if (content.error || content.data.route_id !== "dynamic_affix_word_lab" || content.data.route_version !== "v3") throw new Error("TEACHING_SUFFIX_CONTENT_UNSUPPORTED");
    await publishSuffixVerified(db, contentId, actor.id);
  } catch (error) { finish(path, error); }
  finish(path);
}
