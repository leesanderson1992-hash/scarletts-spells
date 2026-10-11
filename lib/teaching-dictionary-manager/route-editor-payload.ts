import type { RouteContentDraft } from "./contracts";

type SelectedRoute = Pick<RouteContentDraft, "routeId" | "routeVersion" | "microSkillKey">;

/** Save the complete visible route snapshot, including facts unchanged in this edit. */
export function routeEditorPayload(
  selected: SelectedRoute[],
  current: RouteContentDraft[],
  routeJson: Record<string, string>,
  definition: string,
  canonicalWordSum: string,
): RouteContentDraft[] {
  return selected.map((route) => {
    const saved = current.find((item) => item.routeId === route.routeId && item.microSkillKey === route.microSkillKey);
    const content: unknown = JSON.parse(routeJson[route.microSkillKey] ?? JSON.stringify(saved?.content ?? {}));
    if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("ROUTE_JSON_INVALID");
    return {
      ...route,
      wordMeaning: saved?.wordMeaning?.trim() || definition.trim(),
      wordSum: saved?.wordSum?.trim() || canonicalWordSum.trim(),
      content: content as RouteContentDraft["content"],
    };
  });
}
