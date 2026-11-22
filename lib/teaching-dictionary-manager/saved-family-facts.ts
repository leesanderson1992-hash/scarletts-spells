import type { MultiSenseCsvBundle } from "./multi-sense-csv";

/** Only approved projections reach this adapter. Never guess a different sense
 * or choose between several replacement base/root components. */
export function savedFamilyFacts(bundle: MultiSenseCsvBundle | undefined, senseId: string,
  componentId: string, links: { component_part_id: string; family_key: string }[]) {
  const sense = bundle?.senseSet.senses.find(row => row.id === senseId);
  const analysis = bundle?.analyses.find(row => row.senseId === senseId);
  if (!bundle?.sourceSenseReviewedAt || !sense || !analysis) return null;
  const components = analysis.parts.filter(part => part.kind === "base" || part.kind === "root");
  const component = components.find(part => part.id === componentId) ?? (components.length === 1 ? components[0] : null);
  if (!component) return null;
  const families = [...new Set(links.filter(link => link.component_part_id === component.id).map(link => link.family_key))];
  return { sense, component, base: component.sourceText.toLocaleLowerCase("en-GB"),
    kind: component.kind === "root" ? "bound_root" as const : "free_base" as const,
    meaning: component.gloss, families };
}
