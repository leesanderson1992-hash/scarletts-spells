import { expect, test } from "@playwright/test";

import {
  createAdminClient,
  ensureChild,
  ensureParentUser,
  readLocalE2EConfig,
} from "./support/local-supabase.mjs";

test("Legacy /analyse/review redirects to canonical Review Work", async ({
  page,
}) => {
  const scope = "analyse-review-redirect";
  const config = readLocalE2EConfig();
  const admin = createAdminClient(config);
  const parentUserId = await ensureParentUser(admin, {
    email: config.email,
    password: config.password,
  });
  const childId = await ensureChild(admin, { parentUserId, scope });

  await page.goto(`/analyse/review?child=${childId}`);

  await expect(page).toHaveURL(new RegExp(`/courses/review\\?child=${childId}`));
  await expect(
    page.getByRole("heading", { name: "Writing ready for spelling review" }),
  ).toBeVisible();
});
