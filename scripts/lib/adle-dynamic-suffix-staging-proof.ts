import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

type ProofConfig = {
  profileKey: string;
  slug: string;
  childName: string;
  targetWord: string;
  sourceAttemptText: string;
  reflectionKey: string;
  statePath: string;
  stagingHost: string;
};
type State = {
  parentId: string;
  childId: string;
  email: string;
  password: string;
  tag: string;
  planDate: string;
  profileKey: string;
  canonicalWordIds: string[];
};

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
};
const assert: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new Error(`FAIL: ${message}`);
};

export function runDynamicSuffixStagingProof(config: ProofConfig) {
  const stateFile = resolve(config.statePath);
  function client() {
    assert(process.env.ADLE_DYNAMIC_SUFFIX_ACCEPT_STAGING === "disposable-data-only", "set ADLE_DYNAMIC_SUFFIX_ACCEPT_STAGING=disposable-data-only");
    const url = required("STAGING_SUPABASE_URL");
    assert(new URL(url).host === config.stagingHost, "refusing a non-staging host");
    return createClient(url, required("STAGING_SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  const readState = () => JSON.parse(readFileSync(stateFile, "utf8")) as State;
  const save = (value: State) => {
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify(value, null, 2));
  };

  async function setup() {
    const db = client();
    const tag = `${config.slug}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `adle-${tag}@example.test`;
    const password = `Proof-${tag}!`;
    const planDate = required("ADLE_QA_PLAN_DATE");
    const { data: user, error: userError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError || !user.user) throw new Error(userError?.message ?? "Create parent failed");
    try {
      const { data: child, error: childError } = await db.from("children")
        .insert({ parent_user_id: user.user.id, first_name: config.childName }).select("id").single();
      if (childError || !child) throw new Error(childError?.message ?? "Create child failed");
      const { data: profile, error: profileError } = await db.from("canonical_teaching_dictionary_suffix_profiles")
        .select("id,production_enabled,canonical_teaching_dictionary_suffix_members(canonical_word_id,assignment_eligible,row_status,review_status)")
        .eq("micro_skill_key", config.profileKey).eq("row_status", "active").eq("review_status", "approved_for_first_exposure").single();
      if (profileError || !profile) throw new Error(profileError?.message ?? "Missing staging suffix profile");
      assert(profile.production_enabled === false, "staging profile remains production disabled");
      const members = (profile.canonical_teaching_dictionary_suffix_members ?? []).filter((member: any) =>
        member.assignment_eligible && member.row_status === "active" && member.review_status === "approved_for_first_exposure");
      assert(members.length === 4, "profile has exactly four eligible reviewed members");
      const canonicalWordIds = members.map((member: any) => member.canonical_word_id);
      const { data: word, error: wordError } = await db.from("canonical_teaching_dictionary_words")
        .select("id").eq("normalised_word", config.targetWord).eq("row_status", "active")
        .eq("review_status", "approved_for_first_exposure").single();
      if (wordError || !word || !canonicalWordIds.includes(word.id)) throw new Error(wordError?.message ?? `Missing ${config.targetWord}`);
      const { error: itemError } = await db.from("adle_learning_items").insert({
        child_id: child.id,
        canonical_word_id: word.id,
        micro_skill_key: config.profileKey,
        item_status: "pending",
        source_kind: "verified_misspelling",
        source_ref: `disposable-proof:${tag}`,
        source_attempt_text: config.sourceAttemptText,
        reteach_priority: false,
        intake_on: planDate,
        row_status: "active",
      });
      if (itemError) throw itemError;
      const next = {
        parentId: user.user.id,
        childId: child.id,
        email,
        password,
        tag,
        planDate,
        profileKey: config.profileKey,
        canonicalWordIds,
      };
      save(next);
      console.log(JSON.stringify({ childId: child.id, email, password, planDate, profileKey: config.profileKey }));
    } catch (error) {
      await db.auth.admin.deleteUser(user.user.id);
      throw error;
    }
  }

  async function verify() {
    const db = client();
    const state = readState();
    assert(state.profileKey === config.profileKey, "proof state belongs to this profile");
    const { data: assignment, error } = await db.from("daily_assignments")
      .select("id,status").eq("child_id", state.childId).eq("assignment_date", state.planDate).single();
    if (error || !assignment) throw new Error(error?.message ?? "Assignment missing");
    assert(assignment.status === "completed", "assignment is completed");
    const [items, attempts, reflections, taught, schedules] = await Promise.all([
      db.from("assignment_items").select("id,status,metadata").eq("daily_assignment_id", assignment.id),
      db.from("adle_assignment_attempt_events").select("attempt_kind,attempt_text,evidence_class,canonical_word_id").eq("daily_assignment_id", assignment.id),
      db.from("adle_child_learning_reflections").select("prompt_key,reflection_text").eq("daily_assignment_id", assignment.id),
      db.from("adle_taught_word_history").select("canonical_word_id").eq("child_id", state.childId).eq("row_status", "active"),
      db.from("adle_review_schedule_words").select("canonical_word_id").eq("child_id", state.childId).eq("row_status", "active"),
    ]);
    for (const result of [items, attempts, reflections, taught, schedules]) if (result.error) throw result.error;
    assert(items.data?.length === 16 && items.data.every((row) => row.status === "completed"), "16 completed immutable items");
    assert(items.data?.every((row) => row.metadata?.microSkillKey === config.profileKey), "all items are scoped to the selected profile");
    assert(attempts.data?.length === 14, "14 attempt events");
    assert(attempts.data?.filter((row) => row.attempt_kind === "guided_practice").length === 6, "6 guided events");
    assert(attempts.data?.filter((row) => row.attempt_kind === "lesson_production").length === 4, "4 controlled events");
    assert(attempts.data?.filter((row) => row.attempt_kind === "lesson_dictation").length === 4, "4 dictation events");
    assert(reflections.data?.length === 1 && reflections.data[0]?.prompt_key === config.reflectionKey
      && reflections.data[0]?.reflection_text.trim(), "one reviewed reflection");
    const expectedIds = [...state.canonicalWordIds].sort().join("|");
    assert(taught.data?.length === 4 && taught.data.map((row) => row.canonical_word_id).sort().join("|") === expectedIds, "4 scoped taught words");
    assert(schedules.data?.length === 4 && schedules.data.map((row) => row.canonical_word_id).sort().join("|") === expectedIds, "4 scoped review schedules");
    console.log(JSON.stringify({
      assignmentId: assignment.id,
      itemCount: items.data?.length,
      attemptCount: attempts.data?.length,
      reflectionCount: reflections.data?.length,
      taughtCount: taught.data?.length,
      scheduleCount: schedules.data?.length,
    }));
  }

  async function cleanup() {
    const db = client();
    const state = readState();
    await db.from("children").delete().eq("id", state.childId);
    await db.auth.admin.deleteUser(state.parentId);
    const checks = await Promise.all([
      db.from("children").select("id", { count: "exact", head: true }).eq("id", state.childId),
      db.from("adle_learning_items").select("id", { count: "exact", head: true }).eq("child_id", state.childId),
      db.from("daily_assignments").select("id", { count: "exact", head: true }).eq("child_id", state.childId),
      db.from("adle_assignment_attempt_events").select("id", { count: "exact", head: true }).eq("child_id", state.childId),
      db.from("adle_child_learning_reflections").select("id", { count: "exact", head: true }).eq("child_id", state.childId),
      db.from("adle_taught_word_history").select("id", { count: "exact", head: true }).eq("child_id", state.childId),
      db.from("adle_review_schedule_words").select("id", { count: "exact", head: true }).eq("child_id", state.childId),
    ]);
    for (const result of checks) {
      if (result.error) throw result.error;
      assert(result.count === 0, "fixture-owned rows removed");
    }
    console.log(`Dynamic suffix ${config.slug} disposable proof cleanup passed.`);
  }

  const command = process.argv[2];
  const run = command === "setup" ? setup : command === "verify" ? verify : command === "cleanup" ? cleanup : null;
  if (!run) throw new Error("Use setup, verify, or cleanup.");
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
