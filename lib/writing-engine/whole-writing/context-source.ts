import { fingerprint } from "../baseline/source";
import type { SourceSnapshot } from "./source";

function decodePointerSegment(value: string) {
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function readSnapshotField(snapshot: SourceSnapshot, fieldPath: string) {
  if (!fieldPath.startsWith("/")) return null;
  let value: unknown = snapshot.envelope;
  for (const segment of fieldPath.slice(1).split("/").map(decodePointerSegment)) {
    if (Array.isArray(value)) {
      if (!/^\d+$/.test(segment)) return null;
      value = value[Number(segment)];
    } else if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[segment];
    } else {
      return null;
    }
  }
  return typeof value === "string" ? value : null;
}

export function reconstructOccurrenceContext(input: {
  snapshot: SourceSnapshot;
  fieldPath: string;
  fieldHash: string;
  startUtf16: number;
  endUtf16: number;
  observedText: string;
  excerptRadius?: number;
}) {
  const fieldText = readSnapshotField(input.snapshot, input.fieldPath);
  if (fieldText === null) return { status: "blocked" as const, reason: "SOURCE_FIELD_UNAVAILABLE" as const };
  if (fingerprint(fieldText) !== input.fieldHash) return { status: "blocked" as const, reason: "SOURCE_FIELD_HASH_MISMATCH" as const };
  if (
    input.startUtf16 < 0 ||
    input.endUtf16 <= input.startUtf16 ||
    input.endUtf16 > fieldText.length ||
    fieldText.slice(input.startUtf16, input.endUtf16) !== input.observedText
  ) {
    return { status: "blocked" as const, reason: "SOURCE_SPAN_MISMATCH" as const };
  }
  const radius = input.excerptRadius ?? 80;
  const excerptStartUtf16 = Math.max(0, input.startUtf16 - radius);
  const excerptEndUtf16 = Math.min(fieldText.length, input.endUtf16 + radius);
  return {
    status: "ready" as const,
    fieldText,
    excerpt: fieldText.slice(excerptStartUtf16, excerptEndUtf16),
    excerptStartUtf16,
    excerptEndUtf16,
  };
}
