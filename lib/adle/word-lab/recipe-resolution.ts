import type { CurriculumRouteDefinition } from "../curriculum-readiness/route-registry";
import {
  WORD_LAB_RECIPE_REGISTRY,
} from "./recipe-registry";
import type {
  WordLabBlocker,
  WordLabRecipeDefinitionV1,
  WordLabRecipeStatus,
} from "./contracts";

export interface AuthoritativeWordLabRoute {
  routeKey: string;
  routeVersion: number;
  rendererKey: "common_word_lab";
}

export interface WordLabRouteInventoryEntry {
  routeId: string;
  routeVersion: string;
  supportedMicroSkillKeys: readonly string[];
  implementationState: string;
  newAssignmentCapable: boolean;
  rendererKey: string;
}

export type WordLabRouteResolutionResult =
  | { ok: true; route: AuthoritativeWordLabRoute }
  | { ok: false; blockers: readonly WordLabBlocker[] };

export type WordLabRecipeResolutionResult =
  | { ok: true; recipe: WordLabRecipeDefinitionV1; precedence: "micro_skill" | "cluster" | "family" }
  | { ok: false; blockers: readonly WordLabBlocker[] };

function numericVersion(version: string): number | null {
  const match = /^v([1-9][0-9]*)$/.exec(version);
  return match ? Number(match[1]) : null;
}

/** The supplied inventory is authoritative. The recipe registry cannot activate a route. */
export function resolveAuthoritativeWordLabRoute(input: {
  microSkillKey: string;
  routes: readonly WordLabRouteInventoryEntry[];
}): WordLabRouteResolutionResult {
  const matches = input.routes.filter((route) => route.supportedMicroSkillKeys.includes(input.microSkillKey));
  if (matches.length === 0) return { ok: false, blockers: [{ code: "missing_route" }] };
  const commonMatches = matches.filter((route) => route.rendererKey === "common_word_lab");
  if (commonMatches.length === 0) return { ok: false, blockers: [{ code: "route_not_common_word_lab" }] };
  const available = commonMatches.filter((route) => route.implementationState === "registered" && route.newAssignmentCapable);
  if (available.length === 0) return { ok: false, blockers: [{ code: "route_not_available" }] };
  if (available.length > 1) return { ok: false, blockers: [{ code: "ambiguous_route" }] };
  const route = available[0];
  const routeVersion = numericVersion(route.routeVersion);
  if (routeVersion === null) return { ok: false, blockers: [{ code: "route_not_available", detail: route.routeVersion }] };
  return { ok: true, route: { routeKey: route.routeId, routeVersion, rendererKey: "common_word_lab" } };
}

function precedence(recipe: WordLabRecipeDefinitionV1, clusterKey: string, microSkillKey: string) {
  if (recipe.compatibility.microSkillKeys?.includes(microSkillKey)) return "micro_skill" as const;
  if (!recipe.compatibility.microSkillKeys && recipe.compatibility.clusterKeys.includes(clusterKey)) return "cluster" as const;
  if (!recipe.compatibility.microSkillKeys && recipe.compatibility.clusterKeys.length === 0) return "family" as const;
  return null;
}

export function resolveWordLabRecipe(input: {
  route: AuthoritativeWordLabRoute;
  familyKey: string;
  clusterKey: string;
  microSkillKey: string;
  recipes?: readonly WordLabRecipeDefinitionV1[];
  allowedStatuses?: readonly WordLabRecipeStatus[];
}): WordLabRecipeResolutionResult {
  const recipes = input.recipes ?? WORD_LAB_RECIPE_REGISTRY;
  const allowedStatuses = input.allowedStatuses ?? ["production"];
  const routeMatches = recipes.filter((recipe) =>
    recipe.compatibility.routeKey === input.route.routeKey &&
    recipe.compatibility.routeVersion === input.route.routeVersion,
  );
  const taxonomyMatches = routeMatches.filter((recipe) => recipe.compatibility.familyKey === input.familyKey)
    .map((recipe) => ({ recipe, precedence: precedence(recipe, input.clusterKey, input.microSkillKey) }))
    .filter((entry): entry is { recipe: WordLabRecipeDefinitionV1; precedence: "micro_skill" | "cluster" | "family" } => entry.precedence !== null);
  if (taxonomyMatches.length === 0) {
    return { ok: false, blockers: [{ code: routeMatches.length === 0 ? "missing_recipe" : "recipe_taxonomy_mismatch" }] };
  }
  const rank = { family: 1, cluster: 2, micro_skill: 3 } as const;
  const highest = Math.max(...taxonomyMatches.map((entry) => rank[entry.precedence]));
  const winners = taxonomyMatches.filter((entry) => rank[entry.precedence] === highest);
  if (winners.length !== 1) return { ok: false, blockers: [{ code: "ambiguous_recipe" }] };
  const winner = winners[0];
  if (!allowedStatuses.includes(winner.recipe.identity.status)) {
    return { ok: false, blockers: [{ code: "recipe_status_not_allowed", detail: winner.recipe.identity.status }] };
  }
  return { ok: true, recipe: winner.recipe, precedence: winner.precedence };
}

/** Structural compatibility helper for the live inventory without importing activation logic into the compiler. */
export function curriculumRoutesForWordLabResolution(
  routes: readonly CurriculumRouteDefinition[],
): readonly WordLabRouteInventoryEntry[] {
  return routes;
}
