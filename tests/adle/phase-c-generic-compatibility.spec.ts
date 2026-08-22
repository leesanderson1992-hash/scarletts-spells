import { expect, test } from "@playwright/test";

test("Phase C supported historical contracts render and unsafe inputs fail closed", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.goto("/dev/adle/phase-c-compatibility", { waitUntil: "load" });

  const cue = page.getByPlaceholder("Write a cue to help you remember it");
  await expect(cue).toBeVisible();
  await cue.fill("help + ful");
  await expect(cue).toHaveValue("help + ful");

  await page.getByLabel("Historical review word").fill("helpful");
  await page.getByRole("button", { name: "Lock and check" }).click();
  await expect(page.locator('[data-cold-word-recall-state="locked"]')).toBeVisible();

  const blockers = page.locator("[data-adle-activity-blocker]");
  await expect(blockers).toHaveCount(2);
  await expect(page.locator('[data-adle-activity-blocker="ADLE_ACTIVITY_RICH_INTERACTION_UNAVAILABLE"]')).toBeVisible();
  await expect(page.locator('[data-adle-activity-blocker="ADLE_ACTIVITY_INVALID_HISTORICAL_PAYLOAD"]')).toBeVisible();
  await expect(page.getByText("No answer has been saved.")).toHaveCount(2);
});
