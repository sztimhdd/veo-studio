import { test, expect } from '@playwright/test';

test.describe('AgentWorks Layout & Sidebars', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to local dev server
    await page.goto('/');
    
    // Switch to Studio Mode
    const studioBtn = page.locator('button:has-text("Dailies Engine")');
    await studioBtn.click();
  });

  test('should render 3-panel layout in Studio Mode (UAT-01)', async ({ page }) => {
    // The initial view (before "Test Set" + "Generate Dailies") doesn't show sidebars.
    // So let's trigger the flow:
    await page.locator('textarea[placeholder*="Describe the scene"]').fill('Test Prompt');
    await page.locator('button:has-text("Generate Dailies")').click();

    // Verify sidebars and center panel appear
    const leftSidebar = page.getByTestId('left-sidebar');
    const rightSidebar = page.getByTestId('right-sidebar');
    
    await expect(leftSidebar).toBeVisible();
    await expect(rightSidebar).toBeVisible();

    // Verify center ShotCard exists (or at least the skeleton)
    const shotCard0 = page.getByTestId('shot-card-0');
    await expect(shotCard0).toBeVisible({ timeout: 10000 }); // give time for plan API
  });

  test('should allow expanding and collapsing sidebars (UAT-02)', async ({ page }) => {
    // Start pipeline
    await page.locator('textarea[placeholder*="Describe the scene"]').fill('Test Prompt');
    await page.locator('button:has-text("Generate Dailies")').click();

    // Wait for sidebars
    const leftSidebar = page.getByTestId('left-sidebar');
    await expect(leftSidebar).toBeVisible();

    // Check initial expanded state widths roughly (w-280px)
    const box = await leftSidebar.boundingBox();
    expect(box?.width).toBeGreaterThan(200);

    // Click collapse
    const collapseBtn = page.getByLabel('Collapse tools');
    await collapseBtn.click();

    // Wait for transition, check collapsed width (48px)
    await page.waitForTimeout(500); 
    const boxCollapsed = await leftSidebar.boundingBox();
    expect(boxCollapsed?.width).toBeLessThan(60);

    // Expand
    const expandBtn = page.getByLabel('Expand tools');
    await expandBtn.click();
    await page.waitForTimeout(500); 
    const boxExpanded = await leftSidebar.boundingBox();
    expect(boxExpanded?.width).toBeGreaterThan(200);
  });
});
