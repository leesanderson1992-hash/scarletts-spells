import assert from "node:assert/strict";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

function readHostedProjectRef(value) {
  try {
    const url = new URL(value);
    const [projectRef] = url.hostname.split(".");
    return projectRef || null;
  } catch {
    return null;
  }
}

export function readLocalE2EConfig() {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const email = process.env.E2E_PARENT_EMAIL ?? "";
  const password = process.env.E2E_PARENT_PASSWORD ?? "";
  const allowHostedSupabase = process.env.E2E_ALLOW_HOSTED_SUPABASE === "1";
  const expectedHostedProjectRef =
    process.env.E2E_SUPABASE_PROJECT_REF?.trim() ?? "";

  assert.ok(
    isLocalUrl(baseUrl),
    `E2E_BASE_URL must be local. Received: ${baseUrl}`,
  );
  assert.ok(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL is required.");

  if (!isLocalUrl(supabaseUrl)) {
    const hostedProjectRef = readHostedProjectRef(supabaseUrl);

    assert.ok(
      allowHostedSupabase,
      [
        "Hosted Supabase is blocked by default for this E2E harness.",
        "Set E2E_ALLOW_HOSTED_SUPABASE=1 only for a non-production test project.",
      ].join(" "),
    );
    assert.ok(
      expectedHostedProjectRef,
      "E2E_SUPABASE_PROJECT_REF is required when allowing hosted Supabase.",
    );
    assert.equal(
      hostedProjectRef,
      expectedHostedProjectRef,
      [
        "Hosted Supabase URL does not match the approved E2E project ref.",
        `Expected: ${expectedHostedProjectRef}`,
        `Received: ${hostedProjectRef ?? "(unreadable)"}`,
      ].join(" "),
    );
  }

  assert.ok(
    anonKey,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY is required for browser-authenticated E2E checks.",
  );
  assert.ok(
    serviceRoleKey,
    "SUPABASE_SERVICE_ROLE_KEY is required for E2E seeding and verification.",
  );
  assert.ok(email, "E2E_PARENT_EMAIL is required.");
  assert.ok(password, "E2E_PARENT_PASSWORD is required.");

  return {
    baseUrl,
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    email,
    password,
    allowHostedSupabase,
    expectedHostedProjectRef,
  };
}

export function createAdminClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createAnonClient(config) {
  return createClient(config.supabaseUrl, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function describeSupabaseEnvironment(config) {
  if (isLocalUrl(config.supabaseUrl)) {
    return "local";
  }

  if (config.allowHostedSupabase) {
    return "hosted-staging";
  }

  return "blocked";
}

function normaliseScope(scope) {
  return (scope ?? "default")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

function getScopedChildName(scope) {
  const safeScope = normaliseScope(scope);
  return {
    firstName: `E2E-${safeScope}`,
    lastName: "Review",
  };
}

function getScopedReviewFixtureNames(scope) {
  const safeScope = normaliseScope(scope);

  return {
    courseTitle: `Stage7C ${safeScope} Course`,
    moduleTitle: `Stage7C ${safeScope} Module`,
    taskTitle: `Stage7C ${safeScope} Lesson Submission`,
  };
}

export async function ensureParentUser(admin, { email, password }) {
  const { data: usersPage, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    throw listError;
  }

  const existingUser = usersPage.users.find((user) => user.email === email);

  if (existingUser) {
    return existingUser.id;
  }

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !createdUser.user) {
    throw createError ?? new Error("Failed to create local E2E parent user.");
  }

  return createdUser.user.id;
}

export async function ensureChild(admin, { parentUserId, scope = "default" }) {
  const scopedChildName = getScopedChildName(scope);
  const { data: existingChild, error: existingError } = await admin
    .from("children")
    .select("id")
    .eq("parent_user_id", parentUserId)
    .eq("first_name", scopedChildName.firstName)
    .eq("last_name", scopedChildName.lastName)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingChild?.id) {
    const { error: updateError } = await admin
      .from("children")
      .update({ is_archived: false })
      .eq("id", existingChild.id)
      .eq("parent_user_id", parentUserId);

    if (updateError) {
      throw updateError;
    }

    return existingChild.id;
  }

  const { data: insertedChild, error: insertError } = await admin
    .from("children")
    .insert({
      parent_user_id: parentUserId,
      first_name: scopedChildName.firstName,
      last_name: scopedChildName.lastName,
      date_of_birth: "2017-05-13",
      is_archived: false,
    })
    .select("id")
    .single();

  if (insertError || !insertedChild) {
    throw insertError ?? new Error("Failed to create local E2E child.");
  }

  return insertedChild.id;
}

export async function verifyParentCredentials(config) {
  const anonClient = createAnonClient(config);
  const { data, error } = await anonClient.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  });

  if (error || !data.user) {
    throw error ?? new Error("Failed to verify E2E parent credentials.");
  }

  await anonClient.auth.signOut();

  return data.user.id;
}

