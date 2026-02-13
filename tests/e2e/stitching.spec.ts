import { test, expect } from '@playwright/test';

test.describe('Stitching and Export', () => {
  // Increase timeout for FFmpeg loading and processing
  test.setTimeout(180000);

  test.beforeEach(async ({ page }) => {
    // Mock Google GenAI API calls
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      const url = route.request().url();
      
      if (url.includes('generateContent')) {
        if (url.includes('gemini-3-pro-preview')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              candidates: [{
                content: {
                  parts: [{
                    text: JSON.stringify({
                      subject_prompt: "A test subject",
                      environment_prompt: "A test environment",
                      visual_style: "Cinematic",
                    scenes: [
                      {
                        id: "scene-1",
                        order: 1,
                        duration_seconds: 2,
                        segments: [{ start_time: "00:00", end_time: "00:02", prompt: "Test scene", camera_movement: "Static" }],
                        master_prompt: "Test master prompt"
                      }
                    ],

                      reasoning: "Test reasoning"
                    })
                  }]
                }
              }]
            })
          });
        } else if (url.includes('gemini-3-pro-image-preview')) {
          // Artist Turnaround or Refiner
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
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            name: "operations/mock-op-123",
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [{ video: { uri: "https://mock-video-storage.com/video.mp4" } }]
              }
            }
          })
        });
      } else {
        await route.continue();
      }
    });

    // A tiny valid MP4 file (1 second, black)
    const tinyMp4Base64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pbmYxbXA0MgADOG1vb3YAAABsbXZoZAAAAADDU7S4w1O0uAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAI0dHJhawAAAFx0a2hkAAAAAcNTtLjDU7S4AAAAAQAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAUAAAAEAAAAAAhBtZGlhAAAAIG1kaGQAAAAAw1O0uMNTtLjAAAcIAAAH0ABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB521pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAdNzdGJsAAAAr3N0c2QAAAAAAAAAAQAAAJ9hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAUAAUABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAALWF2Y0MBQsAN/+EAFWdCwA3ZAsTsBEAAAPpAADqYAAH0gGisYhAALeX7mP8AAAACHGN0dHMAAAAAAAAAAQAAAAEAAAAAAQAAGHN0dHMAAAAAAAAAAQAAAAEAAAcIAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAABRzdHN6AAAAAAAAAAAAAAABAAAIHHN0Y28AAAAAAAAAAQAAADQ=';
    const tinyMp4 = Buffer.from(tinyMp4Base64, 'base64');

    await page.route('https://mock-video-storage.com/video.mp4**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: tinyMp4,
      });
    });

    // Mock test assets
    await page.route('**/test/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('mock image content'),
      });
    });

    await page.goto('/');

    // Handle API Key Dialog if it appears
    const continueBtn = page.locator('button:has-text("Continue to App")');
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }
  });

  test('should trigger download when Export Full Commercial is clicked', async ({ page }) => {
    // Log console messages for debugging
    page.on('console', msg => {
      console.log(`PAGE LOG: [${msg.type()}] ${msg.text()}`);
    });

    // Handle alerts (e.g. "Stitching failed")
    page.on('dialog', dialog => {
      console.log(`PAGE DIALOG: ${dialog.message()}`);
      dialog.dismiss().catch(() => {});
    });

    // 1. Verify we are in Studio Mode
    await expect(page.locator('h2')).toContainText('Veo Dailies');

    // 2. Use 'Test Set' button to fill prompt
    await page.click('button:has-text("Test Set")');
    const textarea = page.locator('textarea');
    await expect(textarea).not.toHaveValue('', { timeout: 10000 });

    // 3. Click 'Generate Dailies'
    await page.click('button:has-text("Generate Dailies")');

    // 4. Wait for pipeline to complete
    // We use a mock plan with 1 scene so it completes quickly.
    // The VideoStitcher returns the single video immediately without FFmpeg overhead,
    // which is enough to verify the UI's download trigger logic.
    await expect(page.locator('text=Production Complete')).toBeVisible({ timeout: 90000 });

    // 5. Setup download listener
    const downloadPromise = page.waitForEvent('download');

    // 6. Click 'Export Full Commercial'
    const exportBtn = page.locator('#export-btn');
    await expect(exportBtn).toBeVisible();
    
    console.log('Clicking Export button...');
    await exportBtn.click();

    // 7. Verify download
    console.log('Waiting for download event...');
    const download = await downloadPromise;
    
    const filename = download.suggestedFilename();
    console.log(`Download triggered: ${filename}`);
    
    expect(filename).toBe('veo-studio-production.mp4');
    
    // Clean up the download
    await download.delete();
  });
});
