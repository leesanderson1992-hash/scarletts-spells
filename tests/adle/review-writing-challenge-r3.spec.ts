import { expect, test } from "@playwright/test";

const PAGE = "/dev/adle/review-writing-challenge";
const API = "/api/dev/adle/review-writing-challenge";

test.beforeEach(async ({ request }) => {
  const response = await request.delete(API);
  expect(response.ok()).toBeTruthy();
});

test.afterEach(async ({ request }) => {
  await request.delete(API);
});

test("submitted writing yields only unresolved audio checks and reload preserves the lock", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(PAGE);
  await page.getByRole("button", { name: "SPIN" }).click();
  await page.getByRole("button", { name: "Start writing" }).click();

  const writing = "It was neccesary on Wednesday. Buisness was busy.";
  await page.getByRole("textbox", { name: "Your Writing Challenge" }).fill(writing);
  await expect(page.getByText("Target Words: 1 / 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish writing" }).click();

  await expect(page.getByRole("heading", { name: "Target Word checks" })).toBeVisible();
  await expect(page.getByText("Target Word 3", { exact: true })).toBeVisible();
  await expect(page.getByText("Target Word 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Target Word 2", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play target word 3" })).toBeVisible();

  const response = page.getByRole("textbox", { name: "Spell this Target Word" });
  await response.fill("buisness");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("This word needs Reflection & Repair.")).toBeVisible();
  await expect(page.getByText("The word was:")).toContainText("business");
  await expect(response).toBeDisabled();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Target Word checks" })).toBeVisible();
  const restoredResponse = page.getByRole("textbox", { name: "Spell this Target Word" });
  await expect(restoredResponse).toHaveValue("buisness");
  await expect(restoredResponse).toBeDisabled();
  await expect(page.getByText("The word was:")).toContainText("business");
  expect(consoleErrors).toEqual([]);
});

test("reduced motion keeps the frozen wheel result and exact audio success stays non-authentic", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(PAGE);
  await page.getByRole("button", { name: "SPIN" }).click();
  await expect(page.getByText("Selected: Stories")).toBeVisible();
  await page.getByRole("button", { name: "Start writing" }).click();
  await page.getByRole("textbox", { name: "Your Writing Challenge" }).fill("No Target Words yet.");
  await page.getByRole("button", { name: "Finish writing" }).click();

  const firstResponse = page.getByRole("textbox", { name: "Spell this Target Word" }).first();
  await firstResponse.fill("necessary");
  await page.getByRole("button", { name: "Check", exact: true }).first().click();
  await expect(page.getByText("Correct. This response is saved.")).toBeVisible();
  await expect(firstResponse).toBeDisabled();
});
