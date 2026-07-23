import type { LearningItemFact } from "../learning-items";
import {
  validateCurriculumRouteRegistry,
  type CurriculumRouteDefinition,
} from "./route-registry";

const APPROVED_MAPPING_STATUSES = new Set([
  "parent_local_promoted",
  "global_canonical_promoted",
]);
const APPROVED_WORD_STATUS = "approved_for_first_exposure";
const NON_CONTRAST_SUPPORT_ROLES = new Set(["support_example", "review_example"]);
const SELECTABLE_STATUSES = new Set(["pending", "pending_reteach"]);

function canonicalWordSkillPair(
  canonicalWordId: string,
  microSkillKey: string,
): string {
  return `${canonicalWordId}\u0000${microSkillKey}`;
}

/** Structural read-only projections supplied by the Teaching Dictionary loader. */
interface CurriculumWordFact {
  canonicalWordId: string;
  normalisedWord: string;
  rowStatus: string;
  reviewStatus: string;
  frequencyBand: string | null;
  ageBand: string | null;
}

interface CurriculumMicroSkillFact {
  microSkillKey: string;
  masteryDomainKey: string;
  isActive: boolean;
  isAssignable: boolean;
}

interface CurriculumSupportFact {
  canonicalWordId: string;
  microSkillKey: string;
  supportRole: string;
  rowStatus: string;
  reviewStatus: string;
}

export interface SharedWordRouteFact {
  learningItemId: string;
  microSkillKey: string;
  attachedOn: string;
  attachmentOrdinal: number;
  requiresSentenceContext: boolean;
  rowStatus: "active" | "superseded";
}

interface SharedWordReviewPolicy {
  activationMicroSkillKey: string;
  requiresSentenceContext: boolean;
}

function resolveSharedWordReviewPolicy(params: {
  learningItems: readonly LearningItemFact[];
  explicitRoutes: readonly SharedWordRouteFact[];
}): SharedWordReviewPolicy | null {
  const activeItems = params.learningItems
    .filter((item) => item.rowStatus === "active" && item.itemStatus !== "resolved")
    .sort((left, right) => left.learningItemId.localeCompare(right.learningItemId));
  const activeRoutes = params.explicitRoutes
    .filter((route) => route.rowStatus === "active")
    .sort((left, right) =>
      left.attachmentOrdinal !== right.attachmentOrdinal
        ? left.attachmentOrdinal - right.attachmentOrdinal
        : left.learningItemId.localeCompare(right.learningItemId),
    );
  if (activeRoutes.length === 0) {
    const only = activeItems[0];
    return activeItems.length === 1 && only
      ? { activationMicroSkillKey: only.microSkillKey, requiresSentenceContext: false }
      : null;
  }
  const newest = activeRoutes[activeRoutes.length - 1];
  return newest
    ? {
        activationMicroSkillKey: newest.microSkillKey,
        requiresSentenceContext: activeRoutes.some((route) => route.requiresSentenceContext),
      }
    : null;
}

export type CurriculumDecisionStatus = "READY" | "BLOCKED";

export interface CurriculumEvidence {
  source: string;
  id: string;
  field?: string;
  observed?: string | boolean | number | null;
  required?: string | boolean | number | null;
}

export interface CurriculumBlocker {
  code: string;
  stage:
    | "mapping_validity"
    | "mapping_intake_usability"
    | "learning_item_validity"
    | "item_selectability"
    | "target_content"
    | "route_compatibility"
    | "route_activation"
    | "route_selection"
    | "shared_route_integrity"
    | "inventory_integrity";
  dependency: string;
  evidence: CurriculumEvidence[];
}

export interface CurriculumDecision {
  status: CurriculumDecisionStatus;
  blockers: CurriculumBlocker[];
  evidence: CurriculumEvidence[];
}

