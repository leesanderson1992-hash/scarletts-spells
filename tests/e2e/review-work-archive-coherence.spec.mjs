import { expect, test } from "@playwright/test";

import {
  cleanupManualWritingSamples,
  cleanupStage7CSubmissionFixtures,
  createAdminClient,
  ensureChild,
  ensureParentUser,
  fetchManualWritingSamples,
  readLocalE2EConfig,
  seedStage7CLessonSubmissionFixture,
} from "./support/local-supabase.mjs";

test("Stage 7E.2 Review Work archive presentation stays coherent with detail truth", async ({
  page,
}) => {
  const scope = "stage7e2archive";
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
    withPendingSuggestion: false,
    withDurableIssue: false,
  });

  const { data: lessonSample } = await admin
    .from("writing_samples")
    .select("id")
    .eq("task_submission_id", lessonFixture.submissionId)
    .eq("parent_user_id", parentUserId)
    .single();

  if (!lessonSample) {
    throw new Error("Missing lesson writing sample for Stage 7E.2 fixture.");
  }

  const { data: lessonMisspellings } = await admin
    .from("misspelling_instances")
    .select("id, misspelled_word")
    .eq("parent_user_id", parentUserId)
    .eq("writing_sample_id", lessonSample.id);

  const removableMisspellingIds = (lessonMisspellings ?? [])
    .filter((row) => row.misspelled_word !== "hav")
    .map((row) => row.id);

  if (removableMisspellingIds.length > 0) {
    const { error: deleteLessonMisspellingsError } = await admin
      .from("misspelling_instances")
      .delete()
      .in("id", removableMisspellingIds)
      .eq("parent_user_id", parentUserId);

    if (deleteLessonMisspellingsError) {
      throw deleteLessonMisspellingsError;
    }
  }

  await page.goto(`/courses/review/${lessonFixture.submissionId}?child=${childId}`);
  await expect(
    page.getByRole("heading", { name: "Shared outputs for this lesson submission" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Not a learning issue" }).first().click();
  await expect(
    page.getByText("Parent verification recorded as not a learning issue."),
  ).toBeVisible();

  await page.goto(`/courses/review?child=${childId}`);
  const lessonLiveCard = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Stage7C stage7e2archive Lesson Submission",
      exact: true,
    }),
  });
  await expect(lessonLiveCard).toHaveCount(0);
  await page.getByText("Completed review history").click();
  const lessonArchiveCard = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Stage7C stage7e2archive Lesson Submission",
      exact: true,
    }),
  });
  await expect(lessonArchiveCard).toHaveCount(1);
  await expect(lessonArchiveCard.getByText("Reviewed")).toBeVisible();

  const manualSampleText = "I hav.";
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

  const { error: manualMisspellingError } = await admin.from("misspelling_instances").insert({
    writing_sample_id: manualSamples[0].id,
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
    notes: "Stage 7E.2 manual archive coherence fixture",
  });

  if (manualMisspellingError) {
    throw manualMisspellingError;
  }

  await page.goto(`/courses/review/sample_${manualSamples[0].id}?child=${childId}`);
  await expect(
    page.getByRole("heading", { name: "Shared outputs for this manual writing sample" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "False positive" }).first().click();
  await expect(page.getByText("Parent verification recorded as false positive.")).toBeVisible();

  await page.goto(`/courses/review?child=${childId}`);
  const manualLiveCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Manual writing sample", exact: true }),
  });
  await expect(manualLiveCard).toHaveCount(0);
  await page.getByText("Completed review history").click();
  const manualArchiveCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Manual writing sample", exact: true }),
  });
  await expect(manualArchiveCard).toHaveCount(1);
  await expect(manualArchiveCard.getByText("Reviewed")).toBeVisible();
});
