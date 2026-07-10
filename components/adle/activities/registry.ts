/**
 * Component-facing compatibility wrapper over the ADLE 7-UI activity template
 * registry. Renderer metadata lives in lib/adle so non-React regressions and
 * the session runner share one source of truth.
 */

import {
  listRegisteredActivityTemplateKeys,
  resolveActivityTemplateDefinition,
  type ActivityRendererKind,
} from "@/lib/adle/activity-template-registry";

/** The interaction archetypes the session runner knows how to render. */
export type AdleActivityKind = ActivityRendererKind;

export interface ActivityResolutionInput {
  templateKey: string;
  sectionKey: string;
}

/**
 * Resolve an activity to its interaction archetype. Never throws: unknown
 * template -> section fallback -> `guided_prompt`.
 */
export function resolveActivityKind(input: ActivityResolutionInput): AdleActivityKind {
  return resolveActivityTemplateDefinition(input).rendererKind;
}

/** Templates whose full interaction is data-backed today. */
export const DATA_BACKED_TEMPLATE_KEYS: ReadonlySet<string> = new Set(
  listRegisteredActivityTemplateKeys().filter(
    (templateKey) =>
      resolveActivityTemplateDefinition({ templateKey, sectionKey: "" }).rendererKind !== "guided_prompt",
  ),
);

/** All template keys the registry knows about. */
export const KNOWN_TEMPLATE_KEYS: ReadonlySet<string> = new Set(listRegisteredActivityTemplateKeys());
