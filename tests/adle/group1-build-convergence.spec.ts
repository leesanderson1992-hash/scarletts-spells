import { expect, test, type Page } from "@playwright/test";

function candidate(page: Page, heading: string) {
  return page.locator("article").filter({ has: page.getByRole("heading", { name: heading }) });
}

async function pointerDrag(page: Page, source: ReturnType<Page["locator"]>, target: ReturnType<Page["locator"]>) {
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 8 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/adle/activity-convergence");
  await expect(page.getByRole("heading", { name: "Build / Assembly" })).toBeVisible();
});

test("Definition Word Builder supports keyboard placement, manual check and the shared success flow", async ({ page }) => {
  const builder = candidate(page, "DefinitionWordBuilder · Prefix/Affix config");
  const prefix = builder.getByRole("button", { name: "un-" });
  await prefix.focus();
  await prefix.press("Enter");
  const slot = builder.getByRole("button", { name: /Place un- in block 1/ });
  await slot.focus();
  await slot.press("Enter");
  await expect(builder.getByRole("button", { name: "Check my word" })).toBeVisible();
  await builder.getByRole("button", { name: "Check my word" }).click();
  await expect(builder.getByRole("region", { name: "Completed word and meaning" })).toContainText("un + kind → unkind");
  await expect(builder.getByRole("region", { name: "Completed word and meaning" })).toContainText("not kind");
});

test("Jigsaw restores two same-length words in swapped anonymous rows", async ({ page }) => {
  const jigsaw = candidate(page, "Jigsaw Build");
  await jigsaw.getByRole("button", { name: "Resume / restored" }).click();
  const secondRow = jigsaw.locator('[data-jigsaw-row-id="preview-ice-cream"]');
  const thirdRow = jigsaw.locator('[data-jigsaw-row-id="preview-well-being"]');
  await expect(secondRow).toContainText("well-being");
  await expect(secondRow.locator('[data-jigsaw-piece="preview-well-being:0"]')).toBeVisible();
  await expect(thirdRow).toContainText("ice cream");
  await expect(thirdRow.locator('[data-jigsaw-piece="preview-ice-cream:0"]')).toBeVisible();
  await expect(jigsaw.getByText("Built", { exact: true })).toHaveCount(2);
});

test("Jigsaw reports an incorrect order without discarding it", async ({ page }) => {
  const jigsaw = candidate(page, "Jigsaw Build");
  await jigsaw.getByRole("button", { name: "Incorrect" }).click();
  await jigsaw.getByRole("button", { name: "Check my builds" }).click();
  await expect(jigsaw).toContainText("Some pieces are in the wrong order");
  await expect(jigsaw.locator('[data-jigsaw-slot="preview-rainbow:0"] [data-jigsaw-piece="preview-rainbow:1"]')).toBeVisible();
  await expect(jigsaw.locator('[data-jigsaw-slot="preview-rainbow:1"] [data-jigsaw-piece="preview-rainbow:0"]')).toBeVisible();
});

test("Jigsaw pointer placement forms a visible partial word and completes one target independently", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop pointer proof; the mobile project supplies narrow-layout coverage");
  const jigsaw = candidate(page, "Jigsaw Build");
  const firstPiece = jigsaw.locator('[data-jigsaw-piece="preview-rainbow:0"]');
  const firstSlot = jigsaw.getByRole("button", { name: "Empty position 1 in puzzle row 1" });
  await pointerDrag(page, firstPiece, firstSlot);
  await expect(jigsaw.getByRole("button", { name: "rain word part" })).toBeVisible();

  const secondPiece = jigsaw.locator('[data-jigsaw-piece="preview-rainbow:1"]');
  const secondSlot = jigsaw.getByRole("button", { name: "Empty position 2 in puzzle row 1" });
  await pointerDrag(page, secondPiece, secondSlot);
  await jigsaw.getByRole("button", { name: "Check my builds" }).click();
  await expect(jigsaw.getByText("Built", { exact: true })).toHaveCount(1);
  await expect(jigsaw.getByLabel("Puzzle row 2, 3 pieces")).not.toContainText("Built");
});

test("space and hyphen connectors are real shuffled, placeable pieces", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop pointer proof");
  const jigsaw = candidate(page, "Jigsaw Build");
  const space = jigsaw.locator('[data-jigsaw-piece="preview-ice-cream:join:0"]');
  await expect(space).toHaveText("SPACE");
  const spaceSlot = jigsaw.getByRole("button", { name: "Empty position 2 in puzzle row 2" });
  await pointerDrag(page, space, spaceSlot);
  await expect(jigsaw.locator('[data-jigsaw-slot="preview-ice-cream:1"] [data-jigsaw-piece-kind="space"]')).toHaveText("SPACE");

  const hyphens = jigsaw.locator('[data-jigsaw-piece-kind="hyphen"]');
  await expect(hyphens).toHaveCount(3);
  const ids = await hyphens.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-jigsaw-piece")));
  expect(new Set(ids).size).toBe(3);
});

