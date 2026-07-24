/** Read-only gate for the approved `really` / `helpful` shared-route proof.
 * It deliberately has no write path: content promotion and learner intake are
 * separate guarded staging operations after this evidence has been captured. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const STAGING_REF = "jlhotktspjvffslvuyfz";
const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";
const PACKET = resolve("docs/implementation/seed-data/adle-shared-route-readiness-review-v1.md");
const WORDS = ["really", "helpful", "real", "realism", "help", "helper"] as const;
const TARGETS = ["really", "helpful"] as const;
const SKILLS = ["D4_MOR_BASE_WORDS_PRESERVE_BASE", "D4_MOR_BASE_WORDS_IDENTIFY_BASE"] as const;

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(`FAIL: ${message}`); }

async function main() {
  const url = required("STAGING_SUPABASE_URL");
  const key = required("STAGING_SUPABASE_SERVICE_ROLE_KEY");
  const host = new URL(url).hostname;
  assert(host.includes(STAGING_REF) && !host.includes(PRODUCTION_REF), "only the named staging project is permitted");
  assert(required("ADLE_SHARED_ROUTE_STAGING_SUPABASE_HOST") === host, "staging host acknowledgement must match exactly");
  assert(required("ADLE_SHARED_ROUTE_APPROVAL_REF").includes("2026-07-23"), "record the 2026-07-23 product-owner approval reference");
  const digest = createHash("sha256").update(readFileSync(PACKET)).digest("hex");
  assert(required("ADLE_SHARED_ROUTE_REVIEW_PACKET_SHA256") === digest, "review packet digest does not match the approved packet");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const [words, skills, content, families] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("id,normalised_word").in("normalised_word", WORDS).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
    db.from("micro_skill_catalog").select("micro_skill_key,mastery_domain_key,is_active,is_assignable").in("micro_skill_key", SKILLS),
    db.from("canonical_teaching_dictionary_content_versions").select("micro_skill_key,version_status,is_active,final_readiness_review_status").in("micro_skill_key", SKILLS).eq("is_active", true),
    db.from("canonical_teaching_dictionary_base_word_families").select("id,micro_skill_key,base_family_key").in("micro_skill_key", SKILLS).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
  ]);
  for (const result of [words, skills, content, families]) assert(!result.error, result.error?.message ?? "staging query failed");
  assert((words.data ?? []).length === WORDS.length, "every reviewed target/base/transfer word must already be assignment-approved in staging");
  assert((skills.data ?? []).every((skill) => skill.mastery_domain_key === "D4" && skill.is_active && skill.is_assignable), "both routes must be active, assignable Domain 4 catalog rows");
  assert(SKILLS.every((skill) => (content.data ?? []).some((row) => row.micro_skill_key === skill && row.version_status === "active" && row.final_readiness_review_status === "signed_off")), "both signed-off active route content versions are required");
  const wordIdByText = new Map((words.data ?? []).map((word) => [word.normalised_word, word.id]));
  const familyIds = (families.data ?? []).map((family) => family.id);
  const [supports, members] = await Promise.all([
    db.from("canonical_teaching_dictionary_word_support").select("canonical_word_id,micro_skill_key,support_role").in("canonical_word_id", TARGETS.map((word) => wordIdByText.get(word)!)).in("micro_skill_key", SKILLS).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
    familyIds.length ? db.from("canonical_teaching_dictionary_base_word_family_members").select("base_word_family_id,canonical_word_id,member_role,assignment_eligible").in("base_word_family_id", familyIds).eq("row_status", "active").eq("review_status", "approved_for_first_exposure") : Promise.resolve({ data: [], error: null }),
  ]);
  assert(!supports.error && !members.error, supports.error?.message ?? members.error?.message ?? "route support query failed");
  for (const skill of SKILLS) for (const target of TARGETS) {
    const wordId = wordIdByText.get(target)!;
    assert((supports.data ?? []).some((row) => row.canonical_word_id === wordId && row.micro_skill_key === skill && ["support_example", "review_example"].includes(row.support_role)), `${target} lacks approved non-contrast support for ${skill}`);
    assert((members.data ?? []).some((row) => row.canonical_word_id === wordId && row.assignment_eligible), `${target} lacks an approved eligible base-family member for ${skill}`);
  }
  console.log(JSON.stringify({ status: "adle_really_helpful_staging_preflight_ok", reviewPacketSha256: digest, targetWords: TARGETS, microSkills: SKILLS, approvedFamilyCount: (families.data ?? []).length, note: "Read-only proof passed; run the separately confirmed staging content/import workflow next." }, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
