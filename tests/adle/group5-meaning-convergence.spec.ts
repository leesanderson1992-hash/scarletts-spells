import { expect, test, type Page } from "@playwright/test";

async function openFixture(page: Page, fixture: string) {
  await page.goto(`/dev/adle/group5-convergence?fixture=${fixture}`, { waitUntil: "load" });
}

test("Prefix and Suffix Discover share the canonical choice interaction", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFixture(page, "prefix-discover");
  await page.getByRole("button", { name: "Add un-" }).click();
  await page.getByRole("button", { name: "happy again" }).click();
  await expect(page.getByText(/Try again/)).toBeVisible();
  await page.getByRole("button", { name: "not happy" }).click();
  await expect(page.getByText(/Yes — unhappy means not happy/)).toBeVisible();
  await expect(page.getByRole("button", { name: /hear|listen/i })).toHaveCount(0);

  await openFixture(page, "suffix-discover");
  const addSuffix = page.getByRole("button", { name: "Add -ful" });
  await addSuffix.focus(); await addSuffix.press("Enter");
  await page.getByRole("button", { name: "showing care" }).press(" ");
  await expect(page.getByText(/careful means showing care/)).toBeVisible();
});

test("Meaning Match preserves rich correct and incorrect connection mechanics", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFixture(page, "meaning-match-incorrect");
  await page.getByRole("button", { name: /rainbow Parts/ }).click();
  await page.getByRole("button", { name: "a game played with a ball" }).click();
  await expect(page.getByText(/Read the meaning again/)).toBeVisible();
  await page.getByRole("button", { name: /rainbow Parts/ }).focus();
  await page.getByRole("button", { name: /rainbow Parts/ }).press("Enter");
  await page.getByRole("button", { name: "a band of colours seen in the sky" }).press("Enter");
  await expect(page.getByText(/colours curve like a bow/)).toBeVisible();
  await expect(page.getByRole("button", { name: /hear|listen/i })).toHaveCount(0);
});

test("BinSort handles incorrect choice, sparkle, automatic advance and complete Overview", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFixture(page, "prefix-sort");
  await page.getByRole("button", { name: /REVERSE/ }).click();
  await expect(page.getByText(/different job|try again/i)).toBeVisible();
  for (const [word, bin] of [["unfair", "NOT"], ["unkind", "NOT"], ["unlock", "REVERSE"], ["untie", "REVERSE"]] as const) {
    await expect(page.getByText(word, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`^${bin}`) }).click();
    await expect(page.getByTestId("bin-sort-success")).toBeVisible();
    if (word !== "untie") await expect(page.getByTestId("bin-sort-success")).toBeHidden();
  }
  await expect(page.getByTestId("bin-sort-overview")).toBeVisible();
  for (const word of ["unfair", "unkind", "unlock", "untie"]) await expect(page.getByTestId("bin-sort-overview").getByText(word, { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Words in NOT" })).toContainText("unfair");
  await expect(page.getByRole("list", { name: "Words in REVERSE" })).toContainText("unlock");
});

test("reduced-motion success is static, clear and still advances", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page, "sort-reduced-motion");
  await page.getByRole("button", { name: /^NOT/ }).click();
  const success = page.getByTestId("bin-sort-success");
  await expect(success).toHaveAttribute("data-reduced-motion", "true");
  await expect(success).toContainText("Correct");
  await expect(success.locator("text=✦")).toHaveCount(0);
  await expect(page.getByTestId("bin-sort-overview")).toBeVisible();
});

test("keyboard-only Sort follows the same success and advancement path", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFixture(page, "keyboard");
  const firstBin = page.getByRole("button", { name: /^NOT/ });
  await firstBin.focus(); await firstBin.press("Enter");
  await expect(page.getByTestId("bin-sort-success")).toBeVisible();
  await expect(firstBin).toBeFocused();
  await firstBin.press(" ");
  await expect(page.getByText("unlock", { exact: true })).toBeVisible();
});

test("Suffix Sort and Meaning Match fit a narrow touch viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-touch-chromium");
  for (const fixture of ["narrow", "compound-match"]) {
    await openFixture(page, fixture);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, fixture).toBeLessThanOrEqual(1);
  }
});

test("Suffix Sort shows only the two concise category labels", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openFixture(page, "suffix-sort");
  await expect(page.getByRole("button", { name: "FULL OF", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "WITHOUT", exact: true })).toBeVisible();
  await expect(page.getByText(/-ful means|-less means/)).toHaveCount(0);
});
