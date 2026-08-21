import { expect, test, type Page } from "@playwright/test";

async function nextTeachingPage(page: Page) {
  const next = page.getByRole("button", { name: "Next page" });
  await next.focus();
  await next.press("Enter");
}

test("Prefix has one canonical Meet the Words page", async ({ page }) => {
  await page.goto("/dev/adle/morphology-primitives");
  await expect(page.getByRole("heading", { name: "What is a prefix?" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Teaching page navigation" }).getByText(/Page \d+ of \d+/)).toHaveCount(0);
  await nextTeachingPage(page);
  await expect(page.getByRole("heading", { name: "Today’s prefix: un-" })).toBeVisible();
  await nextTeachingPage(page);
  await expect(page.getByRole("heading", { name: "Today’s words" })).toBeVisible();
  await expect(page.getByText("Words we will be reviewing today")).toHaveCount(0);
});

test("Suffix follows What is a suffix, Today’s suffix, then Meet the Words", async ({ page }) => {
  await page.goto("/dev/adle/dynamic-affix-v3");
  await expect(page.getByRole("heading", { name: "What is a suffix?" })).toBeVisible();
  await expect(page.getByText("A suffix is a group of letters added to the end of a base or root that change the meaning of the word.")).toBeVisible();
  await expect(page.getByLabel("base word plus suffix makes Changed word")).toBeVisible();
  await expect(page.getByText("The suffix -ment is a noun maker.", { exact: false })).toHaveCount(0);
  await nextTeachingPage(page);
  await expect(page.getByRole("heading", { name: "Today’s suffix: -ment" })).toBeVisible();
  await expect(page.getByText("A suffix is added to the end of a base or root.")).toHaveCount(0);
  await expect(page.getByText("The suffix -ment is a noun maker. We can take a verb like enjoy and, when we add -ment to the end, it turns it into a noun.")).toBeVisible();
  await expect(page.getByText("Keep the final e in agree + ment → agreement and move + ment → movement.")).toBeVisible();
  await expect(page.getByText("enjoy + ment → enjoyment")).toBeVisible();
  await expect(page.getByText("the feeling or process of enjoying")).toBeVisible();
  await expect(page.getByText("move + ment → movement", { exact: true })).toBeVisible();
  await expect(page.getByText("the action or process of moving")).toBeVisible();
  await expect(page.getByText("-ment turns something you do into the name of the action or result.")).toHaveCount(0);
  await nextTeachingPage(page);
  await expect(page.getByRole("heading", { name: "Today’s words" })).toBeVisible();
  await expect(page.getByText("Ready to investigate?")).toHaveCount(0);
});

test("Base Word starts with teaching pages before FamilyReveal", async ({ page }) => {
  await page.goto("/dev/adle/base-word-family");
  await expect(page.getByRole("heading", { name: "What is a base word?" })).toBeVisible();
  await nextTeachingPage(page);
  await expect(page.getByRole("heading", { name: "Keep the base word steady." })).toBeVisible();
  await nextTeachingPage(page);
  await expect(page.getByRole("heading", { name: "Today’s words" })).toBeVisible();
});

test("Compound starts with authored teaching and Meet the Words", async ({ page }) => {
  await page.goto("/dev/adle/closed-compound");
  await expect(page.getByRole("heading", { name: "Closed compound words" })).toBeVisible();
  await nextTeachingPage(page);
  await expect(page.getByRole("heading", { name: "Today’s compound words" })).toBeVisible();
});
