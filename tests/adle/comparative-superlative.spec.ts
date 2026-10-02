import { expect, test } from "@playwright/test";
import { COMPARATIVE_MICRO_SKILLS, type ComparativeLessonV1 } from "../../lib/adle/inflection/contracts";
import { comparativePreviewFixture } from "../../lib/adle/inflection/preview-fixture";
import { initialComparativeProgress } from "../../lib/adle/inflection/resume";

test("six teaching words read down two family columns", async ({ page }) => {
  const lesson = comparativePreviewFixture(COMPARATIVE_MICRO_SKILLS[0], 2, "family-columns-fixture");
  const progress = { ...initialComparativeProgress(lesson), teachingPageIndex: 2 };
  await page.addInitScript(state => localStorage.setItem("adle:comparative:preview:v1", JSON.stringify(state)), { lesson, progress, finishWrites: 0 });
  await page.goto("/dev/adle/comparative-superlative");
  const columns = page.locator('[aria-label="Lesson word families"] > section');
  await expect(columns).toHaveCount(2);
  for (const [index, family] of lesson.families.entries()) {
    await expect(columns.nth(index).locator("li")).toHaveCount(3);
    for (const [degreeIndex, word] of family.words.entries()) await expect(columns.nth(index).locator("li").nth(degreeIndex)).toContainText(word.word);
  }
});

test("paired answers stay hidden on checkpoint failure, retry freezes both", async ({ page }) => {
  const lesson = comparativePreviewFixture(COMPARATIVE_MICRO_SKILLS[1],3,"failure-fixture");
  const progress = {...initialComparativeProgress(lesson),stageId:"dictation"};
  await page.addInitScript(state => localStorage.setItem("adle:comparative:preview:v1",JSON.stringify(state)),{lesson,progress,finishWrites:0});
  await page.goto("/dev/adle/comparative-superlative");
  const task=page.locator('[data-paired-dictation-state]');
  for (const target of lesson.dictationTasks[0].targets) await expect(task).not.toContainText(target.word);
  await page.getByLabel("Gap 1",{exact:true}).fill("wrong");
  await page.getByLabel("Gap 2",{exact:true}).fill("wrong");
  await page.evaluate(() => { const original=Storage.prototype.setItem; Storage.prototype.setItem=function() { Storage.prototype.setItem=original; throw new Error("injected_checkpoint_failure"); }; });
  await page.getByRole("button",{name:"Check both words"}).click();
  await expect(task.getByRole("alert")).toContainText("couldn't freeze both answers");
  await expect(task).toHaveAttribute("data-paired-dictation-state","writing");
  for (const target of lesson.dictationTasks[0].targets) await expect(task).not.toContainText(target.word);
  await expect(page.getByLabel("Gap 1",{exact:true})).toBeEditable();
  await page.getByLabel("Gap 1",{exact:true}).fill(lesson.dictationTasks[0].targets[0].word);
  await page.getByLabel("Gap 2",{exact:true}).fill(lesson.dictationTasks[0].targets[1].word);
  await page.getByRole("button",{name:"Check both words"}).click();
  await expect(task).toHaveAttribute("data-paired-dictation-state","checked");
  await expect(page.getByLabel("Gap 1",{exact:true})).toHaveAttribute("readonly","");
  await expect(page.getByLabel("Gap 2",{exact:true})).toHaveAttribute("readonly","");
});

