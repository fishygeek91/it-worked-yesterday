import { expect, test } from "@playwright/test";

test("the sound latch is muted by default and never touches the clock", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("iwy.tutorialDone", "1");
  });
  await page.goto("/?l=yesterday");
  const latch = page.locator("[data-sound]");
  await expect(latch).toHaveAttribute("aria-pressed", "false");
  await expect(latch).toHaveText("sound: off");
  await expect(page.locator(".marks")).toHaveText("0 / 4");

  await latch.click();
  await expect(page.locator("[data-sound]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-sound]")).toHaveText("sound: on");
  await expect(page.locator(".marks")).toHaveText("0 / 4");

  await page.locator("[data-sound]").click();
  await expect(page.locator("[data-sound]")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".marks")).toHaveText("0 / 4");
});
