import { createHash } from "node:crypto";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalValue(value: unknown, path: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`canonical_json_non_finite:${path}`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalValue(entry, `${path}[${index}]`));
  }
  if (!record(value)) throw new Error(`canonical_json_unsupported:${path}`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`canonical_json_prototype:${path}`);
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child === undefined) throw new Error(`canonical_json_undefined:${path}.${key}`);
    result[key] = canonicalValue(child, `${path}.${key}`);
  }
  return result;
}

/** Stable JSON for immutable lesson contracts. Arrays retain authored order. */
export function canonicalSnapshotJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, "$"));
}

/** SHA-256 over canonical JSON. This is a server/compiler utility. */
export function fingerprintSnapshotValue(value: unknown): string {
  return createHash("sha256").update(canonicalSnapshotJson(value), "utf8").digest("hex");
}
