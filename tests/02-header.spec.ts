import { test, expect } from '@playwright/test';

test.describe('AgentWorks Header Branding', () => {
  test('should display new AgentWorks branding (UAT-03)', async ({ page }) => {
    await page.goto('/');

    // Check Header Text
    const headerTitle = page.locator('header h1');
    await expect(headerTitle).toHaveText('AgentWorks');
    
    // Check document <title>
    const pageTitle = await page.title();
    expect(pageTitle).toBe('AgentWorks');
  });

  test('should display phase stepper when pipeline is active', async ({ page }) => {
    await page.goto('/');
    
    // Switch to Studio Mode
    await page.locator('button:has-text("Dailies Engine")').click();
    
    // Not visible initially
    await expect(page.getByTestId('phase-stepper')).not.toBeVisible();

    // Start pipeline
    await page.locator('button:has-text("Test Set")').click();
    await page.locator('button:has-text("Generate Dailies")').click();

    // Phase stepper should appear
    await expect(page.getByTestId('phase-stepper')).toBeVisible();
    
    // Verify first step active
    await expect(page.getByTestId('phase-stepper')).toContainText('Director');
  });
});
