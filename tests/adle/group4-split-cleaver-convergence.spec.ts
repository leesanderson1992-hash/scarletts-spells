import { expect, test, type Page } from "@playwright/test";

async function openFixture(page: Page, fixture: string) {
  await page.goto(`/dev/adle/group4-convergence?fixture=${fixture}`, { waitUntil: "load" });
}

test("Prefix Split handles a wrong pointer cut, then completes at the governed boundary", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFixture(page, "prefix-standard");
  await page.getByRole("button", { name: "Split between u and nkind" }).click();
  await expect(page.locator('div[role="status"]')).toContainText("Not there yet");
  await page.getByRole("button", { name: "Split between un and kind" }).click();
  await expect(page.locator('[data-split-state="complete"]')).toBeVisible();
  await expect(page.getByText("un", { exact: true })).toBeVisible();
  await expect(page.getByText("kind", { exact: true })).toBeVisible();
});

test("Suffix Split completes with keyboard activation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFixture(page, "suffix-standard");
  const boundary = page.getByRole("button", { name: "Split between kind and ness" });
  await boundary.focus();
  await boundary.press("Enter");
  await expect(page.locator('[data-split-state="complete"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete fixture" })).toBeFocused();
});

test("two-miss scaffold disables wrong cuts and focuses the remaining governed boundary", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFixture(page, "scaffold");
  const governed = page.getByRole("button", { name: "Split between un and kind" });
  await expect(governed).toBeFocused();
  await expect(page.getByRole("button", { name: "Split between u and nkind" })).toBeDisabled();
  await expect(page.locator('div[role="status"]')).toContainText("Look again for the word-part boundary");
});

test("Base Word isolates one governed component without a typed confirmation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFixture(page, "base-single");
  await page.getByRole("button", { name: "Split between play and ed" }).click();
  await expect(page.locator('[data-isolated-component="true"]')).toHaveText("play");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByText("Yes — play is the base word.")).toBeVisible();
});

test("Base Word supports two adjacent boundaries and moves focus to the remaining cut", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFixture(page, "base-multi");
  await page.getByRole("button", { name: "Split between re and played" }).click();
  const second = page.getByRole("button", { name: "Split between replay and ed" });
  await expect(second).toBeFocused();
  await second.press(" ");
  await expect(page.locator('[data-isolated-component="true"]')).toHaveText("play");
});

test("restored Base Word cuts re-enter the canonical engine without losing progress", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFixture(page, "base-multi-restored");
  await expect(page.locator('[data-fixture-boundaries="2"]')).toBeAttached();
  await expect(page.getByRole("button", { name: "Split between re and played, found" })).toBeDisabled();
  const remaining = page.getByRole("button", { name: "Split between replay and ed" });
  await expect(remaining).toBeFocused();
  await remaining.click();
  await expect(page.locator('[data-isolated-component="true"]')).toHaveText("play");
});

test("final-y reveal starts only after Split and cannot alter the completed boundary answer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFixture(page, "base-final-y");
  await expect(page.locator('[data-transformation-state]')).toHaveCount(0);
  await page.getByRole("button", { name: "Split between happi and ness" }).click();
  await expect(page.locator('[data-transformation-state="surface"]')).toBeVisible();
  await expect(page.locator('[data-fixture-boundaries="5"]')).toBeAttached();
  await expect(page.locator('[data-transformation-kind="surface_to_source"]')).toBeVisible();
  await page.getByRole("button", { name: "Change i to y" }).click();
  await expect(page.locator('[data-transformation-state="revealed"]')).toBeVisible();
  await expect(page.getByText("happy", { exact: true })).toBeVisible();
  await expect(page.locator('[data-fixture-boundaries="5"]')).toBeAttached();
  await expect(page.getByText(/drop e|double/i)).toHaveCount(0);
});

test("reduced motion completes Split safely", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page, "prefix-standard");
  await page.getByRole("button", { name: "Split between un and kind" }).click();
  await expect(page.locator('[data-split-state="complete"]')).toBeVisible();
});

test("canonical Split and transformation fixtures remain within a narrow touch viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-touch-chromium");
  for (const fixture of ["base-multi", "base-final-y"]) {
    await openFixture(page, fixture);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, fixture).toBeLessThanOrEqual(1);
  }
});
