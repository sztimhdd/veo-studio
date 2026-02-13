import { test as base } from '@playwright/test';

// Define any custom fixtures here
export const test = base.extend({
  // Example fixture:
  // myFixture: async ({ page }, use) => {
  //   await page.goto('/');
  //   await use(page);
  // },
});

export { expect } from '@playwright/test';
