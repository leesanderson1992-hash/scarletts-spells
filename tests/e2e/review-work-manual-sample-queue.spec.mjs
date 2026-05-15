import { expect, test } from "@playwright/test";

import {
  cleanupManualWritingSamples,
  createAdminClient,
  ensureChild,
  ensureParentUser,
  fetchManualWritingSamples,
  readLocalE2EConfig,
} from "./support/local-supabase.mjs";

test("Stage 7B Review Work queue shows manual writing samples in the canonical review flow", async ({
  page,
}) => {
  const scope = "stage7b-queue";
  const config = readLocalE2EConfig();
  const admin = createAdminClient(config);
  const parentUserId = await ensureParentUser(admin, {
    email: config.email,
    password: config.password,
  });
  const childId = await ensureChild(admin, { parentUserId, scope });

  await cleanupManualWritingSamples(admin, { parentUserId, childId });

  const sampleText = "I hav a rabbit and I lik to jump on the gras.";


  await page.goto(`/analyse?child=${childId}`);
  await page.getByLabel("Writing sample").fill(sampleText);
  await page.getByRole("button", { name: "Save and open Review Work" }).click();

  await expect(page).toHaveURL(new RegExp(`/courses/review\\?child=${childId}`));
  await expect(page.getByRole("heading", { name: "Latest live review work" })).toBeVisible();

  const queueCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Manual writing sample" }),
  }).first();

  await expect(
    queueCard.getByRole("heading", { name: "Manual writing sample" }),
  ).toBeVisible();
  await expect(queueCard.getByText("Needs review")).toBeVisible();
  await expect(queueCard.getByText("Entered through Add Writing Sample")).toBeVisible();
  await expect(queueCard.getByText(/unresolved suggestion/i)).toBeVisible();

  const writingSamples = await fetchManualWritingSamples(admin, {
    parentUserId,
    childId,
    sampleText,
  });

  expect(writingSamples).toHaveLength(1);

  await queueCard.getByRole("link", { name: "Open review" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/courses/review/sample_${writingSamples[0].id}\\?child=${childId}`),
  );
  await expect(
    page.getByRole("heading", { name: "Manual writing sample", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Source type")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Shared outputs for this manual writing sample" }),
  ).toBeVisible();
});
