/** Create one clearly labelled staging-only test account and real pilot lesson. */

import { createClient } from "@supabase/supabase-js";
import { generateGuardedBaseWordFamilyPilot } from "../lib/adle/loaders/base-word-family-pilot-loader";

const CONFIRM_TOKEN = "PROVISION_STAGING_BASE_WORD_PILOT";
const DEFAULT_TARGETS = ["player_en_gb", "government_en_gb"];

function requiredEnv(name: string): string { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}.`); return value; }

async function main(): Promise<void> {
  if (process.argv.at(-1) !== CONFIRM_TOKEN) throw new Error(`Refusing provisioning without ${CONFIRM_TOKEN}.`);
  const targetKeys = (process.env.ADLE_STAGING_TARGET_KEYS ?? DEFAULT_TARGETS.join(",")).split(",").map((value) => value.trim()).filter(Boolean);
  const planDate = process.env.ADLE_STAGING_PLAN_DATE ?? "2026-07-21";
  if (targetKeys.length !== 2) throw new Error("ADLE_STAGING_TARGET_KEYS must name exactly two canonical word keys.");
  const db = createClient(requiredEnv("STAGING_SUPABASE_URL"), requiredEnv("STAGING_SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const email = `adle-base-word-pilot-${suffix}@example.test`;
  const password = `WordLab-${suffix}!`;
  let parentId: string | null = null;
  let childId: string | null = null;
  try {
    const { data: user, error: userError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError || !user.user) throw new Error(`create test parent: ${userError?.message ?? "no user returned"}`);
    parentId = user.user.id;
    const { data: child, error: childError } = await db.from("children").insert({ parent_user_id: parentId, first_name: "ADLE Base-word Pilot" }).select("id").single();
    if (childError || !child) throw new Error(`create test child: ${childError?.message ?? "no child returned"}`);
    childId = child.id;
    const { data: words, error: wordError } = await db.from("canonical_teaching_dictionary_words").select("id,word_key").in("word_key", targetKeys).eq("row_status", "active").eq("review_status", "approved_for_first_exposure");
    if (wordError || (words ?? []).length !== 2) throw new Error(`read approved target words: ${wordError?.message ?? targetKeys.join(", ")}`);
    const idByKey = new Map((words ?? []).map((word) => [word.word_key, word.id]));
    const { data: memberRows, error: memberError } = await db.from("canonical_teaching_dictionary_base_word_family_members").select("canonical_word_id,base_word_family_id,member_role").in("canonical_word_id", [...idByKey.values()]).eq("member_role", "authentic_target").eq("assignment_eligible", true).eq("row_status", "active").eq("review_status", "approved_for_first_exposure");
    if (memberError || (memberRows ?? []).length !== 2) throw new Error(`read approved authentic family targets: ${memberError?.message ?? targetKeys.join(", ")}`);
    const { data: families, error: familyError } = await db.from("canonical_teaching_dictionary_base_word_families").select("id,micro_skill_key").in("id", (memberRows ?? []).map((row) => row.base_word_family_id)).eq("row_status", "active").eq("review_status", "approved_for_first_exposure");
    if (familyError || (families ?? []).length !== 2 || new Set((families ?? []).map((row) => row.micro_skill_key)).size !== 1) throw new Error(`read shared approved micro-skill: ${familyError?.message ?? targetKeys.join(", ")}`);
    const microSkillKey = families![0].micro_skill_key;
    const { error: itemError } = await db.from("adle_learning_items").insert([
      ...targetKeys.map((wordKey) => ({ child_id: childId, canonical_word_id: idByKey.get(wordKey), micro_skill_key: microSkillKey, item_status: "pending", source_kind: "verified_misspelling", source_ref: `staging-base-word-pilot:${suffix}:${wordKey}`, source_attempt_text: `test-${wordKey}`, intake_on: planDate, row_status: "active" })),
    ]);
    if (itemError) throw new Error(`seed verified misspellings: ${itemError.message}`);
    if (!parentId || !childId) throw new Error("staging pilot identity was not created");
    process.env.ADLE_BASE_WORD_FAMILY_PILOT_ENABLED = "enabled";
    process.env.ADLE_BASE_WORD_FAMILY_PILOT_SCOPE = "allowlist";
    process.env.ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED = "false";
    process.env.ADLE_BASE_WORD_FAMILY_PILOT_CHILD_IDS = childId;
    const result = await generateGuardedBaseWordFamilyPilot({ client: db, parentUserId: parentId, childId, planDate });
    if (!result.assignmentId) throw new Error(`generate guarded lesson: ${result.readinessReason ?? "not ready"}`);
    console.log(JSON.stringify({ status: "staging_pilot_provisioned", parentId, childId, assignmentId: result.assignmentId, planDate, loginEmail: email, loginPassword: password, seededWords: targetKeys, microSkillKey, deploymentGateChanged: false }, null, 2));
  } catch (error) {
    if (childId) await db.from("children").delete().eq("id", childId);
    if (parentId) await db.auth.admin.deleteUser(parentId);
    throw error;
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
