import { test, expect } from '@playwright/test';

test.describe('Classic Mode Regression (UAT-13)', () => {
  test('Classic mode should still load and function', async ({ page }) => {
    await page.goto('/');
    
    // Default is Classic mode, should show prompt box directly
    const promptInput = page.locator('textarea[placeholder*="Describe the video you want to create"]');
    await expect(promptInput).toBeVisible();

    // The Generate button in Classic mode
    const generateBtn = page.getByRole('button', { name: /Generate Video/i });
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeDisabled();

    // Type something to enable
    await promptInput.fill('A cute cat sleeping');
    await expect(generateBtn).toBeEnabled();
  });
});
