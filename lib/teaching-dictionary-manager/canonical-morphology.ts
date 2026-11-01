/** The single write format for reviewed dictionary word parts. Historical
 * shapes remain readable, but must be reviewed before they can be approved. */
export type CanonicalPart = {
  id: string;
  kind: "prefix" | "base" | "root" | "suffix" | "connector";
  sourceText: string;
  surfaceText: string;
  gloss: string;
  displayRange: { start: number; end: number };
};

export type CanonicalJoin = {
  afterPartId: string;
  beforePartId: string;
  joinType: "none" | "space" | "hyphen";
};

export function isCanonicalPart(value: unknown): value is CanonicalPart {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const part = value as Record<string, unknown>;
  const range = part.displayRange as Record<string, unknown> | undefined;
  return typeof part.id === "string" && Boolean(part.id) &&
    ["prefix", "base", "root", "suffix", "connector"].includes(String(part.kind)) &&
    typeof part.sourceText === "string" && Boolean(part.sourceText) &&
    typeof part.surfaceText === "string" && Boolean(part.surfaceText) &&
    typeof part.gloss === "string" && Boolean(part.gloss.trim()) &&
    !["text", "type", "role", "partType", "meaning", "start", "end"].some((key) => key in part) &&
    Number.isInteger(range?.start) && Number.isInteger(range?.end) &&
    Number(range?.start) >= 0 && Number(range?.end) >= Number(range?.start);
}

export type MorphologyAudit = {
  status: "canonical" | "safe_range_conversion" | "needs_review" | "conflict";
  reason: string;
  convertedParts?: CanonicalPart[];
};

/** Only derives display offsets. It never invents a part, spelling, meaning,
 * join or approval, and never rewrites evidence held by an approved family. */
export function auditCanonicalMorphology(input: {
  parts: unknown; joins: unknown; displayWord: string; linkedToFamily: boolean;
}): MorphologyAudit {
  const { parts, joins, displayWord, linkedToFamily } = input;
  if (!Array.isArray(parts) || parts.length === 0 || !Array.isArray(joins))
    return { status: "needs_review", reason: "parts_or_joins_missing" };
  if (joins.length !== parts.length - 1)
    return { status: "needs_review", reason: "join_count" };
  const records = parts as Record<string, unknown>[];
  if (records.some((part) => !part || typeof part !== "object" || Array.isArray(part)))
    return { status: "needs_review", reason: "part_shape" };
  if (records.some((part) => ["text", "type", "role", "partType", "meaning", "start", "end"].some((key) => key in part)))
    return { status: "needs_review", reason: "legacy_aliases" };
  if (records.some((part) => typeof part.id !== "string" || !part.id ||
    !["prefix", "base", "root", "suffix", "connector"].includes(String(part.kind)) ||
    typeof part.sourceText !== "string" || !part.sourceText ||
    typeof part.surfaceText !== "string" || !part.surfaceText ||
    typeof part.gloss !== "string" || !part.gloss.trim()))
    return { status: "needs_review", reason: "unreviewed_part_fact" };
  if (new Set(records.map((part) => part.id)).size !== records.length)
    return { status: "conflict", reason: "duplicate_part_id" };
  const joinRecords = joins as Record<string, unknown>[];
  if (joinRecords.some((join, index) => !join || typeof join !== "object" || Array.isArray(join) ||
    join.afterPartId !== records[index]?.id || join.beforePartId !== records[index + 1]?.id ||
    !["none", "space", "hyphen"].includes(String(join.joinType))))
    return { status: "conflict", reason: "join_identity" };
  let offset = 0;
  let surface = "";
  const converted = records.map((part, index) => {
    const letters = String(part.surfaceText);
    const range = { start: offset, end: offset + letters.length };
    offset = range.end;
    surface += letters;
    if (index < joinRecords.length) {
      const separator = joinRecords[index]?.joinType === "space" ? " " :
        joinRecords[index]?.joinType === "hyphen" ? "-" : "";
      surface += separator;
      offset += separator.length;
    }
    return { ...part, displayRange: range } as CanonicalPart;
  });
  if (surface !== displayWord) return { status: "conflict", reason: "surface_spelling" };
  const ranges = records.map((part) => part.displayRange);
  if (ranges.every((range) => range && typeof range === "object"))
    return records.every((part, index) => JSON.stringify(part.displayRange) === JSON.stringify(converted[index]?.displayRange))
      ? { status: "canonical", reason: "exact" }
      : { status: "conflict", reason: "display_range" };
  if (ranges.some((range) => range !== undefined))
    return { status: "needs_review", reason: "mixed_display_ranges" };
  if (linkedToFamily) return { status: "needs_review", reason: "immutable_family_evidence" };
  return { status: "safe_range_conversion", reason: "display_ranges_only", convertedParts: converted };
}

export function canonicalPartsStatus(value: unknown): "canonical" | "legacy_review" | "invalid" {
  if (!Array.isArray(value) || value.length === 0) return "invalid";
  if (value.every(isCanonicalPart)) return "canonical";
  return value.every((raw) => raw && typeof raw === "object" && !Array.isArray(raw) &&
    typeof (raw as Record<string, unknown>).text === "string" &&
    typeof (raw as Record<string, unknown>).type === "string") ? "legacy_review" : "invalid";
}

export function canonicalWordSum(parts: readonly CanonicalPart[], displayWord: string): string {
  return `${parts.map((part) => part.sourceText).join(" + ")} → ${displayWord}`;
}