test("same-length open and hyphenated words can swap rows and lock independently", async ({ page }) => {
  const jigsaw = candidate(page, "Jigsaw Build");
  const openPlacements = [
    ["preview-ice-cream:0", 1],
    ["preview-ice-cream:join:0", 2],
    ["preview-ice-cream:1", 3],
  ] as const;
  for (const [pieceId, position] of openPlacements) {
    const piece = jigsaw.locator(`[data-jigsaw-piece="${pieceId}"]`);
    await piece.focus();
    await piece.press("Enter");
    const slot = jigsaw.getByRole("button", { name: new RegExp(`Place .+ in puzzle row 3, position ${position}`) });
    await slot.focus();
    await slot.press("Enter");
  }
  await jigsaw.getByRole("button", { name: "Check my builds" }).click();
  await expect(jigsaw.locator('[data-jigsaw-row-id="preview-well-being"]')).toContainText("ice cream");
  await expect(jigsaw.locator('[data-jigsaw-piece="preview-ice-cream:join:0"]')).toHaveAttribute("data-jigsaw-space-label-hidden", "true");

  const hyphenPlacements = [
    ["preview-well-being:0", 1],
    ["preview-mother-in-law:join:0", 2],
    ["preview-well-being:1", 3],
  ] as const;
  for (const [pieceId, position] of hyphenPlacements) {
    await jigsaw.locator(`[data-jigsaw-piece="${pieceId}"]`).click();
    await jigsaw.getByRole("button", { name: new RegExp(`Place .+ in puzzle row 2, position ${position}`) }).click();
  }
  await jigsaw.getByRole("button", { name: "Check my builds" }).click();
  await expect(jigsaw.locator('[data-jigsaw-row-id="preview-ice-cream"]')).toContainText("well-being");
  await expect(jigsaw.getByText("Built", { exact: true })).toHaveCount(2);
  await expect(jigsaw.locator('[data-jigsaw-piece="preview-mother-in-law:join:0"]')).toContainText("-");
});

test("invalid pointer drops cancel safely and swapping remains available", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop pointer proof");
  const jigsaw = candidate(page, "Jigsaw Build");
  const rain = jigsaw.locator('[data-jigsaw-piece="preview-rainbow:0"]');
  await rain.scrollIntoViewIfNeeded();
  const rainBox = await rain.boundingBox();
  expect(rainBox).not.toBeNull();
  await page.mouse.move(rainBox!.x + 20, rainBox!.y + 20);
  await page.mouse.down();
  await page.mouse.move(4, 4, { steps: 5 });
  await page.mouse.up();
  await expect(jigsaw).toContainText("did not reach a puzzle space");
  await expect(jigsaw.locator('[data-jigsaw-piece="preview-rainbow:0"]')).toBeVisible();

  await pointerDrag(page, jigsaw.locator('[data-jigsaw-piece="preview-rainbow:0"]'), jigsaw.getByRole("button", { name: "Empty position 1 in puzzle row 1" }));
  await pointerDrag(page, jigsaw.locator('[data-jigsaw-piece="preview-rainbow:1"]'), jigsaw.locator('[data-jigsaw-slot="preview-rainbow:0"]'));
  await expect(jigsaw.locator('[data-jigsaw-slot="preview-rainbow:0"] [data-jigsaw-piece="preview-rainbow:1"]')).toBeVisible();
  await expect(jigsaw.locator('[data-jigsaw-piece="preview-rainbow:0"]')).toBeVisible();
});

