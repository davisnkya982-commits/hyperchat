import { expect, test } from "playwright/test";

test("direct chat, room chat, and thread reply work against Convex", async ({ page }) => {
  const stamp = Date.now();
  const screenshotDir = "C:/Users/elson/Documents/Codex/2026-06-14/hey-is-it-possible-to-make/work";

  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Create" }).click();
  await page.locator('input[autocomplete="name"]').fill("Hyperchat Tester");
  await page.locator('input[autocomplete="username"]').fill(`tester${stamp}`);
  await page.locator('input[type="email"]').fill(`tester${stamp}@hyperchat.local`);
  await page.locator('input[type="password"]').fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Hyperchat Tester")).toBeVisible({ timeout: 25000 });
  await page.getByRole("button", { name: "Create demo people" }).click();
  await page.waitForTimeout(1800);

  await page.getByRole("button", { name: /New chat/ }).click();
  await expect(page.getByText("Mira Chen")).toBeVisible({ timeout: 25000 });
  await page.getByRole("button", { name: /Mira Chen/ }).first().click();
  await page.locator(".chat-pane textarea").fill("Direct hello from Hyperchat verification.");
  await page.locator(".chat-pane .send-button").click();
  await expect(page.getByText("Direct hello from Hyperchat verification.")).toBeVisible({ timeout: 25000 });

  await page.getByRole("button", { name: /Room/ }).click();
  await page.locator('.room-form input[placeholder="Room name"]').fill("Verification Room");
  await page.locator('.room-form input[placeholder="Description"]').fill("Browser verification room");

  const jonesButton = page.locator(".room-form .member-picker button").filter({ hasText: "Jones Nkya" });
  if (await jonesButton.count()) await jonesButton.first().click();
  const miraButton = page.locator(".room-form .member-picker button").filter({ hasText: "Mira Chen" });
  if (await miraButton.count()) await miraButton.first().click();

  await page.locator(".room-form .primary-button").click();
  await expect(page.locator(".chat-identity").filter({ hasText: "Verification Room" })).toBeVisible({ timeout: 25000 });
  await page.locator(".chat-pane textarea").fill("Room kickoff from browser verification.");
  await page.locator(".chat-pane .send-button").click();
  await expect(page.getByText("Room kickoff from browser verification.")).toBeVisible({ timeout: 25000 });

  const roomBubble = page.locator(".message-bubble", { hasText: "Room kickoff from browser verification." }).last();
  await roomBubble.hover();
  await roomBubble.locator('button[title="Thread"]').click();
  await expect(page.locator(".thread-panel")).toBeVisible({ timeout: 10000 });
  await page.locator(".thread-panel textarea").fill("Thread reply from browser verification.");
  await page.locator(".thread-panel .send-button").click();
  await expect(
    page.locator(".thread-scroll .message-bubble", { hasText: "Thread reply from browser verification." })
  ).toBeVisible({ timeout: 25000 });

  await page.screenshot({ path: `${screenshotDir}/hyperchat-desktop-verification.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${screenshotDir}/hyperchat-mobile-verification.png`, fullPage: true });
});