export interface ApprovedMappingFact {
  mappingId: string;
  authority: "parent_local" | "global_canonical";
  parentUserId: string | null;
  childId: string | null;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  status: string;
  mappingStatus: string | null;
  resolverVisibilityStatus: string | null;
  hasVisibilityEnableEvent: boolean;
  verifiedOn: string;
  sourceRef: string;
}

export interface LearningItemLineageFact {
  learningItemId: string;
  sourceRef: string;
  candidateMappingId: string | null;
  canonicalMappingId: string | null;
  misspellingNormalized: string | null;
  correctSpellingNormalized: string | null;
  microSkillKey: string;
}

export interface RouteActivationFact {
  /** Null is a route-wide observation; a value is a child-scoped pilot gate. */
  childId?: string | null;
  microSkillKey: string;
  routeId: string;
  routeVersion: string;
  environmentKey: "local" | "staging" | "production";
  environmentEnabled: boolean;
  profileOrFamilyEnabled: boolean;
  childEnabled: boolean;
}

/**
 * Exact approved curriculum dependencies for one target through one versioned
 * route. This is deliberately not a word+skill set: one route's reviewed
 * content must never make another route ready by accident.
 */
export interface RouteContentFact {
  canonicalWordId: string;
  microSkillKey: string;
  routeId: string;
  routeVersion: string;
  dependencyFingerprint: string;
  ready: boolean;
  blockers: readonly string[];
  evidence: readonly CurriculumEvidence[];
}

export interface RouteSelectionFact {
  childId: string;
  canonicalWordId: string;
  microSkillKey: string;
  routeId: string;
  routeVersion: string;
  /** Result from the existing route selector/compiler, never a replacement. */
  ready: boolean;
  selectorBlockers: readonly string[];
  evidence: readonly CurriculumEvidence[];
}

export interface CurriculumReadinessFacts {
  environmentKey: "local" | "staging" | "production";
  mappings: readonly ApprovedMappingFact[];
  learningItems: readonly LearningItemFact[];
  learningItemLineage: readonly LearningItemLineageFact[];
  words: readonly CurriculumWordFact[];
  microSkills: readonly CurriculumMicroSkillFact[];
  supports: readonly CurriculumSupportFact[];
  routes: readonly CurriculumRouteDefinition[];
  routeActivation: readonly RouteActivationFact[];
  routeSelections: readonly RouteSelectionFact[];
  routeContent: readonly RouteContentFact[];
  sharedRoutes: ReadonlyMap<string, readonly SharedWordRouteFact[]>;
  /** A schedule may exist before its explicit route rows are complete. */
  scheduledSharedWordKeys: ReadonlySet<string>;
}

export interface MappingInspection {
  mappingId: string;
  targetKey: string | null;
  validity: CurriculumDecision;
  intakeUsability: CurriculumDecision;
}

export interface LearningItemInspection {
  learningItemId: string;
  childId: string;
  targetKey: string;
  validity: CurriculumDecision;
  selectability: CurriculumDecision;
}

export interface RouteInspection {
  routeId: string;
  routeVersion: string;
  compatibility: CurriculumDecision;
  activation: CurriculumDecision;
  assignmentReadiness: CurriculumDecision;
}

export interface TargetInspection {
  targetKey: string;
  canonicalWordId: string;
  microSkillKey: string;
  mappingIds: string[];
  learningItemIds: string[];
  childIds: string[];
  routes: RouteInspection[];
  assignmentReadinessByChild: Array<{ childId: string; decision: CurriculumDecision }>;
}

export interface SharedWordInspection {
  childId: string;
  canonicalWordId: string;
  decision: CurriculumDecision;
  microSkillKeys: string[];
  activationMicroSkillKey: string | null;
  requiresSentenceContext: boolean;
}

export interface CurriculumReadinessInventory {
  mappingInspections: MappingInspection[];
  learningItemInspections: LearningItemInspection[];
  targets: TargetInspection[];
  sharedWords: SharedWordInspection[];
  integrity: CurriculumDecision;
}

