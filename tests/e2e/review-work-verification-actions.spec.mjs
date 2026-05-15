import { expect, test } from "@playwright/test";

import {
  cleanupManualWritingSamples,
  cleanupStage7CSubmissionFixtures,
  createAdminClient,
  ensureChild,
  ensureParentUser,
  fetchManualWritingSamples,
  fetchMisspellingInstances,
  getScopedTableCounts,
  readLocalE2EConfig,
  seedManualWritingSampleFixture,
  seedStage7CLessonSubmissionFixture,
} from "./support/local-supabase.mjs";

test("Stage 7D.1 Review Work reuses canonical non-override parent verification actions", async ({
  page,
}) => {
  const scope = "stage7d1-verification";
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

  const beforeLessonCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
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
  await expect(
    page.getByText("Parent verification recorded: accepted", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText("1 parent verification", { exact: false })).toBeVisible();
  await expect(
    page,
  ).toHaveURL(new RegExp(`/courses/review/${lessonFixture.submissionId}\\?child=${childId}`));
  await expect(
    page.getByRole("heading", { name: "Shared outputs for this lesson submission" }),
  ).toBeVisible();

  const afterLessonCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  expect(afterLessonCounts.parent_verifications).toBe(beforeLessonCounts.parent_verifications + 1);
  expect(afterLessonCounts.writing_issues).toBe(beforeLessonCounts.writing_issues + 1);
  expect(afterLessonCounts.writing_issue_suggestions).toBe(beforeLessonCounts.writing_issue_suggestions);
  expect(afterLessonCounts.writing_issue_correction_attempts).toBe(
    beforeLessonCounts.writing_issue_correction_attempts,
  );
  expect(afterLessonCounts.learning_items).toBe(beforeLessonCounts.learning_items);
  expect(afterLessonCounts.learning_item_evidence).toBe(
    beforeLessonCounts.learning_item_evidence,
  );
  expect(afterLessonCounts.learning_item_issue_links).toBe(
    beforeLessonCounts.learning_item_issue_links,
  );
  expect(afterLessonCounts.assignment_items).toBe(beforeLessonCounts.assignment_items);
  expect(afterLessonCounts.spelling_reward_states).toBe(
    beforeLessonCounts.spelling_reward_states,
  );
  expect(afterLessonCounts.spelling_reward_events).toBe(
    beforeLessonCounts.spelling_reward_events,
  );

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

  const beforeManualCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  await page.goto(`/courses/review/sample_${manualSamples[0].id}?child=${childId}`);
  await expect(
    page,
  ).toHaveURL(new RegExp(`/courses/review/sample_${manualSamples[0].id}\\?child=${childId}`));
  await expect(
    page.getByRole("heading", { name: "Manual writing sample", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Shared outputs for this manual writing sample" }),
  ).toBeVisible();
  await expect(page.getByText("Source type")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "False positive" }).first()).toBeVisible();
  await page.getByRole("button", { name: "False positive" }).first().click();

  await expect(page.getByText("Parent verification recorded as false positive.")).toBeVisible();
  await expect(
    page.getByText("Parent verification recorded: false positive", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText("1 parent verification", { exact: false })).toBeVisible();

  const afterManualCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  expect(afterManualCounts.parent_verifications).toBe(beforeManualCounts.parent_verifications + 1);
  expect(afterManualCounts.writing_issues).toBe(beforeManualCounts.writing_issues);
  expect(afterManualCounts.writing_issue_suggestions).toBe(beforeManualCounts.writing_issue_suggestions);
  expect(afterManualCounts.writing_issue_correction_attempts).toBe(
    beforeManualCounts.writing_issue_correction_attempts,
  );
  expect(afterManualCounts.learning_items).toBe(beforeManualCounts.learning_items);
  expect(afterManualCounts.learning_item_evidence).toBe(
    beforeManualCounts.learning_item_evidence,
  );
  expect(afterManualCounts.learning_item_issue_links).toBe(
    beforeManualCounts.learning_item_issue_links,
  );
  expect(afterManualCounts.assignment_items).toBe(beforeManualCounts.assignment_items);
  expect(afterManualCounts.spelling_reward_states).toBe(
    beforeManualCounts.spelling_reward_states,
  );
  expect(afterManualCounts.spelling_reward_events).toBe(
    beforeManualCounts.spelling_reward_events,
  );
});

test("Stage 7D.2 Review Work reuses canonical override verification flow", async ({
  page,
}) => {
  const scope = "stage7d2-override";
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

  const beforeLessonCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  await page.goto(`/courses/review/${lessonFixture.submissionId}?child=${childId}`);
  await expect(
    page.getByRole("heading", { name: "Shared outputs for this lesson submission" }),
  ).toBeVisible();
  const lessonCandidateCard = page
    .locator("div.rounded-2xl")
    .filter({ has: page.getByText("hav -> have", { exact: true }) })
    .first();
  await expect(lessonCandidateCard).toBeVisible();
  await lessonCandidateCard.getByText("Override shared verification").click();
  await lessonCandidateCard
    .getByLabel("Verified micro-skill key")
    .fill("D4_PG_LONG_AI_FINAL_AY");
  await lessonCandidateCard.getByRole("button", { name: "Save override" }).click();

  await expect(page.getByText("Parent verification recorded as overridden.")).toBeVisible();
  await expect(
    page.getByText("Parent verification recorded: overridden", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText("1 parent verification", { exact: false })).toBeVisible();

  const afterLessonCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  expect(afterLessonCounts.parent_verifications).toBe(beforeLessonCounts.parent_verifications + 1);
  expect(afterLessonCounts.writing_issues).toBe(beforeLessonCounts.writing_issues + 1);
  expect(afterLessonCounts.writing_issue_suggestions).toBe(
    beforeLessonCounts.writing_issue_suggestions,
  );
  expect(afterLessonCounts.writing_issue_correction_attempts).toBe(
    beforeLessonCounts.writing_issue_correction_attempts,
  );
  expect(afterLessonCounts.learning_items).toBe(beforeLessonCounts.learning_items);
  expect(afterLessonCounts.learning_item_evidence).toBe(
    beforeLessonCounts.learning_item_evidence,
  );
  expect(afterLessonCounts.learning_item_issue_links).toBe(
    beforeLessonCounts.learning_item_issue_links,
  );
  expect(afterLessonCounts.assignment_items).toBe(beforeLessonCounts.assignment_items);
  expect(afterLessonCounts.spelling_reward_states).toBe(
    beforeLessonCounts.spelling_reward_states,
  );
  expect(afterLessonCounts.spelling_reward_events).toBe(
    beforeLessonCounts.spelling_reward_events,
  );

  const manualSampleText = "I hav a fox and I lik to jump in the gras again.";
  const manualSampleId = await seedManualWritingSampleFixture(admin, {
    parentUserId,
    childId,
    sampleText: manualSampleText,
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
    context_text: "I hav a fox",
    position_start: 2,
    position_end: 5,
    notes: "Stage 7D.2 manual override fixture",
  });

  if (manualMisspellingError) {
    throw manualMisspellingError;
  }

  const manualMisspellings = await fetchMisspellingInstances(admin, {
    parentUserId,
    childId,
    writingSampleId: manualSampleId,
  });
  expect(manualMisspellings).toHaveLength(1);

  const beforeManualCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  await page.goto(`/courses/review/sample_${manualSampleId}?child=${childId}`);
  await expect(
    page,
  ).toHaveURL(new RegExp(`/courses/review/sample_${manualSampleId}\\?child=${childId}`));
  await expect(
    page.getByRole("heading", { name: "Shared outputs for this manual writing sample" }),
  ).toBeVisible();
  const manualCandidateCard = page
    .locator("div.rounded-2xl")
    .filter({ has: page.getByText("hav -> have", { exact: true }) })
    .first();
  await expect(manualCandidateCard).toBeVisible();
  await manualCandidateCard.getByText("Override shared verification").click();
  await manualCandidateCard
    .getByLabel("Verified micro-skill key")
    .fill("D4_PG_LONG_AI_FINAL_AY");
  await manualCandidateCard.getByRole("button", { name: "Save override" }).click();

  await expect(page.getByText("Parent verification recorded as overridden.")).toBeVisible();
  await expect(
    page.getByText("Parent verification recorded: overridden", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText("1 parent verification", { exact: false })).toBeVisible();

  const afterManualCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  expect(afterManualCounts.parent_verifications).toBe(beforeManualCounts.parent_verifications + 1);
  expect(afterManualCounts.writing_issues).toBe(beforeManualCounts.writing_issues);
  expect(afterManualCounts.writing_issue_suggestions).toBe(
    beforeManualCounts.writing_issue_suggestions,
  );
  expect(afterManualCounts.writing_issue_correction_attempts).toBe(
    beforeManualCounts.writing_issue_correction_attempts,
  );
  expect(afterManualCounts.learning_items).toBe(beforeManualCounts.learning_items);
  expect(afterManualCounts.learning_item_evidence).toBe(
    beforeManualCounts.learning_item_evidence,
  );
  expect(afterManualCounts.learning_item_issue_links).toBe(
    beforeManualCounts.learning_item_issue_links,
  );
  expect(afterManualCounts.assignment_items).toBe(beforeManualCounts.assignment_items);
  expect(afterManualCounts.spelling_reward_states).toBe(
    beforeManualCounts.spelling_reward_states,
  );
  expect(afterManualCounts.spelling_reward_events).toBe(
    beforeManualCounts.spelling_reward_events,
  );
});

test("Stage 7D.3 Review Work detail reflects not-a-learning-issue through shared verification truth", async ({
  page,
}) => {
  const scope = "stage7d3-read-after-write";
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

  const beforeCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  await page.goto(`/courses/review/${lessonFixture.submissionId}?child=${childId}`);
  await expect(
    page.getByRole("heading", { name: "Shared outputs for this lesson submission" }),
  ).toBeVisible();
  const candidateCard = page
    .locator("div.rounded-2xl")
    .filter({ has: page.getByText("hav -> have", { exact: true }) })
    .first();
  await expect(candidateCard).toBeVisible();
  await candidateCard.getByRole("button", { name: "Not a learning issue" }).click();

  await expect(
    page.getByText("Parent verification recorded as not a learning issue."),
  ).toBeVisible();
  await expect(
    page.getByText("Parent verification recorded: not a learning issue", {
      exact: false,
    }).first(),
  ).toBeVisible();
  await expect(page.getByText("1 parent verification", { exact: false })).toBeVisible();

  const afterCounts = await getScopedTableCounts(admin, {
    parentUserId,
    childId,
  });

  expect(afterCounts.parent_verifications).toBe(beforeCounts.parent_verifications + 1);
  expect(afterCounts.writing_issues).toBe(beforeCounts.writing_issues);
  expect(afterCounts.writing_issue_suggestions).toBe(beforeCounts.writing_issue_suggestions);
  expect(afterCounts.writing_issue_correction_attempts).toBe(
    beforeCounts.writing_issue_correction_attempts,
  );
  expect(afterCounts.learning_items).toBe(beforeCounts.learning_items);
  expect(afterCounts.learning_item_evidence).toBe(beforeCounts.learning_item_evidence);
  expect(afterCounts.learning_item_issue_links).toBe(beforeCounts.learning_item_issue_links);
  expect(afterCounts.assignment_items).toBe(beforeCounts.assignment_items);
  expect(afterCounts.spelling_reward_states).toBe(beforeCounts.spelling_reward_states);
  expect(afterCounts.spelling_reward_events).toBe(beforeCounts.spelling_reward_events);
});
