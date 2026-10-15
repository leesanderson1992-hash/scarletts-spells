import type { SupabaseClient } from "@supabase/supabase-js";
import type { NativePackage } from "./governed-package";

/** Native publishers use the database's established canonical JSON ordering.
 * Do not replace that immutable contract with the JavaScript object sort. */
export async function bindNativePackageFingerprints(
  db: Pick<SupabaseClient, "rpc">,
  input: NativePackage,
): Promise<NativePackage> {
  const pkg = structuredClone(input);
  const hash = async (value: unknown): Promise<string> => {
    const result = await db.rpc("adle_generic_snapshot_json_sha256_v1", { p_value: value });
    if (result.error || typeof result.data !== "string" || !/^[a-f0-9]{64}$/.test(result.data)) {
      throw new Error("TEACHING_LESSON_PACKAGE_FINGERPRINT_FAILED");
    }
    return result.data;
  };
  await Promise.all(pkg.authorities.map(async authority => {
    authority.semanticFingerprint = await hash(authority.semanticProjection);
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
