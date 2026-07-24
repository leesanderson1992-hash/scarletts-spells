/**
 * Read-only route-registration inspection.
 *
 * This deliberately reports only whether a named route is registered for an
 * exact micro-skill. It does not invoke a selector, compile a payload, create
 * an assignment, or grant permission to activate a route.
 */
import type { RouteSelectionFact } from "./resolver";
import type { CurriculumRouteDefinition } from "./route-registry";

function evidence(routeId: string, blockers: readonly string[]) {
  return blockers.map((code) => ({
    source: "curriculum_route_registry",
    id: routeId,
    field: "compatibility",
    observed: code,
  }));
}

export function inspectRegisteredRouteCompatibility(params: {
  childId: string;
  canonicalWordId: string;
  microSkillKey: string;
  routeId: string;
  routeVersion: string;
  routes: readonly CurriculumRouteDefinition[];
}): RouteSelectionFact {
  const route = params.routes.find((candidate) =>
    candidate.routeId === params.routeId && candidate.routeVersion === params.routeVersion,
  );
  const selectorBlockers = !route
    ? ["ROUTE_NOT_REGISTERED"]
    : !route.supportedMicroSkillKeys.includes(params.microSkillKey)
      ? ["ROUTE_MICRO_SKILL_UNSUPPORTED"]
      : [];
  return {
    childId: params.childId,
    canonicalWordId: params.canonicalWordId,
    microSkillKey: params.microSkillKey,
    routeId: params.routeId,
    routeVersion: params.routeVersion,
    ready: selectorBlockers.length === 0,
    selectorBlockers,
    evidence: evidence(params.routeId, selectorBlockers),
  };
}
