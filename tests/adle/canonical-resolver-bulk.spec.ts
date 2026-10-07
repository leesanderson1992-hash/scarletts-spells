import { expect, test } from "@playwright/test";

test("select all exposes eligible bulk counts and confirms only pending pairs", async ({ page }) => {
  await page.goto("/dev/resolver-preview");
  const selectAll = page.getByRole("checkbox", { name: "Select all spelling pairs on this page" });
  await page.getByRole("checkbox", { name: "Select buisness to business" }).check();
  await expect(selectAll).toHaveJSProperty("indeterminate", true);
  await expect(page.getByRole("button", { name: "Confirm 1 eligible spelling pair" })).toBeVisible();
  await selectAll.check();
  await expect(page.getByText("4 selected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm 2 eligible spelling pairs" })).toBeVisible();
  await expect(page.getByRole("button", { name: "No Matching Skill 2 eligible spelling pairs" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate in Resolver 1 eligible spelling pair" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm 2 eligible spelling pairs" }).click();
  await expect(page.getByText("2 of 4 selected spelling pairs are eligible.")).toBeVisible();
  await expect(page.getByText("2 will be skipped.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm 2", exact: true }).click();
  await expect(page.getByText("2 updated, 2 skipped, 0 failed.")).toBeVisible();
  await expect(page.getByText("4 selected")).toHaveCount(0);
});

test("No Matching Skill and Activate require review; filter apply clears selection", async ({ page }) => {
  await page.goto("/dev/resolver-preview");
  await page.getByRole("checkbox", { name: "Select buisness to business" }).check();
  await page.getByRole("button", { name: "No Matching Skill 1 eligible spelling pair" }).click();
  await expect(page.getByText("1 of 1 selected spelling pairs are eligible.")).toBeVisible();
  await page.getByRole("button", { name: "No Matching Skill 1", exact: true }).click();
  await expect(page.getByRole("row", { name: /buisness/ })).toHaveCount(0);

  await page.getByRole("checkbox", { name: "Select seperate to separate" }).check();
  await page.getByRole("button", { name: "Activate in Resolver 1 eligible spelling pair" }).click();
  await expect(page.getByText("Make these confirmed pairs available to the resolver.")).toBeVisible();
  await page.getByRole("button", { name: "Activate in Resolver 1", exact: true }).click();
  await expect(page.getByRole("row", { name: /seperate/ }).getByTitle("Resolver enabled")).toBeVisible();

  await page.getByRole("checkbox", { name: "Select recieve to receive" }).check();
  await page.getByRole("combobox", { name: "Rows per page" }).selectOption("50");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/size=50/);
  await expect(page.getByText("1 selected")).toHaveCount(0);
});
