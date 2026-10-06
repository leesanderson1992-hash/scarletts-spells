export const FACET_KEYS = ["resolver", "teaching", "dictionary", "metadata", "lesson"] as const;
export type FacetKey = (typeof FACET_KEYS)[number];
export type FacetState = "complete" | "missing" | "unknown";
export type Facet = { state: FacetState; details: string[] };
export type Facets = Record<FacetKey, Facet>;

export type CandidateFact = {
  childId: string;
  misspelling: string;
  target: string;
  microSkillKey: string;
};
export type MappingFact = {
  misspelling: string;
  target: string;
  microSkillKey: string;
  status: string;
  visibility: string;
  hasEnableEvent: boolean;
};
export type WordFact = {
  id: string;
  target: string;
  rowStatus: string;
  reviewStatus: string;
  ageBand: string | null;
  frequencyBand: string | null;
};
export type RouteFact = {
  childId: string;
  enabled: boolean;
  readyPair: boolean;
  exactReady: boolean | null;
  blockerCodes: string[];
  hasSelector: boolean;
};
export type TeachingFact = {
  active: boolean;
  signedOff: boolean;
  childExplanation: string | null;
  ruleExplanation: string | null;
};

export type ProjectionInput = {
  target: string;
  microSkillKey: string;
  routeId: string;
  candidates: CandidateFact[];
  mappings: MappingFact[];
  words: WordFact[];
  routeFacts: RouteFact[];
  teaching: TeachingFact | null;
  skill: { active: boolean; assignable: boolean; domain: string } | null;
  hasApprovedSupport: boolean;
  allowedAgeBands: readonly string[];
  allowedFrequencyBands: readonly string[];
};

const complete = (): Facet => ({ state: "complete", details: [] });
const missing = (...details: string[]): Facet => ({ state: "missing", details });
const unknown = (detail: string): Facet => ({ state: "unknown", details: [detail] });
const normal = (value: string) => value.trim().toLowerCase();

/** An independent, read-only explanation of the same governed facts used by
 * canonical intake. No facet is inferred from a historical demand blocker. */
