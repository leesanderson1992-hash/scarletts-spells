import { createHash } from "node:crypto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalValue(value: unknown, path: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`context_canonical_json_non_finite:${path}`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalValue(entry, `${path}[${index}]`));
  }
  if (!isRecord(value)) throw new Error(`context_canonical_json_unsupported:${path}`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`context_canonical_json_prototype:${path}`);
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child === undefined) throw new Error(`context_canonical_json_undefined:${path}.${key}`);
    result[key] = canonicalValue(child, `${path}.${key}`);
  }
  return result;
}

export function canonicalContextJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, "$"));
}

export function fingerprintContextValue(value: unknown): string {
  return createHash("sha256").update(canonicalContextJson(value), "utf8").digest("hex");
}
