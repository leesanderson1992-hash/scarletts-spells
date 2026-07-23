/** Staging-only disposable-fixture proof for every new Dynamic Prefix profile. */
import { createClient } from "@supabase/supabase-js";
import { loadDynamicPrefixProfiles } from "../lib/adle/morphology/dynamic-prefix-profile-loader";
import { compileDynamicPrefixWordLabPayload, selectDynamicPrefixWordLab } from "../lib/adle/morphology/dynamic-prefix-word-lab";

const stagingHost = "jlhotktspjvffslvuyfz.supabase.co";
const keys = ["D4_MOR_PREFIXES_DIS_MIS", "D4_MOR_PREFIXES_IN_IM_IL_IR", "D4_MOR_PREFIXES_RE_PRE", "D4_MOR_PREFIXES_SUB_INTER_SUPER"] as const;
const prefix = "dynamic-prefix-four-profile-selector-proof:2026-07-22:";
const required = (key: string) => { const value = process.env[key]?.trim(); if (!value) throw new Error(`Missing ${key}`); return value; };
const assert = (value: unknown, message: string): asserts value => { if (!value) throw new Error(message); };

async function main() {
  if (process.env.ADLE_DYNAMIC_PREFIX_ACCEPT_STAGING !== "disposable-data-only") throw new Error("Refusing without disposable-data-only acknowledgement.");
  const childId = required("ADLE_STAGING_PROOF_CHILD_ID");
  const url = required("STAGING_SUPABASE_URL");
  assert(new URL(url).host === stagingHost, "Refusing non-staging database host.");
  const db = createClient(url, required("STAGING_SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { error: priorCleanupError } = await db.from("adle_learning_items").delete().eq("child_id", childId).like("source_ref", `${prefix}%`);
    assert(!priorCleanupError, `Unable to clear an earlier disposable proof: ${priorCleanupError?.message}`);
    for (const microSkillKey of keys) {
      const { data: members, error } = await db.from("canonical_teaching_dictionary_prefix_members")
        .select("canonical_word_id,canonical_teaching_dictionary_prefix_profiles!inner(micro_skill_key)")
        .eq("canonical_teaching_dictionary_prefix_profiles.micro_skill_key", microSkillKey).eq("assignment_eligible", true)
        .eq("row_status", "active").eq("review_status", "approved_for_first_exposure").limit(5);
      assert(!error && members?.length === 5, `${microSkillKey}: expected five reviewed members`);
      const { error: insertError } = await db.from("adle_learning_items").insert(members.map((member: any, index) => ({
        child_id: childId, canonical_word_id: member.canonical_word_id, micro_skill_key: microSkillKey,
        item_status: "pending", source_kind: "verified_misspelling", source_ref: `${prefix}${microSkillKey}:${index + 1}`,
        source_attempt_text: null, reteach_priority: index === 1, intake_on: `2026-07-${String(10 + index).padStart(2, "0")}`, row_status: "active",
      }))).select("id");
      assert(!insertError, `${microSkillKey}: seed failed: ${insertError?.message}`);
      const loaded = await loadDynamicPrefixProfiles(db, childId, { allowStagingProfiles: true });
      const facts = loaded.learningItems.filter((item) => item.microSkillKey === microSkillKey && item.sourceRef.startsWith(`${prefix}${microSkillKey}:`));
      const profile = loaded.profiles.find((candidate) => candidate.microSkillKey === microSkillKey);
      assert(profile && facts.length === 5, `${microSkillKey}: staged profile or fixtures unavailable`);
      for (const count of [1, 2, 3, 4, 5]) {
        const selection = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: facts.slice(0, count) });
        assert(selection && selection.authenticTargets.length === Math.min(count, 4) && selection.transfers.length === Math.max(0, 4 - count), `${microSkillKey}: ${count}-target selection failed`);
        const payload = compileDynamicPrefixWordLabPayload(selection);
        assert(payload && payload.words.lesson.length === 4 && payload.words.lesson.every((word) => word.prefixText && word.prefixLabel), `${microSkillKey}: ${count}-target payload failed`);
      }
      const { error: deleteError } = await db.from("adle_learning_items").delete().eq("child_id", childId).like("source_ref", `${prefix}${microSkillKey}:%`);
      assert(!deleteError, `${microSkillKey}: cleanup failed: ${deleteError?.message}`);
    }
    console.log(JSON.stringify({ status: "passed", profiles: keys, scenarios: [1,2,3,4,5], cleanup: "complete" }));
  } catch (error) {
    await db.from("adle_learning_items").delete().eq("child_id", childId).like("source_ref", `${prefix}%`);
    throw error;
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
