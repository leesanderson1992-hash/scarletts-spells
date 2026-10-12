import { expect, test } from "@playwright/test";
import candidate from "../../data/adle/candidates/d4-hom/v3/lessons.json";

const firstKey = "D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE";
const version = "d4-hom-v4";
const answerFor = (key: string, sentence: string | null) => candidate.lessons.find(lesson => lesson.microSkillKey === key)?.balloonPrompts.find(prompt => prompt.sentence === sentence)?.answer;

async function startBalloon(page: import("@playwright/test").Page) {
  await page.addInitScript((key) => {
    const contentVersion = "d4-hom-v4";
    localStorage.setItem(`adle:homophone:preview-${key}:${contentVersion}`, JSON.stringify({
      savedAt: Date.now(), schemaVersion: 1, contentVersion,
      state: { stage: "activity:balloon-pop", teachingPage: 0, muted: true, binSortCompleted: true, balloonCompleted: true, coverIndex: 0, coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: {}, choiceMistakes: [], reflectionResponse: "", completed: false },
    }));
  }, firstKey);
  await page.goto("/dev/adle/homophones");
  await expect(page.getByRole("heading", { name: "Balloon Pop" })).toBeVisible();
  await expect(page.locator('[data-lesson-layout="immersive"]')).toBeVisible();
  await expect(page.locator('.word-lab-scene')).toHaveCount(0);
  await page.getByRole("button", { name: "Start 45-second round" }).click();
}

test("wrong, missed, correct and expiry paths keep the real-time clock", async ({ page }) => {
  await page.clock.install();
  await startBalloon(page);
  const prompt = await page.locator('section[aria-label="Balloon Pop"] > p').textContent();
  expect(prompt).toContain("____");
  const answer = answerFor(firstKey, prompt);
  expect(answer).toBeTruthy();
  const wrong = answer === "piece" ? "peace" : "piece";
  await page.getByRole("button", { name: `Pop ${wrong}` }).click({ force: true });
  await expect(page.getByRole("button", { name: `Pop ${wrong}` })).toHaveAttribute("data-balloon-status", "incorrect");
  await expect(page.getByRole("button", { name: `Pop ${answer}` })).toHaveAttribute("data-balloon-status", "correct");
  await expect(page.getByText(/Remember, we use/)).toBeVisible();
  await expect.poll(() => page.evaluate(({ key, version }) => JSON.parse(localStorage.getItem(`adle:homophone:preview-${key}:${version}`) ?? "{}").state?.choiceMistakes?.length ?? 0, { key: firstKey, version })).toBe(1);
  await page.clock.fastForward(5_100);
  await expect(page.getByRole("button", { name: "Pop piece" })).toBeEnabled();
  await page.clock.fastForward(10_100);
  await expect(page.getByText(/balloon floated away/)).toBeVisible();
  await expect.poll(() => page.evaluate(({ key, version }) => JSON.parse(localStorage.getItem(`adle:homophone:preview-${key}:${version}`) ?? "{}").state?.choiceMistakes?.length ?? 0, { key: firstKey, version })).toBe(2);
  await page.clock.fastForward(5_100);
  const next = await page.locator('section[aria-label="Balloon Pop"] > p').textContent();
  const nextAnswer = answerFor(firstKey, next);
  expect(nextAnswer).toBeTruthy();
  await page.getByRole("button", { name: `Pop ${nextAnswer}` }).click({ force: true });
  await expect(page.getByText("Score: 1")).toBeVisible();
  await page.clock.fastForward(45_000);
  await expect(page.getByText(/You popped 1 correct balloon/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Play again" })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue lesson" }).click();
  await expect(page.locator('.word-lab-scene')).toBeVisible();
  await expect(page.locator('[data-lesson-layout="immersive"]')).toHaveCount(0);
});

