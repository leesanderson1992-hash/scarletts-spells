import { expect, test, type Page } from "@playwright/test";

type FixtureFacts = {
  assignmentId: string;
  contentVersion: string;
  wordIds: string[];
  words: string[];
  sentences: string[];
  splitPoint: number;
};

async function facts(page: Page): Promise<FixtureFacts> {
  const fixture = page.getByTestId("dynamic-affix-v3-fixture");
  await expect(fixture).toBeVisible();
  return fixture.evaluate((element) => ({
    assignmentId: element.getAttribute("data-assignment-id")!,
    contentVersion: element.getAttribute("data-content-version")!,
    wordIds: JSON.parse(element.getAttribute("data-word-ids")!) as string[],
    words: JSON.parse(element.getAttribute("data-words")!) as string[],
    sentences: JSON.parse(element.getAttribute("data-sentences")!) as string[],
    splitPoint: Number(element.getAttribute("data-split-point")),
  }));
}

function resumeKey(value: FixtureFacts) {
  return `adle:morphology-un:${value.assignmentId}:1:${value.contentVersion}`;
}

async function setStage(page: Page, value: FixtureFacts, stage: "split" | "controlled" | "dictation" | "reflect", overrides: Record<string, unknown> = {}) {
  const state = {
    stage,
    introIndex: 0,
    discoverIndex: 0,
    discoverAddedPrefix: false,
    splitMisses: 0,
    splitCorrect: false,
    splitIndex: 0,
    matchComplete: false,
    buildIndex: 0,
    controlledIndex: 0,
    dictationIndex: 0,
    controlledAttempts: {},
    controlledChecked: {},
    sentenceAttempts: {},
    checkedSentence: false,
    guidedBindings: [],
    muted: true,
    helpLevel: 0,
    reflectionText: "",
    ...overrides,
  };
  await page.evaluate(({ key, contentVersion, state }) => {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), schemaVersion: 1, contentVersion, state }));
  }, { key: resumeKey(value), contentVersion: value.contentVersion, state });
  await page.reload({ waitUntil: "load" });
}

test("Dynamic Affix V3 feedback, Cover Check, Dictation, reload/resume, Reflection and completion", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.goto("/dev/adle/dynamic-affix-v3", { waitUntil: "load" });
  const value = await facts(page);

  await setStage(page, value, "split");
  const wrongPoint = value.splitPoint === 1 ? 2 : 1;
  await page.getByRole("button", { name: `Split at boundary ${wrongPoint}` }).click();
  await expect(page.getByRole("status")).toContainText("Not there yet");
  await page.getByRole("button", { name: `Split at boundary ${wrongPoint}` }).click();
  await expect(page.getByRole("status")).toContainText("suffix");
  await page.getByRole("button", { name: `Split at boundary ${value.splitPoint}` }).click();
  await expect(page.getByRole("heading", { name: /Yes/ })).toBeVisible();

  await setStage(page, value, "controlled");
  await page.locator('button[aria-label^="Slide the cover"]').press("Enter");
  await page.getByLabel("Type the whole word").fill("wrong");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator("[data-cover-state='check']")).toBeVisible();
  await page.waitForTimeout(100);
  await page.reload({ waitUntil: "load" });
  await expect(page.getByText("Word to remember 2 of 4")).toBeVisible();

  await setStage(page, value, "dictation");
  await page.getByLabel("Write the whole sentence").fill("Wrong sentence.");
  await page.getByRole("button", { name: "Check sentence" }).click();
  await expect(page.getByRole("button", { name: "Next sentence" })).toBeVisible();
  await page.waitForTimeout(100);
  await page.reload({ waitUntil: "load" });
  await expect(page.getByText("Sentence 2 of 4")).toBeVisible();

  const controlledAttempts = Object.fromEntries(value.wordIds.map((id, index) => [id, value.words[index]]));
  const sentenceAttempts = Object.fromEntries(value.wordIds.map((id, index) => [id, value.sentences[index]]));
  await setStage(page, value, "reflect", { controlledAttempts, sentenceAttempts, reflectionText: "Suffixes change a base into a new word." });
  await expect(page.getByLabel(/What did you learn about spelling with the suffix/)).toHaveValue("Suffixes change a base into a new word.");
  await page.reload({ waitUntil: "load" });
  await expect(page.getByLabel(/What did you learn about spelling with the suffix/)).toHaveValue("Suffixes change a base into a new word.");
  await page.getByRole("button", { name: "Finish the Word Lab" }).click();
  await expect(page.getByTestId("dynamic-affix-v3-complete")).toBeVisible();
});
