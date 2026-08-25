import { expect, test, type Page } from "@playwright/test";

type PointerKind = "mouse" | "touch";

async function openFixture(page: Page) {
  await page.goto("/dev/adle/morphology-primitives", { waitUntil: "load" });
  await page.getByRole("button", { name: "Open component playground" }).click();
  const fixture = page.getByTestId("dynamic-prefix-cover-fixture");
  await expect(fixture).toBeVisible();
  return {
    fixture,
    shutter: fixture.locator('button[aria-label^="Slide the cover"]'),
    checkpoints: fixture.getByTestId("dynamic-prefix-cover-checkpoints"),
    completions: fixture.getByTestId("dynamic-prefix-cover-completions"),
  };
}

async function pointerCoordinates(page: Page) {
  const opened = await openFixture(page);
  await opened.fixture.scrollIntoViewIfNeeded();
  const box = await opened.shutter.boundingBox();
  if (!box) throw new Error("Cover shutter has no bounding box.");
  return {
    ...opened,
    startX: box.x + box.width - 32,
    y: box.y + box.height / 2,
    track: box.width - 64,
  };
}

async function dispatchPointer(
  page: Page,
  ratio: number,
  pointerType: PointerKind,
  finalEvent: "move_then_up" | "up_only",
) {
  const opened = await pointerCoordinates(page);
  const pointerId = pointerType === "mouse" ? 7 : 17;
  const eventBase = { pointerId, pointerType, isPrimary: true };
  const endX = opened.startX + (opened.track * ratio);
  await opened.shutter.dispatchEvent("pointerdown", { ...eventBase, buttons: 1, clientX: opened.startX, clientY: opened.y });
  if (finalEvent === "move_then_up") {
    await opened.shutter.dispatchEvent("pointermove", { ...eventBase, buttons: 1, clientX: endX, clientY: opened.y });
  }
  await opened.shutter.dispatchEvent("pointerup", { ...eventBase, buttons: 0, clientX: endX, clientY: opened.y });
  return opened;
}

async function assertPointerBoundaries(page: Page, pointerType: PointerKind) {
  const below = await pointerCoordinates(page);
  const openTransform = await below.shutter.evaluate((element) => getComputedStyle(element).transform);
  const belowEndX = below.startX + (below.track * 0.79);
  const pointerId = pointerType === "mouse" ? 7 : 17;
  const eventBase = { pointerId, pointerType, isPrimary: true };
  await below.shutter.dispatchEvent("pointerdown", { ...eventBase, buttons: 1, clientX: below.startX, clientY: below.y });
  await below.shutter.dispatchEvent("pointermove", { ...eventBase, buttons: 1, clientX: belowEndX, clientY: below.y });
  await below.shutter.dispatchEvent("pointerup", { ...eventBase, buttons: 0, clientX: belowEndX, clientY: below.y });
  await expect(below.fixture.locator("[data-cover-state='look']")).toBeVisible();
  await expect(below.fixture.locator(".text-4xl")).toBeVisible();
  await expect(below.shutter).toHaveCSS("transform", openTransform);
  await expect(below.completions).toHaveText("0");

  const exact = await dispatchPointer(page, 0.8, pointerType, "up_only");
  await expect(exact.shutter).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await expect(exact.fixture.locator("[data-cover-state='write']")).toBeVisible();
  await expect(exact.fixture.locator(".text-4xl")).toHaveCount(0);
  await expect(exact.fixture.getByText("unhappy", { exact: true })).toHaveCount(0);
  await expect(exact.fixture.locator('[aria-label*="unhappy" i], [title*="unhappy" i]')).toHaveCount(0);
  await expect(exact.checkpoints).toHaveText("1");
  const input = exact.fixture.getByLabel("Type the whole word");
  await expect(input).toBeVisible();
  await expect(exact.completions).toHaveText("0");
  await input.fill("unhappy");
  await expect(exact.completions).toHaveText("0");
  await exact.fixture.getByRole("button", { name: "Check" }).click();
  await expect(exact.fixture.locator("[data-cover-state='check']")).toBeVisible();
  await expect(exact.completions).toHaveText("1");

  const exactMove = await pointerCoordinates(page);
  const exactMoveEndX = exactMove.startX + (exactMove.track * 0.8);
  await exactMove.shutter.dispatchEvent("pointerdown", { ...eventBase, buttons: 1, clientX: exactMove.startX, clientY: exactMove.y });
  await exactMove.shutter.dispatchEvent("pointermove", { ...eventBase, buttons: 1, clientX: exactMoveEndX, clientY: exactMove.y });
  await exactMove.shutter.dispatchEvent("pointerup", { ...eventBase, buttons: 0, clientX: exactMoveEndX, clientY: exactMove.y });
  await expect(exactMove.shutter).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await expect(exactMove.fixture.locator("[data-cover-state='write']")).toBeVisible();
  await expect(exactMove.completions).toHaveText("0");
  await expect(exactMove.checkpoints).toHaveText("1");

  const above = await pointerCoordinates(page);
  const aboveEndX = above.startX + (above.track * 0.9);
  await above.shutter.dispatchEvent("pointerdown", { ...eventBase, buttons: 1, clientX: above.startX, clientY: above.y });
  await above.shutter.dispatchEvent("pointermove", { ...eventBase, buttons: 1, clientX: aboveEndX, clientY: above.y });
  await expect(above.shutter).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await expect(above.fixture.locator("[data-cover-state='write']")).toBeVisible();
  await expect(above.fixture.locator(".text-4xl")).toHaveCount(0);
  await expect(above.completions).toHaveText("0");
}

test.describe("Dynamic Prefix Cover track-ratio policy", () => {
  test("mouse uses exact 79/80/above boundaries and Check remains the completion boundary", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await assertPointerBoundaries(page, "mouse");
  });

  test("touch uses exact 79/80/above boundaries at the mobile viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-touch-chromium");
    await assertPointerBoundaries(page, "touch");
  });

  test("Enter, Space, and ArrowRight close accessibly without completing", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    for (const key of ["Enter", "Space", "ArrowRight"]) {
      const { fixture, shutter, completions } = await openFixture(page);
      await shutter.focus();
      await shutter.press(key);
      await expect(fixture.locator("[data-cover-state='write']")).toBeVisible();
      await expect(fixture.locator(".text-4xl")).toHaveCount(0);
      await expect(fixture.getByLabel("Type the whole word")).toBeVisible();
      await expect(completions).toHaveText("0");
    }
  });

  test("reduced motion awaits one durable cover checkpoint and rejects repeated keyboard closure", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { fixture, shutter, checkpoints, completions } = await openFixture(page);
    await shutter.focus();
    await shutter.press("Enter");
    await shutter.press("Enter");
    await expect(fixture.locator("[data-cover-state='write']")).toBeVisible();
    await expect(checkpoints).toHaveText("1");
    await expect(completions).toHaveText("0");
  });
});
