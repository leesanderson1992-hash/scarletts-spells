/** Prepare or publish the immutable, inactive v4 homophone release. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { assertApprovedHomophoneContent } from "../lib/adle/homophone/approved-content";
import { HOMOPHONE_LESSONS } from "../lib/adle/homophone/lesson";
import { buildHomophoneReleasePackage } from "../lib/adle/homophone/release";

async function main() {
  loadEnvConfig(process.cwd());
  const publish = process.argv.includes("--publish");
  const environment = process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT ?? "local";
  if (publish && environment === "production") throw new Error("homophone_package_production_publish_requires_separate_release_process");
  assertApprovedHomophoneContent();
  const client = createServiceRoleClient();
  const spellings = [...new Set(HOMOPHONE_LESSONS.flatMap(lesson => lesson.words.map(word => word.word)))];
  const result = await client.from("canonical_teaching_dictionary_words")
    .select("id,display_word,row_status,review_status,dialect_code")
    .in("display_word", spellings);
  if (result.error) throw new Error(`homophone_canonical_lookup:${result.error.message}`);
  const rows = result.data ?? [];
  const canonicalWords: Record<string, Record<string, string>> = {};
  for (const lesson of HOMOPHONE_LESSONS) {
    canonicalWords[lesson.microSkillKey] = {};
    for (const word of lesson.words) {
      const matches = rows.filter(row => row.display_word === word.word && row.row_status === "active"
        && row.review_status === "approved_for_first_exposure" && row.dialect_code === "en-GB");
      if (matches.length !== 1) throw new Error(`homophone_canonical_word_not_unambiguous:${lesson.microSkillKey}:${word.word}`);
      canonicalWords[lesson.microSkillKey][word.word] = matches[0].id;
    }
  }
  const releaseKey = "d4-hom-v4-approved-2026-10-12";
  const pkg = buildHomophoneReleasePackage({ releaseKey,
    approvalRefs: ["owner-approved-homophone-teaching-content-2026-10-12"], canonicalWords });
  const output = resolve(process.cwd(), "data/adle/releases/d4-hom-v4/package.json");
  const bytes = `${JSON.stringify(pkg, null, 2)}\n`;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, bytes);
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  if (publish) {
    const published = await client.rpc("publish_adle_homophone_package_v2", {
      p_package: pkg, p_package_file_sha256: fileSha256, p_published_by: "Katie Sanderson approved homophone v4" });
    if (published.error || typeof published.data !== "string") throw new Error(`homophone_release_publish:${published.error?.message ?? "missing_release_id"}`);
    console.log(JSON.stringify({ releaseId: published.data, releaseKey, authorityCount: pkg.authorities.length,
      activation: "inactive", packageFileSha256: fileSha256 }));
  } else {
    console.log(JSON.stringify({ path: output, releaseKey, authorityCount: pkg.authorities.length,
      activation: "inactive", packageFileSha256: fileSha256 }));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
