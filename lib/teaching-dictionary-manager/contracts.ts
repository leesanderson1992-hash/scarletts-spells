import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "@/lib/adle/curriculum-readiness/route-registry";

export const WORD_METADATA_FIELDS = [
  "syllables", "phoneme_hint", "grapheme_notes", "stress_pattern", "morphemes",
  "morphology_notes", "irregularity_notes",
] as const;

export type WordMetadataField = (typeof WORD_METADATA_FIELDS)[number];
export type WordMetadata = Record<WordMetadataField, string> & { has_schwa: boolean | null };

export type RouteContentDraft = {
  routeId: string;
  routeVersion: string;
  microSkillKey: string;
  wordMeaning: string;
  wordSum: string;
  content: Record<string, unknown>;
};

/** Published versions store the route draft wrapper; older submissions store just its facts. */
export function routeContentFromStoredRow(row: {
  route_id: string; route_version: string; micro_skill_key: string; content: unknown;
}): RouteContentDraft {
  const stored = row.content && typeof row.content === "object" && !Array.isArray(row.content)
    ? row.content as Record<string, unknown> : {};
  const facts = stored.content && typeof stored.content === "object" && !Array.isArray(stored.content)
    ? stored.content as Record<string, unknown> : stored;
  return {
    routeId: row.route_id, routeVersion: row.route_version, microSkillKey: row.micro_skill_key,
    wordMeaning: typeof stored.wordMeaning === "string" ? stored.wordMeaning : typeof facts.wordMeaning === "string" ? facts.wordMeaning : "",
    wordSum: typeof stored.wordSum === "string" ? stored.wordSum : typeof facts.wordSum === "string" ? facts.wordSum : "",
    content: facts,
  };
}

export type WordDraftPayload = {
  displayWord: string;
  definition: string;
  dictationSentence: string;
  dictationTargetTokenIndex: number;
  ageBand: string;
  frequencyBand: string;
  complexityBand: string;
  metadata: WordMetadata;
  canonicalMorphology: {
    rawSegmentation: string;
    rawPartOfSpeech: string;
    parts: unknown[];
    featureKeys: unknown[];
    joins: unknown[];
    transformationNotes: string;
    wordSum: string;
    analysisStatus: "in_review" | "approved" | "not_applicable" | "rejected";
    reviewNotes: string;
  };
  provenance: {
    sourceCategory: "internal_authored" | "internal_reviewed_seed" | "public_domain" | "open_licensed" | "licensed_vendor" | "reference_only" | "ai_assisted_draft";
    sourceName: string;
    sourceUrl: string;
    sourceLicence: string;
    sourceUseNote: string;
    confidence: "low" | "medium" | "high";
  };
  skillKeys: string[];
  routeContents: RouteContentDraft[];
};

export function normaliseWord(value: string) {
  return value.trim().toLocaleLowerCase("en-GB").replace(/[’ʼ]/g, "'");
}

export function routeForSkill(key: string) {
  return ADLE_CURRICULUM_ROUTE_REGISTRY.find((route) => route.routeId !== "generic_composer"
    && route.supportedMicroSkillKeys.includes(key)) ?? null;
}

export function emptyMetadata(): WordMetadata {
  return {
    syllables: "", phoneme_hint: "", grapheme_notes: "", stress_pattern: "",
    morphemes: "", morphology_notes: "", irregularity_notes: "", has_schwa: null,
  };
}

export function emptyMorphology(): WordDraftPayload["canonicalMorphology"] {
  return { rawSegmentation: "", rawPartOfSpeech: "", parts: [], featureKeys: [], joins: [],
    transformationNotes: "", wordSum: "", analysisStatus: "in_review", reviewNotes: "" };
}

