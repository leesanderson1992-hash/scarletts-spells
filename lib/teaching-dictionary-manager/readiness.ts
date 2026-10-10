import {
  emptyMetadata, emptyMorphology, routeBlockers,
  type RouteContentDraft, type WordDraftPayload,
} from "./contracts";

export type ReadinessRequirement = {
  label: string;
  status: "present" | "needs_review" | "missing";
  editTarget: string;
};

export function publicationBlockerTarget(message: string): string {
  if (message.includes("definition")) return "td-definition";
  if (message.includes("age band")) return "td-age-band";
  if (message.includes("frequency band")) return "td-frequency-band";
  if (message.includes("dictation")) return "td-dictation";
  if (message.includes("morphology")) return "td-canonical-parts";
  if (message.includes("source") || message.includes("licence")) return "td-source";
  return "td-word-editor";
}

export function hasReleasedRouteContent(kind: "prefix" | "suffix" | "base" | null, memberReleased: boolean, sourceAuthorities: readonly string[]): boolean {
  if (!kind || !memberReleased) return false;
  if (kind !== "base") return true;
  return sourceAuthorities.includes("released_route_content");
}

/** Keep the manager's checklist in lockstep with the publication validator. */
export function routeRequirements(route: RouteContentDraft, payload: WordDraftPayload, needsReview: (editTarget: string) => boolean = () => false): ReadinessRequirement[] {
  const emptyPayload: WordDraftPayload = {
    ...payload,
    definition: "", dictationSentence: "", ageBand: "", frequencyBand: "", complexityBand: "",
    metadata: emptyMetadata(), canonicalMorphology: emptyMorphology(),
  };
  const emptyRoute: RouteContentDraft = { ...route, wordMeaning: "", wordSum: "", content: {} };
  const all = routeBlockers(emptyRoute, emptyPayload);
  const missing = new Set(routeBlockers(route, payload));
  return [...new Set([...all, ...missing])].map((label) => {
    const editTarget = requirementEditTarget(label, route.microSkillKey);
    return {
      label: label.replace(/^(Add|Set|Review) /, "").replace(/\.$/, ""),
      status: missing.has(label) ? "missing" as const : needsReview(editTarget) ? "needs_review" as const : "present" as const,
      editTarget,
    };
  });
}

export function requirementEditTarget(message: string, skillKey: string): string {
  const shared: Record<string, string> = {
    "Add the route-specific teaching meaning.": "td-definition",
    "Add the word sum.": "td-canonical-word-sum",
    "Add the dictionary dictation sentence.": "td-dictation",
    "Set the dictionary age band.": "td-age-band",
    "Set the dictionary frequency band.": "td-frequency-band",
    "Set the dictionary complexity band.": "td-complexity-band",
    "Add dictionary syllables.": "td-syllables",
    "Add dictionary phoneme hint.": "td-phoneme_hint",
    "Add dictionary stress pattern.": "td-stress_pattern",
    "Review whether the word has a schwa.": "td-has-schwa",
    "Add dictionary morphemes.": "td-morphemes",
    "Add dictionary morphology notes.": "td-morphology_notes",
  };
  if (shared[message]) return shared[message];
  const fieldByMessage: Record<string, string> = {
    "Add base word.": "baseWord", "Add base meaning.": "baseMeaning",
    "Add prefix variant.": "prefixVariant", "Add suffix form.": "suffixVariant",
    "Add semantic base.": "semanticBaseText", "Add base or root classification.": "semanticBaseKind",
    "Add meaning group.": "meaningBinKey", "Add base-word family.": "familyKey",
    "Add teaching split parts.": "teachingSplitParts",
    "Add teaching split joins.": "teachingSplitParts",
    "Add teaching split.": "teachingSplitParts",
    "Add teaching joins.": "teachingSplitParts",
    "Add true morphology parts.": "trueMorphologyParts",
    "Add true morphology joins.": "trueMorphologyParts",
    "Add true morphology provenance.": "trueMorphologyProvenance",
    "Add a reviewed prefix-choice audit for this word.": "choiceAudit",
    "Add reviewed morphology parts.": "morphologyParts",
    "Add component words and meanings.": "components",
    "Add component joins.": "joins",
    "Add component-to-whole explanation.": "componentToWholeRelationship",
    "Add morphology provenance.": "morphologyProvenance",
    "Add the unchanged base word.": "base",
    "Choose the doubling pattern.": "doublingPattern",
    "Add source references for the derived form.": "sourceRefs",
    "Add adjective family.": "familyKey",
    "Add base, comparative and superlative forms.": "degreeWords",
    "Add two spelling transformations.": "transformations",
    "Add lexical verification.": "lexicalVerification",
    "Add paired dictation sentence.": "pairedSentence",
    "Add source references.": "sourceRefs",
  };
  const field = fieldByMessage[message];
  return field ? `td-route-${skillKey}-${field}` : `td-route-${skillKey}`;
}

export function routeContentForReadiness(route: {
  routeId: string; routeVersion: string; microSkillKey: string;
}, payload: WordDraftPayload, saved?: RouteContentDraft): RouteContentDraft {
  return {
    routeId: route.routeId, routeVersion: route.routeVersion, microSkillKey: route.microSkillKey,
    wordMeaning: saved?.wordMeaning || payload.definition,
    wordSum: saved?.wordSum || payload.canonicalMorphology.wordSum,
    content: saved?.content ?? {},
  };
}

export function requirementPreview(target: string, route: RouteContentDraft, payload: WordDraftPayload): string {
  const shared: Record<string, unknown> = {
    "td-definition": route.wordMeaning || payload.definition,
    "td-canonical-word-sum": route.wordSum || payload.canonicalMorphology.wordSum,
    "td-dictation": payload.dictationSentence,
    "td-age-band": payload.ageBand,
    "td-frequency-band": payload.frequencyBand,
    "td-complexity-band": payload.complexityBand,
    "td-has-schwa": payload.metadata.has_schwa == null ? null : payload.metadata.has_schwa ? "Yes" : "No",
  };
  for (const [field, value] of Object.entries(payload.metadata)) shared[`td-${field}`] = value;
  const routePrefix = `td-route-${route.microSkillKey}-`;
  const value = target.startsWith(routePrefix) ? route.content[target.slice(routePrefix.length)] : shared[target];
  if (typeof value === "string") return value.length > 100 ? `${value.slice(0, 100)}…` : value;
  if (Array.isArray(value)) return `${value.length} recorded ${value.length === 1 ? "entry" : "entries"}`;
  if (value && typeof value === "object") return "Recorded structure";
  return "";
}
