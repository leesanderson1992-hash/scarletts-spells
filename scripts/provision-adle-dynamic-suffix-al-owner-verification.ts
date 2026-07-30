/** Creates the post-proof owner/child staging lesson; production is never contacted. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";

const PROFILE = "D4_MOR_SUFFIXES_AL";
const EMAIL = "katiesanderson8624@gmail.com";
const HOST = "jlhotktspjvffslvuyfz.supabase.co";
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`Missing ${name}.`); return value; };

async function main() {
  if (!process.argv.includes("--apply") || process.argv[process.argv.indexOf("--environment") + 1] !== "staging" || !process.argv.includes("--confirm-owner-verification") || process.env.ADLE_DYNAMIC_SUFFIX_ACCEPT_STAGING !== "disposable-data-only") throw new Error("Use --apply --environment staging --confirm-owner-verification with the staging acknowledgement.");
  const url = required("STAGING_SUPABASE_URL"); if (new URL(url).host !== HOST) throw new Error("Refusing a non-staging host.");
  const db = createClient(url, required("STAGING_SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: users, error: userError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const parent = users?.users.find((user) => user.email?.toLowerCase() === EMAIL);
  if (userError || !parent) throw new Error(userError?.message ?? `Missing owner ${EMAIL}.`);
  const { data: profile, error: profileError } = await db.from("canonical_teaching_dictionary_suffix_profiles").select("id,production_enabled,canonical_teaching_dictionary_suffix_members(canonical_word_id,assignment_eligible,row_status,review_status)").eq("micro_skill_key", PROFILE).eq("row_status", "active").eq("review_status", "approved_for_first_exposure").single();
  if (profileError || !profile || profile.production_enabled) throw new Error(profileError?.message ?? "The staging-only -al profile is unavailable.");
  const members = (profile.canonical_teaching_dictionary_suffix_members ?? []).filter((member: any) => member.assignment_eligible && member.row_status === "active" && member.review_status === "approved_for_first_exposure");
  if (members.length !== 4) throw new Error("Expected four reviewed -al members.");
  const { data: word, error: wordError } = await db.from("canonical_teaching_dictionary_words").select("id").eq("normalised_word", "musical").eq("row_status", "active").eq("review_status", "approved_for_first_exposure").single();
  if (wordError || !word || !members.some((member: any) => member.canonical_word_id === word.id)) throw new Error(wordError?.message ?? "Missing musical profile member.");
  const { data: child, error: childError } = await db.from("children").insert({ parent_user_id: parent.id, first_name: "ADLE -al verification" }).select("id").single();
  if (childError || !child) throw new Error(childError?.message ?? "Could not create verification child.");
  const { error: itemError } = await db.from("adle_learning_items").insert({ child_id: child.id, canonical_word_id: word.id, micro_skill_key: PROFILE, item_status: "pending", source_kind: "verified_misspelling", source_ref: `owner-verification:${child.id}`, source_attempt_text: "musicel", reteach_priority: false, intake_on: new Date().toISOString().slice(0, 10), row_status: "active" });
  if (itemError) { await db.from("children").delete().eq("id", child.id); throw itemError; }
  console.log(JSON.stringify({ childId: child.id, profileKey: PROFILE, url: `https://scarletts-spells-staged.vercel.app/learn/week/adle/dynamic-suffix?child=${child.id}&mode=child`, productionEnabled: false }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