export function validateDraft(payload: WordDraftPayload, normalisedWord: string) {
  const errors: string[] = [];
  if (!normalisedWord || normalisedWord.length > 100 || !/^[\p{L}' -]+$/u.test(normalisedWord)) errors.push("Enter a valid dictionary word.");
  if (!payload.displayWord.trim()) errors.push("Display word is required.");
  if (payload.skillKeys.length !== new Set(payload.skillKeys).size) errors.push("Each micro skill may be selected once.");
  if (payload.skillKeys.some((key) => !/^D[0-9]_[A-Z0-9_]+$/.test(key))) errors.push("A micro skill key is invalid.");
  if (payload.definition.length > 2000 || payload.dictationSentence.length > 2000) errors.push("Definition or dictation is too long.");
  if (payload.routeContents.some((route) => !route.routeId || !route.routeVersion || !route.microSkillKey)) errors.push("Route identity is incomplete.");
  if (!payload.provenance || !["internal_authored", "internal_reviewed_seed", "public_domain", "open_licensed", "licensed_vendor", "reference_only", "ai_assisted_draft"].includes(payload.provenance.sourceCategory)
    || !["low", "medium", "high"].includes(payload.provenance.confidence)) errors.push("Source provenance is incomplete.");
  if (!payload.canonicalMorphology || !Array.isArray(payload.canonicalMorphology.parts)
    || !Array.isArray(payload.canonicalMorphology.featureKeys) || !Array.isArray(payload.canonicalMorphology.joins)
    || !["in_review", "approved", "not_applicable", "rejected"].includes(payload.canonicalMorphology.analysisStatus)) errors.push("Canonical morphology is invalid.");
  return errors;
}

export function publicationBlockers(payload: WordDraftPayload, normalisedWord: string) {
  const blockers = validateDraft(payload, normalisedWord);
  if (!payload.definition.trim()) blockers.push("Add a dictionary definition.");
  if (!payload.ageBand.trim()) blockers.push("Set the age band.");
  if (!payload.frequencyBand.trim()) blockers.push("Set the frequency band.");
  if (!payload.dictationSentence.trim()) blockers.push("Add a dictation sentence.");
  if (payload.provenance.sourceCategory === "reference_only") blockers.push("Reference-only sources cannot publish a teaching word.");
  if (["open_licensed", "licensed_vendor"].includes(payload.provenance.sourceCategory) && !payload.provenance.sourceLicence.trim()) blockers.push("Record the source licence.");
  if (payload.canonicalMorphology.analysisStatus === "approved" && (!payload.canonicalMorphology.wordSum.trim() || payload.canonicalMorphology.parts.length === 0)) blockers.push("Approved canonical morphology needs a word sum and parts.");
  const tokens = payload.dictationSentence.match(/[\p{L}]+(?:['’ʼ-][\p{L}]+)*/gu) ?? [];
  const targetLength = normalisedWord.split(/\s+/u).length;
  const target = normaliseWord(tokens.slice(payload.dictationTargetTokenIndex,
    payload.dictationTargetTokenIndex + targetLength).join(" "));
  if (payload.dictationSentence.trim() && target !== normalisedWord) {
    blockers.push("The dictation target must be the dictionary word or phrase.");
  }
  return blockers;
}

export function routeBlockers(route: RouteContentDraft, payload: WordDraftPayload) {
  const blockers: string[] = [];
  const definition = ADLE_CURRICULUM_ROUTE_REGISTRY.find((candidate) =>
    candidate.routeId === route.routeId && candidate.routeVersion === route.routeVersion);
  if (!definition) return ["This ADLE route/version has no runtime adapter."];
  if (!definition.supportedMicroSkillKeys.includes(route.microSkillKey)) blockers.push("The micro skill is not supported by this route.");
  if (!route.wordMeaning.trim()) blockers.push("Add the route-specific teaching meaning.");
  if (!route.wordSum.trim() && ["base_word_lab", "dynamic_prefix_word_lab", "dynamic_affix_word_lab"].includes(route.routeId)) blockers.push("Add the word sum.");
  if (!payload.dictationSentence.trim()) blockers.push("Add the dictionary dictation sentence.");
  if (["dynamic_prefix_word_lab", "dynamic_affix_word_lab"].includes(route.routeId)) {
    if (!payload.ageBand.trim()) blockers.push("Set the dictionary age band.");
    if (!payload.frequencyBand.trim()) blockers.push("Set the dictionary frequency band.");
    if (!payload.complexityBand.trim()) blockers.push("Set the dictionary complexity band.");
    for (const [field, label] of [["syllables", "syllables"], ["phoneme_hint", "phoneme hint"], ["stress_pattern", "stress pattern"]] as const) {
      if (!payload.metadata[field].trim()) blockers.push(`Add dictionary ${label}.`);
    }
    if (payload.metadata.has_schwa == null) blockers.push("Review whether the word has a schwa.");
  }
  if (route.routeId === "dynamic_prefix_word_lab") {
    if (!payload.metadata.morphemes.trim()) blockers.push("Add dictionary morphemes.");
    if (!payload.metadata.morphology_notes.trim()) blockers.push("Add dictionary morphology notes.");
    for (const [field, label] of [["baseWord", "base word"], ["baseMeaning", "base meaning"], ["prefixVariant", "prefix variant"], ["meaningBinKey", "meaning group"], ["teachingSplitParts", "teaching split parts"], ["teachingSplitJoins", "teaching split joins"]] as const) {
      const value = route.content[field];
      if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) blockers.push(`Add ${label}.`);
    }
    if (!route.content.choiceAudit || typeof route.content.choiceAudit !== "object") blockers.push("Add a reviewed prefix-choice audit for this word.");
  }
  if (route.routeId === "dynamic_affix_word_lab") {
    for (const [field, label] of [["suffixVariant", "suffix form"], ["semanticBaseText", "semantic base"],
      ["semanticBaseKind", "base or root classification"], ["baseMeaning", "base meaning"],
      ["meaningBinKey", "meaning group"], ["teachingSplitParts", "teaching split"],
      ["teachingSplitJoins", "teaching joins"], ["trueMorphologyParts", "true morphology parts"],
      ["trueMorphologyJoins", "true morphology joins"], ["trueMorphologyProvenance", "true morphology provenance"]] as const) {
      const fact = route.content[field];
      if (fact == null || fact === "" || (Array.isArray(fact) && fact.length === 0)
        || (typeof fact === "object" && !Array.isArray(fact) && Object.keys(fact).length === 0)) blockers.push(`Add ${label}.`);
    }
  }
  if (route.routeId === "base_word_lab") {
    for (const [field, label] of [["familyKey", "base-word family"], ["baseWord", "base word"],
      ["baseMeaning", "base meaning"], ["morphologyParts", "reviewed morphology parts"]] as const) {
      const fact = route.content[field];
      if (fact == null || fact === "" || (Array.isArray(fact) && fact.length === 0)
        || (typeof fact === "object" && !Array.isArray(fact) && Object.keys(fact).length === 0)) blockers.push(`Add ${label}.`);
    }
  }
  if (route.routeId === "compound_word_lab") {
    for (const [field, label] of [["components", "component words and meanings"], ["joins", "component joins"],
      ["componentToWholeRelationship", "component-to-whole explanation"], ["morphologyProvenance", "morphology provenance"]] as const) {
      const fact = route.content[field];
      if (fact == null || fact === "" || (Array.isArray(fact) && fact.length === 0)
        || (typeof fact === "object" && !Array.isArray(fact) && Object.keys(fact).length === 0)) blockers.push(`Add ${label}.`);
    }
  }
  if (route.routeId === "ing_endings_word_lab") {
    if (!route.content.base) blockers.push("Add the unchanged base word.");
    if (route.microSkillKey.endsWith("DOUBLE_FINAL_CONSONANT") && !route.content.doublingPattern) blockers.push("Choose the doubling pattern.");
    if (!route.content.sourceRefs) blockers.push("Add source references for the derived form.");
  }
  if (route.routeId === "comparative_superlative_word_lab") {
    for (const [field, label] of [["familyKey", "adjective family"], ["degreeWords", "base, comparative and superlative forms"],
      ["transformations", "two spelling transformations"], ["lexicalVerification", "lexical verification"],
      ["pairedSentence", "paired dictation sentence"], ["sourceRefs", "source references"]] as const) {
      const fact = route.content[field];
      if (fact == null || fact === "" || (Array.isArray(fact) && fact.length === 0)) blockers.push(`Add ${label}.`);
    }
  }
  return blockers;
}
