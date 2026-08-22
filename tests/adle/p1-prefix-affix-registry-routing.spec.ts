import { expect, test, type Page } from "@playwright/test";

async function openFirstRegisteredActivity(page: Page, path: string) {
  await page.goto(path, { waitUntil: "load" });
  const nextPage = page.getByRole("button", { name: "Next page" });
  const startActivities = page.getByRole("button", { name: "Start the activities" });
  await expect(nextPage.or(startActivities)).toBeVisible();
  for (let teachingStep = 0; teachingStep < 4 && await nextPage.isVisible(); teachingStep += 1) {
    await nextPage.click();
  }
  await expect(startActivities).toBeVisible();
  await startActivities.click();
  await expect(page.getByText("Watch the meaning change")).toBeVisible();
  await expect(page.locator("[data-adle-activity-blocker]")).toHaveCount(0);
}

test("Prefix and Affix specialist shells resolve their first rich activity through the canonical registry", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFirstRegisteredActivity(page, "/dev/adle/morphology-primitives");
  await expect(page.getByRole("button", { name: "Add un-" })).toBeVisible();

  await openFirstRegisteredActivity(page, "/dev/adle/dynamic-affix-v3");
  await expect(page.getByRole("button", { name: /^Add / })).toBeVisible();
});