test("sentence word can be dragged to its one target", async ({ page },info) => {
  const lesson=comparativePreviewFixture(COMPARATIVE_MICRO_SKILLS[0],3,"drag-fixture");
  const progress={...initialComparativeProgress(lesson),stageId:"activity:sentence-build"};
  await page.addInitScript(state=>localStorage.setItem("adle:comparative:preview:v1",JSON.stringify(state)),{lesson,progress,finishWrites:0});
  await page.goto("/dev/adle/comparative-superlative");
  const first = lesson.sentenceTasks[0];
  const firstEnding = first.degree === "comparative" ? "er" : "est";
  const firstFamily = lesson.families.find(family => family.familyKey === first.familyKey)!;
  await page.getByRole("button",{name:firstEnding,exact:true}).click();
  await page.getByRole("button",{name:`Place ${firstEnding} in block 1`,exact:true}).click();
  const tile=page.getByRole("button",{name:firstFamily.words.find(word => word.degree === first.degree)!.word,exact:true});
  const gap=page.getByRole("button",{name:"Place the selected word in the sentence"});
  await tile.scrollIntoViewIfNeeded();
  const from=await tile.boundingBox(),to=await gap.boundingBox();
  expect(from).not.toBeNull(); expect(to).not.toBeNull();
  await page.mouse.move(from!.x+from!.width/2,from!.y+from!.height/2); await page.mouse.down();
  await page.mouse.move(to!.x+to!.width/2,to!.y+to!.height/2,{steps:12}); await page.mouse.up();
  await expect(page.locator('[data-sentence-suffix-state]')).toHaveAttribute("data-sentence-suffix-state","complete");
  if (info.project.use.hasTouch) {
    await page.getByRole("button",{name:"Continue",exact:true}).tap();
    const second = lesson.sentenceTasks[1];
    const secondEnding = second.degree === "comparative" ? "er" : "est";
    const secondFamily = lesson.families.find(family => family.familyKey === second.familyKey)!;
    await page.getByRole("button",{name:secondEnding,exact:true}).tap();
    await page.getByRole("button",{name:`Place ${secondEnding} in block 1`,exact:true}).tap();
    await page.getByRole("button",{name:secondFamily.words.find(word => word.degree === second.degree)!.word,exact:true}).tap({ force: true });
    await page.getByRole("button",{name:"Place the selected word in the sentence"}).tap();
    await expect(page.locator('[data-sentence-suffix-state]')).toHaveAttribute("data-sentence-suffix-state","complete");
  }
});

test("sort tile stays above the buckets and drops into its destination", async ({ page }, info) => {
  const lesson = comparativePreviewFixture(COMPARATIVE_MICRO_SKILLS[0], 2, "sort-drag-fixture");
  const progress = { ...initialComparativeProgress(lesson), stageId: "activity:degree-sort", sortPreludeComplete: true };
  await page.addInitScript(state => localStorage.setItem("adle:comparative:preview:v1", JSON.stringify(state)), { lesson, progress, finishWrites: 0 });
  await page.goto("/dev/adle/comparative-superlative");
  await expect(page.locator('[data-testid="bin-sort-active"]')).not.toContainText("Compare two — -er");
  await expect(page.locator('[data-testid="bin-sort-active"]')).not.toContainText("Compare a group — -est");
  const first = lesson.words.find(word => word.degree !== "base")!;
  const tile = page.getByRole("button", { name: first.word, exact: true });
  const bin = page.getByRole("button", { name: new RegExp(`^${first.degree === "comparative" ? "Comparative" : "Superlative"}`) });
  await tile.scrollIntoViewIfNeeded();
  const from = await tile.boundingBox(), to = await bin.boundingBox();
  expect(from).not.toBeNull(); expect(to).not.toBeNull();
  const origin = { x: from!.x + from!.width / 2, y: from!.y + from!.height / 2 };
  const destination = { x: to!.x + to!.width / 2, y: to!.y + to!.height / 2 };
  if (info.project.use.hasTouch) {
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...origin, id: 1 }] });
    for (let step = 1; step <= 12; step++) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: origin.x + (destination.x - origin.x) * step / 12, y: origin.y + (destination.y - origin.y) * step / 12, id: 1 }] });
    await expect(page.getByRole("button", { name: new RegExp(`^${first.word}, lifted$`) })).toHaveCSS("z-index", "50");
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
  } else {
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.mouse.move(destination.x, destination.y, { steps: 12 });
    await expect(page.getByRole("button", { name: new RegExp(`^${first.word}, lifted$`) })).toHaveCSS("z-index", "50");
    await page.mouse.up();
  }
  await expect(page.locator('[data-testid="bin-sort-active"]')).toContainText("Word 2 of 4");
});

