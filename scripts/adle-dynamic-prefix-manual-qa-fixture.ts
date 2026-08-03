import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const STAGING_REF = "jlhotktspjvffslvuyfz";
const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";
const CONFIRMATION = "ADLE-DYNAMIC-PREFIX-RETAINED-QA-V1";
const SOURCE_PREFIX = "dynamic-prefix-retained-manual-qa:";
const SELECTABLE_STATUSES = ["pending", "pending_reteach"];
const PROFILE_ORDER = [
  "D4_MOR_PREFIXES_UN",
  "D4_MOR_PREFIXES_DIS_MIS",
  "D4_MOR_PREFIXES_IN_IM_IL_IR",
  "D4_MOR_PREFIXES_RE_PRE",
  "D4_MOR_PREFIXES_SUB_INTER_SUPER",
] as const;

type ReviewedPrefixMember = {
  canonical_word_id: string;
  assignment_eligible: boolean;
  row_status: string;
  review_status: string;
};

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`FAIL: ${message}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function stagingClient(): SupabaseClient {
  const url = required("SUPABASE_URL");
  const ref = new URL(url).hostname.split(".")[0];
  assert(ref !== PRODUCTION_REF, "production Supabase is rejected");
  assert(ref === STAGING_REF, "unknown Supabase project is rejected");
  return createClient(url, required("SB_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function requireApply(command: string): void {
  assert(process.argv.includes("--apply"), `${command} requires --apply`);
  const confirmIndex = process.argv.indexOf("--confirm");
  assert(
    confirmIndex >= 0 && process.argv[confirmIndex + 1] === CONFIRMATION,
    `${command} requires --confirm ${CONFIRMATION}`,
  );
  assert(
    process.env.ADLE_DYNAMIC_PREFIX_ACCEPT_STAGING === "retained-manual-qa-only",
    "ADLE_DYNAMIC_PREFIX_ACCEPT_STAGING must be retained-manual-qa-only",
  );
}

async function context(db: SupabaseClient) {
  const ownerUserId = required("ADLE_DYNAMIC_PREFIX_QA_OWNER_USER_ID");
  const childId = required("ADLE_DYNAMIC_PREFIX_QA_CHILD_ID");
  const { data: owner, error: ownerError } = await db.auth.admin.getUserById(ownerUserId);
  if (ownerError || !owner.user) throw new Error(`owner lookup: ${ownerError?.message}`);
  const { data: child, error: childError } = await db
    .from("children")
    .select("id,parent_user_id,first_name,last_name,is_archived")
    .eq("id", childId)
    .eq("parent_user_id", ownerUserId)
    .eq("is_archived", false)
    .single();
  if (childError || !child) throw new Error(`owned child lookup: ${childError?.message}`);
  return { ownerUserId, ownerEmail: owner.user.email ?? null, childId, child };
}

async function coverage(db: SupabaseClient, childId: string) {
  const { data: rows, error } = await db
    .from("adle_learning_items")
    .select("id,canonical_word_id,micro_skill_key,item_status,source_ref,row_status")
    .eq("child_id", childId)
    .eq("row_status", "active")
    .in("micro_skill_key", [...PROFILE_ORDER])
    .in("item_status", SELECTABLE_STATUSES);
  if (error) throw new Error(`learning-item coverage: ${error.message}`);
  return PROFILE_ORDER.map((profileKey) => ({
    profileKey,
    rows: (rows ?? []).filter((row) => row.micro_skill_key === profileKey),
  }));
}

async function canonicalTarget(db: SupabaseClient, childId: string, profileKey: string): Promise<string> {
  const { data: profile, error } = await db
    .from("canonical_teaching_dictionary_prefix_profiles")
    .select("canonical_teaching_dictionary_prefix_members(canonical_word_id,assignment_eligible,row_status,review_status)")
    .eq("micro_skill_key", profileKey)
    .eq("row_status", "active")
    .eq("review_status", "approved_for_first_exposure")
    .single();
  if (error || !profile) throw new Error(`${profileKey}: profile lookup: ${error?.message}`);
  const members = (
    profile as unknown as {
      canonical_teaching_dictionary_prefix_members: ReviewedPrefixMember[];
    }
  ).canonical_teaching_dictionary_prefix_members
    .filter(
      (member) =>
        member.assignment_eligible === true &&
        member.row_status === "active" &&
        member.review_status === "approved_for_first_exposure",
    )
    .sort((left, right) => left.canonical_word_id.localeCompare(right.canonical_word_id));
  assert(members.length === 7, `${profileKey}: exactly seven approved eligible members`);
  const { data: existing, error: existingError } = await db
    .from("adle_learning_items")
    .select("canonical_word_id")
    .eq("child_id", childId)
    .eq("micro_skill_key", profileKey)
    .eq("row_status", "active");
  if (existingError) throw new Error(`${profileKey}: existing learning items: ${existingError.message}`);
  const used = new Set((existing ?? []).map((row) => row.canonical_word_id));
  const available = members.find((member) => !used.has(member.canonical_word_id));
  assert(available, `${profileKey}: an unused reviewed member remains for retained QA`);
  return available.canonical_word_id;
}

async function plan(db: SupabaseClient) {
  const current = await context(db);
  const profiles = await coverage(db, current.childId);
  return {
    ...current,
    profiles: profiles.map((entry) => ({ profileKey: entry.profileKey, selectableRows: entry.rows.length })),
    missingProfiles: profiles.filter((entry) => entry.rows.length === 0).map((entry) => entry.profileKey),
  };
}

async function apply(db: SupabaseClient): Promise<void> {
  requireApply("apply");
  const before = await plan(db);
  const intakeOn = new Date().toISOString().slice(0, 10);
  const created = [];
  for (const profileKey of before.missingProfiles) {
    const canonicalWordId = await canonicalTarget(db, before.childId, profileKey);
    const { data, error } = await db.from("adle_learning_items").insert({
      child_id: before.childId,
      canonical_word_id: canonicalWordId,
      micro_skill_key: profileKey,
      item_status: "pending",
      source_kind: "verified_misspelling",
      source_ref: `${SOURCE_PREFIX}${before.childId}:${profileKey}`,
      source_attempt_text: null,
      reteach_priority: false,
      intake_on: intakeOn,
      row_status: "active",
    }).select("id,micro_skill_key,canonical_word_id,source_ref").single();
    if (error || !data) throw new Error(`${profileKey}: create retained QA learning item: ${error?.message}`);
    created.push(data);
  }
  const after = await plan(db);
  assert(after.missingProfiles.length === 0, "all five profiles are selectable for the retained child");
  console.log(JSON.stringify({ status: "retained_manual_qa_ready", ownerUserId: after.ownerUserId, ownerEmail: after.ownerEmail, childId: after.childId, childName: after.child.first_name, created, profiles: after.profiles }));
}

async function verify(db: SupabaseClient): Promise<void> {
  const result = await plan(db);
  assert(result.missingProfiles.length === 0, "all five profiles are selectable for the retained child");
  console.log(JSON.stringify({ status: "retained_manual_qa_verified", ownerUserId: result.ownerUserId, ownerEmail: result.ownerEmail, childId: result.childId, childName: result.child.first_name, profiles: result.profiles }));
}

async function cleanup(db: SupabaseClient): Promise<void> {
  requireApply("cleanup");
  const current = await context(db);
  const { data: assignments, error: assignmentError } = await db
    .from("daily_assignments")
    .select("id")
    .eq("child_id", current.childId)
    .eq("assignment_generation_source", "adle_d4_mor_dynamic_prefix_v1");
  if (assignmentError) throw assignmentError;
  assert((assignments ?? []).length === 0, "retained QA assignments must be removed explicitly before fixture cleanup");
  const { error } = await db
    .from("adle_learning_items")
    .delete()
    .eq("child_id", current.childId)
    .like("source_ref", `${SOURCE_PREFIX}%`);
  if (error) throw error;
  console.log(JSON.stringify({ status: "retained_manual_qa_fixture_removed", childId: current.childId }));
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "plan";
  const db = stagingClient();
  if (command === "plan") console.log(JSON.stringify({ status: "retained_manual_qa_plan", ...(await plan(db)) }));
  else if (command === "apply") await apply(db);
  else if (command === "verify") await verify(db);
  else if (command === "cleanup") await cleanup(db);
  else throw new Error("Use plan, apply, verify, or cleanup.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