function decision(blockers: CurriculumBlocker[] = [], evidence: CurriculumEvidence[] = []): CurriculumDecision {
  const sortedBlockers = blockers
    .map((blocker) => ({ ...blocker, evidence: [...blocker.evidence].sort(compareEvidence) }))
    .sort((left, right) => `${left.stage}\u0000${left.code}\u0000${left.dependency}`.localeCompare(`${right.stage}\u0000${right.code}\u0000${right.dependency}`));
  return { status: sortedBlockers.length ? "BLOCKED" : "READY", blockers: sortedBlockers, evidence: [...evidence].sort(compareEvidence) };
}

function compareEvidence(left: CurriculumEvidence, right: CurriculumEvidence): number {
  return `${left.source}\u0000${left.id}\u0000${left.field ?? ""}`.localeCompare(`${right.source}\u0000${right.id}\u0000${right.field ?? ""}`);
}

function blocker(
  code: string,
  stage: CurriculumBlocker["stage"],
  dependency: string,
  evidence: CurriculumEvidence[] = [],
): CurriculumBlocker {
  return { code, stage, dependency, evidence };
}

function targetForMapping(mapping: ApprovedMappingFact, facts: CurriculumReadinessFacts): { targetKey: string | null; blockers: CurriculumBlocker[]; evidence: CurriculumEvidence[] } {
  const blockers: CurriculumBlocker[] = [];
  const evidence: CurriculumEvidence[] = [{ source: "approved_mapping", id: mapping.mappingId, field: "status", observed: mapping.status }];
  if (!APPROVED_MAPPING_STATUSES.has(mapping.status)) blockers.push(blocker("MAPPING_SCOPE_OR_AUTHORITY_INVALID", "mapping_validity", mapping.mappingId, evidence));
  if (!mapping.misspellingNormalized || !mapping.correctSpellingNormalized || mapping.misspellingNormalized === mapping.correctSpellingNormalized) blockers.push(blocker("MAPPING_NORMALISED_PAIR_INVALID", "mapping_validity", mapping.mappingId, evidence));
  const matches = facts.words.filter((word) => word.rowStatus === "active" && word.normalisedWord === mapping.correctSpellingNormalized);
  if (matches.length !== 1) {
    blockers.push(blocker(matches.length ? "APPROVED_MAPPING_TARGET_AMBIGUOUS" : "APPROVED_MAPPING_TARGET_NOT_FOUND", "mapping_validity", mapping.correctSpellingNormalized, matches.map((word) => ({ source: "canonical_teaching_dictionary_words", id: word.canonicalWordId }))));
    return { targetKey: null, blockers, evidence };
  }
  const word = matches[0];
  const skill = facts.microSkills.find((candidate) => candidate.microSkillKey === mapping.microSkillKey);
  if (!skill || !skill.isActive || !skill.isAssignable || skill.masteryDomainKey !== "D4") blockers.push(blocker("INACTIVE_OR_NON_ASSIGNABLE_MICRO_SKILL", "mapping_validity", mapping.microSkillKey));
  if (word.reviewStatus !== APPROVED_WORD_STATUS) blockers.push(blocker("TARGET_WORD_NOT_APPROVED", "mapping_validity", word.canonicalWordId, [{ source: "canonical_teaching_dictionary_words", id: word.canonicalWordId, field: "review_status", observed: word.reviewStatus, required: APPROVED_WORD_STATUS }]));
  if (!facts.supports.some((support) => support.canonicalWordId === word.canonicalWordId && support.microSkillKey === mapping.microSkillKey && support.rowStatus === "active" && support.reviewStatus === APPROVED_WORD_STATUS && NON_CONTRAST_SUPPORT_ROLES.has(support.supportRole))) blockers.push(blocker("TARGET_SKILL_SUPPORT_MISSING", "mapping_validity", canonicalWordSkillPair(word.canonicalWordId, mapping.microSkillKey)));
  return { targetKey: canonicalWordSkillPair(word.canonicalWordId, mapping.microSkillKey), blockers, evidence };
}