test("cleaver demonstrates the actual target then retries one rule question", async ({ page }) => {
  const lesson=comparativePreviewFixture(COMPARATIVE_MICRO_SKILLS[2],3,"cleaver-fixture");
  await page.addInitScript(state=>localStorage.setItem("adle:comparative:preview:v1",JSON.stringify(state)),{lesson,progress:{...initialComparativeProgress(lesson),stageId:"activity:cleaver"},finishWrites:0});
  await page.goto("/dev/adle/comparative-superlative");
  const transformation = lesson.cleaverTasks[0].transformation;
  const rail = page.getByRole("group", { name: `Choose where to split ${transformation.result}`, exact: true });
  await expect(rail).toBeVisible();
  const firstGap = rail.getByRole("button", { name: /^Split at boundary 1\./ });
  await expect(firstGap.locator("svg").locator("..")).toHaveClass(/opacity-0/);
  await firstGap.hover();
  await expect(firstGap.locator("svg").locator("..")).toHaveClass(/opacity-100/);
  await page.mouse.move(0, 0);
  await expect(firstGap.locator("svg").locator("..")).toHaveClass(/opacity-0/);
  await page.locator('[data-transform-target-state]').screenshot({ path: "/tmp/adle-cleaver-happier.png" });
  await rail.getByRole("button", { name: /^Split at boundary 1\./ }).press("Enter");
  await expect(page.getByText("Try again. Find the ending -er or -est.", { exact: true })).toBeVisible();
  await rail.getByRole("button", { name: new RegExp(`^Split at boundary ${transformation.stem.length}\\.`) }).press("Enter");
  const reveal = page.locator('[data-transformation-kind="degree_to_base"]');
  await expect(reveal).toHaveAttribute("data-transformation-state", "restoring");
  await expect(page.getByRole("button", { name: "Answer the rule question" })).toHaveCount(0);
  await expect(reveal).toHaveAttribute("data-transformation-state", "revealed");
  await expect(reveal).toContainText(`${transformation.base} is the base word.`);
  await expect(reveal).toContainText("i changes to y.");
  await page.getByRole("button",{name:"Answer the rule question"}).click();
  const q=lesson.cleaverTasks[0].question;
  await page.getByRole("button",{name:q.options.find(o=>o.id!==q.correctOptionId)!.text,exact:true}).click();
  await expect(page.getByText(/Not quite. Try again./)).toBeVisible();
  await page.getByRole("button",{name:q.options.find(o=>o.id===q.correctOptionId)!.text,exact:true}).click();
  await expect(page.getByRole("button",{name:"Continue",exact:true})).toBeVisible();
});

test("shared cleaver starts unhighlighted for prefix, suffix, and base-word lessons", async ({ page }) => {
  for (const fixture of ["prefix-standard", "suffix-standard", "base-single"]) {
    await page.goto(`/dev/adle/group4-convergence?fixture=${fixture}`);
    const rail = page.getByRole("group", { name: /^Choose where to split / });
    await expect(rail).toBeVisible();
    await expect(rail.locator("span.opacity-100 > svg")).toHaveCount(0);
    const firstGap = rail.getByRole("button", { name: /^Split at boundary 1\./ });
    await firstGap.focus();
    await expect(firstGap.locator("svg").locator("..")).toHaveClass(/opacity-100/);
  }
});

