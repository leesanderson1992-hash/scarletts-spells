import { expect, test, type Locator, type Page } from "@playwright/test";

async function openSpellGroup(page: Page) {
  await page.goto("/dev/adle/activity-convergence", { waitUntil: "load" });
  await page.getByRole("button", { name: "Group 3 · Spell / Recall" }).click();
}

function candidate(page: Page, name: string): Locator {
  return page.locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) }).first();
}

test("canonical Cover Check enforces study, keyboard cover, recall, comparison and continuation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openSpellGroup(page);
  const cover = candidate(page, "CoverShutter · Prefix/Affix config");
  await expect(cover.locator("p.text-4xl")).toBeVisible();
  const shutter = cover.locator('button[aria-label^="Slide the cover"]');
  await shutter.focus();
  await shutter.press("Enter");
  await expect(cover.locator("p.text-4xl")).toHaveCount(0);
  const input = cover.getByLabel("Type the whole word");
  await expect(input).toBeFocused();
  await input.fill("unkined");
  await input.press("Enter");
  await expect(cover.locator('[data-cover-state="check"]')).toBeVisible();
  await expect(cover.getByText("Compare the word")).toBeVisible();
  await expect(cover.getByRole("button", { name: "Continue" })).toBeVisible();

  await cover.getByRole("button", { name: "Resume / restored" }).click();
  await expect(cover.getByLabel("Type the whole word")).toHaveValue("unfar");
});

test("canonical Sentence Dictation keeps the answer hidden until a locked manual check", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await openSpellGroup(page);
  const dictation = candidate(page, "SentenceDictation · Prefix/Affix");
  const response = dictation.getByLabel("Write the whole sentence");
  const check = dictation.getByRole("button", { name: "Check sentence" });
  await expect(dictation.getByRole("button", { name: "Play sentence" })).toBeVisible();
  await expect(check).toBeDisabled();
  await expect(dictation.getByText("The correct sentence")).toHaveCount(0);
  await expect(dictation.getByText("It was unfair to change the rules.", { exact: true })).toHaveCount(0);

  await response.fill("It was unfare to change the rules.");
  await response.press("Enter");
  await expect(dictation.locator('[data-sentence-dictation-state="checked"]')).toBeVisible();
  await expect(response).toHaveAttribute("readonly", "");
  await expect(dictation.getByText("You wrote")).toBeVisible();
  await expect(dictation.getByText("The correct sentence", { exact: true })).toBeVisible();
  await expect(dictation.getByText("It was unfair to change the rules.", { exact: true })).toBeVisible();
  await expect(dictation.getByRole("button", { name: "Next sentence" })).toBeVisible();
});

