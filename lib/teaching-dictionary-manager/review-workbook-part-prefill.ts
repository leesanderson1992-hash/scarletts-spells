import { FLAT_IMPORT_PART_LIMIT } from "./csv";
import { suggestTransformation, resolveTransformationType, transformationExplanation } from "./transformations";

export type WorkbookPartPrefill = { fields: Record<string, string>; issues: string[]; missingFields: string[] };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const kinds = new Set(["prefix", "base", "root", "suffix", "connector"]);
const joinTypes = new Set(["none", "space", "hyphen"]);
const separator = (join: string) => join === "space" ? " " : join === "hyphen" ? "-" : "";

/** Export-only projection: incomplete historical facts are useful review inputs,
 * never evidence of approval. Only identifiers and exact spelling joins are derived. */
export function prefillWorkbookParts(input: { word: string; definition: string; parts: unknown; joins: unknown; transformations: unknown }): WorkbookPartPrefill {
  const fields: Record<string, string> = {}, issues: string[] = [], missingFields: string[] = [];
  const need = (field: string, message: string) => { missingFields.push(field); issues.push(message); };
  if (!Array.isArray(input.parts) || !input.parts.length) return { fields, issues: ["Add the word parts."], missingFields: ["part_1_underlying_form"] };
  if (input.parts.length > FLAT_IMPORT_PART_LIMIT) return { fields, issues: ["This analysis has more parts than the workbook supports; review it on the word page."], missingFields: [] };
  const raw = input.parts.map(record);
  const used = new Set(raw.map(part => text(part.id)).filter(Boolean));
  const assigned = new Set<string>();
  const ids = raw.map((part, index) => {
    const stored = text(part.id);
    if (stored && !assigned.has(stored)) { assigned.add(stored); return stored; }
    let id = `part_${index + 1}`;
    while (used.has(id) || assigned.has(id)) id += "_review";
    assigned.add(id); return id;
  });
  const sources = raw.map(part => text(part.sourceText) || text(part.text));
  const surfaces = raw.map(part => text(part.surfaceText));
  // Legacy text alone does not tell us letters lost at a join. Reuse it as
  // visible letters only when the complete stored sequence reproduces the word.
  const candidates = raw.map((part, index) => surfaces[index] || text(part.text) || sources[index]);
  const storedJoins = Array.isArray(input.joins) ? input.joins.map(record) : [];
  const joins = raw.slice(1).map((_, index) => {
    const linked = storedJoins.filter(join => join.afterPartId === raw[index].id && join.beforePartId === raw[index + 1].id && raw[index].id && raw[index + 1].id);
    const join = linked.length === 1 ? linked[0] : storedJoins.length === raw.length - 1 ? storedJoins[index] : {};
    return joinTypes.has(text(join.joinType)) ? text(join.joinType) : "";
  });
  const matches: string[][] = [];
  function match(index: number, built: string, chosen: string[]) {
    if (matches.length > 1 || !input.word.startsWith(built)) return;
    if (index === candidates.length) { if (built === input.word) matches.push(chosen); return; }
    if (!candidates[index]) return;
    for (const join of index ? joins[index - 1] ? [joins[index - 1]] : ["none", "space", "hyphen"] : ["none"])
      match(index + 1, built + (index ? separator(join) : "") + candidates[index], index ? [...chosen, join] : chosen);
  }
  match(0, "", []);
  if (matches.length === 1) {
    for (let i = 0; i < surfaces.length; i++) surfaces[i] ||= candidates[i];
    for (let i = 0; i < joins.length; i++) joins[i] ||= matches[0][i];
  }
  const changes = Array.isArray(input.transformations) ? input.transformations.map(record) : [];
  raw.forEach((part, index) => {
    const prefix = `part_${index + 1}_`, label = `Part ${index + 1}`;
    const kindValues = [part.kind, part.type, part.role, part.partType].map(text).filter(Boolean);
    const kind = kindValues.find(value => kinds.has(value)) || "";
    const meaning = text(part.gloss) || text(part.meaning) || (raw.length === 1 && ["base", "root"].includes(kind) && sources[index] === input.word && surfaces[index] === input.word ? input.definition : "");
    Object.assign(fields, { [`${prefix}id`]: ids[index], [`${prefix}kind`]: kind,
      [`${prefix}underlying_form`]: sources[index], [`${prefix}visible_letters`]: surfaces[index], [`${prefix}meaning`]: meaning });
    if (new Set(kindValues).size > 1) need(`${prefix}kind`, `${label}: resolve the conflicting stored roles (${kindValues.join(" / ")}).`);
    else if (!kind) need(`${prefix}kind`, `${label}: choose its role.`);
    if (part.surfaceText && part.text && text(part.surfaceText) !== text(part.text)) need(`${prefix}visible_letters`, `${label}: resolve the conflicting stored visible letters.`);
    if (!sources[index]) need(`${prefix}underlying_form`, `${label}: enter the underlying form.`);
    if (!surfaces[index]) need(`${prefix}visible_letters`, `${label}: confirm its visible letters.`);
    if (!meaning) need(`${prefix}meaning`, `${label}: add its meaning.`);
    if (part.gloss && part.meaning && text(part.gloss) !== text(part.meaning)) need(`${prefix}meaning`, `${label}: resolve the conflicting stored meanings.`);
    if (index) { fields[`${prefix}join_before`] = joins[index - 1]; if (!joins[index - 1]) need(`${prefix}join_before`, `${label}: choose the join before this part.`); }
    if (sources[index] && surfaces[index] && sources[index] !== surfaces[index]) {
      const stored = changes.filter(change => change.sourcePartId === part.id && part.id);
      const change = stored.length === 1 ? stored[0] : {};
      const type = text(change.type) ? resolveTransformationType(text(change.type), sources[index], surfaces[index]) : suggestTransformation(sources[index], surfaces[index]);
      fields[`${prefix}spelling_change_type`] = type || "";
      fields[`${prefix}spelling_change_explanation`] = text(change.explanation) || (type ? transformationExplanation(type, sources[index], surfaces[index]) : "");
      if (stored.length > 1) need(`${prefix}spelling_change_type`, `${label}: review its multiple stored spelling changes on the word page.`);
      else if (!type) need(`${prefix}spelling_change_type`, `${label}: choose its spelling change.`);
      else if (!fields[`${prefix}spelling_change_explanation`]) need(`${prefix}spelling_change_explanation`, `${label}: explain its spelling change.`);
    }
  });
  if (surfaces.every(Boolean) && !matches.length) issues.push("The stored visible parts and joins do not reproduce this spelling; check the visible letters and joins.");
  return { fields, issues: [...new Set(issues)], missingFields: [...new Set(missingFields)] };
}