test("mobile touch and reduced motion keep all choices usable", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startBalloon(page);
  await expect(page.getByRole("button", { name: "Pop piece" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pop peace" })).toBeVisible();
  await page.getByRole("button", { name: "Pop piece" }).tap();
  await expect(page.getByText(/Score: 1|Remember, we use/)).toBeVisible();
});

test("starter uses Adie theme colours and centres its copy in light and dark modes", async ({ page }) => {
  await page.addInitScript((key) => {
    const contentVersion = "d4-hom-v4";
    localStorage.setItem(`adle:homophone:preview-${key}:${contentVersion}`, JSON.stringify({ savedAt: Date.now(), schemaVersion: 1, contentVersion, state: { stage: "activity:balloon-pop", teachingPage: 0, muted: true, binSortCompleted: true, balloonCompleted: true, coverIndex: 0, coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: {}, choiceMistakes: [], reflectionResponse: "", completed: false } }));
  }, firstKey);
  await page.goto("/dev/adle/homophones");
  const starter = page.locator(".balloon-pop-starter");
  await expect(starter).toBeVisible();
  const light = await starter.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, foreground: getComputedStyle(element).color, textAlign: getComputedStyle(element).textAlign }));
  expect(light.textAlign).toBe("center");
  await page.screenshot({ path: test.info().outputPath("balloon-starter-light.png") });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  const dark = await starter.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, foreground: getComputedStyle(element).color }));
  expect(dark.background).not.toBe(light.background);
  expect(dark.foreground).not.toBe(light.foreground);
  await page.screenshot({ path: test.info().outputPath("balloon-starter-dark.png") });
  const position = await starter.evaluate(element => { const box = element.getBoundingClientRect(); return { centre: box.left + box.width / 2, viewport: innerWidth / 2 }; });
  expect(Math.abs(position.centre - position.viewport)).toBeLessThan(2);
});

test("four balloons stay separate in the viewport and accept keyboard input", async ({ page }) => {
  await page.addInitScript(() => {
    const contentVersion = "d4-hom-v4";
    const key = "D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR_OF_OFF";
    localStorage.setItem(`adle:homophone:preview-${key}:${contentVersion}`, JSON.stringify({ savedAt: Date.now(), schemaVersion: 1, contentVersion, state: { stage: "activity:balloon-pop", teachingPage: 0, muted: true, binSortCompleted: true, balloonCompleted: true, coverIndex: 0, coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: {}, choiceMistakes: [], reflectionResponse: "", completed: false } }));
  });
  await page.goto("/dev/adle/homophones");
  await page.getByLabel("Preview word set").selectOption({ label: "for / four / of / off" });
  await page.getByRole("button", { name: "Start 45-second round" }).click();
  const balloons = page.locator(".balloon-pop-choice");
  await expect(balloons).toHaveCount(4);
  const boxes = await balloons.evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width }; }));
  for (let index = 1; index < boxes.length; index++) expect(boxes[index].left).toBeGreaterThanOrEqual(boxes[index - 1].right - 1);
  const viewport = page.viewportSize();
  expect(boxes[0].left).toBeGreaterThanOrEqual(0);
  expect(boxes.at(-1)!.right).toBeLessThanOrEqual(viewport!.width);
  await page.getByRole("button", { name: "Pop four" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Score: 1|Remember, we use/)).toBeVisible();
});

test("approved prompts shuffle without a forced answer pattern and use each sentence before repeating", async ({ page, isMobile }) => {
  test.skip(isMobile);
  const key = "D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR_OF_OFF";
  await page.clock.install();
  await page.addInitScript(({ key, version }) => localStorage.setItem(`adle:homophone:preview-${key}:${version}`, JSON.stringify({ savedAt: Date.now(), schemaVersion: 1, contentVersion: version, state: { stage: "activity:balloon-pop", teachingPage: 0, muted: true, binSortCompleted: true, balloonCompleted: true, coverIndex: 0, coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: {}, choiceMistakes: [], reflectionResponse: "", completed: false } })), { key, version });
  await page.goto("/dev/adle/homophones");
  await page.getByLabel("Preview word set").selectOption({ label: "for / four / of / off" });
  await page.getByRole("button", { name: "Start 45-second round" }).click();
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 2000));
  const sentences: string[] = [];
  const answers: string[] = [];
  for (let index = 0; index < 20; index++) {
    const sentence = (await page.locator('section[aria-label="Balloon Pop"] > p').textContent())?.trim() ?? "";
    const answer = answerFor(key, sentence);
    expect(answer).toBeTruthy();
    sentences.push(sentence);
    answers.push(answer!);
    await page.getByRole("button", { name: `Pop ${answer}`, exact: true }).click({ force: true });
  }
  expect(new Set(sentences).size).toBe(20);
  const authored = candidate.lessons.find(lesson => lesson.microSkillKey === key)!.balloonPrompts;
  expect(new Set(sentences)).toEqual(new Set(authored.map(prompt => prompt.sentence)));
  expect(new Set(answers)).toEqual(new Set(["for", "four", "of", "off"]));
  await expect(page.getByText("Score: 20")).toBeVisible();
  const wrapped = (await page.locator('section[aria-label="Balloon Pop"] > p').textContent())?.trim();
  expect(wrapped).not.toBe(sentences[19]);
});