test("Base Word restores canonical Cover Check and Compound restores canonical Sentence Dictation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const baseContentVersion = "base-word-two-family-interactive-preview-v2";
  const baseState = {
    stage: "controlled", familyIndex: 0, cleaveIndex: 0, cleaveStep: 0, cleaveCuts: {}, cleaveMisses: {}, buildIndex: 0,
    controlledIndex: 0, dictationIndex: 0, controlledAttempts: { replayed_en_gb: "replaed" }, controlledChecked: { replayed_en_gb: true },
    sentenceAttempts: {}, sentenceChecked: false, reflectionText: "",
  };
  await page.goto("/dev/adle/base-word-family", { waitUntil: "load" });
  await page.evaluate(({ contentVersion, state }) => localStorage.setItem(
    `adle:morphology-base-family:dev-base-word-family-g7-teaching-pages:1:${contentVersion}`,
    JSON.stringify(state),
  ), { contentVersion: baseContentVersion, state: baseState });
  await page.reload({ waitUntil: "load" });
  await expect(page.locator('[data-cover-state="check"]')).toBeVisible();
  await expect(page.locator('[aria-label*="You wrote replaed"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();

  const compoundContentVersion = "d4_mor_closed_compounds_v1";
  const assignmentId = "dev-closed-compound-g7-teaching-pages";
  const compoundState = {
    stage: "dictation", index: 0, muted: true, attempts: {}, sentences: { rainbow: "A rain bow" }, sentenceChecked: false, reflection: "",
    jigsawLocked: [], jigsawMisses: {}, jigsawPlacements: {}, meaningConnected: [], meaningMisses: {},
  };
  await page.goto("/dev/adle/closed-compound", { waitUntil: "load" });
  await page.evaluate(({ contentVersion, assignmentId, state }) => localStorage.setItem(
    `adle:morphology-un:${assignmentId}:1:${contentVersion}:closed-compound`,
    JSON.stringify({ savedAt: Date.now(), schemaVersion: 1, contentVersion, state }),
  ), { contentVersion: compoundContentVersion, assignmentId, state: compoundState });
  await page.reload({ waitUntil: "load" });
  const compoundResponse = page.getByLabel("Write the whole sentence");
  await expect(page.locator('[data-sentence-dictation-state="writing"]')).toBeVisible();
  await expect(compoundResponse).toHaveValue("A rain bow");
  await expect(page.getByText("A rainbow appeared after rain.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Check sentence" }).click();
  await expect(compoundResponse).toHaveAttribute("readonly", "");
  await expect(page.getByText("A rainbow appeared after rain.", { exact: true })).toBeVisible();
});

test("canonical spell surfaces remain within the narrow viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-touch-chromium");
  await openSpellGroup(page);
  const dictation = candidate(page, "SentenceDictation · Compound");
  await dictation.getByLabel("Write the whole sentence").fill("A rain bow appeared.");
  await dictation.getByRole("button", { name: "Check sentence" }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

for (const fixture of [
  { key: "scheduled-review", mode: "scheduled_review", answer: "necessary" },
  { key: "diagnostic-probe", mode: "diagnostic_probe", answer: "mischievous" },
] as const) {
  test(`ColdWordRecall ${fixture.mode} hides, locks and prevents post-feedback editing`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await page.goto(`/dev/adle/group3-convergence?fixture=${fixture.key}`, { waitUntil: "load" });
    const recall = page.locator(`[data-cold-word-recall-mode="${fixture.mode}"]`);
    const input = recall.locator("input");
    await expect(recall).toHaveAttribute("data-cold-word-recall-state", "recalling");
    await expect(recall.getByText("Compare the word")).toHaveCount(0);
    await expect(page.getByText(fixture.answer, { exact: true })).toHaveCount(0);
    await expect(page.getByText("Grown-up", { exact: false })).toHaveCount(0);
    await input.fill("nesessary");
    if (fixture.mode === "scheduled_review") await input.press("Enter");
    else await recall.getByRole("button", { name: "Lock and check" }).click();
    await expect(recall).toHaveAttribute("data-cold-word-recall-state", "locked");
    await expect(input).toHaveAttribute("readonly", "");
    await expect(recall.getByText("Compare the word")).toBeVisible();
    await expect(recall.getByRole("button", { name: "Lock and check" })).toHaveCount(0);
    await input.press("Control+A");
    await input.press("Backspace");
    await expect(input).toHaveValue("nesessary");
  });
}

test("forward Sentence Dictation fixture exposes no authored answer before Check", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.goto("/dev/adle/group3-convergence?fixture=prefix-sentence", { waitUntil: "load" });
  const sentence = "It was unfair to change the rules.";
  const input = page.getByLabel("Write the whole sentence");
  await expect(page.getByText(sentence, { exact: true })).toHaveCount(0);
  await input.fill("It was unfare to change the rules.");
  await page.getByRole("button", { name: "Check sentence" }).click();
  await expect(input).toHaveAttribute("readonly", "");
  await expect(page.getByText(sentence, { exact: true })).toBeVisible();
});

test("Cover Check Enter cannot bypass cover or submit empty, and the Check button remains valid", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.goto("/dev/adle/group3-convergence?fixture=prefix-cover", { waitUntil: "load" });
  await expect(page.getByLabel("Type the whole word")).toHaveCount(0);
  await expect(page.locator('[data-cover-state="look"]')).toBeVisible();
  await page.locator('button[aria-label^="Slide the cover"]').press("Enter");
  const input = page.getByLabel("Type the whole word");
  await input.press("Enter");
  await expect(page.locator('[data-cover-state="write"]')).toBeVisible();
  await input.fill("unhelpful");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator('[data-cover-state="check"]')).toBeVisible();
});

test("Sentence Dictation Shift+Enter stays multiline and button Check matches Enter", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.goto("/dev/adle/group3-convergence?fixture=suffix-sentence", { waitUntil: "load" });
  const response = page.getByLabel("Write the whole sentence");
  await response.fill("Her kindness");
  await response.press("Shift+Enter");
  await expect(response).toHaveValue("Her kindness\n");
  await expect(page.locator('[data-sentence-dictation-state="writing"]')).toBeVisible();
  await expect(page.getByText("The correct sentence", { exact: true })).toHaveCount(0);
  await response.fill("Her kindness made the new pupil smile.");
  await page.getByRole("button", { name: "Check sentence" }).click();
  await expect(response).toHaveAttribute("readonly", "");
});

for (const fixture of [
  "prefix-reflection-capital",
  "prefix-reflection-punctuation",
  "suffix-reflection",
  "base-word-reflection",
  "compound-reflection",
] as const) {
  test(`Reflection ${fixture} shows feedback without turning it into a spelling mistake`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await page.goto(`/dev/adle/group3-convergence?fixture=${fixture}`, { waitUntil: "load" });
    await expect(page.locator('[data-reflection-sentence-comparisons="feedback-only"]')).toBeVisible();
    await expect(page.getByText("You checked each spelling carefully.", { exact: false })).toBeVisible();
    await expect(page.getByText("Your sentence:", { exact: false })).toBeVisible();
    await expect(page.getByText("Correct sentence:", { exact: false })).toBeVisible();
    await expect(page.getByText("Correct spelling", { exact: true })).toHaveCount(0);
    const reflection = page.getByPlaceholder("I learned that...");
    await reflection.fill("I noticed the sentence");
    await reflection.press("Enter");
    await expect(reflection).toHaveValue("I noticed the sentence\n");
    await expect(reflection).toBeEnabled();
  });
}
