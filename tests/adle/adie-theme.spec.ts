import { expect, test } from "@playwright/test";

test("theme control is confined to ADLE and its choice persists sitewide", async ({ page }) => {
  await page.goto("/dev/adle/theme-shell");
  const toggle = page.getByRole("button", { name: "Switch to dark mode" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".app-theme-toggle")).toHaveCount(0);
  await page.goto("/dev/adle/theme-shell?path=/dashboard");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".app-theme-toggle")).toHaveCount(0);
});

test("Adie presents existing checked feedback without an extra live announcement", async ({ page }) => {
  await page.goto("/dev/adle/first-impression?stage=activity");
  await expect(page.getByRole("img", { name: /Adie, a smiling white and pink robot/ })).toBeVisible();
  await expect(page.locator(".adie-guide-bubble")).toContainText("Take one calm step at a time.");
  await page.getByRole("button", { name: /select un|choose un|^un$/i }).first().click();
  await page.getByRole("button", { name: "Place un in block 1" }).click();
  await page.getByRole("button", { name: "Check my word" }).click();
  await expect(page.getByRole("region", { name: "Completed word and meaning" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Completed word and meaning" })).toContainText("un + kind → unkind");
  await expect(page.locator('[aria-live="polite"]:not(.sr-only)')).toHaveCount(1);
});
