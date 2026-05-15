import { test, expect } from "@playwright/test";

import {
  cleanupManualWritingSamples,
  createAdminClient,
  ensureChild,
  ensureParentUser,
  fetchManualWritingSamples,
  fetchMisspellingInstances,
  getScopedTableCounts,
  readLocalE2EConfig,
} from "./support/local-supabase.mjs";

test("Stage 7A Add Writing Sample intake saves canonical writing_sample truth and only shared analysis output", async ({
  page,
}) => {
  const scope = "stage7a-intake";
  const config = readLocalE2EConfig();
  const admin = createAdminClient(config);
  const parentUserId = await ensureParentUser(admin, {
    email: config.email,
    password: config.password,
  });
  const childId = await ensureChild(admin, { parentUserId, scope });

  await cleanupManualWritingSamples(admin, { parentUserId, childId });

  const baselineCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  const sampleText = "I hav a cat and I lik to pla in the sun.";


  await page.goto(`/analyse?child=${childId}`);

  await expect(
    page.getByRole("heading", { name: "Paste paper-written work for later review" }),
  ).toBeVisible();
  await expect(page.getByText("Intake only")).toBeVisible();
  await expect(page.getByText("Review happens in Review Work")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save and open Review Work" })).toBeVisible();
  await expect(
    page.getByText("Saving this sample creates canonical writing-sample truth"),
  ).toBeVisible();

  await page.getByLabel("Writing sample").fill(sampleText);
  await page.getByRole("button", { name: "Save and open Review Work" }).click();

  await expect(page).toHaveURL(new RegExp(`/courses/review\\?child=${childId}`));
  await expect(
    page.getByText("Writing sample saved. Review Work is ready when you are."),
  ).toBeVisible();

  const writingSamples = await fetchManualWritingSamples(admin, {
    parentUserId,
    childId,
    sampleText,
  });

  expect(writingSamples).toHaveLength(1);
  expect(writingSamples[0].title).toBe("Manual writing sample");
  expect(writingSamples[0].source).toBe("Add Writing Sample");
  expect(writingSamples[0].sample_text).toBe(sampleText);
  expect(writingSamples[0].written_at).toBeTruthy();
  expect(writingSamples[0].task_submission_id).toBeNull();

  const misspellingInstances = await fetchMisspellingInstances(admin, {
    parentUserId,
    childId,
    writingSampleId: writingSamples[0].id,
  });

  expect(misspellingInstances.length).toBeGreaterThan(0);

  const afterCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  expect(afterCounts.parent_verifications).toBe(baselineCounts.parent_verifications);
  expect(afterCounts.writing_issues).toBe(baselineCounts.writing_issues);
  expect(afterCounts.writing_issue_suggestions).toBe(baselineCounts.writing_issue_suggestions);
  expect(afterCounts.learning_items).toBe(baselineCounts.learning_items);
  expect(afterCounts.learning_item_evidence).toBe(baselineCounts.learning_item_evidence);
  expect(afterCounts.learning_item_issue_links).toBe(baselineCounts.learning_item_issue_links);
  expect(afterCounts.assignment_items).toBe(baselineCounts.assignment_items);
  expect(afterCounts.spelling_reward_states).toBe(baselineCounts.spelling_reward_states);
  expect(afterCounts.spelling_reward_events).toBe(baselineCounts.spelling_reward_events);
});