export async function createParentSession(config) {
  const anonClient = createAnonClient(config);
  const { data, error } = await anonClient.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  });

  if (error || !data.user || !data.session) {
    throw error ?? new Error("Failed to create E2E parent session.");
  }

  return data.session;
}

export async function createParentSessionCookies(config) {
  const cookieJar = new Map();

  const client = createServerClient(config.supabaseUrl, config.anonKey, {
    cookies: {
      getAll() {
        return [...cookieJar.values()];
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          if (!cookie.value || cookie.options?.maxAge === 0) {
            cookieJar.delete(cookie.name);
            continue;
          }

          cookieJar.set(cookie.name, cookie);
        }
      },
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  });

  if (error || !data.user || !data.session) {
    throw error ?? new Error("Failed to create E2E parent session cookies.");
  }

  return [...cookieJar.values()];
}

export async function ensureReviewCourseTask(admin, { parentUserId, childId, scope = "stage7c" }) {
  const scopedNames = getScopedReviewFixtureNames(scope);
  const { data: existingCourse, error: existingCourseError } = await admin
    .from("courses")
    .select("id")
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("title", scopedNames.courseTitle)
    .limit(1)
    .maybeSingle();

  if (existingCourseError) {
    throw existingCourseError;
  }

  let courseId = existingCourse?.id ?? null;

  if (!courseId) {
    const { data: insertedCourse, error: courseInsertError } = await admin
      .from("courses")
      .insert({
        parent_user_id: parentUserId,
        child_id: childId,
        title: scopedNames.courseTitle,
        description: "Review Work detail fixture course.",
      })
      .select("id")
      .single();

    if (courseInsertError || !insertedCourse) {
      throw courseInsertError ?? new Error("Failed to create Stage 7C course.");
    }

    courseId = insertedCourse.id;
  }

  const { data: existingModule, error: existingModuleError } = await admin
    .from("course_modules")
    .select("id")
    .eq("parent_user_id", parentUserId)
    .eq("course_id", courseId)
    .eq("title", scopedNames.moduleTitle)
    .limit(1)
    .maybeSingle();

  if (existingModuleError) {
    throw existingModuleError;
  }

  let moduleId = existingModule?.id ?? null;

  if (!moduleId) {
    const { data: insertedModule, error: moduleInsertError } = await admin
      .from("course_modules")
      .insert({
        parent_user_id: parentUserId,
        course_id: courseId,
        title: scopedNames.moduleTitle,
        description: "Review Work detail fixture module.",
        position: 0,
      })
      .select("id")
      .single();

    if (moduleInsertError || !insertedModule) {
      throw moduleInsertError ?? new Error("Failed to create Stage 7C module.");
    }

    moduleId = insertedModule.id;
  }

  const { data: existingTask, error: existingTaskError } = await admin
    .from("course_tasks")
    .select("id")
    .eq("parent_user_id", parentUserId)
    .eq("course_id", courseId)
    .eq("module_id", moduleId)
    .eq("title", scopedNames.taskTitle)
    .limit(1)
    .maybeSingle();

  if (existingTaskError) {
    throw existingTaskError;
  }

  let taskId = existingTask?.id ?? null;

  if (!taskId) {
    const { data: insertedTask, error: taskInsertError } = await admin
      .from("course_tasks")
      .insert({
        course_id: courseId,
        module_id: moduleId,
        parent_user_id: parentUserId,
        title: scopedNames.taskTitle,
        task_type: "lesson",
        instructions: "Fixture task for Review Work detail QA.",
        writing_prompt: "Write one sentence.",
        position: 0,
      })
      .select("id")
      .single();

    if (taskInsertError || !insertedTask) {
      throw taskInsertError ?? new Error("Failed to create Stage 7C task.");
    }

    taskId = insertedTask.id;
  }

  return { courseId, moduleId, taskId };
}