function mappingIntakeUsability(mapping: ApprovedMappingFact): CurriculumDecision {
  if (mapping.authority === "parent_local") return decision();
  const blockers: CurriculumBlocker[] = [];
  if (mapping.mappingStatus !== "active") blockers.push(blocker("CANONICAL_MAPPING_NOT_ACTIVE", "mapping_intake_usability", mapping.mappingId));
  if (mapping.resolverVisibilityStatus !== "visible" || !mapping.hasVisibilityEnableEvent) blockers.push(blocker("CANONICAL_MAPPING_NOT_RESOLVER_VISIBLE", "mapping_intake_usability", mapping.mappingId));
  return decision(blockers);
}

function itemInspection(item: LearningItemFact, facts: CurriculumReadinessFacts): LearningItemInspection {
  const targetKey = canonicalWordSkillPair(item.canonicalWordId, item.microSkillKey);
  const blockers: CurriculumBlocker[] = [];
  const word = facts.words.find((candidate) => candidate.canonicalWordId === item.canonicalWordId);
  const skill = facts.microSkills.find((candidate) => candidate.microSkillKey === item.microSkillKey);
  if (!word || !skill || !skill.isActive || !skill.isAssignable || skill.masteryDomainKey !== "D4") blockers.push(blocker("LEARNING_ITEM_IDENTITY_INVALID", "learning_item_validity", item.learningItemId));
  const duplicates = facts.learningItems.filter((candidate) => candidate.rowStatus === "active" && candidate.childId === item.childId && candidate.canonicalWordId === item.canonicalWordId && candidate.microSkillKey === item.microSkillKey);
  if (duplicates.length !== 1) blockers.push(blocker("DUPLICATE_ACTIVE_LEARNING_ITEM", "learning_item_validity", targetKey, duplicates.map((candidate) => ({ source: "adle_learning_items", id: candidate.learningItemId }))));
  if (item.sourceKind === "verified_misspelling") {
    const lineage = facts.learningItemLineage.filter((entry) => entry.learningItemId === item.learningItemId && entry.microSkillKey === item.microSkillKey && entry.sourceRef === item.sourceRef);
    if (lineage.length === 0) blockers.push(blocker("LEARNING_ITEM_LINEAGE_MISSING", "learning_item_validity", item.learningItemId));
  }
  return {
    learningItemId: item.learningItemId,
    childId: item.childId,
    targetKey,
    validity: decision(blockers),
    selectability: decision(item.rowStatus === "active" && SELECTABLE_STATUSES.has(item.itemStatus) ? [] : [blocker("LEARNING_ITEM_NOT_SELECTABLE", "item_selectability", item.learningItemId)]),
  };
}

function sharedRouteLinksComplete(
  items: readonly LearningItemFact[],
  explicitRoutes: readonly SharedWordRouteFact[],
): boolean {
  const activeItems = items
    .filter((item) => item.rowStatus === "active" && item.itemStatus !== "resolved")
    .sort((left, right) => left.learningItemId.localeCompare(right.learningItemId));
  const activeRoutes = explicitRoutes
    .filter((route) => route.rowStatus === "active")
    .sort((left, right) => left.learningItemId.localeCompare(right.learningItemId));
  if (activeItems.length === 0) return activeRoutes.length === 0;
  if (activeItems.length !== activeRoutes.length) return false;
  return activeItems.every((item) =>
    activeRoutes.some(
      (route) =>
        route.learningItemId === item.learningItemId &&
        route.microSkillKey === item.microSkillKey,
    ),
  );
}

