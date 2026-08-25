import { expect, test, type Browser, type Page } from "@playwright/test";

const PAGE = "/dev/adle/review-writing-challenge";
const API = "/api/dev/adle/review-writing-challenge";

test.beforeEach(async ({ request }) => {
  const response = await request.delete(API);
  expect(response.ok()).toBeTruthy();
});

test.afterEach(async ({ request }) => {
  await request.delete(API);
});

async function startWriting(page: Page, writing: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(PAGE);
  await page.getByRole("button", { name: "SPIN" }).click();
  await page.getByRole("button", { name: "Start writing" }).click();
  await page.getByRole("textbox", { name: "Your Writing Challenge" }).fill(writing);
  await page.getByRole("button", { name: "Finish writing" }).click();
}

async function saveCueAndReachLook(page: Page) {
  await page.getByRole("button", { name: "Letter part 3" }).click();
  await expect(page.getByText("Selected:")).toContainText("c");
  await page.getByRole("button", { name: "Letter part 4" }).click();
  await expect(page.getByText("Selected:")).toContainText("ce");
  await page.getByRole("textbox", { name: "My Memory Cue" })
    .fill("One c, followed by two s letters.");
  const saveCue = page.getByRole("button", { name: "Save Memory Cue and continue" });
  await expect(saveCue).toBeEnabled();
  await saveCue.click();
  await expect(page.getByText("Look", { exact: true })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /^necessary$/ }).first()).toBeVisible();
  await expect(page.getByText("One c, followed by two s letters.")).toBeVisible();
}

async function coverAndTry(page: Page) {
  await page.getByRole("button", { name: /Slide the cover from left to right/ }).press("Enter");
  await expect(page.getByRole("textbox", { name: "Type the whole word" })).toBeVisible();
  await expect(page.getByText("necessary", { exact: true })).toHaveCount(0);
  await expect(page.getByText("c", { exact: true })).toHaveCount(0);
  await expect(page.getByText("One c, followed by two s letters.")).toHaveCount(0);
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(PAGE);
  return { context, page };
}

test("known writing misspelling completes one canonical repair and survives a fresh context", async ({ page, browser }) => {
  await startWriting(page, "It was neccesary on Wednesday for the business.");
  await page.getByRole("button", { name: "Begin Word Reflection & Repair" }).click();
  await expect(page.getByText("You wrote:")).toBeVisible();
  await expect(page.getByText("neccesary", { exact: true })).toBeVisible();
  await expect(page.getByText("The word was:")).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /^necessary$/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Letter part 3" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "My Memory Cue" })).toBeVisible();
  await expect(page.getByText("For example:", { exact: true })).toBeVisible();
  await expect(page.getByText(/Big Elephants Can Always Understand Small Elephants/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("You wrote:")).toBeVisible();
  await expect(page.getByText("neccesary", { exact: true })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /^necessary$/ }).first()).toBeVisible();
  await saveCueAndReachLook(page);
  await page.reload();
  await expect(page.getByText("Look", { exact: true })).toBeVisible();
  await expect(page.getByText("necessary", { exact: true })).toBeVisible();
  await expect(page.getByText("One c, followed by two s letters.")).toBeVisible();
  await page.getByRole("button", { name: /Slide the cover from left to right/ }).press("Enter");

  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto(PAGE);
  await expect(freshPage.getByRole("textbox", { name: "Type the whole word" })).toBeVisible();
  await expect(freshPage.getByText("necessary", { exact: true })).toHaveCount(0);
  await expect(freshPage.getByText("One c, followed by two s letters.")).toHaveCount(0);
  await freshPage.getByRole("textbox", { name: "Type the whole word" }).fill("necessary");
  await freshPage.getByRole("button", { name: "Check" }).click();
  await expect(freshPage.getByRole("heading", { name: "Repairs saved" })).toBeVisible();
  await freshContext.close();
});

test("learner-confirmed unknown misspelling enters the same repair engine", async ({ page }) => {
  const writing = "Necessary on Wensday, the business was busy.";
  await startWriting(page, writing);
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  const submitted = page.getByRole("textbox", {
    name: "Select your attempted Target Word from the submitted writing",
  });
  const start = writing.indexOf("Wensday");
  await submitted.evaluate((element, selection) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(selection.start, selection.end);
  }, { start, end: start + "Wensday".length });
  await submitted.dispatchEvent("keyup", { key: "Shift" });
  await page.getByRole("button", { name: "Confirm selection" }).click();
  await page.getByRole("button", { name: "Begin Word Reflection & Repair" }).click();
  await expect(page.getByText("You wrote:")).toBeVisible();
  await expect(page.getByText("Wensday", { exact: true })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /^Wednesday$/ }).first()).toBeVisible();
});