export async function cleanupManualWritingSamples(admin, { parentUserId, childId, sampleText = null }) {
  let query = admin
    .from("writing_samples")
    .select("id")
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("title", "Manual writing sample")
    .eq("source", "Add Writing Sample")
    .is("task_submission_id", null);

  if (sampleText !== null) {
    query = query.eq("sample_text", sampleText);
  }

  const { data: sampleRows, error: sampleQueryError } = await query;

  if (sampleQueryError) {
    throw sampleQueryError;
  }

  const sampleIds = (sampleRows ?? []).map((row) => row.id);

  if (sampleIds.length > 0) {
    const { error: misspellingDeleteError } = await admin
      .from("misspelling_instances")
      .delete()
      .in("writing_sample_id", sampleIds)
      .eq("parent_user_id", parentUserId);

    if (misspellingDeleteError) {
      throw misspellingDeleteError;
    }

    const { error: sampleDeleteError } = await admin
      .from("writing_samples")
      .delete()
      .in("id", sampleIds)
      .eq("parent_user_id", parentUserId);

    if (sampleDeleteError) {
      throw sampleDeleteError;
    }
  }
}

export async function getScopedTableCounts(admin, { parentUserId, childId }) {
  const tables = [
    "parent_verifications",
    "writing_issues",
    "writing_issue_suggestions",
    "writing_issue_correction_attempts",
    "learning_items",
    "learning_item_evidence",
    "learning_item_issue_links",
    "assignment_items",
    "spelling_reward_states",
    "spelling_reward_events",
  ];

  const counts = {};

  for (const table of tables) {
    let query = admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("child_id", childId);

    if (table !== "learning_item_issue_links") {
      query = query.eq("parent_user_id", parentUserId);
    }

    const { count, error } = await query;

    if (error) {
      throw error;
    }

    counts[table] = count ?? 0;
  }

  return counts;
}

export async function cleanupStage7CSubmissionFixtures(admin, { parentUserId, childId, scope = "stage7c" }) {
  const { taskId } = await ensureReviewCourseTask(admin, { parentUserId, childId, scope });

  const { data: submissionRows, error: submissionQueryError } = await admin
    .from("task_submissions")
    .select("id")
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("task_id", taskId);

  if (submissionQueryError) {
    throw submissionQueryError;
  }

  const submissionIds = (submissionRows ?? []).map((row) => row.id);

  if (submissionIds.length === 0) {
    return;
  }

  const { data: sampleRows, error: sampleQueryError } = await admin
    .from("writing_samples")
    .select("id")
    .eq("parent_user_id", parentUserId)
    .in("task_submission_id", submissionIds);

  if (sampleQueryError) {
    throw sampleQueryError;
  }

  const sampleIds = (sampleRows ?? []).map((row) => row.id);

  const { data: suggestionRows, error: suggestionQueryError } = await admin
    .from("writing_issue_suggestions")
    .select("id")
    .eq("parent_user_id", parentUserId)
    .in("task_submission_id", submissionIds);

  if (suggestionQueryError) {
    throw suggestionQueryError;
  }

  const suggestionIds = (suggestionRows ?? []).map((row) => row.id);

  const { data: issueRows, error: issueQueryError } = await admin
    .from("writing_issues")
    .select("id")
    .eq("parent_user_id", parentUserId)
    .in("task_submission_id", submissionIds);

  if (issueQueryError) {
    throw issueQueryError;
  }

  const issueIds = (issueRows ?? []).map((row) => row.id);

  if (issueIds.length > 0) {
    const { error: correctionAttemptDeleteError } = await admin
      .from("writing_issue_correction_attempts")
      .delete()
      .in("writing_issue_id", issueIds)
      .eq("parent_user_id", parentUserId);

    if (correctionAttemptDeleteError) {
      throw correctionAttemptDeleteError;
    }
  }

  if (issueIds.length > 0) {
    const { error: issueDeleteError } = await admin
      .from("writing_issues")
      .delete()
      .in("id", issueIds)
      .eq("parent_user_id", parentUserId);

    if (issueDeleteError) {
      throw issueDeleteError;
    }
  }

  if (suggestionIds.length > 0) {
    const { error: suggestionDeleteError } = await admin
      .from("writing_issue_suggestions")
      .delete()
      .in("id", suggestionIds)
      .eq("parent_user_id", parentUserId);

    if (suggestionDeleteError) {
      throw suggestionDeleteError;
    }
  }

  if (submissionIds.length > 0 || sampleIds.length > 0) {
    let verificationDeleteQuery = admin
      .from("parent_verifications")
      .delete()
      .eq("parent_user_id", parentUserId)
      .eq("child_id", childId);

    if (submissionIds.length > 0) {
      verificationDeleteQuery = verificationDeleteQuery.in("task_submission_id", submissionIds);
    }

    if (sampleIds.length > 0) {
      verificationDeleteQuery = verificationDeleteQuery.in("writing_sample_id", sampleIds);
    }

    const { error: verificationDeleteError } = await verificationDeleteQuery;

    if (verificationDeleteError) {
      throw verificationDeleteError;
    }
  }

  if (sampleIds.length > 0) {
    const { error: misspellingDeleteError } = await admin
      .from("misspelling_instances")
      .delete()
      .in("writing_sample_id", sampleIds)
      .eq("parent_user_id", parentUserId);

    if (misspellingDeleteError) {
      throw misspellingDeleteError;
    }

    const { error: sampleDeleteError } = await admin
      .from("writing_samples")
      .delete()
      .in("id", sampleIds)
      .eq("parent_user_id", parentUserId);

    if (sampleDeleteError) {
      throw sampleDeleteError;
    }
  }

  const { error: submissionDeleteError } = await admin
    .from("task_submissions")
    .delete()
    .in("id", submissionIds)
    .eq("parent_user_id", parentUserId);

  if (submissionDeleteError) {
    throw submissionDeleteError;
  }
}