test("mixed bank order is deterministic and the Group 1 surface fits the narrow viewport", async ({ page }) => {
  const jigsaw = candidate(page, "Jigsaw Build");
  await expect(jigsaw.locator("[data-jigsaw-piece]").first()).toBeVisible();
  const ids = await jigsaw.locator("[data-jigsaw-piece]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-jigsaw-piece")));
  await page.reload();
  const reloadedJigsaw = candidate(page, "Jigsaw Build");
  await expect(reloadedJigsaw).toBeVisible();
  await expect(reloadedJigsaw.locator("[data-jigsaw-piece]").first()).toBeVisible();
  const reloadedIds = await reloadedJigsaw.locator("[data-jigsaw-piece]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-jigsaw-piece")));
  expect(reloadedIds).toEqual(ids);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("trays precede the bank and use stable 2x2 and stacked responsive geometry", async ({ page }) => {
  const jigsaw = candidate(page, "Jigsaw Build");
  const trayGroup = jigsaw.getByLabel("Anonymous jigsaw rows");
  const bank = jigsaw.getByLabel("Mixed jigsaw piece bank");
  const precedes = await trayGroup.evaluate((trays, bankElement) => Boolean(trays.compareDocumentPosition(bankElement as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await bank.elementHandle());
  expect(precedes).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  const wide = await jigsaw.locator("[data-jigsaw-row]").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
  expect(new Set(wide).size).toBe(2);
  expect(wide[0]).toBe(wide[1]);
  expect(wide[2]).toBe(wide[3]);

  await page.setViewportSize({ width: 900, height: 900 });
  const medium = await jigsaw.locator("[data-jigsaw-row]").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
  expect(new Set(medium).size).toBe(2);

  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await jigsaw.locator("[data-jigsaw-row]").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
  expect(new Set(narrow).size).toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await expect(jigsaw).not.toContainText("+");
  await expect(jigsaw).not.toContainText("Word 1");
});

test("piece edges stay invariant and placed pieces interlock at the exact tab depth", async ({ page }) => {
  const jigsaw = candidate(page, "Jigsaw Build");
  await page.setViewportSize({ width: 1440, height: 900 });
  const component = jigsaw.locator('[data-jigsaw-piece="preview-well-being:0"]');
  const connector = jigsaw.locator('[data-jigsaw-piece="preview-mother-in-law:join:0"]');
  const bankProfile = await component.evaluate((node) => ({
    left: node.getAttribute("data-jigsaw-left-edge"),
    right: node.getAttribute("data-jigsaw-right-edge"),
    path: node.querySelector("path")?.getAttribute("d"),
  }));
  expect(bankProfile).toEqual(expect.objectContaining({ left: "flat", right: "tab" }));
  const componentPathHeight = await component.locator("path").evaluate((path) => path.getBoundingClientRect().height);
  const connectorPathHeight = await connector.locator("path").evaluate((path) => path.getBoundingClientRect().height);
  expect(Math.abs(componentPathHeight - connectorPathHeight)).toBeLessThanOrEqual(1);

  await component.click();
  await jigsaw.getByRole("button", { name: /Place well word part in puzzle row 3, position 2/ }).click();
  const misplaced = jigsaw.locator('[data-jigsaw-slot="preview-well-being:1"] [data-jigsaw-piece="preview-well-being:0"]');
  await expect(misplaced).toHaveAttribute("data-jigsaw-left-edge", "flat");
  await expect(misplaced).toHaveAttribute("data-jigsaw-right-edge", "tab");
  expect(await misplaced.locator("path").getAttribute("d")).toBe(bankProfile.path);
  await misplaced.click();
  await jigsaw.getByRole("button", { name: /Place well word part in puzzle row 3, position 1/ }).click();

  for (const [pieceId, position] of [
    ["preview-mother-in-law:join:0", 2],
    ["preview-well-being:1", 3],
  ] as const) {
    await jigsaw.locator(`[data-jigsaw-piece="${pieceId}"]`).click();
    await jigsaw.getByRole("button", { name: new RegExp(`Place .+ in puzzle row 3, position ${position}`) }).click();
  }
  const joinedPieces = jigsaw.locator('[data-jigsaw-row-id="preview-well-being"] [data-jigsaw-piece]');
  await expect(joinedPieces.nth(0)).toHaveAttribute("data-jigsaw-right-edge", "tab");
  await expect(joinedPieces.nth(1)).toHaveAttribute("data-jigsaw-left-edge", "socket");
  await expect(joinedPieces.nth(1)).toHaveAttribute("data-jigsaw-right-edge", "tab");
  await expect(joinedPieces.nth(2)).toHaveAttribute("data-jigsaw-left-edge", "socket");
  const joined = await joinedPieces.evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, height: box.height, z: Number(getComputedStyle(node).zIndex) };
  }));
  expect(joined).toHaveLength(3);
  expect(new Set(joined.map((piece) => Math.round(piece.top))).size).toBe(1);
  expect(new Set(joined.map((piece) => Math.round(piece.height))).size).toBe(1);
  expect(Math.abs((joined[0].right - joined[1].left) - 14)).toBeLessThanOrEqual(1);
  expect(Math.abs((joined[1].right - joined[2].left) - 14)).toBeLessThanOrEqual(1);
  expect(joined[0].z).toBeGreaterThan(joined[1].z);
  expect(joined[1].z).toBeGreaterThan(joined[2].z);
  const seamOwner = await page.evaluate(({ x, y }) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-jigsaw-piece]")?.dataset.jigsawPiece,
  { x: joined[1].left + 7, y: joined[1].top + joined[1].height / 2 });
  expect(seamOwner).toBe("preview-well-being:0");
});

test("mixed-word rows receive neutral feedback", async ({ page }) => {
  const jigsaw = candidate(page, "Jigsaw Build");
  for (const [pieceId, position] of [
    ["preview-ice-cream:0", 1],
    ["preview-mother-in-law:join:0", 2],
    ["preview-well-being:1", 3],
  ] as const) {
    await jigsaw.locator(`[data-jigsaw-piece="${pieceId}"]`).click();
    await jigsaw.getByRole("button", { name: new RegExp(`Place .+ in puzzle row 2, position ${position}`) }).click();
  }
  await jigsaw.getByRole("button", { name: "Check my builds" }).click();
  await expect(jigsaw).toContainText("mixes pieces from different words");
  await expect(jigsaw.getByText("Built", { exact: true })).toHaveCount(0);
});