test("failed audio check enters repair and a second correct retry completes it", async ({ page }) => {
  await startWriting(page, "Wednesday business.");
  await page.getByRole("button", { name: "No", exact: true }).click();
  await page.getByRole("textbox", { name: "Spell this Target Word" }).fill("neccesary");
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Begin Word Reflection & Repair" }).click();
  await expect(page.getByText("You wrote:")).toBeVisible();
  await expect(page.getByText("neccesary", { exact: true })).toBeVisible();
  await saveCueAndReachLook(page);
  await coverAndTry(page);
  await page.getByRole("textbox", { name: "Type the whole word" }).fill("stillwrong");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Have another careful look.")).toBeVisible();
  await coverAndTry(page);
  await page.getByRole("textbox", { name: "Type the whole word" }).fill("necessary");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByRole("heading", { name: "Repairs saved" })).toBeVisible();
});

test("two incorrect repair retries end without a third immediate attempt", async ({ page }) => {
  await startWriting(page, "It was neccesary on Wednesday for the business.");
  await page.getByRole("button", { name: "Begin Word Reflection & Repair" }).click();
  await saveCueAndReachLook(page);
  await coverAndTry(page);
  await page.getByRole("textbox", { name: "Type the whole word" }).fill("wrongone");
  await page.getByRole("button", { name: "Check" }).click();
  await coverAndTry(page);
  await page.getByRole("textbox", { name: "Type the whole word" }).fill("wrongtwo");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByRole("heading", { name: "Repairs saved" })).toBeVisible();
  await expect(page.getByText("That word will come back again soon.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Type the whole word" })).toHaveCount(0);
});

test("a terminal repair offers a clear next-word action when another repair remains", async ({ page }) => {
  await startWriting(page, "It was neccesary on Wednesday for the buisness.");
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.getByRole("button", { name: "Begin Word Reflection & Repair" }).click();
  await saveCueAndReachLook(page);
  await coverAndTry(page);
  await page.getByRole("textbox", { name: "Type the whole word" }).fill("necessary");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByRole("button", { name: "Next word" })).toBeVisible();
  await page.getByRole("button", { name: "Next word" }).click();
  await expect(page.getByText("buisness", { exact: true })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /^business$/ }).first()).toBeVisible();
});

test("production-shaped repair lifecycle restores every durable stage in a fresh browser", async ({ page, browser, request }) => {
  await startWriting(page, "It was neccesary on Wednesday for the business.");
  await page.getByRole("button", { name: "Begin Word Reflection & Repair" }).click();

  let fresh = await freshPage(browser);
  await expect(fresh.page.getByText("You wrote:")).toBeVisible();
  await expect(fresh.page.getByText("neccesary", { exact: true })).toBeVisible();
  await fresh.context.close();

  await page.getByRole("button", { name: "Letter part 3" }).click();
  await page.getByRole("textbox", { name: "My Memory Cue" }).fill("One c, then two s letters.");
  await expect(page.getByRole("button", { name: "Save Memory Cue and continue" })).toBeEnabled();
  fresh = await freshPage(browser);
  await expect(fresh.page.getByText("Selected:")).toContainText("c");
  await expect(fresh.page.getByRole("textbox", { name: "My Memory Cue" })).toBeVisible();
  await fresh.context.close();

  await page.getByRole("button", { name: "Save Memory Cue and continue" }).click();
  fresh = await freshPage(browser);
  await expect(fresh.page.getByText("Look", { exact: true })).toBeVisible();
  await expect(fresh.page.getByText("One c, then two s letters.")).toBeVisible();
  await fresh.context.close();

  const cover = await request.post(API, { data: {
    action: "move_to_cover",
    encounterId: "dev-encounter-1",
    idempotencyKey: "fresh-stage:cover",
  } });
  expect(cover.ok()).toBeTruthy();
  fresh = await freshPage(browser);
  await expect(fresh.page.getByText("The spelling is hidden.")).toBeVisible();
  await expect(fresh.page.getByText("necessary", { exact: true })).toHaveCount(0);
  await expect(fresh.page.getByText("One c, then two s letters.")).toHaveCount(0);
  await fresh.page.getByRole("button", { name: "Continue to type" }).click();
  await fresh.page.getByRole("textbox", { name: "Type the whole word" }).fill("stillwrong");
  await fresh.page.getByRole("button", { name: "Check" }).click();
  await fresh.context.close();

  fresh = await freshPage(browser);
  await expect(fresh.page.getByText("Have another careful look.")).toBeVisible();
  await expect(fresh.page.getByText("One c, then two s letters.")).toBeVisible();
  await fresh.page.getByRole("button", { name: /Slide the cover from left to right/ }).press("Enter");
  await fresh.page.getByRole("textbox", { name: "Type the whole word" }).fill("necessary");
  await fresh.page.getByRole("button", { name: "Check" }).click();
  await fresh.context.close();

  fresh = await freshPage(browser);
  await expect(fresh.page.getByRole("heading", { name: "Repairs saved" })).toBeVisible();
  await expect(fresh.page.getByRole("textbox", { name: "Type the whole word" })).toHaveCount(0);
  await fresh.context.close();
});
