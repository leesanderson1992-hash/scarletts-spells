/** Disposable staging-only proof for governed canonical misspelling intake. */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const STAGING_REF = "jlhotktspjvffslvuyfz";
const CONFIRM = "CANONICAL-MISSPELLING-INTAKE-STAGING-PROOF-V1";
const STATE_PATH = resolve(".tmp/canonical-misspelling-intake-staging-proof.json");
const RAW_TEXT = "I want to wosh at the jym wen";

type FixtureState = {
  parentId: string;
  childId: string;
  courseId: string;
  moduleId: string;
  taskId: string;
  submissionId: string;
  writingSampleId: string;
  email: string;
  password: string;
  deploymentUrl: string;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function assertApply() {
  if (!process.argv.includes("--apply") || !process.argv.includes(CONFIRM)) {
    throw new Error(`Mutation requires --apply ${CONFIRM}`);
  }
}

function stagingConfig() {
  const url = required("STAGING_SUPABASE_URL");
  if (new URL(url).hostname !== `${STAGING_REF}.supabase.co`) {
    throw new Error(`Refusing non-staging Supabase host ${new URL(url).hostname}`);
  }
  const deploymentUrl = required("STAGING_DEPLOYMENT_URL").replace(/\/$/, "");
  if (new URL(deploymentUrl).hostname !== "scarletts-spells-staged.vercel.app") {
    throw new Error(`Refusing unexpected staging deployment ${deploymentUrl}`);
  }
  return {
    url,
    serviceRoleKey: required("STAGING_SUPABASE_SERVICE_ROLE_KEY"),
    anonKey: required("STAGING_SUPABASE_ANON_KEY"),
    deploymentUrl,
    cronSecret: required("STAGING_CRON_SECRET"),
  };
}

function readState() {
  if (!existsSync(STATE_PATH)) throw new Error("Staging proof state is missing");
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as FixtureState;
}

function saveState(state: FixtureState) {
  mkdirSync(resolve(".tmp"), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state));
}

