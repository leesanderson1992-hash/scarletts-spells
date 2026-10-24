import { expect, test } from "@playwright/test";
import content from "../../data/adle/homophone/convergence-v1/approved-lesson-content.json";
import cheatCodes from "../../data/adle/homophone/convergence-v1/approved-cheat-codes.json";
import retainedLessons from "../../data/adle/candidates/d4-hom/v4/lessons.json";

const special = [
  { key: "D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS", heading: "The Tiny Mark That Changes Everything! ✨" },
  { key: "D4_HOM_CONFUSABLE_WORDS_SE_SY_CE_CY", heading: "C or S? One Letter Changes Everything! 🔎" },
  { key: "D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T", heading: "Sounds Like T… But Is It -ed? 🔎" },
];

async function checkSharedIntro(page: import("@playwright/test").Page) {
  const intro = page.locator('[data-teaching-page-type="homophone-standard-intro"]');
  await expect(intro.getByRole("heading", { name: "Why are some words so confusing?" })).toBeVisible();
  for (const paragraph of retainedLessons.lessons[0].teachingIntro.paragraphs) await expect(intro).toContainText(paragraph);
  await expect(intro).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(intro).toContainText("Today, we are focusing on");
  await expect(intro.locator("mark").first()).toBeVisible();
}

test("ordinary lesson centres each approved cheat code and ends with a grouped word comparison", async ({ page }) => {
  const key = "D4_HOM_CONFUSABLE_WORDS_ACCEPT_EXCEPT";
  await page.goto(`/dev/adle/homophone-convergence?skill=${key}#lesson`);
  await checkSharedIntro(page);
  await expect(page.locator('[data-teaching-page-type="homophone-standard-intro"]')).toContainText("These words are confusables.");
  await page.getByRole("button", { name: "Next page" }).click();
  const cheat = page.locator('[data-teaching-page-type="homophone-cheat"]');
  await expect(cheat).toContainText("accept");
  const row = cheatCodes.wordPages.find(item => item.word === "accept" && item.setKey.includes("ACCEPT_EXCEPT"));
  expect(row).toBeTruthy();
  await expect(cheat).toContainText(row!.cheatCode);
  const illustration = cheat.getByRole("img");
  await expect(illustration).toHaveAttribute("alt", row!.imageDescription);
  await expect(illustration).toHaveJSProperty("complete", true);
  await expect.poll(() => illustration.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(cheat).toContainText("except");
  await expect(cheat.getByRole("img")).toHaveAttribute("alt", cheatCodes.wordPages.find(item => item.word === "except" && item.setKey.includes("ACCEPT_EXCEPT"))!.imageDescription);
  await page.getByRole("button", { name: "Next page" }).click();
  const summary = page.locator('[data-teaching-page-type="homophone-meet-words"]');
  await expect(summary).toBeVisible();
  await expect(summary.locator("h3")).toHaveText(["accept", "except"]);
  await expect(page.getByRole("button", { name: "Start the activities" })).toBeVisible();
});

test("illustrated cheat code and navigation fit on a short phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/dev/adle/homophone-convergence?skill=D4_HOM_CONTENT_WORD_HOMOPHONES_STEAL_STEEL#lesson");
  await page.getByRole("button", { name: "Next page" }).click();
  const cheat = page.locator('[data-teaching-page-type="homophone-cheat"]');
  await expect(cheat.getByRole("img")).toBeVisible();
  await expect(cheat).toContainText("STEAL has A for AWAY");
  const fit = await page.evaluate(() => {
    const workspace = document.querySelector(".word-lab-workspace")!;
    const teachingContent = document.querySelector(".teaching-pages > div")!;
    const card = document.querySelector('[data-teaching-page-type="homophone-cheat"]')!;
    const navigation = document.querySelector('nav[aria-label="Teaching page navigation"]')!;
    return {
      workspaceScroll: workspace.scrollHeight - workspace.clientHeight,
      teachingScroll: teachingContent.scrollHeight - teachingContent.clientHeight,
      cardOverlap: card.getBoundingClientRect().bottom - navigation.getBoundingClientRect().top,
      navigationOverflow: navigation.getBoundingClientRect().bottom - workspace.getBoundingClientRect().bottom,
    };
  });
  expect(fit.workspaceScroll).toBeLessThanOrEqual(1);
  expect(fit.teachingScroll).toBeLessThanOrEqual(1);
  expect(fit.cardOverlap).toBeLessThanOrEqual(0);
  expect(fit.navigationOverflow).toBeLessThanOrEqual(0);
});

test("retained lessons share Page 1 and show the missing contraction illustration", async ({ page }) => {
  await page.goto("/dev/adle/homophones");
  await page.getByLabel("Preview word set").selectOption("D4_HOM_CONTRACTION_POSSESSIVE_YOUR_YOURE");
  await checkSharedIntro(page);
  await expect(page.locator('[data-teaching-page-type="homophone-standard-intro"]')).toContainText("These words are homophones.");
  await page.getByRole("button", { name: "Next page" }).click();
  await page.getByRole("button", { name: "Next page" }).click();
  const illustration = page.locator('img[src*="you-re.jpg"]');
  await expect(illustration).toBeVisible();
  await expect.poll(() => illustration.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test("retained illustrated word page fits on a short phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/dev/adle/homophones");
  await page.getByLabel("Preview word set").selectOption("D4_HOM_CONTENT_WORD_HOMOPHONES_THREW_THROUGH");
  await page.getByRole("button", { name: "Next page" }).click();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.locator('[data-teaching-page-type="homophone-retained-cheat"]')).toContainText("THROUGH has a long tunnel of letters");
  const fit = await page.evaluate(() => {
    const workspace = document.querySelector(".word-lab-workspace")!;
    const navigation = document.querySelector('nav[aria-label="Teaching page navigation"]')!;
    return { scroll: workspace.scrollHeight - workspace.clientHeight,
      navigationOverflow: navigation.getBoundingClientRect().bottom - workspace.getBoundingClientRect().bottom };
  });
  expect(fit.scroll).toBeLessThanOrEqual(1);
  expect(fit.navigationOverflow).toBeLessThanOrEqual(0);
});

for (const lesson of special) {
  test(`${lesson.key} presents the exact concept page, two pairs per page and a group summary`, async ({ page }) => {
    await page.goto(`/dev/adle/homophone-convergence?skill=${lesson.key}#lesson`);
    await checkSharedIntro(page);
    await page.getByRole("button", { name: "Next page" }).click();
    const concept = page.locator('[data-teaching-page-type="homophone-concept"]');
    await expect(concept.getByRole("heading", { name: lesson.heading })).toBeVisible();
    await page.getByRole("button", { name: "Next page" }).click();
    const pairs = page.locator('[data-teaching-page-type="homophone-pairs"]');
    await expect(pairs.locator("section[aria-label]")).toHaveCount(2);
    await expect(pairs.locator("h3")).toHaveCount(4);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(pairs.locator("section[aria-label]")).toHaveCount(1);
    await expect(pairs.locator("h3")).toHaveCount(2);
    await page.getByRole("button", { name: "Next page" }).click();
    const summary = page.locator('[data-teaching-page-type="homophone-meet-words"]');
    await expect(summary.locator("section[aria-label]")).toHaveCount(3);
    const selected = content.lessons.find(item => item.microSkillKey === lesson.key)!.sets.slice(0, 3);
    for (const word of selected.flatMap(set => set.members.map(member => member.word))) await expect(summary).toContainText(word);
    await expect(page.getByRole("button", { name: "Start the activities" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  });
}
