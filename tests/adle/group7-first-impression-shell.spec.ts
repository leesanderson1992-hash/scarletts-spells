import { expect, test } from "@playwright/test";

test("one teaching page always ends with Meet the Words and supports Back", async ({ page }) => {
  await page.goto("/dev/adle/first-impression?pages=1");
  await expect(page.getByRole("heading", { name: "A prefix changes a word’s meaning." })).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("heading", { name: "Today’s words" })).toBeVisible();
  await expect(page.locator('[data-teaching-page-type="meet_words"]')).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "A prefix changes a word’s meaning." })).toBeVisible();
});

test("three authored teaching pages precede the required Meet the Words page", async ({ page }) => {
  await page.goto("/dev/adle/first-impression?pages=3");
  for (const heading of ["Keep the base word steady.", "Read the parts and the whole word.", "Today’s words"]) {
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect(page.getByText("Page 4 of 4", { exact: false })).toBeVisible();
});

test("two authored teaching pages also end with the required Meet the Words page", async ({ page }) => {
  await page.goto("/dev/adle/first-impression?pages=2");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("heading", { name: "Keep the base word steady." })).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("heading", { name: "Today’s words" })).toBeVisible();
  await expect(page.getByText("Page 3 of 3", { exact: false })).toBeVisible();
});

test("teaching resume restores an exact authored page or Meet the Words", async ({ page }) => {
  await page.goto("/dev/adle/first-impression?pages=3&teachingPage=2");
  await expect(page.getByRole("heading", { name: "Keep the base word steady." })).toBeVisible();
  await page.goto("/dev/adle/first-impression?pages=3&teachingPage=4");
  await expect(page.getByRole("heading", { name: "Today’s words" })).toBeVisible();
  await expect(page.locator('[data-teaching-page-type="meet_words"]')).toBeVisible();
});

test("TeachingPages remain rereadable from a configured middle activity", async ({ page }) => {
  await page.goto("/dev/adle/first-impression?stage=activity");
  await expect(page.getByRole("heading", { name: "Which word means “not kind”?" })).toBeVisible();
  await page.getByRole("button", { name: "Reread lesson pages" }).click();
  await expect(page.getByRole("heading", { name: "A prefix changes a word’s meaning." })).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await page.getByRole("button", { name: "Return to the activity" }).click();
  await expect(page.getByRole("heading", { name: "Which word means “not kind”?" })).toBeVisible();
});

test("locked Dictation remains read-only after rereading TeachingPages", async ({ page }) => {
  await page.goto("/dev/adle/first-impression?stage=dictation&locked=1");
  const response = page.getByRole("textbox", { name: "Write the whole sentence" });
  await expect(response).not.toBeEditable();
  await page.getByRole("button", { name: "Reread lesson pages" }).click();
  await page.getByRole("button", { name: "Next page" }).click();
  await page.getByRole("button", { name: "Return to the activity" }).click();
  await expect(response).not.toBeEditable();
  await expect(response).toHaveValue("The unkind words upset him.");
});

test("Reflection completes into the canonical celebration", async ({ page }) => {
  await page.goto("/dev/adle/first-impression?stage=reflection");
  await page.getByRole("textbox", { name: /How did the prefix help/ }).fill("The prefix helped me understand the word.");
  await page.getByRole("button", { name: "Finish Word Lab" }).click();
  await expect(page.getByTestId("first-impression-celebration")).toBeVisible();
  await expect(page.getByRole("heading", { name: /finished today's spelling/i })).toBeVisible();
});

test("keyboard and narrow layout retain usable teaching navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/adle/first-impression?pages=3");
  const nextPage = page.getByRole("button", { name: "Next page" });
  for (let index = 0; index < 12 && !(await nextPage.evaluate((element) => element === document.activeElement)); index += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(nextPage).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Keep the base word steady." })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
});
