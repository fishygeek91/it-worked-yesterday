import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

/**
 * Mark the current room from the chrome copy. The spec never imports the suite.
 *
 * @param page - Browser page
 */
async function markWhatTheRoomSaid(page: Page): Promise<void> {
  const room = await page.locator(".room").innerText();
  if (room.includes("This checkout is green. The suite passed.")) {
    await page.locator("[data-command=\"good\"]").click();
    return;
  }
  if (room.includes("This checkout is red.")) {
    await page.locator("[data-command=\"bad\"]").click();
    return;
  }
  throw new Error(`unexpected room copy: ${room}`);
}

test("save gif renders only on a win and downloads a real GIF89a file", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#chrome")).toBeVisible();

  // Still searching: the export control must not exist yet.
  await expect(page.locator("[data-save-gif]")).toHaveCount(0);

  const accuse = page.locator("[data-command=\"accuse\"]");
  for (let step = 0; step < 8; step += 1) {
    if (await accuse.isEnabled()) {
      break;
    }
    await markWhatTheRoomSaid(page);
  }
  await expect(accuse).toBeEnabled();
  await accuse.click();
  await expect(page.locator(".outcome")).toHaveText("Accused. That SHA was the first-bad.");

  const marksBefore = await page.locator(".marks").innerText();
  const saveGif = page.locator("[data-save-gif]");
  await expect(saveGif).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await saveGif.click();
  const download = await downloadPromise;

  // Deterministic name from case, seed, and clock — never the guilty SHA.
  expect(download.suggestedFilename()).toBe("iwy-tutorial-seed-1729-3-of-3.gif");

  // The bytes are a real GIF89a document with a trailer, not a screenshot.
  const path = await download.path();
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 6).toString("latin1")).toBe("GIF89a");
  expect(bytes[bytes.length - 1]).toBe(0x3b);
  expect(bytes.toString("latin1")).toContain("NETSCAPE2.0");

  // The export is not a command: the clock did not move.
  await expect(page.locator(".marks")).toHaveText(marksBefore);
});
