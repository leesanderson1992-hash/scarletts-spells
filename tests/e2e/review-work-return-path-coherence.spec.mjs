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

test("Stage 7E.3 Review Work return path keeps queue counts and row visibility coherent", async ({
  page,
}) => {
  const scope = "stage7e3return";
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

  await page.goto(`/courses/review/${lessonFixture.submissionId}?child=${childId}`);
  const unresolvedCard = page
    .locator("div.rounded-2xl")
    .filter({ has: page.getByText("lik", { exact: true }) })
    .filter({ has: page.getByText("Stage 7C unresolved suggestion fixture", { exact: true }) })
    .first();
  await expect(unresolvedCard).toBeVisible();
  await unresolvedCard.getByRole("button", { name: "Accept" }).click();

  await expect(page.getByText("Parent verification recorded as accepted.")).toBeVisible();
  await page.getByRole("link", { name: "Back to review list" }).click();

  await expect(page).toHaveURL(new RegExp(`/courses/review\\?child=${childId}`));
  const summaryCard = page.locator("div.brand-card").first();
  await expect(summaryCard.getByText("1 need review", { exact: false })).toBeVisible();
  await expect(summaryCard.getByText("0 archived", { exact: false })).toBeVisible();

  const lessonCard = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Stage7C stage7e3return Lesson Submission",
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
    notes: "Stage 7E.3 return-path fixture",
  });

  if (manualMisspellingError) {
    throw manualMisspellingError;
  }

  await page.goto(`/courses/review/sample_${manualSampleId}?child=${childId}`);
  await expect(
    page.getByRole("heading", { name: "Shared outputs for this manual writing sample" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "False positive" }).first().click();
  await expect(page.getByText("Parent verification recorded as false positive.")).toBeVisible();
  await page.getByRole("link", { name: "Back to review list" }).click();

  await expect(page).toHaveURL(new RegExp(`/courses/review\\?child=${childId}`));
  await expect(summaryCard.getByText("1 need review", { exact: false })).toBeVisible();
  await expect(summaryCard.getByText("1 archived", { exact: false })).toBeVisible();
  await expect(lessonCard).toHaveCount(1);
  const liveReviewSection = page.locator("section.brand-card").filter({
    has: page.getByRole("heading", { name: "Latest live review work", exact: true }),
  });
  await expect(
    liveReviewSection.locator(
      `article:has(a[href="/courses/review/sample_${manualSampleId}?child=${childId}"])`,
    ),
  ).toHaveCount(0);

  await page.getByText("Completed review history").click();
  const manualArchiveCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Manual writing sample", exact: true }),
  });
  await expect(manualArchiveCard).toHaveCount(1);
  await expect(manualArchiveCard.getByText("Reviewed")).toBeVisible();
});
