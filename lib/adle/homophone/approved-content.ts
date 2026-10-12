import "server-only";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import source from "@/data/adle/candidates/d4-hom/v4/lessons.json";
import approval from "@/data/adle/candidates/d4-hom/v4/content-approval.json";
import { homophoneContentApproved } from "./lesson";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Generation checks the reviewed bytes, including every illustrated word. */
export function assertApprovedHomophoneContent(): void {
  if (!homophoneContentApproved() || sha256(canonicalJson(source.lessons)) !== approval.contentSha256) {
    throw new Error("homophone_content_integrity_failed");
  }
  const paths = [...new Set(source.lessons.flatMap(lesson => lesson.words.filter(word => word.imageRequired).map(word => word.imageSrc)))].sort();
  if (paths.length !== 27 || paths.some(path => !path?.startsWith("/adle/homophones/v1/"))) {
    throw new Error("homophone_image_manifest_invalid");
  }
  const manifest = paths.map(path => ({ path, sha256: sha256(readFileSync(join(process.cwd(), "public", path!))) }));
  if (sha256(JSON.stringify(manifest)) !== approval.imageAssetManifestSha256) {
    throw new Error("homophone_image_integrity_failed");
  }
}
