import { expect, test } from "@playwright/test";

import {
  cleanupManualWritingSamples,
  cleanupStage7CSubmissionFixtures,
  createAdminClient,
  ensureChild,
  ensureParentUser,
  readLocalE2EConfig,
  seedManualWritingSampleFixture,
  seedStage7CLessonSubmissionFixture,
} from "./support/local-supabase.mjs";

test("Stage 7E.1 Review Work queue projection stays coherent with detail after verification actions", async ({
  page,
}) => {
  const scope = "stage7e1queue";
  const config = readLocalE2EConfig();
  const admin = createAdminClient(config);
  const parentUserId = await ensureParentUser(admin, {
    email: config.email,
    password: config.password,
  });
  const childId = await ensureChild(admin, { parentUserId, scope });

  await cleanupManualWritingSamples(admin, { parentUserId, childId });
  await cleanupStage7CSubmissionFixtures(admin, { parentUserId, childId, scope });


  const lessonFixture = await seedStage7CLessonSubmissionFixture(admin, {
    parentUserId,
    childId,
    scope,
  });

  const { data: seededLessonSubmission } = await admin
    .from("task_submissions")
    .select("id")
    .eq("id", lessonFixture.submissionId)
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .maybeSingle();

  expect(seededLessonSubmission?.id).toBe(lessonFixture.submissionId);

  await page.goto(`/courses/review/${lessonFixture.submissionId}?child=${childId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page,
  ).toHaveURL(new RegExp(`/courses/review/${lessonFixture.submissionId}\\?child=${childId}`));
  await expect(
    page.getByRole("heading", { name: "Shared outputs for this lesson submission" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Parent verification recorded as accepted.")).toBeVisible();

  await page.goto(`/courses/review?child=${childId}`);
  const lessonCard = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Stage7C stage7e1queue Lesson Submission",
      exact: true,
    }),
  });

  await expect(lessonCard).toHaveCount(1);
  await expect(lessonCard.getByText("Needs review")).toBeVisible();
  await expect(lessonCard.getByText("1 unresolved suggestion")).toBeVisible();

  const manualSampleId = await seedManualWritingSampleFixture(admin, {
    parentUserId,
    childId,
    sampleText: "I hav.",
  });

  const { error: manualMisspellingError } = await admin.from("misspelling_instances").insert({
    writing_sample_id: manualSampleId,
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
    context_text: "I hav.",
    position_start: 2,
    position_end: 5,
    notes: "Stage 7E.1 manual queue coherence fixture",
  });

  if (manualMisspellingError) {
    throw manualMisspellingError;
  }

  await page.goto(`/courses/review?child=${childId}`);
  const seededManualReviewPath = `/courses/review/sample_${manualSampleId}?child=${childId}`;
  const manualCard = page.locator(`article:has(a[href="${seededManualReviewPath}"])`);

  await expect(manualCard).toHaveCount(1);
  await expect(manualCard.getByText("Needs review")).toBeVisible();
  await expect(manualCard.getByText("1 unresolved suggestion")).toBeVisible();
  await page.goto(seededManualReviewPath);

  await expect(
    page.getByRole("heading", { name: "Shared outputs for this manual writing sample" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "False positive" }).first().click();
  await expect(page.getByText("Parent verification recorded as false positive.")).toBeVisible();

  await page.goto(`/courses/review?child=${childId}`);
  await expect(
    page.locator("article").filter({
      has: page.getByRole("heading", { name: "Manual writing sample", exact: true }),
    }),
  ).toHaveCount(0);
});