function serviceClient(config: ReturnType<typeof stagingConfig>) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function loadCanonicalRows(db: ReturnType<typeof serviceClient>, writingSampleId: string) {
  const { data, error } = await db
    .from("misspelling_instances")
    .select("id,misspelled_word,corrected_word,position_start,position_end,notes")
    .eq("writing_sample_id", writingSampleId)
    .order("position_start", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function assertCanonicalRows(rows: Awaited<ReturnType<typeof loadCanonicalRows>>) {
  const expected = [
    { misspelling: "wosh", correction: "wash", start: 10, end: 14 },
    { misspelling: "jym", correction: "gym", start: 22, end: 25 },
    { misspelling: "wen", correction: "when", start: 26, end: 29 },
  ];
  if (rows.length !== expected.length) throw new Error(`Expected three canonical rows, received ${rows.length}`);
  for (let index = 0; index < expected.length; index += 1) {
    const row = rows[index];
    const target = expected[index];
    const notes = JSON.parse(row.notes ?? "{}") as {
      detectionSource?: string;
      canonicalDetection?: {
        canonicalMappingIds?: string[];
        canonicalCorrection?: string;
        dialectCode?: string;
        normalizationVersion?: string;
      };
    };
    if (
      row.misspelled_word !== target.misspelling ||
      row.corrected_word !== target.correction ||
      row.position_start !== target.start ||
      row.position_end !== target.end ||
      notes.detectionSource !== "resolver_visible_canonical" ||
      notes.canonicalDetection?.canonicalCorrection !== target.correction ||
      notes.canonicalDetection?.dialectCode !== "en-GB" ||
      notes.canonicalDetection?.normalizationVersion !== "spelling_normalize_v1" ||
      !notes.canonicalDetection?.canonicalMappingIds?.length
    ) throw new Error(`Canonical provenance mismatch for ${target.misspelling}`);
  }
}

async function setup() {
  assertApply();
  const config = stagingConfig();
  const db = serviceClient(config);
  const tag = randomUUID();
  const email = `canonical-intake-${tag}@example.test`;
  const password = `Canonical-${tag}!`;
  const { data: created, error: userError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (userError || !created.user) throw userError ?? new Error("Could not create proof user");
  const parentId = created.user.id;

  try {
    const { data: child, error: childError } = await db.from("children").insert({
      parent_user_id: parentId,
      first_name: "Canonical Intake Proof",
      notes: `canonical-intake-proof:${tag}`,
    }).select("id").single();
    if (childError || !child) throw childError ?? new Error("Could not create proof child");

    const { data: course, error: courseError } = await db.from("courses").insert({
      parent_user_id: parentId,
      child_id: child.id,
      title: "Canonical Intake Proof",
      description: `disposable:${tag}`,
      structure_type: "timed",
    }).select("id").single();
    if (courseError || !course) throw courseError ?? new Error("Could not create proof course");

    const { data: module, error: moduleError } = await db.from("course_modules").insert({
      course_id: course.id,
      parent_user_id: parentId,
      title: "Canonical intake",
      position: 0,
    }).select("id").single();
    if (moduleError || !module) throw moduleError ?? new Error("Could not create proof module");

    const { data: task, error: taskError } = await db.from("course_tasks").insert({
      course_id: course.id,
      module_id: module.id,
      parent_user_id: parentId,
      title: "Known misspelling intake",
      task_type: "lesson",
      position: 0,
      is_active: true,
      coin_reward_trigger: "none",
      gold_bar_rule: "none",
    }).select("id").single();
    if (taskError || !task) throw taskError ?? new Error("Could not create proof task");

    const authClient = createClient(config.url, config.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: loginError } = await authClient.auth.signInWithPassword({ email, password });
    if (loginError) throw loginError;
    const submittedAt = new Date().toISOString();
    const envelope = {
      p_parent_user_id: parentId,
      p_child_id: child.id,
      p_course_id: course.id,
      p_task_id: task.id,
      p_submission_request_id: randomUUID(),
      p_submission_text: RAW_TEXT,
      p_submitted_at: submittedAt,
      p_completion_date: submittedAt.slice(0, 10),
      p_structured_payload_type: null,
      p_structured_payload: null,
      p_processing_payload: { submissionText: RAW_TEXT, taskType: "lesson", completionDate: submittedAt.slice(0, 10) },
    };
    const { data: result, error: submissionError } = await authClient.rpc("submit_course_task_response_once", envelope);
    if (submissionError || !result) throw submissionError ?? new Error("Submission RPC returned no result");
    const submissionId = (result as { submissionId?: string }).submissionId;
    if (!submissionId) throw new Error("Submission RPC returned no id");

    const { data: duplicate, error: duplicateError } = await authClient.rpc("submit_course_task_response_once", envelope);
    if (duplicateError || (duplicate as { outcome?: string } | null)?.outcome !== "duplicate") {
      throw duplicateError ?? new Error("Submission retry was not idempotent");
    }

    const response = await fetch(`${config.deploymentUrl}/api/internal/task-submissions/process`, {
      headers: { Authorization: `Bearer ${config.cronSecret}` },
    });
    if (!response.ok) throw new Error(`Deployed processor returned HTTP ${response.status}`);

    const { data: job, error: jobError } = await db.from("task_submission_processing_jobs")
      .select("id,status,attempt_count,last_error").eq("submission_id", submissionId).single();
    if (jobError || job?.status !== "completed" || job.attempt_count !== 1) {
      throw jobError ?? new Error(`Processing job did not complete: ${JSON.stringify(job)}`);
    }

    const { data: sample, error: sampleError } = await db.from("writing_samples")
      .select("id,sample_text").eq("task_submission_id", submissionId).single();
    if (sampleError || !sample || sample.sample_text !== RAW_TEXT) {
      throw sampleError ?? new Error("Writing sample did not preserve the raw text");
    }
    const rows = await loadCanonicalRows(db, sample.id);
    assertCanonicalRows(rows);
    const state: FixtureState = {
      parentId,
      childId: child.id,
      courseId: course.id,
      moduleId: module.id,
      taskId: task.id,
      submissionId,
      writingSampleId: sample.id,
      email,
      password,
      deploymentUrl: config.deploymentUrl,
    };
    saveState(state);
    console.log(JSON.stringify({
      status: "staging_proof_ready",
      rawText: RAW_TEXT,
      submissionId,
      writingSampleId: sample.id,
      rowIds: rows.map((row) => row.id),
      reviewUrl: `${config.deploymentUrl}/courses/review/${submissionId}`,
      email,
      password,
      retryOutcome: "duplicate",
    }, null, 2));
  } catch (error) {
    await db.auth.admin.deleteUser(parentId);
    throw error;
  }
}

async function verify() {
  const config = stagingConfig();
  const db = serviceClient(config);
  const state = readState();
  const { data: sample, error } = await db.from("writing_samples").select("sample_text").eq("id", state.writingSampleId).single();
  if (error || sample?.sample_text !== RAW_TEXT) throw error ?? new Error("Proof sample changed");
  const rows = await loadCanonicalRows(db, state.writingSampleId);
  assertCanonicalRows(rows);
  console.log(JSON.stringify({ status: "staging_proof_verified", submissionId: state.submissionId, rowCount: rows.length }));
}

async function cleanup() {
  assertApply();
  const config = stagingConfig();
  const db = serviceClient(config);
  const state = readState();
  const { error } = await db.auth.admin.deleteUser(state.parentId);
  if (error) throw error;
  rmSync(STATE_PATH, { force: true });
  console.log(JSON.stringify({ status: "staging_proof_cleaned", parentId: state.parentId }));
}

async function main() {
  const command = process.argv[2];
  if (command === "setup") await setup();
  else if (command === "verify") await verify();
  else if (command === "cleanup") await cleanup();
  else throw new Error("Use setup, verify, or cleanup");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
