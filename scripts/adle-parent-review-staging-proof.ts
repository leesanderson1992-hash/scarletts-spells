/** Disposable staging-only parent-review proof. State is intentionally ignored under .tmp. */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const REF = "jlhotktspjvffslvuyfz";
const STATE = resolve(".tmp/adle-parent-review-staging-proof.json");
const CONFIRM = "ADLE-PARENT-REVIEW-STAGING-FIXTURE-V1";
const COUNT_TABLES = [
  "children",
  "courses",
  "course_modules",
  "course_tasks",
  "task_submissions",
  "adle_learning_items",
  "adle_learning_item_sources",
  "adle_review_schedule_word_routes",
  "parent_verified_spelling_candidate_mappings",
] as const;

type FixtureState = {
  parentId: string;
  childId: string;
  courseId: string;
  moduleId: string;
  taskId: string;
  submissionId: string;
  email: string;
  password: string;
  baseline: Record<(typeof COUNT_TABLES)[number], number>;
};

type CreatedFixture = Partial<Omit<FixtureState, "email" | "password" | "baseline">> & {
  parentId: string;
};

function need(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function assertIntakeDisabled() {
  if (process.env.ADLE_CANONICAL_INTAKE_ENABLED !== "disabled")
    throw new Error("ADLE_CANONICAL_INTAKE_ENABLED must be exactly disabled for this proof");
}

function db() {
  const url = need("STAGING_SUPABASE_URL");
  if (new URL(url).hostname !== `${REF}.supabase.co`) throw new Error("Refusing non-staging host");
  return createClient(url, need("STAGING_SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type Client = ReturnType<typeof db>;

function mutate() {
  if (!process.argv.includes("--apply") || !process.argv.includes(CONFIRM))
    throw new Error(`Requires --apply ${CONFIRM}`);
}

async function counts(client: Client): Promise<FixtureState["baseline"]> {
  const values = await Promise.all(
    COUNT_TABLES.map(async (table) => {
      const { count, error } = await client.from(table).select("id", { count: "exact", head: true });
      if (error) throw error;
      return [table, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(values) as FixtureState["baseline"];
}

function state() {
  if (!existsSync(STATE)) throw new Error("Fixture state is missing");
  return JSON.parse(readFileSync(STATE, "utf8")) as FixtureState;
}

function save(fixture: FixtureState) {
  mkdirSync(resolve(".tmp"), { recursive: true });
  writeFileSync(STATE, JSON.stringify(fixture));
}

async function deleteRow(client: Client, table: string, id: string | undefined) {
  if (!id) return;
  const { error } = await client.from(table).delete().eq("id", id);
  if (error) throw new Error(`Could not delete fixture ${table}: ${error.message}`);
}

async function deleteFixtureRows(client: Client, fixture: CreatedFixture) {
  await deleteRow(client, "task_submissions", fixture.submissionId);
  await deleteRow(client, "course_tasks", fixture.taskId);
  await deleteRow(client, "course_modules", fixture.moduleId);
  await deleteRow(client, "courses", fixture.courseId);
  await deleteRow(client, "children", fixture.childId);
  const { error } = await client.auth.admin.deleteUser(fixture.parentId);
  if (error) throw new Error(`Could not delete fixture parent: ${error.message}`);
}

async function setup() {
  mutate();
  assertIntakeDisabled();
  const client = db();
  const baseline = await counts(client);
  const tag = randomUUID();
  const email = `adle-review-${tag}@example.test`;
  const password = `Disposable-${tag}!`;
  const { data: user, error: userError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError || !user.user) throw new Error(userError?.message ?? "create user failed");

  const fixture: CreatedFixture = { parentId: user.user.id };
  try {
    const { data: child, error } = await client
      .from("children")
      .insert({ parent_user_id: fixture.parentId, first_name: "ADLE Review Proof", notes: `adle-parent-review-proof:${tag}` })
      .select("id")
      .single();
    if (error || !child) throw new Error(error?.message ?? "create child failed");
    fixture.childId = child.id;

    const { data: course, error: courseError } = await client
      .from("courses")
      .insert({ parent_user_id: fixture.parentId, child_id: fixture.childId, title: "ADLE Review Proof", description: `disposable:${tag}`, structure_type: "timed" })
      .select("id")
      .single();
    if (courseError || !course) throw new Error(courseError?.message ?? "create course failed");
    fixture.courseId = course.id;

    const { data: module, error: moduleError } = await client
      .from("course_modules")
      .insert({ course_id: fixture.courseId, parent_user_id: fixture.parentId, title: "Disposable review", position: 0 })
      .select("id")
      .single();
    if (moduleError || !module) throw new Error(moduleError?.message ?? "create module failed");
    fixture.moduleId = module.id;

    const { data: task, error: taskError } = await client
      .from("course_tasks")
      .insert({ course_id: fixture.courseId, module_id: fixture.moduleId, parent_user_id: fixture.parentId, title: "Disposable approval", task_type: "checklist", position: 0, is_active: true, coin_reward_trigger: "none", gold_bar_rule: "none" })
      .select("id")
      .single();
    if (taskError || !task) throw new Error(taskError?.message ?? "create task failed");
    fixture.taskId = task.id;

    const { data: submission, error: submissionError } = await client
      .from("task_submissions")
      .insert({ task_id: fixture.taskId, course_id: fixture.courseId, child_id: fixture.childId, parent_user_id: fixture.parentId, submission_text: "Disposable review proof", parent_review_status: "pending" })
      .select("id")
      .single();
    if (submissionError || !submission) throw new Error(submissionError?.message ?? "create submission failed");
    fixture.submissionId = submission.id;

    save({ ...fixture, email, password, baseline } as FixtureState);
    console.log(JSON.stringify({ status: "fixture_ready", submissionId: fixture.submissionId, childId: fixture.childId }));
  } catch (error) {
    await deleteFixtureRows(client, fixture);
    throw error;
  }
}

async function verify() {
  assertIntakeDisabled();
  const client = db();
  const fixture = state();
  const { data, error } = await client
    .from("task_submissions")
    .select("parent_review_status,parent_reviewed_at")
    .eq("id", fixture.submissionId)
    .single();
  if (error) throw error;
  const after = await counts(client);
  const noIntakeWrites =
    after.adle_learning_items === fixture.baseline.adle_learning_items &&
    after.adle_learning_item_sources === fixture.baseline.adle_learning_item_sources &&
    after.adle_review_schedule_word_routes === fixture.baseline.adle_review_schedule_word_routes &&
    after.parent_verified_spelling_candidate_mappings === fixture.baseline.parent_verified_spelling_candidate_mappings;
  if (data.parent_review_status !== "approved" || !data.parent_reviewed_at || !noIntakeWrites)
    throw new Error("approval or disabled-intake invariant failed");
  console.log(JSON.stringify({ status: "approval_verified", submissionId: fixture.submissionId, noIntakeWrites }));
}

async function cleanup() {
  mutate();
  const client = db();
  const fixture = state();
  await deleteFixtureRows(client, fixture);
  const after = await counts(client);
  if (JSON.stringify(after) !== JSON.stringify(fixture.baseline))
    throw new Error("cleanup count mismatch");
  rmSync(STATE, { force: true });
  console.log(JSON.stringify({ status: "cleanup_verified", protectedCountsRestored: true }));
}

const command = process.argv[2];
if (command === "setup") setup();
else if (command === "verify") verify();
else if (command === "cleanup") cleanup();
else throw new Error("Use setup, verify, or cleanup");
