import { expect, test } from "@playwright/test";

test("lesson typing survives a slow autosave and restores an unsaved local copy", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.goto("/dev/lesson-autosave");
  const answer = page.getByRole("textbox", { name: "Answer" });
  await answer.fill("The first sentence");
  await page.waitForTimeout(1_650);
  await answer.pressSequentially(" and the second sentence", { delay: 20 });
  await page.waitForTimeout(1_300);
  await expect(answer).toHaveValue("The first sentence and the second sentence");
  await expect(answer).toBeFocused();
  await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible({ timeout: 8_000 });

  await answer.fill("This must survive a reload before the server saves it");
  await page.reload();
  await expect(answer).toHaveValue("This must survive a reload before the server saves it");
});

test("failed save keeps the answer and Save draft sends the latest edit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.goto("/dev/lesson-autosave");
  const answer = page.getByRole("textbox", { name: "Answer" });
  await answer.fill("FAIL");
  await expect(page.getByText(/Could not save yet/)).toBeVisible({ timeout: 8_000 });
  await expect(answer).toHaveValue("FAIL");

  await answer.fill("Older answer");
  await page.waitForTimeout(1_650);
  await answer.fill("Newest answer");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("form-result")).toHaveText("draft:Answer: Newest answer", { timeout: 8_000 });
});

test("local recovery stays with its child and Submit sends the newest answer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.goto("/dev/lesson-autosave");
  const answer = page.getByRole("textbox", { name: "Answer" });
  await answer.fill("This belongs to the first child");
  await page.goto("/dev/lesson-autosave?child=other");
  await expect(answer).toHaveValue("");
  await page.goto("/dev/lesson-autosave");
  await expect(answer).toHaveValue("This belongs to the first child");

  await answer.fill("Older submission");
  await page.waitForTimeout(1_650);
  await answer.fill("Newest submission");
  await page.getByRole("button", { name: "Submit lesson" }).click();
  await expect(page.getByTestId("form-result")).toHaveText("submit:Answer: Newest submission", { timeout: 8_000 });
});
