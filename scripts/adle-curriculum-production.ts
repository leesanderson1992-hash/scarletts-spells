/**
 * Production-pinned ADLE curriculum activation CLI.
 *
 * Curriculum rows must already belong to the applied Teaching Dictionary
 * import batch named by the manifest. This CLI audits that truth and applies
 * only the immutable route-activation manifest through one database RPC.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  validateAdleCurriculumImportManifest,
  type AdleCurriculumImportManifest,
} from "../lib/adle/curriculum-import-manifest";
import { getAdleLessonRouteDefinition } from "../lib/adle/lesson-route-registry";

const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";
const PRODUCTION_CONFIRM = "APPLY-ADLE-CURRICULUM-TO-SCARLETTS-SPELLS";
const DEFAULT_MANIFEST = "data/adle/import-manifests/adle-production-manifest.json";

function assertProductionApplyDisabled() {
  assert(!process.argv.includes("--apply"), "Production activation is disabled while this route-activation programme is under review; require a separately authorised release change.");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`FAIL: ${message}`);
}
function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}
function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function loadManifest(): {
  path: string;
  manifest: AdleCurriculumImportManifest;
  manifestFileSha256: string;
} {
  const path = resolve(argument("--manifest") ?? DEFAULT_MANIFEST);
  const raw = readFileSync(path);
  const manifest = JSON.parse(raw.toString("utf8")) as unknown;
  const validation = validateAdleCurriculumImportManifest(manifest);
  assert(validation.valid, `invalid manifest: ${validation.errors.join(", ")}`);
  return {
    path,
    manifest: manifest as AdleCurriculumImportManifest,
    manifestFileSha256: sha256(raw),
  };
}

function productionClient(): SupabaseClient {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const host = new URL(url).hostname;
  assert(host.includes(PRODUCTION_REF), "CLI is permanently pinned to Scarlett Spells production");
  assert(
    required("ADLE_CURRICULUM_PRODUCTION_HOST") === host,
    "ADLE_CURRICULUM_PRODUCTION_HOST must exactly match production",
  );
  return createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function inventory(
  db: SupabaseClient,
  manifest: AdleCurriculumImportManifest,
) {
  const skills = [...new Set(manifest.routes.map((route) => route.microSkillKey))];
  const batchIds = [...new Set(manifest.routes.map((route) => route.importBatchId))];
  assert(batchIds.length === 1, "one manifest must reference one immutable import batch");
  const [catalog, batches, content, families, activations, inReview] = await Promise.all([
    db.from("micro_skill_catalog").select("micro_skill_key,mastery_domain_key,is_active,is_assignable").in("micro_skill_key", skills),
    db.from("canonical_teaching_dictionary_import_batches").select("id,batch_status,source_folder_sha256").in("id", batchIds),
    db.from("canonical_teaching_dictionary_content_versions").select("id,micro_skill_key,content_version,version_status,is_active,final_readiness_review_status").in("micro_skill_key", skills),
    db.from("canonical_teaching_dictionary_base_word_families").select("id,micro_skill_key,row_status,review_status").in("micro_skill_key", skills),
    db.from("adle_lesson_route_activations").select("micro_skill_key,lesson_route_key,activation_status,payload_version,content_version,row_status").in("micro_skill_key", skills).eq("environment_key", "production").eq("row_status", "active"),
    db.from("canonical_teaching_dictionary_import_batches").select("id", { count: "exact", head: true }).eq("batch_status", "in_review"),
  ]);
  for (const result of [catalog, batches, content, families, activations, inReview])
    assert(!result.error, result.error?.message ?? "production inventory query failed");
  const blockers: string[] = [];
  for (const route of manifest.routes) {
    const definition = getAdleLessonRouteDefinition(route.lessonRouteKey);
    if (!definition) blockers.push(`route_not_registered:${route.lessonRouteKey}`);
    const skill = (catalog.data ?? []).find((row) => row.micro_skill_key === route.microSkillKey);
    if (!skill || skill.mastery_domain_key !== "D4" || !skill.is_active || !skill.is_assignable)
      blockers.push(`inactive_or_non_assignable_skill:${route.microSkillKey}`);
    const version = (content.data ?? []).find(
      (row) =>
        row.micro_skill_key === route.microSkillKey &&
        row.content_version === route.contentVersion &&
        row.version_status === "active" &&
        row.is_active &&
        row.final_readiness_review_status === "signed_off",
    );
    if (!version) blockers.push(`signed_off_content_missing:${route.microSkillKey}:${route.contentVersion}`);
    if (route.lessonRouteKey === "base_word_family_v1") {
      const approvedFamilies = (families.data ?? []).filter(
        (row) =>
          row.micro_skill_key === route.microSkillKey &&
          row.row_status === "active" &&
          row.review_status === "approved_for_first_exposure",
      );
      if (approvedFamilies.length === 0) blockers.push(`approved_base_family_missing:${route.microSkillKey}`);
    }
  }
  const batch = (batches.data ?? [])[0];
  if (!batch || batch.batch_status !== "applied") blockers.push(`import_batch_not_applied:${batchIds[0]}`);
  return {
    blockers,
    catalogRows: catalog.data ?? [],
    contentRows: content.data ?? [],
    familyCount: (families.data ?? []).length,
    activations: activations.data ?? [],
    inReviewBatchCount: inReview.count ?? 0,
    excludedInReview: manifest.excludedBatchStatuses.includes("in_review"),
  };
}

async function main() {
  assertProductionApplyDisabled();
  const command = process.argv[2] ?? "dry-run";
  assert(["preflight", "dry-run", "apply", "verify", "pause-route", "rollback-plan"].includes(command), "use preflight, dry-run, apply, verify, pause-route, or rollback-plan");
  const { path, manifest, manifestFileSha256 } = loadManifest();
  assert(
    sha256(readFileSync(resolve(manifest.sourcePackagePath))) === manifest.sourcePackageSha256,
    "source package checksum mismatch",
  );
  for (const artifact of manifest.artifacts)
    assert(
      sha256(readFileSync(resolve(artifact.path))) === artifact.sha256,
      `curriculum artifact checksum mismatch: ${artifact.path}`,
    );
  assert(
    !manifest.sourcePackagePath.includes("1000") &&
      manifest.excludedBatchStatuses.includes("in_review"),
    "the 1,000-word in_review batch must remain excluded",
  );
  const db = productionClient();
  const report = await inventory(db, manifest);
  if (command === "rollback-plan") {
    console.log(JSON.stringify({
      mode: "rollback_plan",
      action: "apply a new signed manifest with requestedStatus=paused; retain all curriculum and learner history",
      routes: manifest.routes.map((route) => `${route.microSkillKey}:${route.lessonRouteKey}`),
    }, null, 2));
    return;
  }
  if (command === "pause-route")
    assert(manifest.routes.every((route) => route.requestedStatus === "paused"), "pause-route accepts only a manifest whose routes are paused");
  if (command === "apply" || command === "pause-route") {
    assert(process.argv.includes("--apply"), "mutation requires --apply");
    assert(argument("--confirm") === PRODUCTION_CONFIRM, `mutation requires --confirm ${PRODUCTION_CONFIRM}`);
    assert(argument("--manifest-file-sha256") === manifestFileSha256, "manifest file SHA-256 acknowledgement mismatch");
    assert(report.blockers.length === 0 || command === "pause-route", `preflight blockers: ${report.blockers.join(", ")}`);
    const { data, error } = await db.rpc("apply_adle_curriculum_activation_manifest_v1", {
      p_manifest: manifest,
      p_manifest_file_sha256: manifestFileSha256,
      p_environment_key: "production",
      p_applied_by: required("ADLE_CURRICULUM_APPLIED_BY"),
    });
    if (error) throw new Error(`activation manifest apply failed: ${error.message}`);
    console.log(JSON.stringify({ mode: command, manifestId: data, manifestFileSha256, routes: manifest.routes.length }, null, 2));
    return;
  }
  if (command === "verify")
    assert(report.blockers.length === 0, `verification blockers: ${report.blockers.join(", ")}`);
  console.log(JSON.stringify({
    mode: command,
    manifestPath: path,
    manifestFileSha256,
    sourcePackageSha256: manifest.sourcePackageSha256,
    requestedRoutes: manifest.routes,
    ...report,
    mutationPerformed: false,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