for (const [skillIndex, caption] of [[1, "e returns to the base."], [3, "The extra g disappears."]] as const) test(`target-first cleaver restores ${caption}`, async ({ page }) => {
  const lesson = comparativePreviewFixture(COMPARATIVE_MICRO_SKILLS[skillIndex], 3, `restore-${skillIndex}`);
  await page.addInitScript(state => localStorage.setItem("adle:comparative:preview:v1", JSON.stringify(state)), { lesson, progress: { ...initialComparativeProgress(lesson), stageId: "activity:cleaver" }, finishWrites: 0 });
  await page.goto("/dev/adle/comparative-superlative");
  const t = lesson.cleaverTasks[0].transformation;
  await page.getByRole("group", { name: `Choose where to split ${t.result}`, exact: true }).getByRole("button", { name: new RegExp(`^Split at boundary ${t.stem.length}\\.`) }).click();
  await expect(page.locator('[data-spelling-change="restore"]')).toContainText(caption);
  await expect(page.getByText(`Yes — ${t.base} is the base word.`, { exact: true })).toBeVisible();
});

test("sentence builder visibly transforms before the formed word can be placed", async ({ page }) => {
  const lesson = comparativePreviewFixture(COMPARATIVE_MICRO_SKILLS[2], 3, "build-animation");
  await page.addInitScript(state => { if (!localStorage.getItem("adle:comparative:preview:v1")) localStorage.setItem("adle:comparative:preview:v1", JSON.stringify(state)); }, { lesson, progress: { ...initialComparativeProgress(lesson), stageId: "activity:sentence-build" }, finishWrites: 0 });
  await page.goto("/dev/adle/comparative-superlative");
  const ending = lesson.sentenceTasks[0].degree === "comparative" ? "er" : "est";
  await page.getByRole("button", { name: ending, exact: true }).click();
  await page.getByRole("button", { name: `Place ${ending} in block 1`, exact: true }).click();
  const sentenceFamily = lesson.families.find(family => family.familyKey === lesson.sentenceTasks[0].familyKey)!;
  const word = sentenceFamily.words.find(candidate => candidate.degree === lesson.sentenceTasks[0].degree)!.word;
  await expect(page.locator('[data-spelling-change="build"]')).toBeVisible();
  await expect(page.getByRole("button", { name: word, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: word, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: word, exact: true })).toBeFocused();
  const surface = page.locator('[data-sentence-suffix-state]');
  await expect(surface.getByText(word, { exact: true })).toHaveCount(1);
  await expect(surface.getByText("Your word is ready:", { exact: true })).toHaveCount(0);
  await expect(surface.getByText("y changes to i.", { exact: true })).toHaveCount(0);
  await expect(surface.getByRole("button", { name: /^Move er from block/ })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: word, exact: true }).press("Enter");
  await page.getByRole("button", { name: "Place the selected word in the sentence" }).press("Enter");
  await expect(surface).toHaveAttribute("data-sentence-suffix-state", "complete");
});

