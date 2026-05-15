import { expect, test } from "@playwright/test";

import {
  cleanupManualWritingSamples,
  cleanupStage7CSubmissionFixtures,
  createAdminClient,
  ensureChild,
  ensureParentUser,
  fetchManualWritingSamples,
  getScopedTableCounts,
  readLocalE2EConfig,
  seedManualWritingSampleFixture,
  seedStage7CLessonSubmissionFixture,
} from "./support/local-supabase.mjs";

test("Stage 7C Review Work detail shows a canonical suggested-issues panel without render-time writes", async ({
  page,
}) => {
  const scope = "stage7c-detail-available";
  const config = readLocalE2EConfig();
  const admin = createAdminClient(config);
  const parentUserId = await ensureParentUser(admin, {
    email: config.email,
    password: config.password,
  });
  const childId = await ensureChild(admin, { parentUserId, scope });

  await cleanupManualWritingSamples(admin, { parentUserId, childId });
  await cleanupStage7CSubmissionFixtures(admin, { parentUserId, childId, scope });


  const manualSampleText = "I hav a fox and I lik to jump in the gras.";

  await page.goto(`/analyse?child=${childId}`);
  await page.getByLabel("Writing sample").fill(manualSampleText);
  await page.getByRole("button", { name: "Save and open Review Work" }).click();

  await expect(page).toHaveURL(new RegExp(`/courses/review\\?child=${childId}`));

  const manualSamples = await fetchManualWritingSamples(admin, {
    parentUserId,
    childId,
    sampleText: manualSampleText,
  });

  expect(manualSamples).toHaveLength(1);

  const manualBeforeCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  await page.goto(`/courses/review/sample_${manualSamples[0].id}?child=${childId}`);

  await expect(
    page.getByRole("heading", {
      name: "Shared outputs for this manual writing sample",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Suggested / candidate", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Durable issue", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Unresolved", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Parent verification", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Shared outputs plus parent verification actions")).toBeVisible();
  await expect(page.getByText("hav -> have")).toBeVisible();

  await expect(page.getByRole("button", { name: "False positive" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Not a learning issue" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await expect(page.getByText("Override shared verification").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /assign|practice|resolve/i })).toHaveCount(0);

  const manualAfterCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  expect(manualAfterCounts).toEqual(manualBeforeCounts);

  const lessonFixture = await seedStage7CLessonSubmissionFixture(admin, {
    parentUserId,
    childId,
    scope,
  });

  const lessonBeforeCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  await page.goto(`/courses/review/${lessonFixture.submissionId}?child=${childId}`);

  await expect(
    page.getByRole("heading", {
      name: "Shared outputs for this lesson submission",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Suggested / candidate", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Durable issue", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Unresolved", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Parent verification", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Shared outputs plus parent verification actions")).toBeVisible();
  await expect(page.getByText("hav -> have")).toBeVisible();
  await expect(page.getByText("lik", { exact: true })).toBeVisible();
  await expect(page.getByText("gras", { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();
  await expect(page.getByRole("button", { name: "False positive" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Not a learning issue" }).first()).toBeVisible();
  await expect(page.getByText("Override shared verification").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /assign|practice|resolve|accept into durable issue|reject suggestion/i }),
  ).toHaveCount(0);

  const lessonAfterCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  expect(lessonAfterCounts).toEqual(lessonBeforeCounts);
});

test("Stage 7C Review Work detail shows reviewed/history state without reopening actions", async ({
  page,
}) => {
  const scope = "stage7c-detail-states";
  const config = readLocalE2EConfig();
  const admin = createAdminClient(config);
  const parentUserId = await ensureParentUser(admin, {
    email: config.email,
    password: config.password,
  });
  const childId = await ensureChild(admin, { parentUserId, scope });

  await cleanupManualWritingSamples(admin, { parentUserId, childId });
  await cleanupStage7CSubmissionFixtures(admin, { parentUserId, childId, scope });


  const reviewedFixture = await seedStage7CLessonSubmissionFixture(admin, {
    parentUserId,
    childId,
    scope: `${scope}-reviewed`,
    reviewStatus: "approved",
  });

  await page.goto(`/courses/review/${reviewedFixture.submissionId}?child=${childId}`);
  await expect(page.getByText("Already reviewed")).toBeVisible();
  await expect(
    page.getByText("Shared outputs remain visible here as history only."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Suggested / candidate", exact: true }),
  ).toBeVisible();
});

test("Stage 7C Review Work detail shows no-outputs-yet state for lesson submissions without shared outputs", async ({
  page,
}) => {
  const scope = "stage7c-detail-states";
  const config = readLocalE2EConfig();
  const admin = createAdminClient(config);
  const parentUserId = await ensureParentUser(admin, {
    email: config.email,
    password: config.password,
  });
  const childId = await ensureChild(admin, { parentUserId, scope });

  await cleanupManualWritingSamples(admin, { parentUserId, childId });
  await cleanupStage7CSubmissionFixtures(admin, { parentUserId, childId, scope });

  const noOutputsFixture = await seedStage7CLessonSubmissionFixture(admin, {
    parentUserId,
    childId,
    scope: `${scope}-no-outputs`,
    withLinkedSample: false,
    withMisspellings: false,
    withPendingSuggestion: false,
    withDurableIssue: false,
    sampleText: "This lesson exists before shared outputs are attached.",
  });

  const { data: noOutputsSubmission } = await admin
    .from("task_submissions")
    .select("id")
    .eq("id", noOutputsFixture.submissionId)
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .maybeSingle();

  expect(noOutputsSubmission?.id).toBe(noOutputsFixture.submissionId);

  await page.goto(`/courses/review/${noOutputsFixture.submissionId}?child=${childId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page,
  ).toHaveURL(new RegExp(`/courses/review/${noOutputsFixture.submissionId}\\?child=${childId}`));
  await expect(
    page.getByRole("heading", { name: "No shared outputs yet", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("canonical writing sample is not attached yet", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Suggested / candidate", exact: true }),
  ).toHaveCount(0);
});

test("Stage 7C Review Work detail shows empty-result state for manual writing samples with no suggestions", async ({
  page,
}) => {
  const scope = "stage7c-detail-states";
  const config = readLocalE2EConfig();
  const admin = createAdminClient(config);
  const parentUserId = await ensureParentUser(admin, {
    email: config.email,
    password: config.password,
  });
  const childId = await ensureChild(admin, { parentUserId, scope });

  await cleanupManualWritingSamples(admin, { parentUserId, childId });
  await cleanupStage7CSubmissionFixtures(admin, { parentUserId, childId, scope });

  const emptyResultSampleId = await seedManualWritingSampleFixture(admin, {
    parentUserId,
    childId,
    sampleText: "The cat sat on the mat.",
  });

  await page.goto(`/courses/review/sample_${emptyResultSampleId}?child=${childId}`);
  await expect(
    page.getByRole("heading", { name: "No suggested issues returned", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("did not produce visible suggested issues", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Suggested / candidate", exact: true }),
  ).toHaveCount(0);
});
