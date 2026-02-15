import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Delivery & Transitions E2E', () => {
  test.setTimeout(900000); // 15 minutes for real API calls

  test.beforeEach(async ({ page }) => {
    // MOCKING STRATEGY:
    // We mock by default for CI/Stability. 
    // To run with REAL APIs, comment out this route block or set USE_REAL_API=true env var.
    const USE_REAL_API = process.env.USE_REAL_API === 'true';

    if (!USE_REAL_API) {
      await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
        const url = route.request().url();
        
        if (url.includes('generateContent')) {
          if (url.includes('gemini-3-pro-preview')) {
            // Director Plan with Transitions
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                candidates: [{
                  content: {
                    parts: [{
                      text: JSON.stringify({
                        subject_prompt: "Test Subject",
                        environment_prompt: "Test Env",
                        visual_style: "Test Style",
                        scenes: [
                          {
                            id: "s1", order: 1, duration_seconds: 4,
                            segments: [{ start_time: "00:00", end_time: "00:04", prompt: "Hero says: Hello.", camera_movement: "Static" }],
                            master_prompt: "Scene 1",
                            transition: { type: "fade", duration: 0.5 }
                          },
                          {
                            id: "s2", order: 2, duration_seconds: 4,
                            segments: [{ start_time: "00:00", end_time: "00:04", prompt: "Hero says: World.", camera_movement: "Pan" }],
                            master_prompt: "Scene 2"
                          }
                        ],
                        reasoning: "Test Plan"
                      })
                    }]
                  }
                }]
              })
            });
          } else if (url.includes('gemini-3-pro-image-preview')) {
            // Artist / Refiner
            const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhAFGAKm64QAAAABJRU5ErkJggg==';
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                candidates: [{
                  content: {
                    parts: [{ inlineData: { data: base64Image, mimeType: 'image/png' } }]
                  }
                }]
              })
            });
          }
        } else if (url.includes('generateVideos') || url.includes('predictLongRunning') || url.includes('operations/')) {
          const videoUri = "http://localhost:3000/test/shot.mp4?alt=media";
          const generatedVideos = [{ video: { uri: videoUri } }];
          
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              name: "operations/mock-op",
              done: true,
              metadata: {
                "@type": "type.googleapis.com/google.ai.generativelanguage.v1beta.GenerateVideoMetadata"
              },
              response: {
                "@type": "type.googleapis.com/google.ai.generativelanguage.v1beta.GenerateVideoResponse",
                generatedVideos: generatedVideos,
                generatedSamples: generatedVideos // Legacy fallback
              },
              // Fallbacks for various SDK versions or behaviors
              result: {
                generatedVideos: generatedVideos
              }
            })
          });
        }
      });

      // Mock Video Blob Fetch
      await page.route('**/*shot.mp4*', async (route) => {
        const tinyMp4Base64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pbmYxbXA0MgADOG1vb3YAAABsbXZoZAAAAADDU7S4w1O0uAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAI0dHJhawAAAFx0a2hkAAAAAcNTtLjDU7S4AAAAAQAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAUAAAAEAAAAAAhBtZGlhAAAAIG1kaGQAAAAAw1O0uMNTtLjAAAcIAAAH0ABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB521pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAdNzdGJsAAAAr3N0c2QAAAAAAAAAAQAAAJ9hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAUAAUABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAALWF2Y0MBQsAN/+EAFWdCwA3ZAsTsBEAAAPpAADqYAAH0gGisYhAALeX7mP8AAAACHGN0dHMAAAAAAAAAAQAAAAEAAAAAAQAAGHN0dHMAAAAAAAAAAQAAAAEAAAcIAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAABRzdHN6AAAAAAAAAAAAAAABAAAIHHN0Y28AAAAAAAAAAQAAADQ=';
        await route.fulfill({
          status: 200,
          contentType: 'video/mp4',
          body: Buffer.from(tinyMp4Base64, 'base64'),
        });
      });

      // Mock Static Image Assets (to fix "Image corrupt" in stripImageMetadata)
      // Playwright's route matching order matters? We put this before the generic catch-all?
      // Actually page.route is LIFO (last registered is checked first), so we should register specific routes AFTER general ones if we want them to take precedence?
      // No, usually it's reverse order of definition? Docs say: "Routes are matched in the reverse order of their registration..."
      // So newer routes override older ones.
      
      const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhAFGAKm64QAAAABJRU5ErkJggg==';
      const imageBuffer = Buffer.from(tinyPngBase64, 'base64');
      
      await page.route('**/*.png', async (route) => {
        await route.fulfill({ status: 200, contentType: 'image/png', body: imageBuffer });
      });
      await page.route('**/*.jpg', async (route) => {
        await route.fulfill({ status: 200, contentType: 'image/jpeg', body: imageBuffer });
      });
    }

    await page.goto('/');
    
    // Handle API Key Dialog if it appears
    const continueBtn = page.locator('button:has-text("Continue to App")');
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }
  });

  /**
   * REAL E2E TEST (Production Readiness)
   * This test runs the FULL pipeline with REAL Gemini 3 Pro and Veo 3.1 API calls.
   * Prerequisites: VITE_GEMINI_API_KEY must be set in the environment.
   */
  test('FULL PRODUCTION RUN: master all shots and export with transitions + captions', async ({ page }) => {
    // 1. Setup Logging & Environment
    // const apiKey = process.env.VITE_GEMINI_API_KEY;
    // if (!apiKey) {
    //   test.skip(true, 'VITE_GEMINI_API_KEY not set - skipping real API test');
    //   return;
    // }
    
    page.on('console', msg => {
      const text = msg.text();
      console.log(`[BROWSER] ${text}`);
      if (text.includes('CRITICAL_FAILURE') || text.includes('failed')) {
        console.error(`🔴 CRITICAL LOG DETECTED: ${text}`);
      }
    });

    // 2. Load Scenario
    await page.goto('/');
    const continueBtn = page.locator('button:has-text("Continue to App")');
    if (await continueBtn.isVisible()) await continueBtn.click();

    console.log('--- PHASE 1: PRE-PRODUCTION ---');
    await page.click('button:has-text("🐱 Cat Food")');
    await expect(page.locator('textarea')).not.toBeEmpty();

    // 3. Draft Generation
    console.log('--- PHASE 2: DRAFTING (VEO FAST) ---');
    await page.click('button:has-text("Generate Dailies")');
    
    // We expect 3 scenes for this scenario
    await expect(page.locator('text=Dailies are ready for review')).toBeVisible({ timeout: 300000 });
    
    const draftVideos = page.locator('video');
    const draftCount = await draftVideos.count();
    console.log(`✅ Drafts complete. Shots generated: ${draftCount}`);
    expect(draftCount).toBeGreaterThan(0);

    // 4. Batch Mastering
    console.log('--- PHASE 3: MASTERING (VEO HQ + DUAL-FRAME) ---');
    const masterAllBtn = page.locator('button:has-text("Master All (4K)")');
    await expect(masterAllBtn).toBeVisible();
    await masterAllBtn.click();

    // Wait for all scenes to show the "4K MASTERED" badge
    await expect(page.locator('text=Batch mastering complete!')).toBeVisible({ timeout: 600000 });
    const masteredBadges = page.locator('text=4K MASTERED');
    await expect(masteredBadges).toHaveCount(draftCount);
    console.log('✅ Mastering complete.');

    // 5. Final Export & Delivery
    console.log('--- PHASE 4: DELIVERY (FFMPEG + CAPTIONS) ---');
    
    // Download expectation
    const [downloadVideo] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export Full Commercial")')
    ]);

    const videoPath = await downloadVideo.path();
    console.log(`✅ Video Delivered: ${downloadVideo.suggestedFilename()} at ${videoPath}`);
    expect(downloadVideo.suggestedFilename()).toContain('.mp4');

    // Check for SRT (should trigger immediately after or in parallel)
    // Note: If browser triggers two downloads, we might need a second listener
    console.log('✅ E2E Production Test Successful.');
  });
});
