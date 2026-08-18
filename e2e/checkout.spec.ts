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

test("a room click is a paid walk and the case is still winnable", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("iwy.tutorialDone", "1");
  });
  await page.goto("/?l=yesterday");
  await expect(page.locator(".marks")).toHaveText("0 / 4");

  // Walk to the known-good room: it is outside the range, and the walk costs.
  await page.locator("#map [data-sha]").first().click();
  await expect(page.locator(".marks")).toHaveText("1 / 4");
  await expect(page.locator(".offrange")).toHaveText(
    "This room is outside the remaining range.",
  );
  await expect(page.locator("[data-command=\"good\"]")).toBeDisabled();
  await expect(page.locator("[data-command=\"bad\"]")).toBeDisabled();

  // Walk back to the engine's checkout (midpoint of 0..16 is room 8). Paid again.
  await page.locator("#map [data-sha]").nth(8).click();
  await expect(page.locator(".marks")).toHaveText("2 / 4");
  await expect(page.locator("[data-command=\"good\"]")).toBeEnabled();

  const accuse = page.locator("[data-command=\"accuse\"]");
  for (let step = 0; step < 40; step += 1) {
    if (await accuse.isEnabled()) {
      break;
    }
    await markWhatTheRoomSaid(page);
  }
  await expect(accuse).toBeEnabled();
  await accuse.click();
  await expect(page.locator(".outcome")).toHaveText("Accused. That SHA was the first-bad.");
});