test("the transformed wrong ending can be retried without duplicate tiles", async ({ page }) => {
  const lesson = comparativePreviewFixture(COMPARATIVE_MICRO_SKILLS[2], 3, "ending-retry");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(state => localStorage.setItem("adle:comparative:preview:v1", JSON.stringify(state)), { lesson, progress: { ...initialComparativeProgress(lesson), stageId: "activity:sentence-build" }, finishWrites: 0 });
  await page.goto("/dev/adle/comparative-superlative");
  await page.getByRole("button", { name: "est", exact: true }).click();
  await page.getByRole("button", { name: "Place est in block 1", exact: true }).click();
  await page.getByRole("button", { name: "happiest", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Place the selected word in the sentence" }).press("Enter");
  await expect(page.getByText(/This compares two. Try -er./)).toBeVisible();
  await page.getByRole("button", { name: "Try another ending", exact: true }).click();
  await page.getByRole("button", { name: "er", exact: true }).click();
  await page.getByRole("button", { name: "Place er in block 1", exact: true }).click();
  await page.getByRole("button", { name: "happier", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Place the selected word in the sentence" }).press("Enter");
  await expect(page.locator('[data-sentence-suffix-state]')).toHaveAttribute("data-sentence-suffix-state", "complete");
});

test("reflection shows submitted mistakes before the response, and separates swaps", async ({ page }) => {
  const lesson = comparativePreviewFixture(COMPARATIVE_MICRO_SKILLS[2], 3, "reflection-mistakes");
  const progress = { ...initialComparativeProgress(lesson), stageId: "reflection" };
  progress.coverAttempts[lesson.words[1].canonicalWordId] = "happyer";
  progress.coverAttempts[lesson.words[2].canonicalWordId] = "happyist";
  const first = lesson.dictationTasks[0], second = lesson.dictationTasks[1];
  progress.dictationValues[first.id] = [first.targets[1].word, first.targets[0].word];
  progress.dictationValues[second.id] = ["funnyer", second.targets[1].word];
  progress.dictationChecked[first.id] = progress.dictationChecked[second.id] = true;
  await page.addInitScript(state => localStorage.setItem("adle:comparative:preview:v1", JSON.stringify(state)), { lesson, progress, finishWrites: 0 });
  await page.goto("/dev/adle/comparative-superlative");
  const cards = page.locator('[data-lesson-reflection] article');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("happyer");
  await expect(cards.nth(1)).toContainText("happyist");
  await expect(cards.nth(2)).toContainText("funnyer");
  await expect(page.locator('[data-reflection-context-recap]')).toContainText("spelt happier correctly, but put it in gap 2. It belongs in gap 1.");
  await expect(page.locator('textarea')).not.toBeFocused();
  await expect(page.locator("label").filter({ hasText: "Reflect on any questions that you got wrong. What is the one thing you would like to remember from this lesson? Write one memory cue sentence." })).toBeVisible();
  await expect(page.locator("textarea")).toHaveAttribute("placeholder", "I will remember…");
  await page.reload();
  await expect(cards).toHaveCount(3);
});

test("template menu offers actual reflection examples with mistakes", async ({ page }) => {
  await page.goto("/dev/adle/template-menu#reflection-examples");
  const examples = page.locator("#reflection-examples");
  for (const label of ["Comparative / superlative", "Suffix -ous", "Prefix", "Base words", "Compound words"]) {
    await examples.getByRole("button", { name: label, exact: true }).click();
    await expect(examples.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(examples.getByRole("heading", { name: "What went wrong", exact: true })).toBeVisible();
    await expect(examples.locator('article').first()).toContainText("You wrote");
    await expect(examples.locator('article').first()).toContainText("Correct spelling");
  }
});

test("menu switches to the real target-first cleaver", async ({ page }) => {
  await page.goto("/dev/adle/template-menu");
  await page.getByLabel("Preview rule", { exact: true }).selectOption(COMPARATIVE_MICRO_SKILLS[2]);
  await page.getByRole("button", { name: "Task 3 · transform target", exact: true }).click();
  await expect(page.getByRole("button", { name: "Task 3 · transform target", exact: true })).toHaveAttribute("aria-pressed", "true");
  const target = comparativePreviewFixture(COMPARATIVE_MICRO_SKILLS[2]).cleaverTasks[0].transformation;
  const rail = page.getByRole("group", { name: `Choose where to split ${target.result}`, exact: true });
  await expect(rail).toBeVisible();
  await rail.getByRole("button", { name: new RegExp(`^Split at boundary ${target.stem.length}\\.`) }).click();
  await expect(page.getByText(`Yes — ${target.base} is the base word.`, { exact: true })).toBeVisible();
});

test("paired dictation fails closed without browser audio", async ({ page }) => {
  const lesson=comparativePreviewFixture(COMPARATIVE_MICRO_SKILLS[0],3,"audio-fixture");
  await page.addInitScript(state=>{
    localStorage.setItem("adle:comparative:preview:v1",JSON.stringify(state));
    Reflect.deleteProperty(window,"speechSynthesis");
    Reflect.deleteProperty(window,"SpeechSynthesisUtterance");
  },{lesson,progress:{...initialComparativeProgress(lesson),stageId:"dictation"},finishWrites:0});
  await page.goto("/dev/adle/comparative-superlative");
  await expect(page.locator('[data-paired-dictation-state]').getByRole("alert")).toContainText("audio is unavailable");
  await page.getByLabel("Gap 1",{exact:true}).fill("wrong"); await page.getByLabel("Gap 2",{exact:true}).fill("wrong");
  await expect(page.getByRole("button",{name:"Check both words"})).toBeDisabled();
});

for (const skill of COMPARATIVE_MICRO_SKILLS) test(`complete ${skill}, reload and idempotent Finish`, async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/dev/adle/comparative-superlative");
  await page.getByRole("combobox").first().selectOption(skill);
  const lesson = await page.evaluate(() => JSON.parse(localStorage.getItem("adle:comparative:preview:v1")!).lesson) as ComparativeLessonV1;
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.getByRole("button", { name: "Start the activities", exact: true }).click();
  for (const t of lesson.sentenceTasks) {
    const ending = t.degree === "comparative" ? "er" : "est";
    const family = lesson.families.find(f => f.familyKey === t.familyKey)!;
    await page.getByRole("button", { name: ending, exact: true }).click();
    await page.getByRole("button", { name: `Place ${ending} in block 1`, exact: true }).click();
    const tile = page.getByRole("button", { name: family.words[t.degree === "comparative" ? 1 : 2].word, exact: true });
    await tile.press("Enter");
    await page.getByRole("button", { name: "Place the selected word in the sentence" }).press("Enter");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.getByRole("button", { name: "Let's go", exact: true }).click();
  const sortWords = lesson.words.filter(w => w.degree !== "base");
  for (const [index, word] of sortWords.entries()) {
    const bin = page.getByRole("button", { name: word.degree === "comparative" ? /^Comparative/ : /^Superlative/ });
    await expect(page.getByTestId("bin-sort-active")).toContainText(word.word);
    await expect(bin).toBeEnabled(); await bin.click();
    if (index + 1 < sortWords.length) await expect(page.getByRole("button", { name: sortWords[index+1].word, exact: true })).toBeVisible();
    else await expect(page.getByTestId("bin-sort-overview")).toBeVisible();
  }
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const task of lesson.cleaverTasks) {
    await page.getByRole("group", { name: `Choose where to split ${task.transformation.result}`, exact: true }).getByRole("button", { name: new RegExp(`^Split at boundary ${task.transformation.stem.length}\\.`) }).click();
    await page.getByRole("button", { name: "Answer the rule question" }).click();
    await page.getByRole("button", { name: task.question.options.find(o => o.id === task.question.correctOptionId)!.text, exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  for (const word of lesson.words) {
    await page.locator('button[aria-label^="Slide the cover"]').press("Enter");
    await expect(page.locator('[data-cover-state="write"] .text-4xl')).toHaveCount(0);
    await page.getByLabel("Type the whole word").fill(word.word);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  for (const [i, sentence] of lesson.dictationTasks.entries()) {
    const values = i === 0 ? [sentence.targets[1].word, sentence.targets[0].word] : sentence.targets.map(t => t.word);
    await expect(page.getByRole("button", { name: "Hear word 1", exact: true })).toBeVisible();
    await page.getByLabel("Gap 1", { exact: true }).fill(values[0]);
    await page.getByLabel("Gap 2", { exact: true }).fill(values[1]);
    await page.getByRole("button", { name: "Check both words" }).click();
    await expect(page.getByLabel("Gap 1", { exact: true })).toHaveAttribute("readonly", "");
    if (i === 0) {
      await expect(page.getByText("Spelling correct.", { exact: false })).toHaveCount(2);
      await page.reload();
      await expect(page.getByLabel("Gap 1", { exact: true })).toHaveValue(values[0]);
      await expect(page.getByLabel("Gap 1", { exact: true })).toHaveAttribute("readonly", "");
    }
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.locator("textarea").fill("I can compare two things and a group, and use the spelling rule.");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.locator('[data-comparative-finished="true"]')).toBeVisible();
  await page.reload(); await expect(page.locator('[data-comparative-finished="true"]')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("adle:comparative:preview:v1")!).finishWrites)).toBe(1);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `/tmp/adle-${skill}-${info.project.name}.png`, fullPage: true });
});
