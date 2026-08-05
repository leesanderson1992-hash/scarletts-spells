import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";

import { getAdleDailyPlanReadModel } from "../lib/adle/loaders/daily-plan-surface";

const STAGING_REF = "jlhotktspjvffslvuyfz";
const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function countForAssignment(
  client: ReturnType<typeof createClient>,
  table: string,
  assignmentId: string,
): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("daily_assignment_id", assignmentId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function main(): Promise<void> {
  const environment = argument("--environment");
  assert(environment === "staging" || environment === "production", "environment must be staging or production");
  const expectedRef = environment === "staging" ? STAGING_REF : PRODUCTION_REF;
  const rejectedRef = environment === "staging" ? PRODUCTION_REF : STAGING_REF;
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const hostname = new URL(url).hostname;
  assert(hostname.includes(expectedRef), `refusing ${environment} proof for unexpected Supabase identity`);
  assert(!hostname.includes(rejectedRef), `refusing ${environment} proof for rejected Supabase identity`);

  const childId = argument("--child-id");
  const planDate = argument("--plan-date");
  const expectedAssignmentId = process.argv.includes("--assignment-id")
    ? argument("--assignment-id")
    : null;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SB_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw new Error("Missing service-role key");
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const assignmentQuery = client
    .from("daily_assignments")
    .select("id,parent_user_id,child_id,assignment_date")
    .eq("child_id", childId)
    .eq("assignment_date", planDate)
    .eq("title", "ADLE Daily Plan");
  const { data: assignments, error: assignmentError } = expectedAssignmentId
    ? await assignmentQuery.eq("id", expectedAssignmentId)
    : await assignmentQuery;
  if (assignmentError) throw new Error(`daily_assignments: ${assignmentError.message}`);
  assert.equal(assignments?.length, 1, "expected exactly one guarded assignment");
  const assignment = assignments[0];

  const before = {
    items: await countForAssignment(client, "assignment_items", assignment.id),
    attempts: await countForAssignment(client, "adle_assignment_attempt_events", assignment.id),
    reflections: await countForAssignment(client, "adle_child_learning_reflections", assignment.id),
  };
  const readModel = await getAdleDailyPlanReadModel({
    userClient: client,
    parentUserId: assignment.parent_user_id,
    childId,
    planDate,
    assignmentId: assignment.id,
  });
  const after = {
    items: await countForAssignment(client, "assignment_items", assignment.id),
    attempts: await countForAssignment(client, "adle_assignment_attempt_events", assignment.id),
    reflections: await countForAssignment(client, "adle_child_learning_reflections", assignment.id),
  };
  assert.deepEqual(after, before, "read-only proof must not write learner state");
  assert(readModel.state === "ready" || readModel.state === "completed", "assignment read model must be readable");
  assert.equal(readModel.genericSnapshotResolution, null, "non-Generic route must not invoke Generic Snapshot reader");
  const routeMetadata = readModel.lessonRouteMetadata as { route?: { routeId?: unknown; routeVersion?: unknown } } | null;

  process.stdout.write(`${JSON.stringify({
    environment,
    assignmentId: assignment.id,
    planDate,
    state: readModel.state,
    routeId: routeMetadata?.route?.routeId ?? null,
    routeVersion: routeMetadata?.route?.routeVersion ?? null,
    snapshotCapability: readModel.snapshotCapability?.genericSnapshotColumn ?? null,
    itemCount: before.items,
    genericSnapshotReaderInvoked: readModel.genericSnapshotResolution !== null,
    learnerWriteCountsBefore: before,
    learnerWriteCountsAfter: after,
    mutationPerformed: false,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