export async function seedStage7CLessonSubmissionFixture(
  admin,
  {
    parentUserId,
    childId,
    scope = "stage7c",
    reviewStatus = "pending",
    withLinkedSample = true,
    withMisspellings = true,
    withPendingSuggestion = true,
    withDurableIssue = true,
    sampleText = "I hav a dog and I lik to run on the gras after school.",
  },
) {
  const { courseId, taskId } = await ensureReviewCourseTask(admin, {
    parentUserId,
    childId,
    scope,
  });

  const submittedAt = new Date().toISOString();

  const { data: submission, error: submissionError } = await admin
    .from("task_submissions")
    .insert({
      task_id: taskId,
      course_id: courseId,
      child_id: childId,
      parent_user_id: parentUserId,
      submission_text: sampleText,
      submitted_at: submittedAt,
      parent_review_status: reviewStatus,
      parent_review_note:
        reviewStatus === "pending" ? null : "Stage 7C reviewed fixture note",
      parent_reviewed_at: reviewStatus === "pending" ? null : submittedAt,
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    throw submissionError ?? new Error("Failed to create Stage 7C submission.");
  }

  let writingSample = null;

  if (withLinkedSample) {
    const { data: insertedWritingSample, error: writingSampleError } = await admin
      .from("writing_samples")
      .insert({
        child_id: childId,
        parent_user_id: parentUserId,
        title: "Lesson submission",
        sample_text: sampleText,
        source: "Course task submission",
        written_at: submittedAt.slice(0, 10),
        task_submission_id: submission.id,
      })
      .select("id")
      .single();

    if (writingSampleError || !insertedWritingSample) {
      throw writingSampleError ?? new Error("Failed to create Stage 7C writing sample.");
    }

    writingSample = insertedWritingSample;
  }

  const misspellingInserts = withLinkedSample && withMisspellings ? [
    {
      writing_sample_id: writingSample.id,
      child_id: childId,
      parent_user_id: parentUserId,
      misspelled_word: "hav",
      corrected_word: "have",
      suggested_word: "have",
      error_type: "Phonic",
      secondary_error_type: null,
      confidence_score: 1,
      is_false_positive: false,
      is_parent_overridden: false,
      context_text: "I hav a dog",
      position_start: 2,
      position_end: 5,
      notes: "Stage 7C candidate fixture",
    },
    {
      writing_sample_id: writingSample.id,
      child_id: childId,
      parent_user_id: parentUserId,
      misspelled_word: "lik",
      corrected_word: "like",
      suggested_word: "like",
      error_type: "Pattern/rule",
      secondary_error_type: null,
      confidence_score: 1,
      is_false_positive: false,
      is_parent_overridden: false,
      context_text: "I lik to run",
      position_start: 14,
      position_end: 17,
      notes: "Stage 7C unresolved fixture",
    },
    {
      writing_sample_id: writingSample.id,
      child_id: childId,
      parent_user_id: parentUserId,
      misspelled_word: "gras",
      corrected_word: "grass",
      suggested_word: "grass",
      error_type: "Pattern/rule",
      secondary_error_type: null,
      confidence_score: 1,
      is_false_positive: false,
      is_parent_overridden: false,
      context_text: "the gras after school",
      position_start: 30,
      position_end: 34,
      notes: "Stage 7C durable fixture",
    },
  ] : [];

  let misspellingByWord = new Map();

  if (misspellingInserts.length > 0) {
    const { data: misspellings, error: misspellingError } = await admin
      .from("misspelling_instances")
      .insert(misspellingInserts)
      .select("id, misspelled_word");

    if (misspellingError || !misspellings || misspellings.length !== misspellingInserts.length) {
      throw misspellingError ?? new Error("Failed to create Stage 7C misspellings.");
    }

    misspellingByWord = new Map(
      misspellings.map((row) => [row.misspelled_word, row.id]),
    );
  }

  if (withLinkedSample && withPendingSuggestion) {
    const { data: unresolvedSuggestion, error: suggestionError } = await admin
      .from("writing_issue_suggestions")
      .insert({
        child_id: childId,
        parent_user_id: parentUserId,
        task_submission_id: submission.id,
        writing_sample_id: writingSample.id,
        misspelling_instance_id: misspellingByWord.get("lik") ?? null,
        source_type: "misspelling_instance",
        suggestion_status: "pending",
        observed_text: "lik",
        suggested_replacement: "like",
        suggested_micro_skill_key: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
        notes: "Stage 7C unresolved suggestion fixture",
      })
      .select("id")
      .single();

    if (suggestionError || !unresolvedSuggestion) {
      throw suggestionError ?? new Error("Failed to create Stage 7C suggestion.");
    }
  }

  if (withLinkedSample && withDurableIssue) {
    const issueStatus = reviewStatus === "pending" ? "finalised" : "finalised";
    const { error: durableIssueError } = await admin.from("writing_issues").insert({
      child_id: childId,
      parent_user_id: parentUserId,
      task_submission_id: submission.id,
      writing_sample_id: writingSample.id,
      source_misspelling_instance_id: misspellingByWord.get("gras") ?? null,
      issue_status: issueStatus,
      final_classification: "fragile_knowledge",
      observed_text: "gras",
      suggested_replacement: "grass",
      approved_replacement: "grass",
      micro_skill_key: "unknown",
      parent_review_note: "Stage 7C durable issue fixture",
      parent_marked_at: submittedAt,
      final_classified_at: submittedAt,
    });

    if (durableIssueError) {
      throw durableIssueError;
    }
  }

  return {
    submissionId: submission.id,
    writingSampleId: writingSample?.id ?? null,
  };
}

export async function seedManualWritingSampleFixture(
  admin,
  {
    parentUserId,
    childId,
    sampleText,
    source = "Add Writing Sample",
    title = "Manual writing sample",
    writtenAt = new Date().toISOString().slice(0, 10),
  },
) {
  const { data: writingSample, error } = await admin
    .from("writing_samples")
    .insert({
      child_id: childId,
      parent_user_id: parentUserId,
      title,
      sample_text: sampleText,
      source,
      written_at: writtenAt,
      task_submission_id: null,
    })
    .select("id")
    .single();

  if (error || !writingSample) {
    throw error ?? new Error("Failed to create manual writing sample fixture.");
  }

  return writingSample.id;
}

export async function fetchManualWritingSamples(admin, { parentUserId, childId, sampleText }) {
  const { data, error } = await admin
    .from("writing_samples")
    .select("id, title, source, sample_text, written_at, task_submission_id")
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("title", "Manual writing sample")
    .eq("source", "Add Writing Sample")
    .eq("sample_text", sampleText)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchMisspellingInstances(admin, { parentUserId, childId, writingSampleId }) {
  const { data, error } = await admin
    .from("misspelling_instances")
    .select("id, misspelled_word, corrected_word")
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("writing_sample_id", writingSampleId);

  if (error) {
    throw error;
  }

  return data ?? [];
}
