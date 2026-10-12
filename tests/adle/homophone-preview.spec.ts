import { expect, test } from "@playwright/test";
import candidate from "../../data/adle/candidates/d4-hom/v4/lessons.json";

const sets = [
  { label: "piece / peace", count: 2 },
  { label: "there / their / they're", count: 3 },
  { label: "for / four / of / off", count: 4 },
];

test("preview theme switches the lesson and Balloon Pop between light and dark", async ({ page }) => {
  await page.goto("/dev/adle/homophones");
  const reading = page.locator('[data-teaching-page-type="reading"]');
  const lightBackground = await reading.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.getByRole("button", { name: "☾ Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "☾ Dark" })).toHaveAttribute("aria-pressed", "true");
  const darkBackground = await reading.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(darkBackground).not.toBe(lightBackground);
  await page.screenshot({ path: test.info().outputPath("homophone-dark-learning.png"), fullPage: true });
  await page.getByRole("button", { name: "☀ Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "☾ Dark" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() => {
    const key = "D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE";
    const contentVersion = "d4-hom-v4";
    localStorage.setItem(`adle:homophone:preview-${key}:${contentVersion}`, JSON.stringify({ savedAt: Date.now(), schemaVersion: 1, contentVersion, state: { stage: "activity:balloon-pop", teachingPage: 0, muted: true, binSortCompleted: true, balloonCompleted: true, coverIndex: 0, coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: {}, choiceMistakes: [], reflectionResponse: "", completed: false } }));
  });
  await page.reload();
  await expect(page.locator(".balloon-pop-starter")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: test.info().outputPath("homophone-dark-balloon-starter.png"), fullPage: true });
});

for (const set of sets) {
  test(`${set.count}-word teaching preview fits and shows each word`, async ({ page }) => {
    await page.goto("/dev/adle/homophones");
    await page.getByLabel("Preview word set").selectOption({ label: set.label });
    await expect(page.locator('[data-teaching-page-type="reading"] mark')).toHaveCount(set.count);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByRole("heading", { name: "Cheat Codes to Remember" })).toBeVisible();
    const words = page.getByRole("list", { name: "Lesson words" }).getByRole("listitem");
    await expect(words).toHaveCount(1);
    const image = words.locator("img");
    await expect(image).toHaveCount(1);
    const layout = await words.evaluate(element => {
      const card = element.getBoundingClientRect();
      const art = element.querySelector("img")!.getBoundingClientRect();
      const copy = element.querySelector("div")!.getBoundingClientRect();
      const parent = element.parentElement!.getBoundingClientRect();
      return { artRight: art.right, copyLeft: copy.left, cardCentre: card.left + card.width / 2, parentCentre: parent.left + parent.width / 2 };
    });
    expect(layout.artRight).toBeLessThanOrEqual(layout.copyLeft);
    expect(Math.abs(layout.cardCentre - layout.parentCentre)).toBeLessThan(2);
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    for (let index = 1; index < set.count; index++) {
      await page.getByRole("button", { name: "Next page" }).click();
      await expect(words).toHaveCount(1);
    }
    await expect(page.getByRole("button", { name: "Start the activities" })).toBeVisible();
    for (const image of await words.locator("img").all()) await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: test.info().outputPath(`homophone-${set.count}-word.png`), fullPage: true });
  });
}

test("word-only Cover Check resumes without a sentence gap", async ({ page }) => {
  await page.addInitScript(() => {
    const contentVersion = "d4-hom-v4";
    const key = "D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE";
    localStorage.setItem(`adle:homophone:preview-${key}:${contentVersion}`, JSON.stringify({
      savedAt: Date.now(), schemaVersion: 1, contentVersion,
      state: { stage: "cover", teachingPage: 1, muted: true, binSortCompleted: true, balloonCompleted: true, coverIndex: 1, coverAttempts: { piece: "piece" }, dictationIndex: 0, dictationValues: {}, dictationChecked: {}, choiceMistakes: [], reflectionResponse: "", completed: false },
    }));
  });
  await page.goto("/dev/adle/homophones");
  await expect(page.locator('[data-cover-state="look"]')).toContainText("peace");
  await expect(page.locator('[data-cover-state="look"]')).not.toContainText("____");
});

test("Cover Check asks for every word in a four-word set", async ({ page }) => {
  const key = "D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR_OF_OFF";
  const version = "d4-hom-v4";
  const words = candidate.lessons.find(lesson => lesson.microSkillKey === key)!.words.map(entry => entry.word);
  await page.addInitScript(({ key, version }) => localStorage.setItem(`adle:homophone:preview-${key}:${version}`, JSON.stringify({ savedAt: Date.now(), schemaVersion: 1, contentVersion: version, state: { stage: "cover", teachingPage: 0, muted: true, binSortCompleted: true, balloonCompleted: true, coverIndex: 0, coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: {}, choiceMistakes: [], reflectionResponse: "", completed: false } })), { key, version });
  await page.goto("/dev/adle/homophones");
  await page.getByLabel("Preview word set").selectOption({ label: "for / four / of / off" });
  for (const word of words) {
    await expect(page.locator('[data-cover-state="look"]')).toContainText(word);
    await page.locator(".cover-check-shutter").focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("Type the whole word").fill(word);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(page.getByText("Passage 1 of 3")).toBeVisible();
});

test("a wrong Bin Sort choice is saved for Reflection", async ({ page }) => {
  const key = "D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE";
  await page.addInitScript(key => localStorage.setItem(`adle:homophone:preview-${key}:d4-hom-v4`, JSON.stringify({ savedAt: Date.now(), schemaVersion: 1, contentVersion: "d4-hom-v4", state: { stage: "activity:bin-sort", teachingPage: 0, muted: true, binSortCompleted: true, balloonCompleted: true, coverIndex: 0, coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: {}, choiceMistakes: [], reflectionResponse: "", completed: false } })), key);
  await page.goto("/dev/adle/homophones");
  await expect(page.getByRole("button", { name: "Sound off" })).toBeVisible();
  const firstSentence = await page.locator('[data-testid="bin-sort-active"] .relative.z-10').textContent();
  const prompts = candidate.lessons.find(lesson => lesson.microSkillKey === key)!.binSort;
  const correct = prompts.find(prompt => firstSentence?.includes(prompt.sentence))?.answer;
  expect(correct).toBeTruthy();
  const wrong = correct === "piece" ? "peace" : "piece";
  await page.getByRole("button", { name: wrong, exact: true }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(`adle:homophone:preview-${key}:d4-hom-v4`) ?? "{}").state?.choiceMistakes?.length ?? 0, key)).toBe(1);
});
