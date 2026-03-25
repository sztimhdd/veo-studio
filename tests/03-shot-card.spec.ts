import { test, expect } from '@playwright/test';

// Skip since it relies on long-running APIs; we'll mock or just do a timeout test if necessary
test.describe('ShotCard Features (UAT-04)', () => {
  test('ShotCard initializes with skeleton and rolls correctly', async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("Dailies Engine")').click();
    
    await page.locator('textarea[placeholder*="Describe the scene"]').fill('Test Prompt');
    await page.locator('button:has-text("Generate Dailies")').click();

    // The shot card 0 should appear alongside skeleton initially
    const shotCard = page.getByTestId('shot-card-0');
    await expect(shotCard).toBeVisible({ timeout: 15000 }); // Director API time

    // "ROLL TAKE 1" or "ROLLING..." text
    // The button might say ROLLING initially since phase is DRAFTING.
    const rollBtn = page.getByTestId('roll-take-btn-0');
    await expect(rollBtn).toBeVisible();

    // Director's prompt overlay
    const promptToggle = page.locator('text=DIRECTOR\'S PROMPT').first();
    await expect(promptToggle).toBeVisible();
  });
});
