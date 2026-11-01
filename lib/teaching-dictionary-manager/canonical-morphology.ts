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
    Number.isInteger(range?.start) && Number.isInteger(range?.end) &&
    Number(range?.start) >= 0 && Number(range?.end) >= Number(range?.start);
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
