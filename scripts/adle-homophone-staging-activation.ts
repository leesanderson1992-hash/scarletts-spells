/** Guarded activation for the reviewed v4 homophone release on disposable staging only.
 * Usage: NODE_OPTIONS=--conditions=react-server npx tsx scripts/adle-homophone-staging-activation.ts
 *   inspect|enable|pause|disable --child-id <disposable-child-uuid> [--apply]
 */
import { loadEnvConfig } from "@next/env";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { childAllowlistActivationReport } from "../lib/adle/route-activation-scope";
import { HOMOPHONE_LESSONS } from "../lib/adle/homophone/lesson";

const STAGING_HOST = "jlhotktspjvffslvuyfz.supabase.co";
const RELEASE_KEY = "d4-hom-v4-approved-2026-10-12";
const ROUTE_ID = "homophone_word_lab";
const ROUTE_VERSION = "v2";
type Command = "inspect" | "enable" | "pause" | "disable";

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(label);
  return value;
}

async function main() {
  loadEnvConfig(process.cwd());
  const command = process.argv[2] as Command;
  if (!["inspect", "enable", "pause", "disable"].includes(command)) throw new Error("homophone_staging_command_invalid");
  const childArg = process.argv.indexOf("--child-id");
  const childId = required(process.argv[childArg + 1], "homophone_staging_child_id_missing");
  const report = childAllowlistActivationReport([childId]);
  const url = required(process.env.NEXT_PUBLIC_SUPABASE_URL, "homophone_staging_url_missing");
  if (new URL(url).hostname !== STAGING_HOST || process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT !== "staging") {
    throw new Error("homophone_staging_target_mismatch");
  }
  const client = createServiceRoleClient();
  const released = await client.from("adle_curriculum_release_manifests")
    .select("id,release_key,release_manifest_sha256,route_id,route_version,activation_route_key")
    .eq("release_key", RELEASE_KEY).maybeSingle();
  if (released.error) throw new Error(`homophone_staging_release_read:${released.error.message}`);
  const release = required(released.data, "homophone_staging_release_not_published");
  if (release.route_id !== ROUTE_ID || release.route_version !== ROUTE_VERSION || release.activation_route_key !== `${ROUTE_ID}:${ROUTE_VERSION}`) {
    throw new Error("homophone_staging_release_route_mismatch");
  }
  const dependencies = await client.from("adle_curriculum_release_dependencies")
    .select("micro_skill_key,authority_type").eq("release_manifest_id", release.id);
  if (dependencies.error || dependencies.data?.length !== HOMOPHONE_LESSONS.length
    || HOMOPHONE_LESSONS.some(lesson => dependencies.data?.filter(row => row.micro_skill_key === lesson.microSkillKey
      && row.authority_type === "homophone_lesson_content").length !== 1)) throw new Error("homophone_staging_release_dependencies_incomplete");
  const heads = await client.from("adle_route_activation_heads")
    .select("micro_skill_key,current_revision_id").eq("environment_key", "staging")
    .eq("route_id", ROUTE_ID).eq("route_version", ROUTE_VERSION);
  if (heads.error) throw new Error(`homophone_staging_activation_read:${heads.error.message}`);
  const current = new Map((heads.data ?? []).map(row => [row.micro_skill_key, row.current_revision_id]));
  const revisions = current.size ? await client.from("adle_route_activation_revisions")
    .select("id,activation_status,release_manifest_id,readiness_report").in("id", [...current.values()]) : null;
  if (revisions?.error) throw new Error(`homophone_staging_revision_read:${revisions.error.message}`);
  const states = HOMOPHONE_LESSONS.map(lesson => {
    const revisionId = current.get(lesson.microSkillKey);
    const revision = revisions?.data?.find(row => row.id === revisionId);
    if (revision && revision.release_manifest_id !== release.id) throw new Error(`homophone_staging_foreign_release:${lesson.microSkillKey}`);
    return { microSkillKey: lesson.microSkillKey, revisionId: revisionId ?? null, status: revision?.activation_status ?? "inactive" };
  });
  if (command === "inspect" || !process.argv.includes("--apply")) {
    console.log(JSON.stringify({ command, target: STAGING_HOST, releaseKey: RELEASE_KEY, childId, applied: false, states }, null, 2));
    return;
  }
  const status = command === "enable" ? "enabled" : command === "pause" ? "paused" : "safety_revoked";
  for (const state of states) {
    const result = await client.rpc("set_adle_route_activation_revision_v2", {
      p_release_manifest_sha256: release.release_manifest_sha256,
      p_micro_skill_key: state.microSkillKey, p_environment_key: "staging", p_activation_status: status,
      p_incomplete_assignment_policy: status === "safety_revoked" ? "block_incomplete" : "allow_existing",
      p_readiness_report: report, p_expected_current_revision_id: state.revisionId,
      p_changed_by: "homophone-staging-activation", p_change_reason: `Approved v4 homophone staging ${command} for disposable child`,
    });
    if (result.error || typeof result.data !== "string") throw new Error(`homophone_staging_activation:${state.microSkillKey}:${result.error?.message ?? "missing_revision"}`);
  }
  const verified = await client.from("adle_route_activation_heads").select("micro_skill_key,current_revision_id")
    .eq("environment_key", "staging").eq("route_id", ROUTE_ID).eq("route_version", ROUTE_VERSION);
  if (verified.error || HOMOPHONE_LESSONS.some(lesson => !verified.data?.some(row => row.micro_skill_key === lesson.microSkillKey))) {
    throw new Error("homophone_staging_activation_readback_incomplete");
  }
  console.log(JSON.stringify({ command, target: STAGING_HOST, releaseKey: RELEASE_KEY, childId, applied: true,
    skillCount: HOMOPHONE_LESSONS.length, status }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
