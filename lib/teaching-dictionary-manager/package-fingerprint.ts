import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAdleReadPage } from "../adle/observability/read-metrics";
import type { NativePackage } from "./governed-package";

const readinessHashes = new Map<string, Promise<string>>();
const MAX_READINESS_HASHES = 32;

/** Native publishers use the database's established canonical JSON ordering.
 * Do not replace that immutable contract with the JavaScript object sort. */
export async function bindNativePackageFingerprints(
  db: Pick<SupabaseClient, "rpc">,
  input: NativePackage,
  readinessDatabase?: string,
  sharePackageHashes = false,
): Promise<NativePackage> {
  const pkg = structuredClone(input);
  const readHash = async (value: unknown, algorithm: string): Promise<string> => {
    const started = performance.now();
    const result = await db.rpc(algorithm, { p_value: value });
    if (result.error || typeof result.data !== "string" || !/^[a-f0-9]{64}$/.test(result.data)) {
      throw new Error(`TEACHING_LESSON_PACKAGE_FINGERPRINT_FAILED:${result.error?.code ?? "INVALID_RESPONSE"}`);
    }
    recordAdleReadPage(algorithm, [result.data], performance.now() - started);
    return result.data;
  };
  const hash = (value: unknown, algorithm = "adle_generic_snapshot_json_sha256_v1"): Promise<string> => {
    if (!readinessDatabase) return readHash(value, algorithm);
    // Cache only the database's hash of these exact bytes. Each request still
    // loads current review, activation and compiler inputs from the database.
    const key = createHash("sha256").update(JSON.stringify([readinessDatabase, algorithm, value])).digest("hex");
    const existing = readinessHashes.get(key);
    if (existing) return existing;
    if (readinessHashes.size >= MAX_READINESS_HASHES) {
      const oldest = readinessHashes.keys().next().value;
      if (oldest !== undefined) readinessHashes.delete(oldest);
    }
    const read = sharePackageHashes
      ? unstable_cache(() => readHash(value, algorithm), ["teaching-dictionary-package-hash-v1", key], { revalidate: 3600 })
      : () => readHash(value, algorithm);
    const pending = read().catch(error => {
      if (readinessHashes.get(key) === pending) readinessHashes.delete(key);
      throw error;
    });
    readinessHashes.set(key, pending);
    return pending;
  };
  await Promise.all(pkg.authorities.map(async authority => {
    authority.semanticFingerprint = await hash(authority.semanticProjection,
      authority.authorityType === "compound_structure" ? "adle_snapshot_json_sha256_v1" : "adle_generic_snapshot_json_sha256_v1");
  }));
  for (const skill of pkg.manifest.microSkills) {
    for (const dependency of skill.dependencies) {
      const authority = pkg.authorities.find(candidate => candidate.authorityType === dependency.authorityType
        && candidate.authorityKey === dependency.authorityKey);
      if (!authority) throw new Error("TEACHING_LESSON_PACKAGE_DEPENDENCY_MISSING");
      dependency.semanticFingerprint = authority.semanticFingerprint;
    }
  }
  const { packageSha256: _previous, ...body } = pkg;
  void _previous;
  return { ...body, packageSha256: await hash(body) };
}