function routeInspection(route: CurriculumRouteDefinition, target: { canonicalWordId: string; microSkillKey: string }, childId: string | null, facts: CurriculumReadinessFacts): RouteInspection {
  const compatible = route.supportedMicroSkillKeys.includes(target.microSkillKey)
    ? decision()
    : decision([blocker("ROUTE_SKILL_NOT_SUPPORTED", "route_compatibility", target.microSkillKey)]);
  const matchingActivationFacts = facts.routeActivation.filter(
    (entry) =>
      entry.microSkillKey === target.microSkillKey &&
      entry.routeId === route.routeId &&
      entry.routeVersion === route.routeVersion &&
      entry.environmentKey === facts.environmentKey,
  );
  const activationFact = matchingActivationFacts.find((entry) => entry.childId === childId)
    ?? matchingActivationFacts.find((entry) => entry.childId === null || entry.childId === undefined);
  const activationBlockers: CurriculumBlocker[] = [];
  if (!route.newAssignmentCapable) activationBlockers.push(blocker("ROUTE_NOT_NEW_ASSIGNMENT_CAPABLE", "route_activation", `${route.routeId}:${route.routeVersion}`));
  if (!activationFact?.environmentEnabled) activationBlockers.push(blocker("ROUTE_ENVIRONMENT_GATE_CLOSED", "route_activation", `${route.routeId}:${route.routeVersion}`));
  if (!activationFact?.profileOrFamilyEnabled) activationBlockers.push(blocker("ROUTE_PROFILE_OR_FAMILY_DISABLED", "route_activation", `${route.routeId}:${route.routeVersion}`));
  if (childId !== null && !activationFact?.childEnabled) activationBlockers.push(blocker("ROUTE_CHILD_GATE_CLOSED", "route_activation", childId));
  const activation = decision(activationBlockers);
  const selected = childId === null ? null : facts.routeSelections.find((entry) => entry.childId === childId && entry.canonicalWordId === target.canonicalWordId && entry.microSkillKey === target.microSkillKey && entry.routeId === route.routeId && entry.routeVersion === route.routeVersion);
  const selectionBlockers = selected && !selected.ready ? selected.selectorBlockers.map((code) => blocker(code, "route_selection", `${route.routeId}:${route.routeVersion}`, [...selected.evidence])) : selected === null && route.requiresAuthenticSelectableItem && childId !== null ? [blocker("ROUTE_SELECTOR_NOT_EVALUATED", "route_selection", `${route.routeId}:${route.routeVersion}`)] : [];
  const routeContent = facts.routeContent.find(
    (entry) =>
      entry.canonicalWordId === target.canonicalWordId &&
      entry.microSkillKey === target.microSkillKey &&
      entry.routeId === route.routeId &&
      entry.routeVersion === route.routeVersion,
  );
  if (!routeContent) {
    selectionBlockers.push(blocker("TARGET_ROUTE_CONTENT_INCOMPLETE", "target_content", `${canonicalWordSkillPair(target.canonicalWordId, target.microSkillKey)}\u0000${route.routeId}\u0000${route.routeVersion}`));
  } else if (!routeContent.ready) {
    const codes = routeContent.blockers.length > 0
      ? routeContent.blockers
      : ["TARGET_ROUTE_CONTENT_INCOMPLETE"];
    selectionBlockers.push(...codes.map((code) => blocker(
      code,
      "target_content",
      `${routeContent.dependencyFingerprint}\u0000${route.routeId}\u0000${route.routeVersion}`,
      [...routeContent.evidence],
    )));
  }
  // First-exposure routes create or expand review linkage on completion. They
  // must not be blocked merely because a future shared-review row does not yet
  // exist. Review integrity is reported separately in sharedWords.
  return { routeId: route.routeId, routeVersion: route.routeVersion, compatibility: compatible, activation, assignmentReadiness: decision([...compatible.blockers, ...activation.blockers, ...selectionBlockers]) };
}

