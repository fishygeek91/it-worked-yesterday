import { expect, test, type Page } from "@playwright/test";

/**
 * Mark against the room copy. The spec never imports the suite.
 *
 * @param page - Browser page
 */
async function markAgainstTheRoom(page: Page): Promise<void> {
  const room = await page.locator(".room").innerText();
  if (room.includes("This checkout is green. The suite passed.")) {
    await page.locator("[data-command=\"bad\"]").click();
    return;
  }
  if (room.includes("This checkout is red.")) {
    await page.locator("[data-command=\"good\"]").click();
    return;
  }
  throw new Error(`unexpected room copy: ${room}`);
}

test("a lost case reads back the interview record", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#chrome")).toBeVisible();
  await expect(page.locator(".ledger")).toHaveCount(0);

  const accuse = page.locator("[data-command=\"accuse\"]");
  for (let step = 0; step < 8; step += 1) {
    if (await accuse.isEnabled()) {
      break;
    }
    await markAgainstTheRoom(page);
  }
  await expect(accuse).toBeEnabled();
  await accuse.click();

  await expect(page.locator(".outcome")).toContainText("not the first-bad");
  await expect(page.locator(".ledger-head")).toHaveText("The interview record.");
  const lies = page.locator(".ledger-line.is-lie");
  await expect(lies.first()).toBeVisible();
  await expect(page.locator(".ledger-note")).toHaveText(
    "Read it back. Somewhere in here you argued with the suite.",
  );

  await page.locator("[data-command=\"reset\"]").click();
  await expect(page.locator(".ledger")).toHaveCount(0);
});