export function projectReadiness(input: ProjectionInput): Facets {
  const target = normal(input.target);
  const candidates = input.candidates.filter((candidate) =>
    normal(candidate.target) === target && candidate.microSkillKey === input.microSkillKey);
  const resolverProblems: string[] = [];
  if (!candidates.length) resolverProblems.push("No governed source candidate is linked to this word and micro skill.");
  for (const candidate of candidates) {
    const possible = input.mappings.filter((mapping) =>
      normal(mapping.misspelling) === normal(candidate.misspelling) &&
      mapping.microSkillKey === input.microSkillKey);
    const visible = possible.filter((mapping) =>
      mapping.status === "active" && mapping.visibility === "visible" && mapping.hasEnableEvent);
    const exact = visible.filter((mapping) => normal(mapping.target) === target);
    if (new Set(visible.map((mapping) => normal(mapping.target))).size > 1) {
      resolverProblems.push(`Conflicting visible mappings for “${candidate.misspelling}”.`);
    } else if (exact.length !== 1) {
      resolverProblems.push(exact.length > 1
        ? `More than one visible mapping for “${candidate.misspelling}” → “${input.target}”.`
        : `The mapping “${candidate.misspelling}” → “${input.target}” needs active status, resolver visibility and its enable event.`);
    }
  }
  const resolver = resolverProblems.length ? missing(...new Set(resolverProblems)) : complete();

  const rows = input.words.filter((word) => normal(word.target) === target);
  const active = rows.filter((word) => word.rowStatus === "active");
  const approved = active.filter((word) => word.reviewStatus === "approved_for_first_exposure");
  const word = approved.length === 1 && active.length === 1 ? approved[0] : null;
  const dictionary = !rows.length
    ? missing(`No canonical Teaching Dictionary word exists for “${input.target}”.`)
    : !word
      ? missing(active.length !== 1
          ? `Expected one active dictionary word; found ${active.length}.`
          : `Dictionary review is “${active[0].reviewStatus}”; approval for first exposure is required.`)
      : complete();

  const routeByChild = new Map(input.routeFacts.map((fact) => [fact.childId, fact]));
  const relevantRoutes = [...new Set(candidates.map((candidate) => candidate.childId))]
    .map((childId) => routeByChild.get(childId)).filter((fact): fact is RouteFact => Boolean(fact));
  const routeCertified = relevantRoutes.length > 0 && relevantRoutes.every((fact) => fact.exactReady === true && fact.readyPair);
  const routeCanOverrideBand = routeCertified && input.routeId !== "adle_word_level";
  const routeCanSupplyWord = routeCertified && (input.routeId === "base_word_lab" || input.routeId === "compound_word_lab");
  const dictionaryResult = routeCanSupplyWord && !rows.length ? complete() : dictionary;

  let metadata: Facet;
  if (!word) metadata = routeCanSupplyWord ? complete() : unknown("Metadata cannot be checked until an approved dictionary word is linked.");
  else {
    const problems: string[] = [];
    if (!word.ageBand && !routeCanSupplyWord) problems.push("Missing age_band on the canonical word.");
    if (!word.frequencyBand && !routeCanSupplyWord) problems.push("Missing frequency_band on the canonical word.");
    if (word.ageBand && !input.allowedAgeBands.includes(word.ageBand) && !routeCanOverrideBand)
      problems.push(`age_band is “${word.ageBand}”; it is outside the current child band.`);
    if (word.frequencyBand && !input.allowedFrequencyBands.includes(word.frequencyBand) && !routeCanOverrideBand)
      problems.push(`frequency_band is “${word.frequencyBand}”; it is outside the current child band.`);
    metadata = problems.length ? missing(...problems) : complete();
  }

  let teaching: Facet;
  if (input.routeId === "adle_word_level") {
    const problems: string[] = [];
    if (!input.teaching?.active) problems.push("The micro skill needs an active teaching-content version.");
    if (!input.teaching?.signedOff) problems.push("Teaching content needs final readiness sign-off.");
    if (!input.teaching?.childExplanation?.trim()) problems.push("Missing child_friendly_explanation.");
    if (!input.teaching?.ruleExplanation?.trim()) problems.push("Missing rule_explanation.");
    teaching = problems.length ? missing(...problems) : complete();
  } else if (routeCertified) teaching = complete();
  else {
    const contentCodes = relevantRoutes.flatMap((fact) => fact.blockerCodes).filter((code) =>
      ["morphology_missing", "semantic_base_missing", "teaching_surface_missing", "meaning_missing", "dictation_missing", "choice_audit_missing"].includes(code));
    teaching = contentCodes.length
      ? missing(...[...new Set(contentCodes)].map((code) => `Route content is missing or unapproved: ${code.replaceAll("_", " ")}.`))
      : unknown("Route-specific teaching content has not been certified for this word and child.");
  }

  const lessonProblems: string[] = [];
  if (!input.skill?.active || !input.skill?.assignable || input.skill?.domain !== "D4")
    lessonProblems.push("The D4 micro skill must be active and assignable.");
  if (relevantRoutes.length) {
    if (relevantRoutes.some((fact) => !fact.enabled)) lessonProblems.push("The ADLE route or approved selector profile is not enabled for every waiting child.");
    if (input.routeId === "adle_word_level") {
      if (relevantRoutes.some((fact) => !fact.hasSelector) && !input.hasApprovedSupport)
        lessonProblems.push("An approved transfer selector or exact word support is missing.");
      if (relevantRoutes.some((fact) => !fact.hasSelector && !fact.readyPair))
        lessonProblems.push("The exact word and micro skill pair is not approved for selection.");
    } else if (relevantRoutes.some((fact) => !fact.readyPair || fact.exactReady !== true)) {
      lessonProblems.push("The exact route member or compilable ADLE lesson payload is not approved.");
      for (const code of new Set(relevantRoutes.flatMap((fact) => fact.blockerCodes)))
        lessonProblems.push(`Route check: ${code.replaceAll("_", " ")}.`);
    }
  }
  const lesson = lessonProblems.length ? missing(...lessonProblems) :
    !relevantRoutes.length ? unknown("No child-scoped route readiness facts are available yet.") : complete();
  return { resolver, teaching, dictionary: dictionaryResult, metadata, lesson };
}