export function resolveCurriculumReadinessInventory(facts: CurriculumReadinessFacts): CurriculumReadinessInventory {
  const registryErrors = validateCurriculumRouteRegistry(facts.routes);
  const integrity = decision(registryErrors.map((error) => blocker("REGISTRY_INVALID", "inventory_integrity", error)));
  const mappingInspections = facts.mappings.slice().sort((a, b) => a.mappingId.localeCompare(b.mappingId)).map((mapping) => {
    const resolved = targetForMapping(mapping, facts);
    return { mappingId: mapping.mappingId, targetKey: resolved.targetKey, validity: decision(resolved.blockers, resolved.evidence), intakeUsability: mappingIntakeUsability(mapping) };
  });
  const learningItemInspections = facts.learningItems.filter((item) => item.rowStatus === "active").slice().sort((a, b) => a.learningItemId.localeCompare(b.learningItemId)).map((item) => itemInspection(item, facts));
  const targetIds = new Map<string, { canonicalWordId: string; microSkillKey: string; mappingIds: string[]; learningItemIds: string[]; childIds: string[] }>();
  for (const inspection of mappingInspections) if (inspection.targetKey) {
    const [canonicalWordId, microSkillKey] = inspection.targetKey.split("\u0000");
    const value = targetIds.get(inspection.targetKey) ?? { canonicalWordId, microSkillKey, mappingIds: [], learningItemIds: [], childIds: [] };
    value.mappingIds.push(inspection.mappingId); targetIds.set(inspection.targetKey, value);
  }
  for (const inspection of learningItemInspections) {
    const [canonicalWordId, microSkillKey] = inspection.targetKey.split("\u0000");
    const value = targetIds.get(inspection.targetKey) ?? { canonicalWordId, microSkillKey, mappingIds: [], learningItemIds: [], childIds: [] };
    value.learningItemIds.push(inspection.learningItemId); value.childIds.push(inspection.childId); targetIds.set(inspection.targetKey, value);
  }
  const targets = [...targetIds.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([targetKey, target]) => {
    const routes = facts.routes.map((route) => routeInspection(route, target, null, facts));
    const childIds = [...new Set(target.childIds)].sort();
    return {
      targetKey, ...target,
      mappingIds: [...new Set(target.mappingIds)].sort(), learningItemIds: [...new Set(target.learningItemIds)].sort(), childIds,
      routes,
      assignmentReadinessByChild: childIds.map((childId) => {
        const results = facts.routes.map((route) => routeInspection(route, target, childId, facts));
        const ready = results.some((result) => result.assignmentReadiness.status === "READY");
        return { childId, decision: ready ? decision() : decision(results.flatMap((result) => result.assignmentReadiness.blockers)) };
      }),
    };
  });
  const groups = new Map<string, LearningItemFact[]>();
  for (const item of facts.learningItems.filter((item) => item.rowStatus === "active" && item.itemStatus !== "resolved")) {
    const key = `${item.childId}\u0000${item.canonicalWordId}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const sharedWords = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, items]) => {
    const [childId, canonicalWordId] = key.split("\u0000");
    const explicitRoutes = facts.sharedRoutes.get(key) ?? [];
    const policy = resolveSharedWordReviewPolicy({ learningItems: items, explicitRoutes });
    const multiple = new Set(items.map((item) => item.microSkillKey)).size > 1;
    const requiresExplicitReviewLinks = multiple && facts.scheduledSharedWordKeys.has(key);
    const sharedBlockers = requiresExplicitReviewLinks && (!policy || !sharedRouteLinksComplete(items, explicitRoutes))
      ? [blocker("SHARED_ROUTE_LINKAGE_MISSING", "shared_route_integrity", key)]
      : [];
    return { childId, canonicalWordId, decision: decision(sharedBlockers), microSkillKeys: [...new Set(items.map((item) => item.microSkillKey))].sort(), activationMicroSkillKey: policy?.activationMicroSkillKey ?? null, requiresSentenceContext: policy?.requiresSentenceContext ?? false };
  });
  return { mappingInspections, learningItemInspections, targets, sharedWords, integrity };
}
