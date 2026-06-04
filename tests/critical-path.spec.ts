// ============================================================================
// Critical path E2E — load → edit → drag → reload → persist
// ============================================================================
// The one flow that, if it works, means the whole stack is wired correctly:
// the example project loads and lays out, an element can be selected and
// edited through the inspector, a node can be dragged on the canvas, and the
// edit survives a full page reload (the Y.Doc draft is persisted to IndexedDB).
//
// Selectors lean on stable, user-facing hooks: React Flow stamps each node with
// `data-id`, the inspector's name field carries an accessible label, and the
// node renders its name in `.element-node-name`. No test-only attributes.
// ============================================================================

import { expect, test } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";

// A node that is visible at the default view (architecture layer, latest MVP,
// subsystems collapsed) in the bundled example project: the top-level
// "Customer" actor. Picking a top-level leaf keeps the drag + persistence
// assertions independent of group expand/collapse state.
const TARGET_ID = "end-user";
const ORIGINAL_NAME = "Customer";
const EDITED_NAME = "Customer (edited by E2E)";

function node(page: Page, id: string): Locator {
  return page.locator(`.react-flow__node[data-id="${id}"]`);
}

/** Wait for the example project to finish its async ELK layout and render. */
async function waitForGraph(page: Page): Promise<void> {
  await expect(node(page, TARGET_ID)).toBeVisible({ timeout: 30_000 });
  // The first layout triggers a fitView animation; let it settle so the node
  // is positionally stable before we try to click or drag it.
  await node(page, TARGET_ID).locator(".element-node").waitFor({ state: "visible" });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForGraph(page);
});

test("loads the bundled example project onto the canvas", async ({ page }) => {
  // More than one node means the graph (not just an empty shell) rendered.
  const count = await page.locator(".react-flow__node").count();
  expect(count).toBeGreaterThan(1);
  await expect(node(page, TARGET_ID).locator(".element-node-name")).toHaveText(ORIGINAL_NAME);
});

test("selecting a node opens the inspector for it", async ({ page }) => {
  await node(page, TARGET_ID).click();
  // The inspector's editable name field surfaces the selected element.
  await expect(page.getByRole("button", { name: "Edit element name" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit element name" })).toHaveText(ORIGINAL_NAME);
});

test("edit a property, drag a node, then reload and the edit persists", async ({ page }) => {
  // --- select -------------------------------------------------------------
  await node(page, TARGET_ID).click();

  // --- edit a property (the element name) ---------------------------------
  await page.getByRole("button", { name: "Edit element name" }).click();
  const nameInput = page.getByRole("textbox", { name: "element name" });
  await expect(nameInput).toBeVisible();
  await nameInput.fill(EDITED_NAME);
  await nameInput.press("Enter");

  // The edit is reflected immediately on the canvas node and in the inspector.
  await expect(node(page, TARGET_ID).locator(".element-node-name")).toHaveText(EDITED_NAME);

  // --- drag the node ------------------------------------------------------
  const before = await node(page, TARGET_ID).boundingBox();
  if (before === null) throw new Error("target node has no bounding box");

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  // Move in several steps so React Flow registers a drag (not a click).
  await page.mouse.move(before.x + before.width / 2 + 140, before.y + before.height / 2 + 80, {
    steps: 12,
  });
  await page.mouse.up();

  const after = await node(page, TARGET_ID).boundingBox();
  if (after === null) throw new Error("target node has no bounding box after drag");
  // The node actually moved (drag → onNodeDragStop persisted a layout override).
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(40);

  // --- reload and assert persistence --------------------------------------
  // The draft (name edit + layout override) lives in the Y.Doc, mirrored to
  // IndexedDB; a reload must restore it rather than fall back to the pristine
  // example.
  await page.reload();
  await waitForGraph(page);

  await expect(node(page, TARGET_ID).locator(".element-node-name")).toHaveText(EDITED_NAME);
});
